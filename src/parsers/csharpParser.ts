import * as vscode from 'vscode';
import { FunctionInfo } from '../types';

export class CSharpParser {
    private outputChannel: vscode.OutputChannel;

    constructor(outputChannel: vscode.OutputChannel) {
        this.outputChannel = outputChannel;
    }

    /**
     * 解析C#文档的层级结构
     */
    public extractCSharpHierarchy(rootNode: any, functions: FunctionInfo[], language: string): void {
        if (!rootNode.children) return;

        this.outputChannel.appendLine('🔍 开始解析C#层级结构...');
        this.outputChannel.appendLine(`🔍 根节点类型: ${rootNode.type}`);
        this.outputChannel.appendLine(`🔍 根节点子节点数量: ${rootNode.children.length}`);
        
        // 首先找到顶级类（不在其他类内部的类）
        const topLevelClasses: any[] = [];
        const nestedClasses: any[] = [];
        
        this.traverseTree(rootNode, (node) => {
            if (node.type === 'class_declaration') {
                if (this.isNestedClass(node)) {
                    nestedClasses.push(node);
                } else {
                    topLevelClasses.push(node);
                }
            }
        });
        
        this.outputChannel.appendLine(`📊 C#解析统计:`);
        this.outputChannel.appendLine(`  - 顶级类: ${topLevelClasses.length}`);
        this.outputChannel.appendLine(`  - 嵌套类: ${nestedClasses.length}`);
        
        // 处理顶级类
        topLevelClasses.forEach(classNode => {
            this.processCSharpClass(classNode, functions, language);
        });
        
        // 处理嵌套类
        nestedClasses.forEach(classNode => {
            this.processNestedCSharpClass(classNode, functions, language);
        });
        
        // 处理其他顶级成员
        this.traverseTree(rootNode, (node) => {
            if (node.type === 'namespace_declaration') {
                this.processCSharpNamespace(node, functions, language);
            } else if (node.type === 'method_declaration' || 
                       node.type === 'constructor_declaration' ||
                       node.type === 'event_declaration') {
                if (!this.isInsideClass(node) && !this.isAlreadyProcessedClass(node, topLevelClasses, nestedClasses)) {
                    this.processTopLevelCSharpMember(node, functions, language);
                }
            }
        });
        
        this.outputChannel.appendLine(`📊 C#解析完成，共提取 ${functions.length} 个函数信息`);
        
        // 详细分析提取的函数信息
        if (functions.length > 0) {
            this.outputChannel.appendLine(`🔍 提取的函数信息详情:`);
            functions.slice(0, 10).forEach((func, index) => {
                this.outputChannel.appendLine(`  ${index + 1}. ${func.name} (${func.type}) - 类:${func.className || '无'} - 命名空间:${func.namespaceName || '无'} - 行${func.startLine}-${func.endLine}`);
            });
            if (functions.length > 10) {
                this.outputChannel.appendLine(`  ... 还有 ${functions.length - 10} 个函数信息`);
            }
        }
    }

    // 在 CSharpParser 类里新增一个辅助方法
    private parametersFromLocalFunction(node: any): string[] {
        try {
            for (const ch of node.children || []) {
                if (ch.type === 'parameter_list') {
                    const text = ch.text || '';
                    // 去掉括号并按逗号分
                    return text.replace(/^\(|\)$/g, '').split(',')
                            .map((s: string) => s.trim())
                            .filter(Boolean);
                }
            }
        } catch {}
        return [];
    }



