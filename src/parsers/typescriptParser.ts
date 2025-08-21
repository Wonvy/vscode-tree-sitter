// typescriptParser.ts
import * as vscode from 'vscode';
import { FunctionInfo, Language } from '../types';

/**
 * TypeScript 专用解析器
 * - 支持 TypeScript 特有的语法：interface、type、enum、namespace、decorator
 * - 继承 JavaScript 解析器的所有功能
 * - 增强的类型信息提取：泛型、联合类型、交叉类型等
 * - 支持装饰器语法和元数据
 */
export class TypeScriptParser {
  constructor(private output: vscode.OutputChannel) {}

  /* ===================== 入口 ===================== */

  public extractTypeScriptHierarchy(rootNode: any, functions: FunctionInfo[], language: Language) {
    this.traverse(rootNode, (node: any) => {
      // TypeScript 特有的节点类型
      if (node.type === 'interface_declaration') {
        this.processInterfaceDeclaration(node, functions, language);
        return;
      }

      if (node.type === 'type_alias_declaration') {
        this.processTypeAliasDeclaration(node, functions, language);
        return;
      }

      if (node.type === 'enum_declaration') {
        this.processEnumDeclaration(node, functions, language);
        return;
      }

      if (node.type === 'namespace_declaration') {
        this.processNamespaceDeclaration(node, functions, language);
        return;
      }

      if (node.type === 'decorator') {
        this.processDecorator(node, functions, language);
        return;
      }

      // 类声明（TypeScript 增强版）
      if (node.type === 'class_declaration' || node.type === 'class') {
        this.processTypeScriptClassDeclaration(node, functions, language);
        return;
      }

      // 函数声明（TypeScript 增强版）
      if (
        node.type === 'function_declaration' ||
        node.type === 'function_expression' ||
        node.type === 'arrow_function'
      ) {
        // 类成员交给 processTypeScriptClassDeclaration 统一生成，避免重复
        if (this.isInsideClassMember(node)) return;

        const info = this.extractTypeScriptFunction(node, language);
        if (info) functions.push(info);
        return;
      }

      // 变量声明（可能包含函数类型）
      if (node.type === 'variable_declaration') {
        this.processTypeScriptVariableDeclaration(node, functions, language);
        return;
      }
    });
  }

  /* ===================== TypeScript 特有结构 ===================== */

  private processInterfaceDeclaration(node: any, out: FunctionInfo[], language: Language) {
    const name = this.findInterfaceName(node) || 'interface';
    const startLine = node.startPosition.row + 1;
    const endLine = node.endPosition.row + 1;

    out.push({
      id: `${language}-interface-${name}-${node.startPosition.row}`,
      name,
      comment: this.extractTypeScriptComment(node, language) || '',
      startLine,
      endLine,
      parameters: [],
      returnType: 'interface',
      visibility: 'public',
      isStatic: false,
      language,
      type: 'interface',
      className: undefined,
      namespaceName: undefined,
    });

    // 处理接口体中的方法签名
    const body = node.childForFieldName?.('body') || 
                 (node.children || []).find((c: any) => c.type === 'object_type');
    if (!body) return;

    const members = body.namedChildren ?? body.children ?? [];
    for (const m of members) {
      if (!m) continue;

      if (m.type === 'method_signature' || m.type === 'property_signature') {
        const mi = this.extractInterfaceMember(m, name, language);
        if (mi) out.push(mi);
      }
    }
  }

  // 新增：提取接口成员的方法
  private extractInterfaceMember(memberNode: any, interfaceName: string, language: Language): FunctionInfo | null {
    const name = this.findMethodName(memberNode) || 'anonymous';
    const startLine = memberNode.startPosition.row + 1;
    const endLine = memberNode.endPosition.row + 1;

    // 提取参数类型
    const parameters = this.extractTypeScriptParameters(
      memberNode.childForFieldName?.('parameters')
    );

    // 提取返回类型
    const returnType = this.extractTypeScriptReturnType(memberNode);

    return {
      id: `${language}-interface-member-${interfaceName}-${name}-${startLine}`,
      name: `${interfaceName}.${name}`,
      comment: this.extractTypeScriptComment(memberNode, language) || '',
      startLine,
      endLine,
      parameters,
      returnType: returnType || 'any',
      visibility: 'public',
      isStatic: false,
      language,
      type: 'method',
      className: interfaceName,
      namespaceName: undefined,
    };
  }

