import * as vscode from 'vscode';
import { FunctionInfo } from '../types';

export class JavaScriptParser {
    private outputChannel: vscode.OutputChannel;

    constructor(outputChannel: vscode.OutputChannel) {
        this.outputChannel = outputChannel;
    }

    /**
     * 解析JavaScript/TypeScript文档的层级结构
     */
    public extractJavaScriptHierarchy(rootNode: any, functions: FunctionInfo[], language: string): void {
        if (!rootNode.children) return;

        this.outputChannel.appendLine('🔍 开始解析JavaScript层级结构...');
        this.outputChannel.appendLine(`🔍 根节点类型: ${rootNode.type}`);
        this.outputChannel.appendLine(`🔍 根节点子节点数量: ${rootNode.children.length}`);
        

        this.traverseTree(rootNode, (node) => {
            this.outputChannel.appendLine(`🔍 检查节点: ${node.type}, 文本: "${node.text?.substring(0, 100)}..."`);

            if (node.type === 'class_declaration') {
                this.outputChannel.appendLine(`✅ 发现类声明节点`);
                this.processClassDeclaration(node, functions, language);
                return;
            }

            // 统一收集任意层级函数：声明、表达式、箭头函数
            if (
                node.type === 'function_declaration' ||
                node.type === 'function_expression' ||
                node.type === 'arrow_function'
            ) {
                const info = this.extractAnyFunction(node, language);
                if (info) {
                    functions.push(info);
                    this.outputChannel.appendLine(`✅ 收集函数: ${info.name} [${info.startLine}-${info.endLine}] (${node.type})`);
                } else {
                    this.outputChannel.appendLine(`⚠️ 未能为 ${node.type} 解析出有效函数信息，已跳过`);
                }
                return;
            }
        });
    }


    /**
     * 提取任意函数
     */
    private extractAnyFunction(node: any, language: string): FunctionInfo | null {
        // 1) 名称
        const name = this.resolveFunctionName(node) || `anonymous@${node.startPosition.row + 1}`;

        // 2) 参数
        const paramNode = node.parameters || node.childForFieldName?.('parameters');
        const parameters = this.extractParameters(paramNode);

        // 3) 行号
        const startLine = node.startPosition.row + 1;
        const endLine = node.endPosition.row + 1;

        // 4) 生成 FunctionInfo（统一用 'function'；类方法仍由 processClassDeclaration 产出 'method'）
        const info: FunctionInfo = {
            id: `${language}-${name}-${node.startPosition.row}`,
            name,
            comment: this.extractComment(node, language),
            startLine,
            endLine,
            parameters,
            returnType: 'any',
            visibility: 'public',
            isStatic: false,
            language,
            type: 'function',
            className: undefined,
            namespaceName: undefined
        };
        return info;
    }