    /**
     * 处理C#命名空间
     */
    private processCSharpNamespace(namespaceNode: any, functions: FunctionInfo[], language: string): void {
        const namespaceName = this.findNamespaceName(namespaceNode);
        if (!namespaceName) return;

        const namespaceInfo: FunctionInfo = {
            id: `${language}-${namespaceName}-${namespaceNode.startPosition.row}`,
            name: namespaceName,
            comment: this.extractComment(namespaceNode, language),
            startLine: namespaceNode.startPosition.row + 1,
            endLine: namespaceNode.endPosition.row + 1,
            parameters: [],
            returnType: 'namespace',
            visibility: 'public',
            isStatic: false,
            language,
            type: 'namespace',
            className: undefined,
            namespaceName: undefined
        };

        functions.push(namespaceInfo);

        // 查找命名空间中的类和其他成员
        this.traverseCSharpNamespaceMembers(namespaceNode, (memberNode) => {
            if (memberNode.type === 'class_declaration') {
                this.processCSharpClass(memberNode, functions, language, namespaceName);
            } else if (this.isFunctionDeclaration(memberNode, language)) {
                const memberInfo = this.extractFunctionInfo(memberNode, language);
                if (memberInfo) {
                    memberInfo.namespaceName = namespaceName;
                    functions.push(memberInfo);
                }
            }
        });
    }

    /**
     * 处理C#类
     */
    private processCSharpClass(classNode: any, functions: FunctionInfo[], language: string, namespaceName?: string): void {
        const className = this.findClassName(classNode);
        if (!className) return;

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
            namespaceName: namespaceName
        };

        functions.push(classInfo);