  private processTypeAliasDeclaration(node: any, out: FunctionInfo[], language: Language) {
    const name = this.findTypeAliasName(node) || 'type';
    const startLine = node.startPosition.row + 1;
    const endLine = node.endPosition.row + 1;

    out.push({
      id: `${language}-type-${name}-${node.startPosition.row}`,
      name,
      comment: this.extractTypeScriptComment(node, language) || '',
      startLine,
      endLine,
      parameters: [],
      returnType: 'type',
      visibility: 'public',
      isStatic: false,
      language,
      type: 'type',
      className: undefined,
      namespaceName: undefined,
    });
  }

  private processEnumDeclaration(node: any, out: FunctionInfo[], language: Language) {
    const name = this.findEnumName(node) || 'enum';
    const startLine = node.startPosition.row + 1;
    const endLine = node.endPosition.row + 1;

    out.push({
      id: `${language}-enum-${name}-${node.startPosition.row}`,
      name,
      comment: this.extractTypeScriptComment(node, language) || '',
      startLine,
      endLine,
      parameters: [],
      returnType: 'enum',
      visibility: 'public',
      isStatic: false,
      language,
      type: 'enum',
      className: undefined,
      namespaceName: undefined,
    });

    // 处理枚举成员
    const body = node.childForFieldName?.('body') || 
                 (node.children || []).find((c: any) => c.type === 'enum_body');
    if (!body) return;

    const members = body.namedChildren ?? body.children ?? [];
    for (const m of members) {
      if (!m) continue;

      if (m.type === 'enum_member') {
        const memberName = this.findEnumMemberName(m) || 'member';
        const memberStartLine = m.startPosition.row + 1;
        const memberEndLine = m.endPosition.row + 1;

        out.push({
          id: `${language}-enum-member-${name}-${memberName}-${m.startPosition.row}`,
          name: `${name}.${memberName}`,
          comment: this.extractTypeScriptComment(m, language) || '',
          startLine: memberStartLine,
          endLine: memberEndLine,
          parameters: [],
          returnType: 'enum_member',
          visibility: 'public',
          isStatic: false,
          language,
          type: 'enum_member',
          className: name,
          namespaceName: undefined,
        });
      }
    }
  }

  private processNamespaceDeclaration(node: any, out: FunctionInfo[], language: Language) {
    const name = this.findNamespaceName(node) || 'namespace';
    const startLine = node.startPosition.row + 1;
    const endLine = node.endPosition.row + 1;

    out.push({
      id: `${language}-namespace-${name}-${node.startPosition.row}`,
      name,
      comment: this.extractTypeScriptComment(node, language) || '',
      startLine,
      endLine,
      parameters: [],
      returnType: 'namespace',
      visibility: 'public',
      isStatic: false,
      language,
      type: 'namespace',
      className: undefined,
      namespaceName: undefined,
    });

    // 处理命名空间体
    const body = node.childForFieldName?.('body') || 
                 (node.children || []).find((c: any) => c.type === 'statement_block');
    if (!body) return;

    // 递归处理命名空间内的所有声明
    this.traverse(body, (childNode: any) => {
      if (childNode.type === 'function_declaration' ||
          childNode.type === 'class_declaration' ||
          childNode.type === 'interface_declaration' ||
          childNode.type === 'type_alias_declaration' ||
          childNode.type === 'enum_declaration') {
        
        // 为命名空间内的声明添加命名空间前缀
        const childInfo = this.extractTypeScriptDeclaration(childNode, language);
        if (childInfo) {
          childInfo.namespaceName = name;
          childInfo.name = `${name}.${childInfo.name}`;
          out.push(childInfo);
        }
      }
    });
  }

  private processDecorator(node: any, out: FunctionInfo[], language: Language) {
    // 装饰器本身不直接产生函数，但可能影响被装饰的声明
    // 这里可以记录装饰器信息，或者跳过
    return;
  }

  /* ===================== TypeScript 增强的类处理 ===================== */