    /**
     * 解析函数名称
     */
    private resolveFunctionName(node: any): string | undefined {
        // 直接从自身拿（function_declaration）
        const direct = this.findJavaScriptFunctionName(node);
        if (direct) return direct;

        // 沿父链推断名称
        let cur = node.parent;
        while (cur) {
            switch (cur.type) {
                case 'variable_declarator':
                    // const foo = () => {}
                    if (cur.children) {
                        const id = cur.children.find((c: any) => c.type === 'identifier');
                        if (id?.text) return id.text;
                    }
                    break;
                case 'assignment_expression':
                    // foo = () => {}  /  obj.foo = () => {}
                    const left = cur.children?.find((c: any) => c.fieldName === 'left') || cur.children?.[0];
                    if (left) {
                        // 标识符
                        const id = this.findFirstIdentifier(left);
                        if (id) return id;
                        // 成员表达式 a.b.c -> 取最后一个属性名
                        const lastProp = this.findLastPropertyIdentifier(left);
                        if (lastProp) return lastProp;
                    }
                    break;
                case 'property':
                    // const o = { bar: () => {}, baz() {} }
                    const key = cur.children?.find((c: any) =>
                        c.type === 'property_identifier' || c.type === 'identifier' || c.type === 'string' || c.type === 'number'
                    );
                    if (key?.text) return key.text.replace(/^['"]|['"]$/g, '');
                    break;
                case 'method_definition':
                    // class 内的方法由现有逻辑处理；对象字面量 method 也可能走到这里
                    const m = this.findMethodName(cur);
                    if (m) return m;
                    break;
            }
            cur = cur.parent;
        }
        return undefined;
    }

    /**
     * 查找第一个标识符
     */
    private findFirstIdentifier(node: any): string | undefined {
        if (!node) return undefined;
        if (node.type === 'identifier') return node.text;
        if (node.children) {
            for (const ch of node.children) {
                const r = this.findFirstIdentifier(ch);
                if (r) return r;
            }
        }
        return undefined;
    }

    /**
     * 查找最后一个属性标识符
     */
    private findLastPropertyIdentifier(node: any): string | undefined {
        // 处理 member_expression 链：a.b.c 取 c
        if (!node) return undefined;
        let name: string | undefined;
        const walk = (n: any) => {
            if (!n) return;
            if (n.type === 'property_identifier' || n.type === 'identifier') {
                name = n.text;
            }
            if (n.children) n.children.forEach(walk);
        };
        walk(node);
        return name;
    }




    /**
     * 验证函数名是否有效
     */
    private isValidFunctionName(name: string): boolean {
        if (!name || name.length <= 1) return false;
        
        // 检查是否是常见的循环变量名或参数名
        const invalidNames = [
            'key', 'value', 'item', 'element', 'part', 'path', 'file', 'data',
            'i', 'j', 'k', 'h', 'v', 'x', 'y', 'z', 'n', 'm', 'p', 'q',
            'a', 'b', 'c', 'd', 'e', 'f', 'g', 'r', 's', 't', 'u', 'w'
        ];
        if (invalidNames.includes(name.toLowerCase())) return false;
        
        // 检查是否符合JavaScript标识符规则
        return /^[a-zA-Z_$][a-zA-Z0-9_$]*$/.test(name);
    }

    /**
     * 检查是否是顶级箭头函数
     */
    private isTopLevelArrowFunction(node: any): boolean {
        if (!node.parent) return false;
        
        // 检查父节点类型，确保不是作为参数或变量的一部分
        const parentType = node.parent.type;
        const invalidParentTypes = [
            'call_expression',      // 函数调用
            'assignment_expression', // 赋值表达式
            'variable_declarator',   // 变量声明
            'property',              // 对象属性
            'array_element',         // 数组元素
            'argument_list'          // 参数列表
        ];
        
        if (invalidParentTypes.includes(parentType)) {
            return false;
        }
        
        return true;
    }

    /**
     * 处理类声明
     */
    private processClassDeclaration(classNode: any, functions: FunctionInfo[], language: string): void {
        const className = this.findClassName(classNode);
        if (!className) {
            this.outputChannel.appendLine(`❌ 无法找到类名，跳过此类声明`);
            return;
        }

        this.outputChannel.appendLine(`🔍 处理类声明: ${className}`);

        // 创建类节点
        const classInfo: FunctionInfo = {
            id: `${language}-${className}-${classNode.startPosition.row}`,
            name: className,
            comment: this.extractComment(classNode, language),
            startLine: classNode.startPosition.row + 1,
            endLine: classNode.endPosition.row + 1,
            parameters: [],
            returnType: 'class',
            visibility: 'public',
            isStatic: false,
            language,
            type: 'class',
            className: undefined,
            namespaceName: undefined
        };

        functions.push(classInfo);
        this.outputChannel.appendLine(`✅ 添加类到函数列表: ${className}`);

        // 查找类中的方法 - 递归遍历所有子节点
        let methodCount = 0;
        this.traverseClassMethods(classNode, (methodNode) => {
            if (this.isClassMethod(methodNode)) {
                this.outputChannel.appendLine(`  ✅ 识别为类方法: ${methodNode.type}`);
                const methodInfo = this.extractClassMethod(methodNode, language, className);
                if (methodInfo) {
                    this.outputChannel.appendLine(`✅ 提取类方法: ${methodInfo.name}`);
                    // 设置className，这样在convertFunctionsToOutlineItems中就能正确建立父子关系
                    methodInfo.className = className;
                    functions.push(methodInfo);
                    methodCount++;
                } else {
                    this.outputChannel.appendLine(`❌ 提取类方法失败: ${methodNode.type}`);
                }
            } else {
                this.outputChannel.appendLine(`  ❌ 不是类方法: ${methodNode.type}`);
            }
        });
        
        this.outputChannel.appendLine(`📊 类 ${className} 处理完成，找到 ${methodCount} 个方法`);
    }

    /**
     * 递归遍历类中的所有方法
     */
    private traverseClassMethods(classNode: any, callback: (methodNode: any) => void): void {
        if (!classNode.children) return;
        
        classNode.children.forEach((child: any) => {
            // 如果是class_body，继续遍历其子节点
            if (child.type === 'class_body') {
                this.traverseClassMethods(child, callback);
            }
            // 如果是方法定义，直接调用回调
            else if (this.isClassMethod(child)) {
                callback(child);
            }
            // 其他情况，递归遍历
            else if (child.children) {
                this.traverseClassMethods(child, callback);
            }
        });
    }

    /**
     * 处理顶级函数
     */
    private processTopLevelFunction(functionNode: any, functions: FunctionInfo[], language: string): void {
        const functionName = this.findJavaScriptFunctionName(functionNode);
        if (!functionName) return;

        const functionInfo: FunctionInfo = {
            id: `${language}-${functionName}-${functionNode.startPosition.row}`,
            name: functionName,
            comment: this.extractComment(functionNode, language),
            startLine: functionNode.startPosition.row + 1,
            endLine: functionNode.endPosition.row + 1,
            parameters: this.extractParameters(functionNode.parameters),
            returnType: 'any',
            visibility: 'public',
            isStatic: false,
            language,
            type: 'function',
            className: undefined,
            namespaceName: undefined
        };

        functions.push(functionInfo);
    }

    /**
     * 处理顶级箭头函数
     */
    private processTopLevelArrowFunction(arrowFunctionNode: any, functions: FunctionInfo[], language: string): void {
        const functionName = this.findArrowFunctionName(arrowFunctionNode);
        if (!functionName) return;

        const functionInfo: FunctionInfo = {
            id: `${language}-${functionName}-${arrowFunctionNode.startPosition.row}`,
            name: functionName,
            comment: this.extractComment(arrowFunctionNode, language),
            startLine: arrowFunctionNode.startPosition.row + 1,
            endLine: arrowFunctionNode.endPosition.row + 1,
            parameters: this.extractParameters(arrowFunctionNode.parameters),
            returnType: 'any',
            visibility: 'public',
            isStatic: false,
            language,
            type: 'function',
            className: undefined,
            namespaceName: undefined
        };

        functions.push(functionInfo);
    }

    /**
     * 检查是否是类方法
     */
    private isClassMethod(node: any): boolean {
        const isMethod = node.type === 'method_definition' ||
               node.type === 'constructor_declaration' ||
               node.type === 'getter' ||
               node.type === 'setter' ||
               node.type === 'function_declaration' ||  // 类内的函数声明
               node.type === 'arrow_function';          // 类内的箭头函数
        
        this.outputChannel.appendLine(`🔍 检查是否为类方法: ${node.type} -> ${isMethod ? '是' : '否'}`);
        if (isMethod) {
            this.outputChannel.appendLine(`  ✅ 节点文本: "${node.text?.substring(0, 100)}..."`);
        }
        
        return isMethod;
    }

    /**
     * 提取类方法
     */
    private extractClassMethod(methodNode: any, language: string, className: string): FunctionInfo | null {
        try {
            this.outputChannel.appendLine(`🔍 开始提取类方法，节点类型: ${methodNode.type}`);
            
            let name = '';
            let type: 'function' | 'method' | 'constructor' | 'class' | 'namespace' | 'property' | 'field' | 'event' = 'method';
            let parameters: string[] = [];
            let isStatic = false;

            if (methodNode.type === 'method_definition') {
                name = this.findMethodName(methodNode) || 'anonymous';
                type = 'method';
                parameters = this.extractParameters(methodNode.parameters);
                isStatic = methodNode.static || false;
            } else if (methodNode.type === 'constructor_declaration') {
                name = 'constructor';
                type = 'constructor';
                parameters = this.extractParameters(methodNode.parameters);
            } else if (methodNode.type === 'getter') {
                name = this.findGetterName(methodNode) || 'getter';
                type = 'property';
            } else if (methodNode.type === 'setter') {
                name = this.findSetterName(methodNode) || 'setter';
                type = 'property';
            } else if (methodNode.type === 'function_declaration') {
                name = this.findJavaScriptFunctionName(methodNode) || 'anonymous';
                type = 'method';
                parameters = this.extractParameters(methodNode.parameters);
            } else if (methodNode.type === 'arrow_function') {
                name = this.findArrowFunctionName(methodNode) || 'arrow_function';
                type = 'method';
                parameters = this.extractParameters(methodNode.parameters);
            }

            if (!name || name === 'anonymous') {
                this.outputChannel.appendLine(`❌ 无法提取方法名，跳过此方法`);
                return null;
            }

            this.outputChannel.appendLine(`✅ 成功提取类方法: ${name} (${type})`);
            return {
                id: `${language}-${className}-${name}-${methodNode.startPosition.row}`,
                name: name,
                comment: this.extractComment(methodNode, language),
                startLine: methodNode.startPosition.row + 1,
                endLine: methodNode.endPosition.row + 1,
                parameters,
                returnType: 'any',
                visibility: 'public',
                isStatic,
                language,
                type,
                className,
                namespaceName: undefined
            };
        } catch (err) {
            this.outputChannel.appendLine(`❌ 提取类方法失败: ${err}`);
            return null;
        }
    }

    /**
     * 查找getter名称
     */
    private findGetterName(getterNode: any): string | undefined {
        if (!getterNode || !getterNode.children) return undefined;
        
        for (const child of getterNode.children) {
            if (child.type === 'property_identifier') {
                return child.text;
            }
        }
        return undefined;
    }

    /**
     * 查找setter名称
     */
    private findSetterName(setterNode: any): string | undefined {
        if (!setterNode || !setterNode.children) return undefined;
        
        for (const child of setterNode.children) {
            if (child.type === 'property_identifier') {
                return child.text;
            }
        }
        return undefined;
    }

    /**
     * 查找箭头函数名称
     */
    private findArrowFunctionName(arrowFunctionNode: any): string | undefined {
        if (!arrowFunctionNode || !arrowFunctionNode.children) return undefined;
        
        for (const child of arrowFunctionNode.children) {
            if (child.type === 'identifier') {
                return child.text;
            }
        }
        return undefined;
    }

    /**
     * 查找JavaScript函数名
     */
    private findJavaScriptFunctionName(functionNode: any): string | undefined {
        if (!functionNode || !functionNode.children) return undefined;
        
        for (const child of functionNode.children) {
            if (child.type === 'identifier') {
                const functionName = child.text;
                // 验证函数名是否有效（不是单个字符的变量名等）
                if (functionName && functionName.length > 1 && /^[a-zA-Z_$][a-zA-Z0-9_$]*$/.test(functionName)) {
                    return functionName;
                }
            }
            if (child.children) {
                const foundName = this.findJavaScriptFunctionName(child);
                if (foundName) return foundName;
            }
        }
        
        return undefined;
    }

    /**
     * 查找方法名
     */
    private findMethodName(methodNode: any): string | undefined {
        if (!methodNode || !methodNode.children) return undefined;
        
        for (const child of methodNode.children) {
            if (child.type === 'identifier') {
                return child.text;
            }
        }
        
        return undefined;
    }

    /**
     * 查找类名
     */
    private findClassName(classNode: any): string | undefined {
        if (!classNode || !classNode.children) return undefined;
        
        for (const child of classNode.children) {
            if (child.type === 'identifier') {
                return child.text;
            }
        }
        
        return undefined;
    }

    /**
     * 提取参数
     */
    private extractParameters(parametersNode: any): string[] {
        if (!parametersNode || !parametersNode.children) return [];

        const parameters: string[] = [];
        
        parametersNode.children.forEach((param: any) => {
            if (param.type === 'identifier') {
                parameters.push(param.text);
            } else if (param.type === 'parameter') {
                const identifier = param.children?.find((child: any) => 
                    child.type === 'identifier'
                );
                if (identifier) {
                    parameters.push(identifier.text);
                }
            }
        });

        return parameters;
    }

    /**
     * 提取注释
     */
    private extractComment(node: any, language: string): string {
        let allComments: string[] = [];
        
        // 查找节点前的注释
        let currentSibling = node.previousSibling;
        while (currentSibling) {
            if (currentSibling.type === 'comment' || currentSibling.type === 'comment_block') {
                const commentText = currentSibling.text.trim();
                allComments.unshift(commentText);
                currentSibling = currentSibling.previousSibling;
            } else {
                break;
            }
        }
        
        // 查找节点内的注释
        if (node.children) {
            for (const child of node.children) {
                if (child.type === 'comment' || child.type === 'comment_block') {
                    const commentText = child.text.trim();
                    allComments.push(commentText);
                }
            }
        }
        
        // 查找父节点的注释
        if ((language === 'javascript' || language === 'typescript') && node.parent) {
            let parent = node.parent;
            let parentComments: string[] = [];
            let currentParentSibling = parent.previousSibling;
            
            while (currentParentSibling) {
                if (currentParentSibling.type === 'comment' || currentParentSibling.type === 'comment_block') {
                    const commentText = currentParentSibling.text.trim();
                    parentComments.unshift(commentText);
                    currentParentSibling = currentParentSibling.previousSibling;
                } else {
                    break;
                }
            }
            
            if (parentComments.length > 0) {
                allComments = [...parentComments, ...allComments];
            }
        }
        
        // 如果找到了注释，合并并解析
        if (allComments.length > 0) {
            const combinedComment = allComments.join('\n');
            const cleanedComment = this.cleanComment(combinedComment, language);
            return cleanedComment;
        }
        
        return '';
    }

    /**
     * 清理注释
     */
    private cleanComment(commentText: string, language: string): string {
        if (!commentText) return '';
        
        let cleanText = commentText
            .replace(/^\/\/\s*/, '')
            .replace(/^\/\*\s*/, '')
            .replace(/\s*\*\/$/, '')
            .replace(/^#\s*/, '')
            .replace(/^\/\/\/\s*/, '')
            .replace(/^\*\s*/, '')
            .trim();
        
        // 对于JavaScript/TypeScript，查找JSDoc注释
        if (language === 'javascript' || language === 'typescript') {
            // 查找@description或@desc标签
            const descMatch = cleanText.match(/@(?:description|desc)\s+(.+)/);
            if (descMatch && descMatch[1]) {
                return descMatch[1].trim();
            }
            
            // 查找第一行非标签的文本
            const lines = cleanText.split('\n');
            for (const line of lines) {
                const trimmedLine = line.trim();
                if (trimmedLine && 
                    !trimmedLine.startsWith('@') && 
                    !trimmedLine.startsWith('*') &&
                    !trimmedLine.startsWith('/**') &&
                    !trimmedLine.startsWith('*/')) {
                    return trimmedLine;
                }
            }
            
            // 如果没有找到JSDoc内容，尝试提取简单的行注释
            const simpleComment = cleanText.replace(/^\/\/\s*/, '').trim();
            if (simpleComment) {
                return simpleComment;
            }
        }
        
        // 如果都没有找到，返回清理后的第一行非空文本
        const lines = cleanText.split('\n');
        for (const line of lines) {
            const trimmedLine = line.trim();
            if (trimmedLine) {
                return trimmedLine;
            }
        }
        
        return '';
    }

    /**
     * 遍历树
     */
    private traverseTree(node: any, callback: (node: any) => void): void {
        callback(node);
        
        if (node.children) {
            node.children.forEach((child: any) => {
                this.traverseTree(child, callback);
            });
        }
    }
} 