        // 查找类中的方法、字段、事件、嵌套类等
        this.traverseCSharpClassMembers(classNode, (memberNode) => {
            if (memberNode.type === 'class_declaration') {
                // 处理嵌套类
                this.processNestedCSharpClass(memberNode, functions, language, className, namespaceName);
            } else if (this.isFunctionDeclaration(memberNode, language)) {
                const memberInfo = this.extractFunctionInfo(memberNode, language);
                if (memberInfo) {
                    memberInfo.className = className;
                    memberInfo.namespaceName = namespaceName;
                    functions.push(memberInfo);
                }
            }
        });
    }

    /**
     * 处理顶级C#成员
     */
    private processTopLevelCSharpMember(memberNode: any, functions: FunctionInfo[], language: string): void {
        const memberInfo = this.extractFunctionInfo(memberNode, language);
        if (memberInfo) {
            functions.push(memberInfo);
        }
    }

    /**
     * 处理嵌套的C#类
     */
    private processNestedCSharpClass(classNode: any, functions: FunctionInfo[], language: string, parentClassName?: string, namespaceName?: string): void {
        const className = this.findClassName(classNode);
        if (!className) return;

        const nestedClassInfo: FunctionInfo = {
            id: `${language}-${parentClassName || 'unknown'}-${className}-${classNode.startPosition.row}`,
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
            className: parentClassName,
            namespaceName: namespaceName
        };

        functions.push(nestedClassInfo);

        // 查找嵌套类中的方法、事件等
        this.traverseCSharpClassMembers(classNode, (memberNode) => {
            if (this.isFunctionDeclaration(memberNode, language)) {
                const memberInfo = this.extractFunctionInfo(memberNode, language);
                if (memberInfo) {
                    memberInfo.className = className;
                    memberInfo.namespaceName = namespaceName;
                    functions.push(memberInfo);
                }
            }
        });
    }

    /**
     * 递归遍历C#命名空间中的所有成员
     */
    private traverseCSharpNamespaceMembers(namespaceNode: any, callback: (memberNode: any) => void): void {
        if (!namespaceNode.children) return;
        
        namespaceNode.children.forEach((child: any) => {
            if (child.type === 'namespace_body') {
                this.traverseCSharpNamespaceMembers(child, callback);
            } else if (this.isFunctionDeclaration(child, 'csharp') || child.type === 'class_declaration') {
                callback(child);
            } else if (child.children) {
                this.traverseCSharpNamespaceMembers(child, callback);
            }
        });
    }

    /**
     * 递归遍历C#类中的所有成员
     */
    private traverseCSharpClassMembers(classNode: any, callback: (memberNode: any) => void): void {
        if (!classNode.children) return;
        
        classNode.children.forEach((child: any) => {
            if (child.type === 'class_body') {
                this.traverseCSharpClassMembers(child, callback);
            } else if (this.isFunctionDeclaration(child, 'csharp')) {
                callback(child);
            } else if (child.children) {
                this.traverseCSharpClassMembers(child, callback);
            }
        });
    }

    /**
     * 检查类是否是嵌套类
     */
    private isNestedClass(classNode: any): boolean {
        if (!classNode.parent) return false;
        
        let currentNode = classNode.parent;
        let depth = 0;
        
        while (currentNode && depth < 10) {
            if (currentNode.type === 'class_declaration') {
                return true;
            }
            currentNode = currentNode.parent;
            depth++;
        }
        return false;
    }
    
    /**
     * 检查节点是否在类内部
     */
    private isInsideClass(node: any): boolean {
        if (!node.parent) return false;
        
        let currentNode = node.parent;
        while (currentNode) {
            if (currentNode.type === 'class_declaration' || currentNode.type === 'class_body') {
                return true;
            }
            currentNode = currentNode.parent;
        }
        return false;
    }
    
    /**
     * 查找嵌套类的父类名
     */
    private findParentClassName(classNode: any): string | undefined {
        if (!classNode.parent) return undefined;
        
        let currentNode = classNode.parent;
        while (currentNode) {
            if (currentNode.type === 'class_declaration') {
                const parentClassName = this.findClassName(currentNode);
                if (parentClassName) {
                    return parentClassName;
                }
            }
            currentNode = currentNode.parent;
        }
        return undefined;
    }
    
    /**
     * 检查节点是否已经处理过
     */
    private isAlreadyProcessedClass(node: any, topLevelClasses: any[], nestedClasses: any[]): boolean {
        const isInTopLevel = topLevelClasses.some(top => 
            top.startPosition.row === node.startPosition.row && 
            top.startPosition.column === node.startPosition.column
        );
        
        const isInNested = nestedClasses.some(nested => 
            nested.startPosition.row === node.startPosition.row && 
            nested.startPosition.column === node.startPosition.column
        );
        
        return isInTopLevel || isInNested;
    }

    /**
     * 检查是否是函数声明
     */
    private isFunctionDeclaration(node: any, language: string): boolean {
        return node.type === 'method_declaration' ||
               node.type === 'constructor_declaration' ||
               node.type === 'local_function_statement' ||
               node.type === 'class_declaration' ||
               node.type === 'namespace_declaration' ||
               node.type === 'event_declaration' ||
               node.type === 'indexer_declaration' ||
               node.type === 'operator_declaration' ||
               node.type === 'conversion_operator_declaration' ||
               node.type === 'destructor_declaration';
    }

    /**
     * 提取函数信息
     */
    private extractFunctionInfo(node: any, language: string): FunctionInfo | null {
        try {
            let name = '';
            let parameters: string[] = [];
            let returnType = '';
            let visibility: 'public' | 'private' | 'protected' | 'internal' = 'public';
            let isStatic = false;
            let startLine = node.startPosition.row;
            let endLine = node.endPosition.row;
            let type: 'function' | 'method' | 'constructor' | 'class' | 'namespace' | 'property' | 'field' | 'event' = 'function';
            let className: string | undefined;
            let namespaceName: string | undefined;

            if (node.type === 'method_declaration') {
                name = this.findMethodName(node) || 'anonymous';
                parameters = this.extractParameters(node.parameters);
                
                if (node.return_type) {
                    returnType = node.return_type.text || 'void';
                }
                
                if (node.modifiers) {
                    node.modifiers.forEach((modifier: any) => {
                        if (modifier.text === 'static') {
                            isStatic = true;
                        } else if (['public', 'private', 'protected', 'internal'].includes(modifier.text)) {
                            visibility = modifier.text as any;
                        }
                    });
                }
                
                className = this.findClassName(node);
                namespaceName = this.findNamespaceName(node);
                type = 'method';
            } else if (node.type === 'constructor_declaration') {
                name = 'constructor';
                parameters = this.extractParameters(node.parameters);
                returnType = 'constructor';
                type = 'constructor';
                
                if (node.modifiers) {
                    node.modifiers.forEach((modifier: any) => {
                        if (['public', 'private', 'protected', 'internal'].includes(modifier.text)) {
                            visibility = modifier.text as any;
                        }
                    });
                }
                
                className = this.findClassName(node);
                namespaceName = this.findNamespaceName(node);
            } else if (node.type === 'class_declaration') {
                name = this.findClassName(node) || 'anonymous';
                namespaceName = this.findNamespaceName(node);
                returnType = 'class';
                type = 'class';
                
                // 对于嵌套类，需要设置其父类名称
                if (this.isNestedClass(node)) {
                    className = this.findParentClassName(node);
                }
            } else if (node.type === 'namespace_declaration') {
                name = this.findNamespaceName(node) || 'anonymous';
                returnType = 'namespace';
                type = 'namespace';  
                        
 
            } else if (node.type === 'local_function_statement') {
                // C# 本地函数：存在于方法体内
                // 名称：local_function_statement 下通常有 identifier
                let name = '';
                for (const ch of node.children || []) {
                    if (ch.type === 'identifier') {
                        name = ch.text;
                        break;
                    }
                }
                if (!name) name = 'local_function';

                const startLine = node.startPosition.row;
                const endLine = node.endPosition.row;

                // 父级是方法/构造函数，className/namespaceName 依旧可通过向上查找
                const className = this.findClassName(node);
                const namespaceName = this.findNamespaceName(node);

                return {
                    id: `${language}-${name}-${startLine + 1}`,
                    name,
                    comment: this.extractComment(node, language),
                    startLine: startLine + 1,
                    endLine: endLine + 1,
                    parameters: this.parametersFromLocalFunction(node),
                    returnType: 'function',
                    visibility: 'private', // 本地函数不暴露，标私有即可
                    isStatic: false,
                    language,
                    type: 'function', // 与 types.ts 定义一致
                    className,
                    namespaceName
                };
            } else if (node.type === 'event_declaration') {
                name = this.findEventName(node) || 'event';
                returnType = this.findEventType(node) || 'event';
                type = 'event';
                
                if (node.modifiers) {
                    node.modifiers.forEach((modifier: any) => {
                        if (modifier.text === 'static') {
                            isStatic = true;
                        } else if (['public', 'private', 'protected', 'internal'].includes(modifier.text)) {
                            visibility = modifier.text as any;
                        }
                    });
                }
                
                className = this.findClassName(node);
                namespaceName = this.findNamespaceName(node);
            }

            if (!name) return null;

            return {
                id: `${language}-${name}-${startLine}`,
                name,
                comment: this.extractComment(node, language),
                startLine: startLine + 1,
                endLine: endLine + 1,
                parameters,
                returnType: returnType || 'void',
                visibility,
                isStatic,
                language,
                type,
                className,
                namespaceName
            };
        } catch (err) {
            console.warn('提取函数信息失败:', err);
            return null;
        }
    }

    /**
     * 查找方法名
     */
    private findMethodName(methodNode: any): string | undefined {
        if (!methodNode || !methodNode.children) return undefined;
        
        // 新策略：查找括号前面的标识符作为方法名
        // 这样可以避免复杂的类型解析，更精准地找到方法名
        
        // 首先尝试找到参数列表节点
        let parameterListNode: any = null;
        for (const child of methodNode.children) {
            if (child.type === 'parameter_list') {
                parameterListNode = child;
                break;
            }
        }
        
        if (parameterListNode) {
            // 找到参数列表，向前查找方法名
            let currentNode = parameterListNode.previousSibling;
            while (currentNode) {
                // 跳过空白和符号
                if (currentNode.type === 'whitespace' || 
                    ['<', '>', '[', ']', '?', '*', '&'].includes(currentNode.text)) {
                    currentNode = currentNode.previousSibling;
                    continue;
                }
                
                // 跳过类型相关节点
                if (currentNode.type === 'generic_name' || 
                    currentNode.type === 'type_name' || 
                    currentNode.type === 'predefined_type' ||
                    currentNode.type === 'array_type' ||
                    currentNode.type === 'nullable_type' ||
                    currentNode.type === 'pointer_type' ||
                    currentNode.type === 'type_argument_list' ||
                    currentNode.type === 'array_rank_specifier') {
                    currentNode = currentNode.previousSibling;
                    continue;
                }
                
                // 找到方法名标识符
                if (currentNode.type === 'identifier') {
                    return currentNode.text;
                }
                
                // 如果遇到修饰符，说明已经过了方法名
                if (currentNode.type === 'modifier' || 
                    (currentNode.type === 'identifier' && 
                     ['public', 'private', 'protected', 'internal', 'static', 'async', 'virtual', 'override', 'abstract', 'extern', 'sealed', 'readonly', 'volatile'].includes(currentNode.text))) {
                    break;
                }
                
                currentNode = currentNode.previousSibling;
            }
        }
        
        // 如果没有找到参数列表，使用原来的逻辑作为后备
        let foundReturnType = false;
        let skipNext = 0;
        
        for (const child of methodNode.children) {
            // 跳过修饰符
            if (child.type === 'modifier' || 
                (child.type === 'identifier' && ['public', 'private', 'protected', 'internal', 'static', 'async', 'virtual', 'override', 'abstract', 'extern', 'sealed', 'readonly', 'volatile'].includes(child.text))) {
                continue;
            }
            
            // 跳过特性
            if (child.type === 'attribute_list' || child.type === 'attribute') {
                continue;
            }
            
            // 处理返回类型
            if (child.type === 'generic_name' || child.type === 'type_name' || child.type === 'predefined_type' || 
                child.type === 'array_type' || child.type === 'nullable_type' || child.type === 'pointer_type') {
                foundReturnType = true;
                
                // 如果是泛型类型，需要跳过泛型参数
                if (child.type === 'generic_name' && child.children) {
                    for (const grandChild of child.children) {
                        if (grandChild.type === 'type_argument_list') {
                            skipNext = 1;
                        }
                    }
                }
                continue;
            }
            
            // 跳过泛型参数列表
            if (child.type === 'type_argument_list' || child.type === 'type_parameter_list') {
                continue;
            }
            
            // 跳过数组维度说明符
            if (child.type === 'array_rank_specifier') {
                continue;
            }
            
            // 跳过符号
            if (['<', '>', '[', ']', '?', '*'].includes(child.text)) {
                continue;
            }
            
            // 跳过泛型参数（在找到返回类型后）
            if (skipNext > 0) {
                skipNext--;
                continue;
            }
            
            // 找到方法名标识符
            if (child.type === 'identifier' && foundReturnType) {
                // 验证这不是返回类型的一部分
                const text = child.text;
                if (!['Task', 'List', 'IEnumerable', 'ICollection', 'Array', 'System', 'IntPtr', 'ColorLayer', 
                       'byte', 'int', 'string', 'bool', 'double', 'float', 'char', 'long', 'short', 'decimal',
                       'PowerPoint', 'Shape', 'Rectangle', 'Form', 'Timer', 'DocumentWindow'].includes(text)) {
                    return text;
                }
            }
            
            // 递归查找子节点
            if (child.children && child.children.length > 0) {
                const foundName = this.findMethodName(child);
                if (foundName) {
                    return foundName;
                }
            }
        }
        
        return undefined;
    }

    /**
     * 查找类名
     */
    private findClassName(methodNode: any): string | undefined {
        if (!methodNode) return undefined;
        
        if (methodNode.type === 'class_declaration') {
            for (const child of methodNode.children) {
                if (child.type === 'identifier') {
                    return child.text;
                }
            }
        }
        
        let currentNode = methodNode.parent;
        let depth = 0;
        while (currentNode && depth < 10) {
            if (currentNode.type === 'class_declaration') {
                for (const child of currentNode.children) {
                    if (child.type === 'identifier') {
                        return child.text;
                    }
                }
            }
            currentNode = currentNode.parent;
            depth++;
        }
        
        return undefined;
    }

    /**
     * 查找命名空间名
     */
    private findNamespaceName(methodNode: any): string | undefined {
        if (!methodNode) return undefined;
        
        let currentNode = methodNode.parent;
        while (currentNode) {
            if (currentNode.type === 'namespace_declaration') {
                for (const child of currentNode.children) {
                    if (child.type === 'identifier') {
                        return child.text;
                    }
                }
            }
            currentNode = currentNode.parent;
        }
        
        return undefined;
    }

    /**
     * 查找事件名
     */
    private findEventName(eventNode: any): string | undefined {
        if (!eventNode || !eventNode.children) return undefined;
        
        for (const child of eventNode.children) {
            if (child.type === 'identifier') {
                return child.text;
            }
        }
        
        return undefined;
    }

    /**
     * 查找事件类型
     */
    private findEventType(eventNode: any): string | undefined {
        if (!eventNode || !eventNode.children) return undefined;
        
        for (const child of eventNode.children) {
            if (child.type === 'type_identifier' || child.type === 'predefined_type') {
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
            if (param.type === 'parameter') {
                const identifier = param.children?.find((child: any) => 
                    child.type === 'identifier'
                );
                if (identifier) {
                    parameters.push(identifier.text);
                }
            } else if (param.type === 'identifier') {
                parameters.push(param.text);
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
        if (language === 'csharp' && node.parent) {
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
        
        // 提取C# XML文档注释中的summary内容
        if (language === 'csharp') {
            const summaryMatch = cleanText.match(/<summary>\s*([\s\S]*?)\s*<\/summary>/s);
            if (summaryMatch && summaryMatch[1]) {
                const summaryContent = summaryMatch[1].trim();
                const lines = summaryContent.split('\n');
                const nonEmptyLines = lines
                    .map(line => line.trim())
                    .filter(line => line && !line.startsWith('///') && !line.startsWith('//'));
                
                if (nonEmptyLines.length > 0) {
                    return nonEmptyLines[0];
                }
            }
            
            const lines = cleanText.split('\n');
            let inSummary = false;
            let summaryLines: string[] = [];
            
            for (let i = 0; i < lines.length; i++) {
                const line = lines[i];
                const trimmedLine = line.trim();
                
                if (trimmedLine.includes('<summary>')) {
                    inSummary = true;
                    continue;
                }
                
                if (trimmedLine.includes('</summary>')) {
                    inSummary = false;
                    break;
                }
                
                if (inSummary) {
                    const contentLine = trimmedLine
                        .replace(/^\/\/\s*/, '')
                        .replace(/^\/\/\/\s*/, '')
                        .trim();
                    if (contentLine) {
                        summaryLines.push(contentLine);
                    }
                }
            }
            
            if (summaryLines.length > 0) {
                return summaryLines[0];
            }
            
            for (const line of lines) {
                const trimmedLine = line.trim();
                if (trimmedLine && 
                    !trimmedLine.startsWith('<') && 
                    !trimmedLine.startsWith('///') && 
                    !trimmedLine.startsWith('//') &&
                    !trimmedLine.includes('</summary>') &&
                    !trimmedLine.includes('<param') &&
                    !trimmedLine.includes('<returns>') &&
                    !trimmedLine.includes('<exception') &&
                    !trimmedLine.includes('<remarks>')) {
                    return trimmedLine;
                }
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