  private processTypeScriptClassDeclaration(node: any, out: FunctionInfo[], language: Language) {
    const name = this.findClassName(node) || 'class';
    const startLine = node.startPosition.row + 1;
    const endLine = node.endPosition.row + 1;

    out.push({
      id: `${language}-class-${name}-${node.startPosition.row}`,
      name,
      comment: this.extractTypeScriptComment(node, language) || '',
      startLine,
      endLine,
      parameters: [],
      returnType: 'class',
      visibility: 'public',
      isStatic: false,
      language,
      type: 'class',
      className: undefined,
      namespaceName: undefined,
    });

    // 处理类体
    const body = node.childForFieldName?.('body') ||
                 (node.children || []).find((c: any) => c.type === 'class_body');
    if (!body) return;

    const members = body.namedChildren ?? body.children ?? [];
    for (const m of members) {
      if (!m) continue;

      if (m.type === 'class_declaration' || m.type === 'class') {
        // 嵌套类
        this.processTypeScriptClassDeclaration(m, out, language);
        continue;
      }

      if (m.type === 'method_definition' || 
          m.type === 'public_field_definition' || 
          m.type === 'field_definition' ||
          m.type === 'accessor') {
        const mi = this.extractTypeScriptClassMethod(m, name, language);
        if (mi) out.push(mi);
      }
    }
  }

  private extractTypeScriptClassMethod(methodNode: any, className: string, language: Language): FunctionInfo | null {
    const name = this.findMethodName(methodNode) || 'anonymous';
    const fn = this.findFunctionChild(methodNode);
    const startLine = (fn ?? methodNode).startPosition.row + 1;
    const endLine = (fn ?? methodNode).endPosition.row + 1;

    // 提取 TypeScript 特有的信息
    const returnType = this.extractTypeScriptReturnType(methodNode);
    const visibility = this.extractTypeScriptVisibility(methodNode);
    const isStatic = this.isTypeScriptStatic(methodNode);
    const isAbstract = this.isTypeScriptAbstract(methodNode);

    const parameters = this.extractTypeScriptParameters(
      fn?.childForFieldName?.('parameters') ??
      fn?.parameters ??
      methodNode.childForFieldName?.('parameters')
    );

    // 提取注释信息
    const comment = this.extractTypeScriptComment(methodNode, language);
    const jsDocInfo = this.extractJSDocInfo(methodNode);
    
    // 组合注释：优先使用 JSDoc 描述，然后是普通注释
    let finalComment = '';
    if (jsDocInfo.description) {
      finalComment = jsDocInfo.description;
      // 如果有参数信息，添加到注释中
      if (jsDocInfo.params.length > 0) {
        finalComment += ` | 参数: ${jsDocInfo.params.join(', ')}`;
      }
      // 如果有返回信息，添加到注释中
      if (jsDocInfo.returns) {
        finalComment += ` | 返回: ${jsDocInfo.returns}`;
      }
    } else if (comment) {
      finalComment = comment;
    }

    // 添加访问修饰符信息到注释
    if (visibility !== 'public') {
      finalComment = `[${visibility}] ${finalComment}`.trim();
    }
    if (isStatic) {
      finalComment = `[static] ${finalComment}`.trim();
    }
    if (isAbstract) {
      finalComment = `[abstract] ${finalComment}`.trim();
    }

    return {
      id: `${language}-method-${className}-${name}-${startLine}`,
      name,
      comment: finalComment,
      startLine,
      endLine,
      parameters,
      returnType: returnType || 'any',
      visibility: visibility,
      isStatic: isStatic || false,
      language,
      type: 'method',
      className,
      namespaceName: undefined,
    };
  }

  /* ===================== TypeScript 增强的函数处理 ===================== */

  private extractTypeScriptFunction(node: any, language: Language): FunctionInfo | null {
    const name = this.findFunctionName(node) || 'anonymous';
    const startLine = node.startPosition.row + 1;
    const endLine = node.endPosition.row + 1;

    // 提取 TypeScript 特有的信息
    const returnType = this.extractTypeScriptReturnType(node);
    const parameters = this.extractTypeScriptParameters(
      node.childForFieldName?.('parameters') ?? node.parameters
    );

    // 提取注释信息
    const comment = this.extractTypeScriptComment(node, language);
    const jsDocInfo = this.extractJSDocInfo(node);
    
    // 组合注释：优先使用 JSDoc 描述，然后是普通注释
    let finalComment = '';
    if (jsDocInfo.description) {
      finalComment = jsDocInfo.description;
      // 如果有参数信息，添加到注释中
      if (jsDocInfo.params.length > 0) {
        finalComment += ` | 参数: ${jsDocInfo.params.join(', ')}`;
      }
      // 如果有返回信息，添加到注释中
      if (jsDocInfo.returns) {
        finalComment += ` | 返回: ${jsDocInfo.returns}`;
      }
    } else if (comment) {
      finalComment = comment;
    }

    return {
      id: `${language}-function-${name}-${startLine}`,
      name,
      comment: finalComment,
      startLine,
      endLine,
      parameters,
      returnType: returnType || 'any',
      visibility: 'public',
      isStatic: false,
      language,
      type: 'function',
      className: undefined,
      namespaceName: undefined,
    };
  }

