import * as vscode from 'vscode';
import { Parser, Language as TreeSitterLanguage } from 'web-tree-sitter';
import { OutlineItem } from './outlineItem';
import { FunctionInfo, Language } from './types';
import * as path from 'path';

export class TreeSitterOutlineProvider implements vscode.TreeDataProvider<OutlineItem> {
    private _onDidChangeTreeData: vscode.EventEmitter<OutlineItem | undefined | null | void> = new vscode.EventEmitter<OutlineItem | undefined | null | void>();
    readonly onDidChangeTreeData: vscode.Event<OutlineItem | undefined | null | void> = this._onDidChangeTreeData.event;

    private parser: Parser | null = null;
    private currentLanguage: string = '';
    private isInitialized = false;
    private jsLanguage: TreeSitterLanguage | null = null;
    private csLanguage: TreeSitterLanguage | null = null;
    private pyLanguage: TreeSitterLanguage | null = null;
    private extensionUri: vscode.Uri;

    constructor(extensionUri: vscode.Uri) {
        this.extensionUri = extensionUri;
        this.initializeTreeSitter();
    }

    private async initializeTreeSitter(): Promise<void> {
        if (this.isInitialized) return;

        try {
            console.log('🚀 开始初始化 Tree-Sitter...');
            await Parser.init();
            console.log('✅ Parser 初始化成功');

            // 加载JavaScript语法
            console.log('📥 正在加载 JavaScript 语法文件...');
            const jsWasmPath = vscode.Uri.file(path.join(this.extensionUri.fsPath, 'public', 'tree-sitter-javascript.wasm'));
            try {
                const jsWasmBuffer = await vscode.workspace.fs.readFile(jsWasmPath);
                this.jsLanguage = await TreeSitterLanguage.load(jsWasmBuffer);
                console.log('✅ JavaScript 语法加载成功');
            } catch (error) {
                console.warn('⚠️ JavaScript 语法文件加载失败，尝试从unpkg下载...');
                try {
                    const jsResponseFallback = await fetch('https://unpkg.com/tree-sitter-javascript@0.23.1/tree-sitter-javascript.wasm');
                    if (jsResponseFallback.ok) {
                        const jsWasmBuffer = await jsResponseFallback.arrayBuffer();
                        this.jsLanguage = await TreeSitterLanguage.load(new Uint8Array(jsWasmBuffer));
                        console.log('✅ JavaScript 语法从unpkg加载成功');
                    }
                } catch (fallbackError) {
                    console.error('❌ JavaScript 语法加载完全失败:', fallbackError);
                }
            }

            // 加载C#语法
            console.log('📥 正在加载 C# 语法文件...');
            const csWasmPath = vscode.Uri.file(path.join(this.extensionUri.fsPath, 'public', 'tree-sitter-c-sharp.wasm'));
            try {
                const csWasmBuffer = await vscode.workspace.fs.readFile(csWasmPath);
                this.csLanguage = await TreeSitterLanguage.load(csWasmBuffer);
                console.log('✅ C# 语法加载成功');
            } catch (error) {
                console.warn('⚠️ C# 语法文件加载失败，尝试从unpkg下载...');
                try {
                    const csResponseFallback = await fetch('https://unpkg.com/tree-sitter-c-sharp@0.23.1/tree-sitter-c-sharp.wasm');
                    if (csResponseFallback.ok) {
                        const csWasmBuffer = await csResponseFallback.arrayBuffer();
                        this.csLanguage = await TreeSitterLanguage.load(new Uint8Array(csWasmBuffer));
                        console.log('✅ C# 语法从unpkg加载成功');
                    }
                } catch (fallbackError) {
                    console.error('❌ C# 语法加载完全失败:', fallbackError);
                }
            }

            // 加载Python语法
            console.log('📥 正在加载 Python 语法文件...');
            const pyWasmPath = vscode.Uri.file(path.join(this.extensionUri.fsPath, 'public', 'tree-sitter-python.wasm'));
            try {
                const pyWasmBuffer = await vscode.workspace.fs.readFile(pyWasmPath);
                this.pyLanguage = await TreeSitterLanguage.load(pyWasmBuffer);
                console.log('✅ Python 语法加载成功');
            } catch (error) {
                console.warn('⚠️ Python 语法文件加载失败，尝试从unpkg下载...');
                try {
                    const pyResponseFallback = await fetch('https://unpkg.com/tree-sitter-python@0.23.1/tree-sitter-python.wasm');
                    if (pyResponseFallback.ok) {
                        const pyWasmBuffer = await pyResponseFallback.arrayBuffer();
                        this.pyLanguage = await TreeSitterLanguage.load(new Uint8Array(pyWasmBuffer));
                        console.log('✅ Python 语法从unpkg加载成功');
                    }
                } catch (fallbackError) {
                    console.error('❌ Python 语法加载完全失败:', fallbackError);
                }
            }

            this.isInitialized = true;
            console.log('🎉 Tree-Sitter 初始化完成!');
        } catch (err) {
            console.error('❌ Tree-Sitter 初始化失败:', err);
        }
    }

