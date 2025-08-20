// javascriptParser.ts
import * as vscode from 'vscode';
import { FunctionInfo, Language } from '../types';

/**
 * JavaScript / TypeScript 解析器
 * - 收集所有层级的函数：function_declaration / function_expression / arrow_function
 * - 支持对象字面量方法、类方法（含字段形式的箭头函数）、export/default、赋值表达式、变量声明
 * - 名称解析优先级：自身 > 变量声明/解构 > 赋值左侧 > 对象属性 key > 方法名
 * - 注释向上查找：连续的行注释 / JSDoc（/** *\/）优先，取首行非 @tag 文本
 * - 避免把类成员函数重复加入（类成员由 processClassDeclaration 产出）
 */
export class JavaScriptParser {
  constructor(private output: vscode.OutputChannel) {}

  /* ===================== 入口 ===================== */

  public extractJavaScriptHierarchy(rootNode: any, functions: FunctionInfo[], language: Language) {
    this.traverse(rootNode, (node: any) => {
      // class
      if (node.type === 'class_declaration' || node.type === 'class') {
        this.processClassDeclaration(node, functions, language);
        return;
      }

      // 任意层级函数
      if (
        node.type === 'function_declaration' ||
        node.type === 'function_expression' ||
        node.type === 'arrow_function'
      ) {
        // 类成员交给 processClassDeclaration 统一生成，避免重复
        if (this.isInsideClassMember(node)) return;

        const info = this.extractAnyFunction(node, language);
        if (info) functions.push(info);
        return;
      }
    });
  }

  /* ===================== 类与类成员 ===================== */