  /* ===================== TypeScript 类型信息提取 ===================== */

  private extractTypeScriptReturnType(node: any): string | undefined {
    // 查找返回类型注解
    const returnType = node.childForFieldName?.('return_type') ||
                      (node.children || []).find((c: any) => c.type === 'type_annotation');
    
    if (returnType) {
      return this.formatTypeScriptType(returnType);
    }

    return undefined;
  }

  private extractTypeScriptParameters(paramsNode: any): string[] {
    if (!paramsNode) return [];

    const parameters: string[] = [];
    const children = paramsNode.namedChildren ?? paramsNode.children ?? [];

    for (const child of children) {
      if (!child) continue;

      if (child.type === 'parameter' || child.type === 'required_parameter' || child.type === 'optional_parameter') {
        const paramName = this.findParameterName(child);
        const paramType = this.extractParameterType(child);
        
        if (paramName) {
          const param = paramType ? `${paramName}: ${paramType}` : paramName;
          parameters.push(param);
        }
      }
    }

    return parameters;
  }

  private extractParameterType(paramNode: any): string | undefined {
    const typeAnnotation = paramNode.childForFieldName?.('type') ||
                          (paramNode.children || []).find((c: any) => c.type === 'type_annotation');
    
    if (typeAnnotation) {
      return this.formatTypeScriptType(typeAnnotation);
    }

    return undefined;
  }

  private formatTypeScriptType(typeNode: any): string {
    if (!typeNode) return 'any';

    // 处理各种 TypeScript 类型
    if (typeNode.type === 'predefined_type') {
      return typeNode.text || 'any';
    }

    if (typeNode.type === 'type_identifier') {
      return typeNode.text || 'any';
    }

    if (typeNode.type === 'union_type') {
      const types = (typeNode.children || [])
        .filter((c: any) => c.type !== '|')
        .map((c: any) => this.formatTypeScriptType(c))
        .join(' | ');
      return types || 'any';
    }

    if (typeNode.type === 'intersection_type') {
      const types = (typeNode.children || [])
        .filter((c: any) => c.type !== '&')
        .map((c: any) => this.formatTypeScriptType(c))
        .join(' & ');
      return types || 'any';
    }

    if (typeNode.type === 'generic_type') {
      const baseType = this.formatTypeScriptType(typeNode.children?.[0]);
      const typeArgs = typeNode.children?.slice(1)
        .filter((c: any) => c.type === 'type_argument_list')
        .map((c: any) => this.formatTypeScriptType(c))
        .join(', ');
      
      if (typeArgs) {
        return `${baseType}<${typeArgs}>`;
      }
      return baseType;
    }

    return 'any';
  }

  /* ===================== TypeScript 修饰符处理 ===================== */

  private extractTypeScriptVisibility(node: any): 'public' | 'private' | 'protected' | 'internal' {
    const modifiers = node.modifiers || [];
    
    if (modifiers.some((m: any) => m.type === 'private' || m.text === 'private')) {
      return 'private';
    }
    
    if (modifiers.some((m: any) => m.type === 'protected' || m.text === 'protected')) {
      return 'protected';
    }
    
    return 'public';
  }

  private isTypeScriptStatic(node: any): boolean {
    const modifiers = node.modifiers || [];
    return modifiers.some((m: any) => m.type === 'static' || m.text === 'static');
  }

  private isTypeScriptAbstract(node: any): boolean {
    const modifiers = node.modifiers || [];
    return modifiers.some((m: any) => m.type === 'abstract' || m.text === 'abstract');
  }

  /* ===================== 辅助方法 ===================== */

  private traverse(node: any, callback: (node: any) => void) {
    if (!node) return;
    
    callback(node);
    
    const children = node.children || node.namedChildren || [];
    for (const child of children) {
      if (child) {
        this.traverse(child, callback);
      }
    }
  }

  private findInterfaceName(node: any): string | undefined {
    return node.childForFieldName?.('name')?.text ||
           (node.children || []).find((c: any) => c.type === 'identifier')?.text;
  }