    refresh(): void {
        this._onDidChangeTreeData.fire();
    }

    getTreeItem(element: OutlineItem): vscode.TreeItem {
        return element;
    }

    getChildren(element?: OutlineItem): Thenable<OutlineItem[]> {
        if (element) {
            return Promise.resolve(element.children || []);
        }

        const editor = vscode.window.activeTextEditor;
        if (!editor) {
            return Promise.resolve([]);
        }

        const document = editor.document;
        const language = document.languageId;

        // 检查语言是否支持
        if (!this.isLanguageSupported(language)) {
            return Promise.resolve([]);
        }

        // 如果语言改变，重新设置解析器
        if (this.currentLanguage !== language) {
            this.setLanguage(language);
        }

        return this.parseDocument(document);
    }

    private isLanguageSupported(language: string): boolean {
        return ['python', 'javascript', 'typescript', 'csharp'].includes(language);
    }

    private setLanguage(language: string): void {
        if (!this.parser) {
            this.parser = new Parser();
        }

        this.currentLanguage = language;
        
        switch (language) {
            case 'python':
                if (this.pyLanguage) {
                    this.parser.setLanguage(this.pyLanguage);
                }
                break;
            case 'javascript':
            case 'typescript':
                if (this.jsLanguage) {
                    this.parser.setLanguage(this.jsLanguage);
                }
                break;
            case 'csharp':
                if (this.csLanguage) {
                    this.parser.setLanguage(this.csLanguage);
                }
                break;
        }
    }

    private async parseDocument(document: vscode.TextDocument): Promise<OutlineItem[]> {
        if (!this.parser || !this.isInitialized) {
            console.log('❌ 解析器未初始化或未就绪');
            return [];
        }

        try {
            console.log(`🔍 开始解析文档: ${document.fileName}`);
            console.log(`📝 语言: ${this.currentLanguage}`);
            console.log(`🔧 解析器状态: ${this.parser ? '已创建' : '未创建'}`);
            
            const sourceCode = document.getText();
            console.log(`📄 源代码长度: ${sourceCode.length} 字符`);
            
            const tree = this.parser.parse(sourceCode);
            console.log(`🌳 解析树: ${tree ? '成功' : '失败'}`);
            
            if (!tree || !tree.rootNode) {
                console.log('❌ 解析树为空或根节点缺失');
                return [];
            }

            const rootNode = tree.rootNode;
            console.log(`🌱 根节点类型: ${rootNode.type}`);
            console.log(`👶 子节点数量: ${rootNode.children ? rootNode.children.length : 0}`);
            
            // 遍历前几个节点，看看实际的结构
            if (rootNode.children) {
                console.log('🔍 前5个根节点类型:');
                rootNode.children.slice(0, 5).forEach((child: any, index: number) => {
                    console.log(`  ${index}: ${child.type} - "${child.text?.substring(0, 50)}..."`);
                });
            }
            
            const functions = this.extractFunctionInfoFromTree(rootNode, this.currentLanguage);
            console.log(`📊 提取的函数数量: ${functions.length}`);
            
            if (functions.length === 0) {
                console.log('⚠️ 没有找到任何函数，开始详细诊断...');
                this.diagnoseTreeStructure(rootNode, this.currentLanguage);
            }
            
            const outlineItems = this.convertFunctionsToOutlineItems(functions);
            console.log(`🎯 生成的轮廓项数量: ${outlineItems.length}`);
            
            return outlineItems;
        } catch (error) {
            console.error('❌ 解析文档时出错:', error);
            return [];
        }
    }