  private processClassDeclaration(node: any, out: FunctionInfo[], language: Language) {
    const name = this.findClassName(node) || 'class';
    const startLine = node.startPosition.row + 1;
    const endLine = node.endPosition.row + 1;

    out.push({
      id: `${language}-class-${name}-${node.startPosition.row}`,
      name,
      comment: this.extractComment(node, language) || '',
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

    // 类体
    const body =
      node.childForFieldName?.('body') ||
      (node.children || []).find((c: any) => c.type === 'class_body');
    if (!body) return;

    const members = body.namedChildren ?? body.children ?? [];
    for (const m of members) {
      if (!m) continue;

      if (m.type === 'class_declaration' || m.type === 'class') {
        // 嵌套类
        this.processClassDeclaration(m, out, language);
        continue;
      }

      if (m.type === 'method_definition' || m.type === 'public_field_definition' || m.type === 'field_definition') {
        const mi = this.extractClassMethod(m, name, language);
        if (mi) out.push(mi);
      }
    }
  }

  private extractClassMethod(methodNode: any, className: string, language: Language): FunctionInfo | null {
    // 方法名
    const name = this.findMethodName(methodNode) || 'anonymous';
    // 取到函数体节点，便于行号与参数
    const fn = this.findFunctionChild(methodNode);
    const startLine = (fn ?? methodNode).startPosition.row + 1;
    const endLine   = (fn ?? methodNode).endPosition.row + 1;

    // 参数
    const parameters = this.extractParameters(
      fn?.childForFieldName?.('parameters') ??
      fn?.parameters ??
      methodNode.childForFieldName?.('parameters')
    );

    return {
      id: `${language}-method-${className}.${name}-${(fn ?? methodNode).startPosition.row}`,
      name: `${className}.${name}`,
      comment: this.extractComment(methodNode, language) || '',
      startLine,
      endLine,
      parameters,
      returnType: 'any',
      visibility: this.isStatic(methodNode) ? 'public' : 'public',
      isStatic: this.isStatic(methodNode),
      language,
      type: 'method',
      className,
      namespaceName: undefined,
    };
  }

  private isStatic(node: any): boolean {
    return !!((node.modifiers ?? node.children ?? []).some((c: any) => c.type === 'static' || c.text === 'static'));
  }

  /* ===================== 任意函数 ===================== */

  private extractAnyFunction(node: any, language: Language): FunctionInfo | null {
    const name = this.resolveFunctionName(node) || `anonymous@${node.startPosition.row + 1}`;
    const parameters = this.extractParameters(
      node.childForFieldName?.('parameters') ?? node.parameters
    );
    const startLine = node.startPosition.row + 1;
    const endLine = node.endPosition.row + 1;

    // 过滤掉各种简单函数
    if (this.shouldSkipFunction(node, name, startLine, endLine)) {
      return null;
    }

    return {
      id: `${language}-fn-${name}-${node.startPosition.row}`,
      name,
      comment: this.extractComment(node, language) || '',
      startLine,
      endLine,
      parameters,
      returnType: 'any',
      visibility: 'public',
      isStatic: false,
      language,
      type: 'function',
      className: undefined,
      namespaceName: undefined,
    };
  }

  /**
   * 判断是否应该跳过某个函数
   */
  private shouldSkipFunction(node: any, name: string, startLine: number, endLine: number): boolean {
    // 1. 跳过单行的简单箭头函数（包括有名字的）
    if (node.type === 'arrow_function' && startLine === endLine) {
      const text = node.text || '';
      // 更严格的过滤：单行且不包含花括号的箭头函数
      const isSimple = !text.includes('{') && text.length < 120;
      if (isSimple) {
        // 额外检查：如果是非常简单的工具函数，也跳过
        const isUtilityFunction = (
          text.includes('=>') && 
          (text.length < 80 || 
           text.match(/=>\s*\(.*\)/) || // => (expression)
           text.match(/=>\s*[^{]*$/) || // => simple expression
           text.includes('??') ||       // 空值合并
           text.includes('?.'))         // 可选链
        );
        if (isUtilityFunction) return true;
      }
    }

    // 2. 跳过匿名回调函数（如 forEach、map 等）
    if (name.startsWith('anonymous@')) {
      // 检查父节点是否是方法调用
      const parent = node.parent;
      if (parent && this.isMethodCall(parent)) {
        return true; // 跳过方法调用中的回调函数
      }
      
      // 检查是否是简单的匿名函数
      const text = node.text || '';
      if (text.length < 150) return true;
      
      // 跳过 Promise 构造函数的回调
      if (this.isPromiseCallback(node)) {
        return true;
      }
    }

    // 3. 跳过立即执行函数表达式 (IIFE)
    if (this.isIIFE(node)) {
      return true;
    }

    // 4. 跳过变量声明中的简单工具函数
    if (this.isSimpleUtilityFunction(node, name)) {
      return true;
    }

    // 5. 跳过所有回调函数（无论是否有名字）
    if (this.isCallbackFunction(node)) {
      return true;
    }

    // 6. 跳过对象字面量中的简单方法
    if (this.isSimpleObjectMethod(node, name)) {
      return true;
    }

    // 7. 跳过内部辅助函数
    if (this.isInternalHelperFunction(node, name)) {
      return true;
    }

    return false;
  }

  /**
   * 检查是否是 Promise 构造函数的回调
   */
  private isPromiseCallback(node: any): boolean {
    if (!node) return false;
    
    // 检查是否在 new Promise() 的参数中
    let parent = node.parent;
    while (parent) {
      if (parent.type === 'new_expression') {
        const constructor = parent.childForFieldName?.('constructor') || parent.children?.[1];
        if (constructor && constructor.text === 'Promise') {
          return true;
        }
      }
      parent = parent.parent;
      // 限制搜索深度
      if (!parent || parent.type === 'program') break;
    }
    
    return false;
  }

  /**
   * 检查是否是内部辅助函数
   */
  private isInternalHelperFunction(node: any, name: string): boolean {
    if (!node || !name) return false;
    
    // 常见的内部辅助函数名模式
    const helperPatterns = [
      /^check[A-Z]/,          // checkMonaco, checkStatus 等
      /^validate[A-Z]/,       // validateData 等
      /^handle[A-Z]/,         // handleError 等
      /^process[A-Z]/,        // processData 等
      /^parse[A-Z]/,          // parseResult 等
      /^format[A-Z]/,         // formatValue 等
      /^convert[A-Z]/,        // convertValue 等
      /^transform[A-Z]/,      // transformData 等
      /^helper[A-Z]/,         // helperFunction 等
      /^util[A-Z]/,           // utilFunction 等
      /^_/,                   // _privateFunction 等
      /Helper$/,              // functionHelper 等
      /Util$/,                // functionUtil 等
      /Internal$/             // functionInternal 等
    ];
    
    // 检查是否匹配内部辅助函数模式
    const isHelperName = helperPatterns.some(pattern => pattern.test(name));
    
    if (isHelperName) {
      // 检查是否在其他函数内部定义
      let parent = node.parent;
      let depth = 0;
      while (parent && depth < 10) {
        if (parent.type === 'function_declaration' || 
            parent.type === 'function_expression' || 
            parent.type === 'arrow_function' ||
            parent.type === 'method_definition') {
          return true; // 在其他函数内部定义的辅助函数
        }
        parent = parent.parent;
        depth++;
      }
      
      // 即使不在函数内部，如果是明显的辅助函数名，也跳过
      const obviousHelpers = ['checkMonaco', 'checkStatus', 'validateInput', 'handleError'];
      if (obviousHelpers.includes(name)) {
        return true;
      }
    }
    
    return false;
  }

  /**
   * 检查是否是回调函数
   */
  private isCallbackFunction(node: any): boolean {
    if (!node) return false;
    
    // 简化逻辑：直接检查父节点链
    let current = node;
    let depth = 0;
    const maxDepth = 5; // 限制搜索深度
    
    while (current && depth < maxDepth) {
      // 检查是否是方法调用
      if (current.type === 'call_expression') {
        const callee = current.childForFieldName?.('function') || current.children?.[0];
        
        if (callee) {
          // 直接方法调用：forEach()
          if (callee.type === 'identifier') {
            const methodName = callee.text;
            if (this.isCallbackMethod(methodName)) {
              return true;
            }
          }
          
          // 成员方法调用：array.forEach()
          if (callee.type === 'member_expression') {
            const property = callee.childForFieldName?.('property') || callee.children?.[2];
            if (property && property.text) {
              const methodName = property.text;
              if (this.isCallbackMethod(methodName)) {
                return true;
              }
            }
          }
        }
      }
      
      current = current.parent;
      depth++;
    }
    
    return false;
  }
  
  /**
   * 检查是否是回调方法
   */
  private isCallbackMethod(methodName: string): boolean {
    const callbackMethods = [
      'forEach', 'map', 'filter', 'reduce', 'find', 'findIndex',
      'some', 'every', 'sort', 'reverse', 'slice', 'splice',
      'push', 'pop', 'shift', 'unshift', 'includes', 'indexOf',
      'setTimeout', 'setInterval', 'addEventListener', 'removeEventListener',
      'then', 'catch', 'finally', // Promise 方法
      'on', 'off', 'once', 'emit' // 事件方法
    ];
    
    return callbackMethods.includes(methodName);
  }
  
  /**
   * 检查节点是否在方法调用的参数中
   */
  private isNodeInArguments(node: any, callExpression: any): boolean {
    const args = callExpression.childForFieldName?.('arguments') || 
                 callExpression.children?.find((c: any) => c.type === 'arguments');
    
    if (!args) return false;
    
    // 递归检查参数中是否包含目标节点
    const containsNode = (parent: any, target: any): boolean => {
      if (parent === target) return true;
      if (!parent.children) return false;
      
      for (const child of parent.children) {
        if (containsNode(child, target)) return true;
      }
      return false;
    };
    
    return containsNode(args, node);
  }

  /**
   * 检查是否是简单的工具函数
   */
  private isSimpleUtilityFunction(node: any, name: string): boolean {
    // 检查是否是变量声明中的箭头函数
    const parent = node.parent;
    if (parent && parent.type === 'variable_declarator') {
      const text = node.text || '';
      
      // 简单工具函数的特征：
      // 1. 单行箭头函数
      // 2. 包含常见的工具函数模式
      const utilityPatterns = [
        /=>\s*\(.*\?\?.*\)/, // 空值合并模式：=> (a ?? b)
        /=>\s*.*\.toString\(\)/, // 转字符串模式
        /=>\s*.*\.toFixed\(\)/, // 数字格式化
        /=>\s*.*\.padStart\(/, // 字符串填充
        /=>\s*.*\.toUpperCase\(\)/, // 大小写转换
        /=>\s*.*\.toLowerCase\(\)/, // 大小写转换
        /=>\s*.*\[\w+\]/, // 索引访问模式：=> obj[key]
        /=>\s*\w+\s*[+\-*/]\s*\w+/, // 简单运算：=> a + b
      ];

      return utilityPatterns.some(pattern => pattern.test(text)) && text.length < 120;
    }

    return false;
  }

  /**
   * 检查是否是方法调用（如 forEach、map、filter 等）
   */
  private isMethodCall(node: any): boolean {
    if (!node) return false;
    
    // 检查是否是方法调用
    if (node.type === 'call_expression') {
      const callee = node.childForFieldName?.('function') || node.children?.[0];
      if (callee && callee.type === 'member_expression') {
        const property = callee.childForFieldName?.('property') || callee.children?.[2];
        if (property && property.text) {
          const methodName = property.text;
          // 常见的数组/对象方法
          const callbackMethods = [
            'forEach', 'map', 'filter', 'reduce', 'find', 'findIndex',
            'some', 'every', 'sort', 'reverse', 'slice', 'splice',
            'push', 'pop', 'shift', 'unshift', 'includes', 'indexOf'
          ];
          return callbackMethods.includes(methodName);
        }
      }
    }
    
    return false;
  }

  /**
   * 检查是否是立即执行函数表达式 (IIFE)
   */
  private isIIFE(node: any): boolean {
    if (!node) return false;
    
    // 检查父节点是否是 IIFE 模式
    const parent = node.parent;
    if (parent && parent.type === 'call_expression') {
      const callee = parent.childForFieldName?.('function') || parent.children?.[0];
      // 如果函数节点就是当前节点，且被立即调用，则是 IIFE
      return callee === node;
    }
    
    return false;
  }

  /**
   * 检查是否是对象字面量中的简单方法
   */
  private isSimpleObjectMethod(node: any, name: string): boolean {
    if (!node) return false;
    
    const parent = node.parent;
    if (parent && parent.type === 'pair') {
      // 检查是否是对象字面量中的简单方法
      const text = node.text || '';
      
      // 常见的简单对象方法名
      const simpleMethodNames = [
        'run', 'handler', 'callback', 'onClick', 'onSubmit', 'onLoad',
        'onError', 'success', 'error', 'complete', 'done', 'fail',
        'init', 'destroy', 'setup', 'cleanup', 'reset', 'update',
        'render', 'draw', 'paint', 'refresh', 'reload'
      ];
      
      // 如果是简单方法名且代码较短，跳过
      if (simpleMethodNames.includes(name) && text.length < 200) {
        return true;
      }
      
      // 如果是单行的对象方法，也跳过
      if (node.type === 'arrow_function' && text.length < 150 && !text.includes('\n')) {
        return true;
      }
      
      // 如果只是调用其他方法，也跳过
      if (text.includes('this.') && text.split('\n').length <= 3) {
        return true;
      }
    }
    
    return false;
  }

  /* ===================== 名称解析 ===================== */

  private resolveFunctionName(node: any): string | null {
    // 1) 普通函数声明：function foo() {}
    if (node.type === 'function_declaration') {
      const id = node.childForFieldName?.('name') || (node.children || []).find((c: any) => c.type === 'identifier');
      return id?.text ?? null;
    }

    // 对于表达式 / 箭头函数，从父节点推断名字
    let cur: any = node.parent;

    // export default function() {} / export default () => {}
    if (cur && (cur.type === 'export_statement' || cur.type === 'export_default_declaration')) {
      // 继续向上找真正绑定名的节点
      cur = cur.childForFieldName?.('declaration') ?? node.parent;
    }

    // 2) 变量声明：const foo = () => {}
    if (cur && cur.type === 'variable_declarator') {
      const id =
        cur.childForFieldName?.('name') ||
        (cur.children || []).find((c: any) => c.type === 'identifier' || c.type === 'shorthand_property_identifier_pattern');
      return id?.text ?? null;
    }

    // 3) 赋值表达式：foo.bar = function() {}
    if (cur && cur.type === 'assignment_expression') {
      const left = cur.childForFieldName?.('left') || (cur.children || [])[0];
      const name = this.flattenMemberName(left);
      return name || null;
    }

    // 4) 对象字面量属性：{ foo: () => {} } or { foo() {} }
    if (cur && (cur.type === 'pair' || cur.type === 'method_definition')) {
      const key =
        cur.childForFieldName?.('key') ||
        (cur.children || []).find((c: any) =>
          ['property_identifier', 'property_name', 'identifier', 'string', 'number'].includes(c.type)
        );
      if (key) {
        // "foo" / 'foo' / 123
        return this.stripQuotes(key.text ?? '');
      }
    }

    // 5) 类字段：class A { foo = () => {} }
    if (cur && (cur.type === 'public_field_definition' || cur.type === 'field_definition')) {
      const id =
        cur.childForFieldName?.('name') ||
        (cur.children || []).find((c: any) => c.type === 'property_identifier' || c.type === 'identifier' || c.type === 'private_property_identifier');
      return id?.text ?? null;
    }

    return null;
  }

  private findClassName(node: any): string | null {
    const id = node.childForFieldName?.('name') || (node.children || []).find((c: any) => c.type === 'identifier');
    return id?.text ?? null;
  }

  private findMethodName(node: any): string | null {
    // method_definition 的 name 在 property_identifier / private_property_identifier / property_name
    const nameNode =
      node.childForFieldName?.('name') ||
      node.childForFieldName?.('key') ||
      (node.children || []).find((c: any) =>
        ['property_identifier', 'private_property_identifier', 'property_name', 'identifier', 'string'].includes(c.type)
      );
    return nameNode ? this.stripQuotes(nameNode.text) : null;
  }

  private findFunctionChild(node: any): any | null {
    // 方法节点里包着 function_expression / arrow_function
    const q = (node.namedChildren ?? node.children ?? []) as any[];
    return q.find(n => n.type === 'function' || n.type === 'function_expression' || n.type === 'arrow_function') ?? null;
  }

  private flattenMemberName(left: any): string {
    // a.b.c  /  a['b'].c
    const parts: string[] = [];
    const walk = (n: any) => {
      if (!n) return;
      if (n.type === 'identifier' || n.type === 'property_identifier' || n.type === 'private_property_identifier') {
        parts.push(n.text);
      } else if (n.type === 'string' || n.type === 'template_string') {
        parts.push(this.stripQuotes(n.text));
      } else if (n.type === 'member_expression') {
        walk(n.childForFieldName?.('object') || n.children?.[0]);
        walk(n.childForFieldName?.('property') || n.children?.[2]);
        return;
      } else if (n.type === 'subscript_expression') {
        walk(n.childForFieldName?.('object') || n.children?.[0]);
        walk(n.childForFieldName?.('index') || n.children?.[2]);
        return;
      } else if (n.type === 'parenthesized_expression') {
        walk(n.children?.[1]);
        return;
      }
    };
    walk(left);
    return parts.filter(Boolean).join('.');
  }

  private stripQuotes(s: string): string {
    if (!s) return s;
    if ((s.startsWith('"') && s.endsWith('"')) || (s.startsWith("'") && s.endsWith("'"))) {
      return s.slice(1, -1);
    }
    return s;
  }

  private isInsideClassMember(node: any): boolean {
    // 只要祖先里有 class_body，并且直接父节点是 method_definition / field_definition，就视为类成员
    let cur = node.parent;
    let seenClassBody = false;
    while (cur) {
      if (cur.type === 'class_body') seenClassBody = true;
      if (seenClassBody && (cur.type === 'method_definition' || cur.type === 'public_field_definition' || cur.type === 'field_definition')) {
        return true;
      }
      cur = cur.parent;
    }
    return false;
  }

  /* ===================== 参数解析 ===================== */

  private extractParameters(paramNode: any): string[] {
    if (!paramNode) return [];
    const names: string[] = [];

    const collect = (n: any) => {
      if (!n) return;
      if (['identifier', 'pattern', 'rest_pattern', 'shorthand_property_identifier_pattern'].includes(n.type)) {
        if (n.text) names.push(n.text.replace(/^\.\.\./, '...'));
      } else if (n.type === 'assignment_pattern') {
        collect(n.childForFieldName?.('left') || n.children?.[0]);
      } else if (n.type === 'array_pattern' || n.type === 'object_pattern' || n.type === 'formal_parameters' || n.type === 'parameters') {
        for (const c of n.namedChildren ?? n.children ?? []) collect(c);
      } else if (n.type === 'rest_parameter') {
        const id = n.childForFieldName?.('identifier') || n.children?.find((c: any) => c.type === 'identifier');
        if (id?.text) names.push('...' + id.text);
      }
    };

    collect(paramNode);
    return names;
  }

  /* ===================== 注释提取（向上查找） ===================== */

  private extractComment(node: any, _language: Language): string | undefined {
    // 锚点：如果处于声明/赋值/属性里，优先用外层语句节点取注释
    const anchor = this.findStatementAnchor(node) || node;
    const comments: any[] = [];

    // 收集紧邻在锚点之前的“连续”注释（同父级，且中间无其他 token）
    let prev = anchor.previousSibling;
    while (prev && this.isIgnorableGap(prev)) prev = prev.previousSibling;

    while (prev && prev.type === 'comment') {
      comments.unshift(prev);
      prev = prev.previousSibling;
      // 跨过空白/分号之类“空隙”
      while (prev && this.isIgnorableGap(prev)) prev = prev.previousSibling;
    }

    if (comments.length === 0) return undefined;

    // 优先 JSDoc 块；否则行注释合并后取第一行非 @tag
    const text = comments.map(c => c.text).join('\n');

    if (text.includes('/**')) {
      const cleaned = this.cleanJsDoc(text);
      return cleaned || undefined;
    }

    const oneLine = this.firstMeaningfulLine(
      text
        .split('\n')
        .map(l => l.replace(/^\s*\/\/\s?/, '').trim())
        .join(' ')
    );
    return oneLine || undefined;
  }

  private isIgnorableGap(n: any): boolean {
    // 忽略分号、逗号、空白节点（tree-sitter 不一定给空白），尽量保守
    return n.type === ',' || n.type === ';';
  }

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

  private firstMeaningfulLine(s: string): string {
    for (const line of s.split(/\r?\n/)) {
      const t = line.trim();
      if (!t) continue;
      if (t.startsWith('@')) continue;
      return t;
    }
    return '';
  }

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
        p.type === 'field_definition'
      ) {
        return p;
      }
      cur = p;
    }
    return null;
  }

  /* ===================== 通用遍历 ===================== */

  private traverse(node: any, fn: (n: any) => void) {
    const stack: any[] = [node];
    while (stack.length) {
      const cur = stack.pop();
      if (!cur) continue;
      fn(cur);
      const kids = cur.namedChildren ?? cur.children ?? [];
      for (let i = kids.length - 1; i >= 0; i--) stack.push(kids[i]);
    }
  }
}