  private findTypeAliasName(node: any): string | undefined {
    return node.childForFieldName?.('name')?.text ||
           (node.children || []).find((c: any) => c.type === 'identifier')?.text;
  }

  private findEnumName(node: any): string | undefined {
    return node.childForFieldName?.('name')?.text ||
           (node.children || []).find((c: any) => c.type === 'identifier')?.text;
  }

  private findEnumMemberName(node: any): string | undefined {
    return node.childForFieldName?.('name')?.text ||
           (node.children || []).find((c: any) => c.type === 'identifier')?.text;
  }

  private findNamespaceName(node: any): string | undefined {
    return node.childForFieldName?.('name')?.text ||
           (node.children || []).find((c: any) => c.type === 'identifier')?.text;
  }

  private findClassName(node: any): string | undefined {
    return node.childForFieldName?.('name')?.text ||
           (node.children || []).find((c: any) => c.type === 'identifier')?.text;
  }

  private findMethodName(node: any): string | undefined {
    return node.childForFieldName?.('name')?.text ||
           (node.children || []).find((c: any) => c.type === 'identifier')?.text;
  }

  private findFunctionName(node: any): string | undefined {
    return node.childForFieldName?.('name')?.text ||
           (node.children || []).find((c: any) => c.type === 'identifier')?.text;
  }

  private findParameterName(node: any): string | undefined {
    return node.childForFieldName?.('name')?.text ||
           (node.children || []).find((c: any) => c.type === 'identifier')?.text;
  }

  private findFunctionChild(node: any): any {
    return node.childForFieldName?.('value') ||
           (node.children || []).find((c: any) => 
             c.type === 'function' || 
             c.type === 'function_expression' || 
             c.type === 'arrow_function'
           );
  }

  private isInsideClassMember(node: any): boolean {
    let current = node.parent;
    while (current) {
      if (current.type === 'class_body') {
        return true;
      }
      current = current.parent;
    }
    return false;
  }

  private extractTypeScriptComment(node: any, language: Language): string {
    // 参考 javascriptParser.ts 的实现，使用更可靠的注释提取方法
    // 锚点：如果处于声明/赋值/属性里，优先用外层语句节点取注释
    const anchor = this.findStatementAnchor(node) || node;
    const comments: any[] = [];

    // 收集紧邻在锚点之前的"连续"注释（同父级，且中间无其他 token）
    let prev = anchor.previousSibling;
    while (prev && this.isIgnorableGap(prev)) prev = prev.previousSibling;

    while (prev && prev.type === 'comment') {
      comments.unshift(prev);
      prev = prev.previousSibling;
      // 跨过空白/分号之类"空隙"
      while (prev && this.isIgnorableGap(prev)) prev = prev.previousSibling;
    }

    if (comments.length === 0) return '';

    // 优先 JSDoc 块；否则行注释合并后取第一行非 @tag
    const text = comments.map(c => c.text).join('\n');

    if (text.includes('/**')) {
      const cleaned = this.cleanJsDoc(text);
      return cleaned || '';
    }

    const oneLine = this.firstMeaningfulLine(
      text
        .split('\n')
        .map(l => l.replace(/^\s*\/\/\s?/, '').trim())
        .join(' ')
    );
    return oneLine || '';
  }

  // 新增：检查是否是可忽略的间隙
  private isIgnorableGap(n: any): boolean {
    // 忽略分号、逗号、空白节点（tree-sitter 不一定给空白），尽量保守
    return n.type === ',' || n.type === ';';
  }

  // 新增：清理 JSDoc 注释
  private cleanJsDoc(raw: string): string {
    // 去掉 /** */ 和每行 * 前缀
    const body = raw
      .replace(/^\/\*\*?/, '')
      .replace(/\*\/$/, '')
      .split('\n')
      .map(l => l.replace(/^\s*\*\s?/, '').trim())
      .join('\n');

    // 第一行非 @tag
    return this.firstMeaningfulLine(body);
  }

  // 新增：获取第一行有意义的文本
  private firstMeaningfulLine(s: string): string {
    for (const line of s.split(/\r?\n/)) {
      const t = line.trim();
      if (!t) continue;
      if (t.startsWith('@')) continue;
      return t;
    }
    return '';
  }