    private extractFunctionInfoFromTree(rootNode: any, language: string): FunctionInfo[] {
        const functions: FunctionInfo[] = [];
        
        if (language === 'javascript' || language === 'typescript') {
            // 对于JS/TS，我们需要构建层级结构
            this.extractJavaScriptHierarchy(rootNode, functions, language);
        } else {
            // 其他语言保持原有逻辑
            this.traverseTree(rootNode, (node) => {
                if (this.isFunctionDeclaration(node, language)) {
                    const functionInfo = this.extractFunctionInfo(node, language);
                    if (functionInfo) {
                        functions.push(functionInfo);
                    }
                }
            });
        }

        return functions;
    }

    private extractJavaScriptHierarchy(rootNode: any, functions: FunctionInfo[], language: string): void {
        if (!rootNode.children) return;

        console.log('🔍 开始解析JavaScript层级结构...');
        
        // 遍历所有节点，找到类声明和方法
        this.traverseTree(rootNode, (node) => {
            if (node.type === 'class_declaration') {
                // 处理类声明
                this.processClassDeclaration(node, functions, language);
            } else if (node.type === 'function_declaration') {
                // 处理顶级函数声明
                this.processTopLevelFunction(node, functions, language);
            }
        });
    }

    private processClassDeclaration(classNode: any, functions: FunctionInfo[], language: string): void {
        const className = this.findClassName(classNode);
        if (!className) return;

        console.log(`🔍 处理类声明: ${className}`);

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

        // 查找类中的方法
        if (classNode.children) {
            classNode.children.forEach((child: any) => {
                if (this.isClassMethod(child)) {
                    const methodInfo = this.extractClassMethod(child, language, className);
                    if (methodInfo) {
                        console.log(`✅ 提取类方法: ${methodInfo.name}`);
                        // 设置className，这样在convertFunctionsToOutlineItems中就能正确建立父子关系
                        methodInfo.className = className;
                        functions.push(methodInfo);
                    }
                }
            });
        }
    }