  // 新增：查找语句锚点
  private findStatementAnchor(n: any): any | null {
    // 变量声明、赋值语句、对象属性、方法定义
    let cur: any = n;
    while (cur?.parent) {
      const p = cur.parent;
      if (
        p.type === 'variable_declaration' ||
        p.type === 'lexical_declaration' ||
        p.type === 'expression_statement' ||
        p.type === 'pair' ||
        p.type === 'method_definition' ||
        p.type === 'public_field_definition' ||
        p.type === 'field_definition' ||
        p.type === 'interface_declaration' ||
        p.type === 'type_alias_declaration' ||
        p.type === 'enum_declaration' ||
        p.type === 'namespace_declaration' ||
        p.type === 'class_declaration'
      ) {
        return p;
      }
      cur = p;
    }
    return null;
  }

  // 新增：提取 JSDoc 注释的特定信息
  private extractJSDocInfo(node: any): { description: string; params: string[]; returns: string } {
    // 使用与 extractTypeScriptComment 相同的注释查找逻辑
    const anchor = this.findStatementAnchor(node) || node;
    const comments: any[] = [];

    // 收集紧邻在锚点之前的"连续"注释
    let prev = anchor.previousSibling;
    while (prev && this.isIgnorableGap(prev)) prev = prev.previousSibling;

    while (prev && prev.type === 'comment') {
      comments.unshift(prev);
      prev = prev.previousSibling;
      while (prev && this.isIgnorableGap(prev)) prev = prev.previousSibling;
    }

    if (comments.length === 0) {
      return { description: '', params: [], returns: '' };
    }

    const text = comments.map(c => c.text).join('\n');
    let description = '';
    const params: string[] = [];
    let returns = '';

    if (text.includes('/**')) {
      // 这是一个 JSDoc 注释
      const lines = text.split('\n');
      
      for (const line of lines) {
        const trimmed = line.trim();
        
        // 提取描述（非标签行）
        if (trimmed && !trimmed.startsWith('*') && !trimmed.startsWith('/') && !trimmed.startsWith('@')) {
          const cleanLine = trimmed.replace(/^\/\*\*?/, '').replace(/\*\/$/, '').trim();
          if (cleanLine) {
            description += cleanLine + ' ';
          }
        }
        
        // 提取 @param 标签
        if (trimmed.includes('@param')) {
          const paramMatch = trimmed.match(/@param\s+\{([^}]+)\}\s+(\w+)\s+(.+)/);
          if (paramMatch) {
            params.push(`${paramMatch[2]}: ${paramMatch[1]} - ${paramMatch[3]}`);
          }
        }
        
        // 提取 @returns 标签
        if (trimmed.includes('@returns') || trimmed.includes('@return')) {
          const returnMatch = trimmed.match(/@returns?\s+\{([^}]+)\}\s+(.+)/);
          if (returnMatch) {
            returns = `${returnMatch[1]} - ${returnMatch[2]}`;
          }
        }
      }
    }

    return {
      description: description.trim(),
      params,
      returns: returns.trim()
    };
  }

  private extractTypeScriptDeclaration(node: any, language: Language): FunctionInfo | null {
    // 根据节点类型调用相应的提取方法
    if (node.type === 'function_declaration') {
      return this.extractTypeScriptFunction(node, language);
    }
    
    if (node.type === 'class_declaration') {
      // 简化处理，只返回类名
      const name = this.findClassName(node) || 'class';
      const startLine = node.startPosition.row + 1;
      const endLine = node.endPosition.row + 1;
      
      return {
        id: `${language}-class-${name}-${node.startPosition.row}`,
        name,
        comment: this.extractTypeScriptComment(node, language) || '',
        startLine,
        endLine,
        parameters: [],
        returnType: 'class',
        visibility: 'public',
        isStatic: false,
        language,
        type: 'class',
        className: undefined,
        namespaceName: undefined,
      };
    }
    
    return null;
  }

  private processTypeScriptVariableDeclaration(node: any, out: FunctionInfo[], language: Language) {
    // 处理可能包含函数类型的变量声明
    const declarators = node.childForFieldName?.('declarator_list')?.namedChildren || [];
    
    for (const declarator of declarators) {
      if (declarator.type === 'variable_declarator') {
        const value = declarator.childForFieldName?.('value');
        
        if (value && (value.type === 'function_expression' || value.type === 'arrow_function')) {
          const info = this.extractTypeScriptFunction(value, language);
          if (info) {
            // 尝试从变量名获取函数名
            const varName = declarator.childForFieldName?.('name')?.text;
            if (varName) {
              info.name = varName;
            }
            out.push(info);
          }
        }
      }
    }
  }
} 