    private processTopLevelFunction(functionNode: any, functions: FunctionInfo[], language: string): void {
        const functionName = this.findJavaScriptFunctionName(functionNode);
        if (!functionName) return;

        console.log(`🔍 处理顶级函数: ${functionName}`);

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

    private isClassMethod(node: any): boolean {
        return node.type === 'method_definition' ||
               node.type === 'constructor_declaration' ||
               node.type === 'getter' ||
               node.type === 'setter';
    }

    private extractClassMethod(methodNode: any, language: string, className: string): FunctionInfo | null {
        try {
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
            }

            if (!name || name === 'anonymous') return null;

            return {
                id: `${language}-${className}-${name}-${methodNode.startPosition.row}`,
                name: name, // 只保存方法名，不包含类名
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
            console.warn('提取类方法失败:', err);
            return null;
        }
    }

    private findGetterName(getterNode: any): string | undefined {
        if (!getterNode || !getterNode.children) return undefined;
        
        for (const child of getterNode.children) {
            if (child.type === 'property_identifier') {
                return child.text;
            }
        }
        return undefined;
    }

    private findSetterName(setterNode: any): string | undefined {
        if (!setterNode || !setterNode.children) return undefined;
        
        for (const child of setterNode.children) {
            if (child.type === 'property_identifier') {
                return child.text;
            }
        }
        return undefined;
    }

    private traverseTree(node: any, callback: (node: any) => void): void {
        callback(node);
        
        if (node.children) {
            node.children.forEach((child: any) => {
                this.traverseTree(child, callback);
            });
        }
    }

    private isFunctionDeclaration(node: any, language: string): boolean {
        if (language === 'javascript' || language === 'typescript') {
            return node.type === 'function_declaration' || 
                   node.type === 'method_definition' ||
                   node.type === 'arrow_function' ||
                   node.type === 'function_expression';
        } else if (language === 'csharp') {
            return node.type === 'method_declaration' ||
                   node.type === 'constructor_declaration' ||
                   node.type === 'local_function_statement' ||
                   node.type === 'class_declaration' ||
                   node.type === 'namespace_declaration' ||
                   node.type === 'property_declaration' ||
                   node.type === 'field_declaration' ||
                   node.type === 'event_declaration' ||
                   node.type === 'indexer_declaration' ||
                   node.type === 'operator_declaration' ||
                   node.type === 'conversion_operator_declaration' ||
                   node.type === 'destructor_declaration';
        } else if (language === 'python') {
            return node.type === 'function_definition' ||
                   node.type === 'class_definition';
        }
        
        return false;
    }

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

            if (language === 'javascript' || language === 'typescript') {
                if (node.type === 'function_declaration') {
                    name = this.findJavaScriptFunctionName(node) || 'anonymous';
                    parameters = this.extractParameters(node.parameters);
                    returnType = 'any';
                    type = 'function';
                } else if (node.type === 'method_definition') {
                    name = this.findJavaScriptFunctionName(node) || 'anonymous';
                    parameters = this.extractParameters(node.parameters);
                    returnType = 'any';
                    isStatic = node.static || false;
                    type = 'method';
                } else if (node.type === 'arrow_function') {
                    name = 'arrow_function';
                    parameters = this.extractParameters(node.parameters);
                    returnType = 'any';
                    type = 'function';
                }
            } else if (language === 'csharp') {
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
                } else if (node.type === 'namespace_declaration') {
                    name = this.findNamespaceName(node) || 'anonymous';
                    returnType = 'namespace';
                    type = 'namespace';
                } else if (node.type === 'property_declaration') {
                    name = this.findPropertyName(node) || 'property';
                    returnType = this.findPropertyType(node) || 'any';
                    type = 'property';
                    
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
                } else if (node.type === 'field_declaration') {
                    name = this.findFieldName(node) || 'field';
                    returnType = this.findFieldType(node) || 'any';
                    type = 'field';
                    
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
            } else if (language === 'python') {
                if (node.type === 'function_definition') {
                    name = this.findPythonFunctionName(node) || 'anonymous';
                    parameters = this.extractPythonParameters(node);
                    returnType = 'any';
                    type = 'function';
                } else if (node.type === 'class_definition') {
                    name = this.findPythonClassName(node) || 'anonymous';
                    returnType = 'class';
                    type = 'class';
                }
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

    private findJavaScriptFunctionName(functionNode: any): string | undefined {
        if (!functionNode || !functionNode.children) return undefined;
        
        for (const child of functionNode.children) {
            if (child.type === 'identifier') {
                return child.text;
            }
            if (child.children) {
                const foundName = this.findJavaScriptFunctionName(child);
                if (foundName) return foundName;
            }
        }
        
        return undefined;
    }

    private findMethodName(methodNode: any): string | undefined {
        if (!methodNode || !methodNode.children) return undefined;
        
        for (const child of methodNode.children) {
            if (child.type === 'identifier') {
                return child.text;
            }
            if (child.children) {
                const foundName = this.findMethodName(child);
                if (foundName) return foundName;
            }
        }
        
        return undefined;
    }

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
        while (currentNode) {
            if (currentNode.type === 'class_declaration') {
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

    private findPythonFunctionName(functionNode: any): string | undefined {
        if (!functionNode || !functionNode.children) return undefined;
        
        for (const child of functionNode.children) {
            if (child.type === 'identifier') {
                return child.text;
            }
        }
        
        return undefined;
    }

    private findPythonClassName(classNode: any): string | undefined {
        if (!classNode || !classNode.children) return undefined;
        
        for (const child of classNode.children) {
            if (child.type === 'identifier') {
                return child.text;
            }
        }
        
        return undefined;
    }

    private findPropertyName(propertyNode: any): string | undefined {
        if (!propertyNode || !propertyNode.children) return undefined;
        
        for (const child of propertyNode.children) {
            if (child.type === 'identifier') {
                return child.text;
            }
        }
        
        return undefined;
    }

    private findPropertyType(propertyNode: any): string | undefined {
        if (!propertyNode || !propertyNode.children) return undefined;
        
        for (const child of propertyNode.children) {
            if (child.type === 'type_identifier' || child.type === 'predefined_type') {
                return child.text;
            }
        }
        
        return undefined;
    }

    private findFieldName(fieldNode: any): string | undefined {
        if (!fieldNode || !fieldNode.children) return undefined;
        
        for (const child of fieldNode.children) {
            if (child.type === 'variable_declarator') {
                for (const grandChild of child.children) {
                    if (grandChild.type === 'identifier') {
                        return grandChild.text;
                    }
                }
            }
        }
        
        return undefined;
    }

    private findFieldType(fieldNode: any): string | undefined {
        if (!fieldNode || !fieldNode.children) return undefined;
        
        for (const child of fieldNode.children) {
            if (child.type === 'type_identifier' || child.type === 'predefined_type') {
                return child.text;
            }
        }
        
        return undefined;
    }

    private findEventName(eventNode: any): string | undefined {
        if (!eventNode || !eventNode.children) return undefined;
        
        for (const child of eventNode.children) {
            if (child.type === 'identifier') {
                return child.text;
            }
        }
        
        return undefined;
    }

    private findEventType(eventNode: any): string | undefined {
        if (!eventNode || !eventNode.children) return undefined;
        
        for (const child of eventNode.children) {
            if (child.type === 'type_identifier' || child.type === 'predefined_type') {
                return child.text;
            }
        }
        
        return undefined;
    }

    private findVariableName(variableNode: any): string | undefined {
        if (!variableNode || !variableNode.children) return undefined;
        
        for (const child of variableNode.children) {
            if (child.type === 'variable_declarator') {
                for (const grandChild of child.children) {
                    if (grandChild.type === 'identifier') {
                        return grandChild.text;
                    }
                }
            }
        }
        
        return undefined;
    }

    private findInterfaceName(interfaceNode: any): string | undefined {
        if (!interfaceNode || !interfaceNode.children) return undefined;
        
        for (const child of interfaceNode.children) {
            if (child.type === 'identifier') {
                return child.text;
            }
        }
        
        return undefined;
    }

    private findTypeAliasName(typeAliasNode: any): string | undefined {
        if (!typeAliasNode || !typeAliasNode.children) return undefined;
        
        for (const child of typeAliasNode.children) {
            if (child.type === 'identifier') {
                return child.text;
            }
        }
        
        return undefined;
    }

    private findEnumName(enumNode: any): string | undefined {
        if (!enumNode || !enumNode.children) return undefined;
        
        for (const child of enumNode.children) {
            if (child.type === 'identifier') {
                return child.text;
            }
        }
        
        return undefined;
    }

    private extractParameters(parametersNode: any): string[] {
        if (!parametersNode || !parametersNode.children) {
            return [];
        }

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

    private extractPythonParameters(parametersNode: any): string[] {
        if (!parametersNode || !parametersNode.children) {
            return [];
        }

        const parameters: string[] = [];
        
        parametersNode.children.forEach((param: any) => {
            if (param.type === 'typed_parameter' || param.type === 'identifier') {
                const identifier = param.children?.find((child: any) => 
                    child.type === 'identifier'
                ) || param;
                if (identifier && identifier.text) {
                    parameters.push(identifier.text);
                }
            }
        });

        return parameters;
    }

    private extractComment(node: any, language: string): string {
        let allComments: string[] = [];
        
        // 方法1：查找节点前的注释
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
        
        // 方法2：查找节点内的注释（对于某些语言）
        if (node.children) {
            for (const child of node.children) {
                if (child.type === 'comment' || child.type === 'comment_block') {
                    const commentText = child.text.trim();
                    allComments.push(commentText);
                }
            }
        }
        
        // 方法3：查找父节点的注释（对于C#等语言）
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
            console.log(`📝 提取到注释: "${cleanedComment}"`);
            return cleanedComment;
        }
        
        console.log(`⚠️ 未找到注释，节点类型: ${node.type}`);
        return '';
    }

    private cleanComment(commentText: string, language: string): string {
        if (!commentText) return '';
        
        console.log(`🧹 清理注释: "${commentText}"`);
        
        let cleanText = commentText
            .replace(/^\/\/\s*/, '')           // 移除行注释 //
            .replace(/^\/\*\s*/, '')           // 移除块注释开始 /*
            .replace(/\s*\*\/$/, '')           // 移除块注释结束 */
            .replace(/^#\s*/, '')              // 移除Python注释 #
            .replace(/^\/\/\/\s*/, '')         // 移除C# XML注释 ///
            .replace(/^\*\s*/, '')             // 移除块注释中的 *
            .trim();
        
        // 提取C# XML文档注释中的summary内容
        if (language === 'csharp') {
            // 方法1：使用正则表达式查找summary标签
            const summaryMatch = cleanText.match(/<summary>\s*([\s\S]*?)\s*<\/summary>/s);
            if (summaryMatch && summaryMatch[1]) {
                const summaryContent = summaryMatch[1].trim();
                const lines = summaryContent.split('\n');
                const nonEmptyLines = lines
                    .map(line => line.trim())
                    .filter(line => line && !line.startsWith('///') && !line.startsWith('//'));
                
                if (nonEmptyLines.length > 0) {
                    console.log(`✅ 提取到C# summary: "${nonEmptyLines[0]}"`);
                    return nonEmptyLines[0];
                }
            }
            
            // 方法2：逐行解析，查找summary标签
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
                console.log(`✅ 提取到C# summary: "${summaryLines[0]}"`);
                return summaryLines[0];
            }
            
            // 方法3：查找第一个非标签的文本行
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
                    console.log(`✅ 提取到C# 文本行: "${trimmedLine}"`);
                    return trimmedLine;
                }
            }
        }
        
        // 对于JavaScript/TypeScript，查找JSDoc注释
        if (language === 'javascript' || language === 'typescript') {
            // 查找@description或@desc标签
            const descMatch = cleanText.match(/@(?:description|desc)\s+(.+)/);
            if (descMatch && descMatch[1]) {
                console.log(`✅ 提取到JSDoc description: "${descMatch[1]}"`);
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
                    console.log(`✅ 提取到JS/TS 文本行: "${trimmedLine}"`);
                    return trimmedLine;
                }
            }
        }
        
        // 对于Python，查找docstring
        if (language === 'python') {
            // 移除三引号
            cleanText = cleanText.replace(/^["']{3}\s*/, '').replace(/\s*["']{3}$/, '');
            const lines = cleanText.split('\n');
            for (const line of lines) {
                const trimmedLine = line.trim();
                if (trimmedLine && !trimmedLine.startsWith('"""') && !trimmedLine.startsWith("'''")) {
                    console.log(`✅ 提取到Python docstring: "${trimmedLine}"`);
                    return trimmedLine;
                }
            }
        }
        
        // 如果都没有找到，返回清理后的第一行非空文本
        const lines = cleanText.split('\n');
        for (const line of lines) {
            const trimmedLine = line.trim();
            if (trimmedLine) {
                console.log(`✅ 提取到通用文本: "${trimmedLine}"`);
                return trimmedLine;
            }
        }
        
        console.log(`❌ 没有提取到任何注释内容`);
        return '';
    }

    private convertFunctionsToOutlineItems(functions: FunctionInfo[]): OutlineItem[] {
        // 按层级分组
        const topLevelItems = functions.filter(f => !f.className && !f.namespaceName);
        const nestedItems = functions.filter(f => f.className || f.namespaceName);
        
        // 创建顶级项目
        const outlineItems = topLevelItems.map(func => {
            const item = new OutlineItem(
                func.name,
                func.comment || this.getDefaultDescription(func.type),
                vscode.TreeItemCollapsibleState.Collapsed, // 默认折叠
                func.startLine,
                func.endLine
            );
            
            // 添加图标
            item.iconPath = this.getIconForType(func.type);
            
            // 查找嵌套项目
            const children = nestedItems.filter(nested => 
                nested.className === func.name || nested.namespaceName === func.name
            );
            
            if (children.length > 0) {
                item.collapsibleState = vscode.TreeItemCollapsibleState.Collapsed;
                children.forEach(child => {
                    const childItem = new OutlineItem(
                        child.name.split('.').pop() || child.name, // 只显示方法名，不显示类名
                        child.comment || this.getDefaultDescription(child.type),
                        vscode.TreeItemCollapsibleState.None,
                        child.startLine,
                        child.endLine
                    );
                    
                    childItem.iconPath = this.getIconForType(child.type);
                    item.addChild(childItem);
                });
            } else {
                item.collapsibleState = vscode.TreeItemCollapsibleState.None;
            }
            
            return item;
        });
        
        // 添加没有父级的嵌套项目（可能是独立的函数）
        const orphanedNested = nestedItems.filter(nested => 
            !topLevelItems.some(top => top.name === nested.className || top.name === nested.namespaceName)
        );
        
        orphanedNested.forEach(func => {
            const item = new OutlineItem(
                func.name,
                func.comment || this.getDefaultDescription(func.type),
                vscode.TreeItemCollapsibleState.None,
                func.startLine,
                func.endLine
            );
            
            item.iconPath = this.getIconForType(func.type);
            outlineItems.push(item);
        });
        
        return outlineItems;
    }

    private getDefaultDescription(type: string): string {
        switch (type) {
            case 'function': return '函数';
            case 'method': return '方法';
            case 'constructor': return '构造函数';
            case 'class': return '类';
            case 'namespace': return '命名空间';
            case 'property': return '属性';
            case 'field': return '字段';
            case 'event': return '事件';
            default: return '函数';
        }
    }

    private getIconForType(type: string): vscode.ThemeIcon {
        switch (type) {
            case 'function': return new vscode.ThemeIcon('symbol-function');
            case 'method': return new vscode.ThemeIcon('symbol-method');
            case 'constructor': return new vscode.ThemeIcon('symbol-constructor');
            case 'class': return new vscode.ThemeIcon('symbol-class');
            case 'namespace': return new vscode.ThemeIcon('symbol-namespace');
            case 'property': return new vscode.ThemeIcon('symbol-property');
            case 'field': return new vscode.ThemeIcon('symbol-field');
            case 'event': return new vscode.ThemeIcon('symbol-event');
            default: return new vscode.ThemeIcon('symbol-function');
        }
    }

    private diagnoseTreeStructure(rootNode: any, language: string): void {
        console.warn('开始详细诊断树结构...');
        const diagnostics: string[] = [];

        if (!rootNode) {
            diagnostics.push('根节点为空');
            return;
        }

        if (!rootNode.children) {
            diagnostics.push('根节点没有子节点');
            return;
        }

        const functionNodes = rootNode.children.filter((node: any) => this.isFunctionDeclaration(node, language));
        if (functionNodes.length === 0) {
            diagnostics.push('未找到任何函数声明或定义');
        } else {
            diagnostics.push(`找到 ${functionNodes.length} 个函数声明/定义`);
        }

        const classNodes = rootNode.children.filter((node: any) => node.type === 'class_declaration');
        if (classNodes.length === 0) {
            diagnostics.push('未找到任何类声明');
        } else {
            diagnostics.push(`找到 ${classNodes.length} 个类声明`);
        }

        const namespaceNodes = rootNode.children.filter((node: any) => node.type === 'namespace_declaration');
        if (namespaceNodes.length === 0) {
            diagnostics.push('未找到任何命名空间声明');
        } else {
            diagnostics.push(`找到 ${namespaceNodes.length} 个命名空间声明`);
        }

        const propertyNodes = rootNode.children.filter((node: any) => node.type === 'property_declaration');
        if (propertyNodes.length === 0) {
            diagnostics.push('未找到任何属性声明');
        } else {
            diagnostics.push(`找到 ${propertyNodes.length} 个属性声明`);
        }

        const fieldNodes = rootNode.children.filter((node: any) => node.type === 'field_declaration');
        if (fieldNodes.length === 0) {
            diagnostics.push('未找到任何字段声明');
        } else {
            diagnostics.push(`找到 ${fieldNodes.length} 个字段声明`);
        }

        const eventNodes = rootNode.children.filter((node: any) => node.type === 'event_declaration');
        if (eventNodes.length === 0) {
            diagnostics.push('未找到任何事件声明');
        } else {
            diagnostics.push(`找到 ${eventNodes.length} 个事件声明`);
        }

        if (diagnostics.length > 0) {
            console.warn('树结构诊断:', diagnostics.join('\n'));
        } else {
            console.log('✅ 树结构诊断: 没有发现明显问题');
        }
    }
}