import * as vscode from 'vscode';
import { Parser, Language as TreeSitterLanguage } from 'web-tree-sitter';
import { OutlineItem } from './outlineItem';
import { FunctionInfo, Language } from './types';
import { getConfig } from './config';
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
    private outputChannel: vscode.OutputChannel;
    
    // 新增：存储当前文档的函数信息，用于反向查找
    private currentFunctions: FunctionInfo[] = [];
    private currentOutlineItems: OutlineItem[] = [];
    private cursorChangeListener: vscode.Disposable | null = null;

    constructor(extensionUri: vscode.Uri, outputChannel: vscode.OutputChannel) {
        this.extensionUri = extensionUri;
        this.outputChannel = outputChannel;
        this.initializeTreeSitter();
        this.setupCursorChangeListener();
    }

    private async initializeTreeSitter(): Promise<void> {
        if (this.isInitialized) return;

        try {
            this.outputChannel.appendLine('🚀 开始初始化 Tree-Sitter...');
            await Parser.init();
            this.outputChannel.appendLine('✅ Parser 初始化成功');

            // 加载JavaScript语法
            this.outputChannel.appendLine('📥 正在加载 JavaScript 语法文件...');
            const jsWasmPath = vscode.Uri.file(path.join(this.extensionUri.fsPath, 'public', 'tree-sitter-javascript.wasm'));
            try {
                const jsWasmBuffer = await vscode.workspace.fs.readFile(jsWasmPath);
                this.outputChannel.appendLine(`📊 JavaScript WASM 文件大小: ${jsWasmBuffer.length} 字节`);
                this.jsLanguage = await TreeSitterLanguage.load(jsWasmBuffer);
                this.outputChannel.appendLine('✅ JavaScript 语法加载成功');
            } catch (error) {
                this.outputChannel.appendLine(`❌ JavaScript 语法文件加载失败: ${error}`);
            }

            // 加载C#语法
            this.outputChannel.appendLine('📥 正在加载 C# 语法文件...');
            const csWasmPath = vscode.Uri.file(path.join(this.extensionUri.fsPath, 'public', 'tree-sitter-c-sharp.wasm'));
            try {
                const csWasmBuffer = await vscode.workspace.fs.readFile(csWasmPath);
                this.outputChannel.appendLine(`📊 C# WASM 文件大小: ${csWasmBuffer.length} 字节`);
                this.csLanguage = await TreeSitterLanguage.load(csWasmBuffer);
                this.outputChannel.appendLine('✅ C# 语法加载成功');
            } catch (error) {
                this.outputChannel.appendLine(`❌ C# 语法文件加载失败: ${error}`);
            }

            // 加载Python语法
            this.outputChannel.appendLine('📥 正在加载 Python 语法文件...');
            const pyWasmPath = vscode.Uri.file(path.join(this.extensionUri.fsPath, 'public', 'tree-sitter-python.wasm'));
            try {
                const pyWasmBuffer = await vscode.workspace.fs.readFile(pyWasmPath);
                this.outputChannel.appendLine(`📊 Python WASM 文件大小: ${pyWasmBuffer.length} 字节`);
                this.pyLanguage = await TreeSitterLanguage.load(pyWasmBuffer);
                this.outputChannel.appendLine('✅ Python 语法加载成功');
            } catch (error) {
                this.outputChannel.appendLine(`❌ Python 语法文件加载失败: ${error}`);
            }

            this.isInitialized = true;
            this.outputChannel.appendLine('🎉 Tree-Sitter 初始化完成!');
        } catch (err) {
            this.outputChannel.appendLine(`❌ Tree-Sitter 初始化失败: ${err}`);
        }
    }

    refresh(): void {
        this._onDidChangeTreeData.fire();
    }

    getTreeItem(element: OutlineItem): vscode.TreeItem {
        return element;
    }

    getChildren(element?: OutlineItem): Thenable<OutlineItem[]> {
        const timestamp = new Date().toLocaleTimeString();
        this.outputChannel.appendLine(`[${timestamp}] 🔍 getChildren 被调用，元素: ${element ? element.label : 'root'}`);
        
        if (element) {
            this.outputChannel.appendLine(`[${timestamp}] ✅ 返回子元素: ${element.children?.length || 0} 个`);
            return Promise.resolve(element.children || []);
        }

        const editor = vscode.window.activeTextEditor;
        if (!editor) {
            this.outputChannel.appendLine(`[${timestamp}] ⚠️ 没有活动编辑器，编辑器可能失去焦点，不处理文档`);
            return Promise.resolve([]);
        }

        // 检查编辑器是否仍然有效
        if (!editor.document || !editor.document.fileName) {
            this.outputChannel.appendLine(`[${timestamp}] ⚠️ 编辑器文档无效，不处理文档`);
            return Promise.resolve([]);
        }

        return this.processDocument(editor.document, timestamp);
    }

    // 新增：获取最后活动的编辑器
    private getLastActiveEditor(): vscode.TextEditor | undefined {
        // 首先尝试获取当前活动编辑器
        if (vscode.window.activeTextEditor) {
            return vscode.window.activeTextEditor;
        }
        
        // 如果没有活动编辑器，尝试从可见的编辑器中获取
        const visibleEditors = vscode.window.visibleTextEditors;
        if (visibleEditors.length > 0) {
            // 返回第一个可见编辑器
            return visibleEditors[0];
        }
        
        // 如果都没有，尝试从工作区文档中获取
        const documents = vscode.workspace.textDocuments;
        if (documents.length > 0) {
            // 创建一个虚拟的编辑器对象
            const document = documents[0];
            return {
                document,
                selection: new vscode.Selection(0, 0, 0, 0),
                selections: [new vscode.Selection(0, 0, 0, 0)],
                visibleRanges: [new vscode.Range(0, 0, 0, 0)],
                options: {},
                viewColumn: vscode.ViewColumn.One,
                edit: () => Promise.resolve(true),
                insertSnippet: () => Promise.resolve(true),
                setDecorations: () => {},
                revealRange: () => {},
                show: () => {},
                hide: () => {}
            } as unknown as vscode.TextEditor;
        }
        
        return undefined;
    }

    // 新增：处理文档的通用方法
    private processDocument(document: vscode.TextDocument, timestamp: string): Thenable<OutlineItem[]> {
        const language = document.languageId;
        const fileName = document.fileName;
        
        // 检查文档是否有效
        if (!fileName || fileName.includes('extension-output') || fileName.includes('output')) {
            this.outputChannel.appendLine(`[${timestamp}] ⚠️ 跳过无效文档: ${fileName}`);
            return Promise.resolve([]);
        }
        
        this.outputChannel.appendLine(`[${timestamp}] 🔍 处理文档，语言: ${language}, 文件: ${fileName}`);

        // 检查语言是否支持
        if (!this.isLanguageSupported(language)) {
            this.outputChannel.appendLine(`[${timestamp}] ⚠️ 不支持的语言: ${language}`);
            return Promise.resolve([]);
        }

        // 检查是否已初始化
        if (!this.isInitialized) {
            this.outputChannel.appendLine(`[${timestamp}] ⏳ Tree-Sitter 正在初始化中，稍后再试...`);
            return Promise.resolve([]);
        }

        this.outputChannel.appendLine(`[${timestamp}] ✅ 开始解析文档: ${fileName}`);

        // 如果语言改变，重新设置解析器
        if (this.currentLanguage !== language) {
            this.outputChannel.appendLine(`[${timestamp}] 🔄 语言从 ${this.currentLanguage} 变为 ${language}`);
            this.setLanguage(language);
        }

        return this.parseDocument(document, timestamp);
    }

    private isLanguageSupported(language: string): boolean {
        // 过滤掉不支持的文档类型
        const unsupportedLanguages = [
            'code-runner-output',
            'output',
            'log',
            'plaintext',
            'markdown'
        ];
        
        if (unsupportedLanguages.includes(language)) {
            return false;
        }
        
        return ['python', 'javascript', 'typescript', 'csharp'].includes(language);
    }

    private setLanguage(language: string): void {
        // 只有在初始化完成后才创建 Parser
        if (!this.isInitialized) {
            console.log('⚠️ Tree-Sitter 尚未初始化完成，跳过语言设置');
            return;
        }

        if (!this.parser) {
            try {
                this.parser = new Parser();
                console.log('✅ 创建新的 Parser 实例');
            } catch (error) {
                console.error('❌ 创建 Parser 实例失败:', error);
                return;
            }
        }

        this.currentLanguage = language;
        
        switch (language) {
            case 'python':
                if (this.pyLanguage) {
                    this.parser.setLanguage(this.pyLanguage);
                    console.log('✅ 设置 Python 语言');
                }
                break;
            case 'javascript':
            case 'typescript':
                if (this.jsLanguage) {
                    this.parser.setLanguage(this.jsLanguage);
                    console.log('✅ 设置 JavaScript/TypeScript 语言');
                }
                break;
            case 'csharp':
                if (this.csLanguage) {
                    this.parser.setLanguage(this.csLanguage);
                    console.log('✅ 设置 C# 语言');
                }
                break;
        }
    }

    private async parseDocument(document: vscode.TextDocument, timestamp: string): Promise<OutlineItem[]> {
        if (!this.isInitialized) {
            this.outputChannel.appendLine(`[${timestamp}] ❌ Tree-Sitter 尚未初始化完成，无法解析文档`);
            return [];
        }

        if (!this.parser) {
            this.outputChannel.appendLine(`[${timestamp}] ❌ Parser 实例未创建，尝试设置语言...`);
            this.setLanguage(document.languageId);
            
            if (!this.parser) {
                this.outputChannel.appendLine(`[${timestamp}] ❌ 仍然无法创建 Parser 实例`);
                return [];
            }
        }

        try {
            this.outputChannel.appendLine(`[${timestamp}] 🔍 开始解析文档: ${document.fileName}`);
            this.outputChannel.appendLine(`[${timestamp}] 📝 语言: ${this.currentLanguage}`);
            this.outputChannel.appendLine(`[${timestamp}] 🔧 解析器状态: ${this.parser ? '已创建' : '未创建'}`);
            
            const sourceCode = document.getText();
            this.outputChannel.appendLine(`[${timestamp}] 📄 源代码长度: ${sourceCode.length} 字符`);
            
            const tree = this.parser.parse(sourceCode);
            this.outputChannel.appendLine(`[${timestamp}] 🌳 解析树: ${tree ? '成功' : '失败'}`);
            
            if (!tree || !tree.rootNode) {
                this.outputChannel.appendLine(`[${timestamp}] ❌ 解析树为空或根节点缺失`);
                return [];
            }

            const rootNode = tree.rootNode;
            this.outputChannel.appendLine(`[${timestamp}] 🌱 根节点类型: ${rootNode.type}`);
            this.outputChannel.appendLine(`[${timestamp}] 👶 子节点数量: ${rootNode.children ? rootNode.children.length : 0}`);
            
            // 遍历前几个节点，看看实际的结构
            if (rootNode.children) {
                this.outputChannel.appendLine(`[${timestamp}] 🔍 前5个根节点类型:`);
                rootNode.children.slice(0, 5).forEach((child: any, index: number) => {
                    this.outputChannel.appendLine(`[${timestamp}]   ${index}: ${child.type} - "${child.text?.substring(0, 50)}..."`);
                });
            }
            
            const functions = this.extractFunctionInfoFromTree(rootNode, this.currentLanguage);
            this.outputChannel.appendLine(`[${timestamp}] 📊 提取的函数数量: ${functions.length}`);
            
            // 保存当前文档的函数信息，用于反向查找
            this.currentFunctions = functions;
            
            if (functions.length === 0) {
                this.outputChannel.appendLine(`[${timestamp}] ⚠️ 没有找到任何函数，开始详细诊断...`);
                this.diagnoseTreeStructure(rootNode, this.currentLanguage, timestamp);
            }
            
            const outlineItems = this.convertFunctionsToOutlineItems(functions);
            this.outputChannel.appendLine(`[${timestamp}] 🎯 生成的轮廓项数量: ${outlineItems.length}`);
            
            // 保存当前文档的大纲项，用于反向查找
            this.currentOutlineItems = outlineItems;
            
            // 添加加载完成的时间戳
            const loadTimestamp = new Date().toLocaleTimeString();
            this.outputChannel.appendLine(`[${loadTimestamp}] ✅ 函数大纲加载完成！共 ${outlineItems.length} 个项目`);
            
            return outlineItems;
        } catch (error) {
            this.outputChannel.appendLine(`[${timestamp}] ❌ 解析文档时出错: ${error}`);
            return [];
        }
    }

    private extractFunctionInfoFromTree(rootNode: any, language: string): FunctionInfo[] {
        const functions: FunctionInfo[] = [];
        
        if (language === 'javascript' || language === 'typescript') {
            // 对于JS/TS，我们需要构建层级结构
            this.extractJavaScriptHierarchy(rootNode, functions, language);
        } else if (language === 'csharp') {
            // 对于C#，构建命名空间和类的层级结构
            this.extractCSharpHierarchy(rootNode, functions, language);
        } else if (language === 'python') {
            // 对于Python，构建模块和类的层级结构
            this.extractPythonHierarchy(rootNode, functions, language);
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

        this.outputChannel.appendLine('🔍 开始解析JavaScript层级结构...');
        this.outputChannel.appendLine(`🔍 根节点类型: ${rootNode.type}`);
        this.outputChannel.appendLine(`🔍 根节点子节点数量: ${rootNode.children.length}`);
        
        // 遍历所有节点，找到类声明和方法
        this.traverseTree(rootNode, (node) => {
            this.outputChannel.appendLine(`🔍 检查节点: ${node.type}, 文本: "${node.text?.substring(0, 100)}..."`);
            
            if (node.type === 'class_declaration') {
                this.outputChannel.appendLine(`✅ 发现类声明节点`);
                // 处理类声明
                this.processClassDeclaration(node, functions, language);
            } else if (node.type === 'function_declaration') {
                // 只处理顶级函数声明，确保有函数名
                const functionName = this.findJavaScriptFunctionName(node);
                if (functionName && functionName !== 'anonymous' && this.isValidFunctionName(functionName)) {
                    this.outputChannel.appendLine(`✅ 发现顶级函数声明节点: ${functionName}`);
                    // 处理顶级函数声明
                    this.processTopLevelFunction(node, functions, language);
                } else {
                    this.outputChannel.appendLine(`⚠️ 跳过匿名函数声明或无效函数名: ${functionName}`);
                }
            }
            // 注释掉箭头函数的处理，因为它们通常不是顶级函数
            // else if (node.type === 'arrow_function') {
            //     // 箭头函数通常作为变量赋值或函数参数的一部分，不应该单独显示
            //     this.outputChannel.appendLine(`⚠️ 跳过箭头函数，因为它不是顶级函数`);
            // }
        });
    }

    // 新增方法：验证函数名是否有效
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

    // 新增方法：检查是否是顶级箭头函数
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

    private processClassDeclaration(classNode: any, functions: FunctionInfo[], language: string): void {
        const className = this.findClassName(classNode);
        if (!className) {
            this.outputChannel.appendLine(`❌ 无法找到类名，跳过此类声明`);
            return;
        }

        this.outputChannel.appendLine(`🔍 处理类声明: ${className}`);
        this.outputChannel.appendLine(`🔍 类节点类型: ${classNode.type}`);
        this.outputChannel.appendLine(`🔍 类节点子节点数量: ${classNode.children ? classNode.children.length : 0}`);
        this.outputChannel.appendLine(`🔍 类节点文本: "${classNode.text?.substring(0, 200)}..."`);

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

    // 新增方法：递归遍历类中的所有方法
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

    private processTopLevelArrowFunction(arrowFunctionNode: any, functions: FunctionInfo[], language: string): void {
        const functionName = this.findArrowFunctionName(arrowFunctionNode);
        if (!functionName) return;

        console.log(`🔍 处理顶级箭头函数: ${functionName}`);

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

    private extractClassMethod(methodNode: any, language: string, className: string): FunctionInfo | null {
        try {
            this.outputChannel.appendLine(`🔍 开始提取类方法，节点类型: ${methodNode.type}`);
            this.outputChannel.appendLine(`🔍 方法节点文本: "${methodNode.text?.substring(0, 100)}..."`);
            
            let name = '';
            let type: 'function' | 'method' | 'constructor' | 'class' | 'namespace' | 'property' | 'field' | 'event' = 'method';
            let parameters: string[] = [];
            let isStatic = false;

            if (methodNode.type === 'method_definition') {
                this.outputChannel.appendLine(`  🔍 处理method_definition类型`);
                name = this.findMethodName(methodNode) || 'anonymous';
                type = 'method';
                parameters = this.extractParameters(methodNode.parameters);
                isStatic = methodNode.static || false;
                this.outputChannel.appendLine(`  ✅ 方法名: ${name}, 参数: ${parameters.join(', ')}, 静态: ${isStatic}`);
            } else if (methodNode.type === 'constructor_declaration') {
                this.outputChannel.appendLine(`  🔍 处理constructor_declaration类型`);
                name = 'constructor';
                type = 'constructor';
                parameters = this.extractParameters(methodNode.parameters);
                this.outputChannel.appendLine(`  ✅ 构造函数, 参数: ${parameters.join(', ')}`);
            } else if (methodNode.type === 'getter') {
                this.outputChannel.appendLine(`  🔍 处理getter类型`);
                name = this.findGetterName(methodNode) || 'getter';
                type = 'property';
                this.outputChannel.appendLine(`  ✅ getter名称: ${name}`);
            } else if (methodNode.type === 'setter') {
                this.outputChannel.appendLine(`  🔍 处理setter类型`);
                name = this.findSetterName(methodNode) || 'setter';
                type = 'property';
                this.outputChannel.appendLine(`  ✅ setter名称: ${name}`);
            } else if (methodNode.type === 'function_declaration') {
                this.outputChannel.appendLine(`  🔍 处理类内function_declaration类型`);
                // 处理类内的函数声明
                name = this.findJavaScriptFunctionName(methodNode) || 'anonymous';
                type = 'method';
                parameters = this.extractParameters(methodNode.parameters);
                this.outputChannel.appendLine(`  ✅ 函数声明名称: ${name}, 参数: ${parameters.join(', ')}`);
            } else if (methodNode.type === 'arrow_function') {
                this.outputChannel.appendLine(`  🔍 处理类内arrow_function类型`);
                // 处理类内的箭头函数
                name = this.findArrowFunctionName(methodNode) || 'arrow_function';
                type = 'method';
                parameters = this.extractParameters(methodNode.parameters);
                this.outputChannel.appendLine(`  ✅ 箭头函数名称: ${name}, 参数: ${parameters.join(', ')}`);
            }

            if (!name || name === 'anonymous') {
                this.outputChannel.appendLine(`❌ 无法提取方法名，跳过此方法`);
                return null;
            }

            this.outputChannel.appendLine(`✅ 成功提取类方法: ${name} (${type})`);
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
            this.outputChannel.appendLine(`❌ 提取类方法失败: ${err}`);
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

    private findArrowFunctionName(arrowFunctionNode: any): string | undefined {
        if (!arrowFunctionNode || !arrowFunctionNode.children) return undefined;
        
        for (const child of arrowFunctionNode.children) {
            if (child.type === 'identifier') {
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
            // 只识别真正的函数声明和定义
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
                   // 移除 property_declaration，因为属性不需要显示
                   // 移除 field_declaration，因为字段不需要显示
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

    private findMethodName(methodNode: any): string | undefined {
        if (!methodNode || !methodNode.children) {
            this.outputChannel.appendLine(`  ❌ findMethodName: 方法节点或子节点为空`);
            return undefined;
        }
        
        this.outputChannel.appendLine(`  🔍 findMethodName: 开始查找方法名，子节点数量: ${methodNode.children.length}`);
        
        // 对于C#方法，我们需要跳过修饰符、返回类型，找到真正的方法名
        let foundReturnType = false;
        let skipNextGeneric = false;
        let skipNextArrayType = false;
        
        for (const child of methodNode.children) {
            this.outputChannel.appendLine(`    🔍 检查子节点: ${child.type}, 文本: "${child.text?.substring(0, 50)}..."`);
            
            // 跳过修饰符
            if (['modifier', 'public', 'private', 'protected', 'internal', 'static', 'async', 'virtual', 'override', 'abstract', 'extern'].includes(child.type) || 
                (child.type === 'identifier' && ['public', 'private', 'protected', 'internal', 'static', 'async', 'virtual', 'override', 'abstract', 'extern'].includes(child.text))) {
                this.outputChannel.appendLine(`    ⏭️ 跳过修饰符: ${child.text}`);
                continue;
            }
            
            // 跳过特性（如[DllImport]）
            if (child.type === 'attribute_list' || child.type === 'attribute') {
                this.outputChannel.appendLine(`    ⏭️ 跳过特性: ${child.text}`);
                continue;
            }
            
            // 检查是否是返回类型部分
            if (child.type === 'generic_name' || child.type === 'type_name' || child.type === 'predefined_type' ||
                (child.type === 'identifier' && ['Task', 'void', 'int', 'string', 'bool', 'double', 'float', 'byte', 'char', 'long', 'short', 'decimal', 'List', 'IEnumerable', 'ICollection', 'Array', 'System', 'IntPtr', 'ColorLayer'].includes(child.text))) {
                this.outputChannel.appendLine(`    ⏭️ 跳过返回类型: ${child.text}`);
                foundReturnType = true;
                // 如果是泛型类型，需要跳过泛型参数
                if (['Task', 'List', 'IEnumerable', 'ICollection', 'Array'].includes(child.text)) {
                    skipNextGeneric = true;
                }
                // 如果是数组类型的基础类型（如byte），需要跳过数组符号
                if (['byte', 'int', 'string', 'bool', 'double', 'float', 'char', 'long', 'short', 'decimal'].includes(child.text)) {
                    skipNextArrayType = true;
                }
                continue;
            }
            
            // 跳过泛型参数列表
            if (child.type === 'type_argument_list' || child.type === 'type_parameter_list') {
                this.outputChannel.appendLine(`    ⏭️ 跳过泛型参数: ${child.text}`);
                skipNextGeneric = false; // 重置标志
                continue;
            }
            
            // 跳过<>符号
            if (child.text === '<' || child.text === '>') {
                this.outputChannel.appendLine(`    ⏭️ 跳过泛型符号: ${child.text}`);
                continue;
            }
            
            // 跳过泛型类型参数（如byte[]中的byte）
            if (skipNextGeneric && child.type === 'identifier') {
                this.outputChannel.appendLine(`    ⏭️ 跳过泛型类型参数: ${child.text}`);
                skipNextGeneric = false;
                continue;
            }
            
            // 跳过数组类型标识符和数组符号
            if (child.type === 'array_type' || child.type === 'array_rank_specifier' || child.text === '[' || child.text === ']') {
                this.outputChannel.appendLine(`    ⏭️ 跳过数组类型: ${child.text}`);
                skipNextArrayType = false; // 重置标志
                continue;
            }
            
            // 跳过数组类型的基础类型（如byte[]中的byte）
            if (skipNextArrayType && child.type === 'identifier') {
                this.outputChannel.appendLine(`    ⏭️ 跳过数组基础类型: ${child.text}`);
                skipNextArrayType = false;
                continue;
            }
            
            // 找到真正的方法名标识符
            if (child.type === 'identifier') {
                // 如果已经遇到过返回类型，这应该是方法名
                if (foundReturnType) {
                    this.outputChannel.appendLine(`    ✅ 找到方法名标识符: ${child.text}`);
                    return child.text;
                } else {
                    // 如果还没遇到返回类型，这可能是返回类型的一部分
                    this.outputChannel.appendLine(`    ⏭️ 可能是返回类型的标识符: ${child.text}`);
                    foundReturnType = true;
                    continue;
                }
            }
            
            if (child.type === 'property_identifier') {
                this.outputChannel.appendLine(`    ✅ 找到属性标识符: ${child.text}`);
                return child.text;
            }
            
            // 递归查找子节点
            if (child.children && child.children.length > 0) {
                this.outputChannel.appendLine(`    🔍 递归查找子节点`);
                const foundName = this.findMethodName(child);
                if (foundName) {
                    this.outputChannel.appendLine(`    ✅ 递归找到方法名: ${foundName}`);
                    return foundName;
                }
            }
        }
        
        this.outputChannel.appendLine(`  ❌ findMethodName: 未找到方法名`);
        return undefined;
    }

    private findClassName(methodNode: any): string | undefined {
        if (!methodNode) {
            this.outputChannel.appendLine(`  ❌ findClassName: 方法节点为空`);
            return undefined;
        }
        
        this.outputChannel.appendLine(`  🔍 findClassName: 开始查找类名，节点类型: ${methodNode.type}`);
        
        if (methodNode.type === 'class_declaration') {
            this.outputChannel.appendLine(`  🔍 当前节点就是类声明，查找标识符`);
            for (const child of methodNode.children) {
                this.outputChannel.appendLine(`    🔍 检查子节点: ${child.type}, 文本: "${child.text?.substring(0, 50)}..."`);
                if (child.type === 'identifier') {
                    this.outputChannel.appendLine(`    ✅ 找到类名: ${child.text}`);
                    return child.text;
                }
            }
        }
        
        this.outputChannel.appendLine(`  🔍 向上查找父节点中的类声明`);
        let currentNode = methodNode.parent;
        let depth = 0;
        while (currentNode && depth < 10) { // 限制递归深度
            this.outputChannel.appendLine(`    🔍 检查父节点 ${depth}: ${currentNode.type}`);
            if (currentNode.type === 'class_declaration') {
                this.outputChannel.appendLine(`    ✅ 找到父类声明节点`);
                for (const child of currentNode.children) {
                    this.outputChannel.appendLine(`      🔍 检查子节点: ${child.type}, 文本: "${child.text?.substring(0, 50)}..."`);
                    if (child.type === 'identifier') {
                        this.outputChannel.appendLine(`      ✅ 找到类名: ${child.text}`);
                        return child.text;
                    }
                }
            }
            currentNode = currentNode.parent;
            depth++;
        }
        
        this.outputChannel.appendLine(`  ❌ findClassName: 未找到类名`);
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
            this.outputChannel.appendLine(`  🔍 extractParameters: 参数节点为空或没有子节点`);
            return [];
        }

        this.outputChannel.appendLine(`  🔍 extractParameters: 开始提取参数，子节点数量: ${parametersNode.children.length}`);
        const parameters: string[] = [];
        
        parametersNode.children.forEach((param: any, index: number) => {
            this.outputChannel.appendLine(`    🔍 检查参数 ${index}: 类型=${param.type}, 文本="${param.text?.substring(0, 50)}..."`);
            
            if (param.type === 'parameter') {
                const identifier = param.children?.find((child: any) => 
                    child.type === 'identifier'
                );
                if (identifier) {
                    this.outputChannel.appendLine(`    ✅ 找到参数标识符: ${identifier.text}`);
                    parameters.push(identifier.text);
                } else {
                    this.outputChannel.appendLine(`    ❌ 参数节点中没有找到标识符`);
                }
            } else if (param.type === 'identifier') {
                this.outputChannel.appendLine(`    ✅ 直接找到参数标识符: ${param.text}`);
                parameters.push(param.text);
            } else {
                this.outputChannel.appendLine(`    ❌ 未知参数类型: ${param.type}`);
            }
        });

        this.outputChannel.appendLine(`  ✅ extractParameters: 提取到 ${parameters.length} 个参数: [${parameters.join(', ')}]`);
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
        
        // 方法4：对于JavaScript/TypeScript，查找父节点的注释
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
            
            // 如果没有找到JSDoc内容，尝试提取简单的行注释
            const simpleComment = cleanText.replace(/^\/\/\s*/, '').trim();
            if (simpleComment) {
                console.log(`✅ 提取到JS/TS 简单注释: "${simpleComment}"`);
                return simpleComment;
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
        this.outputChannel.appendLine(`🔍 convertFunctionsToOutlineItems: 开始转换 ${functions.length} 个函数信息`);
        
        // 按层级分组
        const topLevelItems = functions.filter(f => !f.className && !f.namespaceName);
        const nestedItems = functions.filter(f => f.className || f.namespaceName);
        
        this.outputChannel.appendLine(`📊 顶级项目: ${topLevelItems.length}, 嵌套项目: ${nestedItems.length}`);
        
        // 去重处理：使用Map来避免重复的顶级项目
        const uniqueTopLevelItems = new Map<string, FunctionInfo>();
        topLevelItems.forEach(item => {
            const key = `${item.name}-${item.type}`;
            if (!uniqueTopLevelItems.has(key)) {
                uniqueTopLevelItems.set(key, item);
            }
        });
        
        this.outputChannel.appendLine(`📊 去重后顶级项目: ${uniqueTopLevelItems.size}`);
        
        // 创建顶级项目
        const outlineItems = Array.from(uniqueTopLevelItems.values()).map(func => {
            this.outputChannel.appendLine(`🔍 处理顶级项目: ${func.name} (${func.type})`);
            
            // 创建函数详细信息
            const functionDetails = {
                name: func.name,
                type: func.type,
                startLine: func.startLine,
                endLine: func.endLine,
                parameters: func.parameters,
                returnType: func.returnType,
                visibility: func.visibility,
                isStatic: func.isStatic,
                comment: func.comment,
                className: func.className,
                namespaceName: func.namespaceName
            };
            
            const item = new OutlineItem(
                func.name,
                func.comment || this.getDefaultDescription(func.type),
                vscode.TreeItemCollapsibleState.Expanded, // 默认展开
                func.startLine,
                func.endLine,
                func.name, // 传递函数名
                functionDetails // 传递函数详细信息
            );
            
            // 添加图标
            item.iconPath = this.getIconForType(func.type);
            
            // 查找嵌套项目
            const children = nestedItems.filter(nested => 
                nested.className === func.name || nested.namespaceName === func.name
            );
            
            this.outputChannel.appendLine(`  🔍 为 ${func.name} 查找子项目，找到 ${children.length} 个`);
            
            if (children.length > 0) {
                item.collapsibleState = vscode.TreeItemCollapsibleState.Expanded;
                // 去重处理子项目
                const uniqueChildren = new Map<string, FunctionInfo>();
                children.forEach(child => {
                    const childKey = `${child.name}-${child.type}-${child.startLine}`;
                    if (!uniqueChildren.has(childKey)) {
                        uniqueChildren.set(childKey, child);
                    }
                });
                
                uniqueChildren.forEach(child => {
                    this.outputChannel.appendLine(`    ✅ 添加子项目: ${child.name} (${child.type})`);
                    
                    // 创建子项目的函数详细信息
                    const childFunctionDetails = {
                        name: child.name,
                        type: child.type,
                        startLine: child.startLine,
                        endLine: child.endLine,
                        parameters: child.parameters,
                        returnType: child.returnType,
                        visibility: child.visibility,
                        isStatic: child.isStatic,
                        comment: child.comment,
                        className: child.className,
                        namespaceName: child.namespaceName
                    };
                    
                    const childItem = new OutlineItem(
                        child.name.split('.').pop() || child.name, // 只显示方法名，不显示类名
                        child.comment || this.getDefaultDescription(child.type),
                        vscode.TreeItemCollapsibleState.None,
                        child.startLine,
                        child.endLine,
                        child.name, // 传递函数名
                        childFunctionDetails // 传递函数详细信息
                    );
                    
                    childItem.iconPath = this.getIconForType(child.type);
                    item.addChild(childItem);
                });
            } else {
                item.collapsibleState = vscode.TreeItemCollapsibleState.None;
            }
            
            return item;
        });
        
        // 添加没有父级的嵌套项目（可能是独立的函数），同样需要去重
        const orphanedNested = nestedItems.filter(nested => 
            !Array.from(uniqueTopLevelItems.values()).some(top => top.name === nested.className || top.name === nested.namespaceName)
        );
        
        this.outputChannel.appendLine(`📊 孤儿嵌套项目: ${orphanedNested.length}`);
        
        // 去重处理孤儿嵌套项目
        const uniqueOrphanedNested = new Map<string, FunctionInfo>();
        orphanedNested.forEach(func => {
            const key = `${func.name}-${func.type}-${func.startLine}`;
            if (!uniqueOrphanedNested.has(key)) {
                uniqueOrphanedNested.set(key, func);
            }
        });
        
        uniqueOrphanedNested.forEach(func => {
            this.outputChannel.appendLine(`🔍 处理孤儿嵌套项目: ${func.name} (${func.type}), 类名: ${func.className}`);
            
            // 创建孤儿项目的函数详细信息
            const orphanFunctionDetails = {
                name: func.name,
                type: func.type,
                startLine: func.startLine,
                endLine: func.endLine,
                parameters: func.parameters,
                returnType: func.returnType,
                visibility: func.visibility,
                isStatic: func.isStatic,
                comment: func.comment,
                className: func.className,
                namespaceName: func.namespaceName
            };
            
            const item = new OutlineItem(
                func.name,
                func.comment || this.getDefaultDescription(func.type),
                vscode.TreeItemCollapsibleState.None,
                func.startLine,
                func.endLine,
                func.name, // 传递函数名
                orphanFunctionDetails // 传递函数详细信息
            );
            
            item.iconPath = this.getIconForType(func.type);
            outlineItems.push(item);
        });
        
        this.outputChannel.appendLine(`✅ convertFunctionsToOutlineItems: 转换完成，返回 ${outlineItems.length} 个大纲项`);
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

    private diagnoseTreeStructure(rootNode: any, language: string, timestamp: string): void {
        this.outputChannel.appendLine(`[${timestamp}] 🔍 开始详细诊断树结构...`);
        const diagnostics: string[] = [];

        if (!rootNode) {
            this.outputChannel.appendLine(`[${timestamp}] ❌ 根节点为空`);
            return;
        }

        if (!rootNode.children) {
            this.outputChannel.appendLine(`[${timestamp}] ❌ 根节点没有子节点`);
            return;
        }

        const functionNodes = rootNode.children.filter((node: any) => this.isFunctionDeclaration(node, language));
        if (functionNodes.length === 0) {
            this.outputChannel.appendLine(`[${timestamp}] ⚠️ 未找到任何函数声明或定义`);
        } else {
            this.outputChannel.appendLine(`[${timestamp}] ✅ 找到 ${functionNodes.length} 个函数声明/定义`);
        }

        const classNodes = rootNode.children.filter((node: any) => node.type === 'class_declaration');
        if (classNodes.length === 0) {
            this.outputChannel.appendLine(`[${timestamp}] ⚠️ 未找到任何类声明`);
        } else {
            this.outputChannel.appendLine(`[${timestamp}] ✅ 找到 ${classNodes.length} 个类声明`);
        }

        const namespaceNodes = rootNode.children.filter((node: any) => node.type === 'namespace_declaration');
        if (namespaceNodes.length === 0) {
            this.outputChannel.appendLine(`[${timestamp}] ⚠️ 未找到任何命名空间声明`);
        } else {
            this.outputChannel.appendLine(`[${timestamp}] ✅ 找到 ${namespaceNodes.length} 个命名空间声明`);
        }

        // 移除字段诊断，因为字段不需要显示
        // const fieldNodes = rootNode.children.filter((node: any) => node.type === 'field_declaration');
        // if (fieldNodes.length === 0) {
        //     this.outputChannel.appendLine(`[${timestamp}] ⚠️ 未找到任何字段声明`);
        // } else {
        //     this.outputChannel.appendLine(`[${timestamp}] ✅ 找到 ${fieldNodes.length} 个字段声明`);
        // }

        const eventNodes = rootNode.children.filter((node: any) => node.type === 'event_declaration');
        if (eventNodes.length === 0) {
            this.outputChannel.appendLine(`[${timestamp}] ⚠️ 未找到任何事件声明`);
        } else {
            this.outputChannel.appendLine(`[${timestamp}] ✅ 找到 ${eventNodes.length} 个事件声明`);
        }

        if (diagnostics.length > 0) {
            this.outputChannel.appendLine(`[${timestamp}] ⚠️ 树结构诊断: ${diagnostics.join(', ')}`);
        } else {
            this.outputChannel.appendLine(`[${timestamp}] ✅ 树结构诊断: 没有发现明显问题`);
        }
    }

    private setupCursorChangeListener(): void {
        // 监听文档变化
        this.cursorChangeListener = vscode.workspace.onDidChangeTextDocument(event => {
            const editor = vscode.window.activeTextEditor;
            if (editor && event.document === editor.document) {
                // 只有在文档内容真正变化时才刷新，而不是光标位置变化
                this.refresh();
            }
        });

        // 监听光标位置变化 - 优化：减少不必要的刷新和日志
        let lastHighlightedLine = -1;
        let lastLogTime = 0;
        const LOG_INTERVAL = 1000; // 1秒内只记录一次日志
        
        vscode.window.onDidChangeTextEditorSelection(event => {
            if (event.textEditor === vscode.window.activeTextEditor) {
                const lineNumber = event.selections[0].active.line + 1; // 转换为1-based行号
                const currentTime = Date.now();
                
                // 只有当行号真正变化时才处理，避免重复处理
                if (lineNumber !== lastHighlightedLine) {
                    // 限制日志输出频率，避免控制台刷屏
                    if (currentTime - lastLogTime > LOG_INTERVAL) {
                        const timestamp = new Date().toLocaleTimeString();
                        this.outputChannel.appendLine(`[${timestamp}] 🖱️ 光标位置变化: ${lastHighlightedLine} -> ${lineNumber}`);
                        lastLogTime = currentTime;
                    }
                    
                    lastHighlightedLine = lineNumber;
                    
                    // 延迟一点时间确保光标位置稳定
                    setTimeout(() => {
                        this.highlightFunctionAtLine(lineNumber);
                    }, 100); // 增加延迟时间，减少频繁刷新
                }
            }
        });

        // 监听活动编辑器变化
        vscode.window.onDidChangeActiveTextEditor(editor => {
            if (editor) {
                // 重置最后高亮的行号
                lastHighlightedLine = -1;
                lastLogTime = 0;
                this.refresh();
            }
        });
    }

    private disposeCursorChangeListener(): void {
        if (this.cursorChangeListener) {
            this.cursorChangeListener.dispose();
            this.cursorChangeListener = null;
        }
    }

    // 新增：根据行号查找对应的函数
    public findFunctionByLine(lineNumber: number): FunctionInfo | null {
        if (!this.currentFunctions || this.currentFunctions.length === 0) {
            return null;
        }

        // 查找包含当前行的函数
        for (const func of this.currentFunctions) {
            if (lineNumber >= func.startLine && lineNumber <= func.endLine) {
                return func;
            }
        }

        return null;
    }

    // 新增：根据行号查找对应的OutlineItem
    public findOutlineItemByLine(lineNumber: number): OutlineItem | null {
        if (!this.currentOutlineItems || this.currentOutlineItems.length === 0) {
            return null;
        }

        // 递归查找包含当前行的OutlineItem
        const result = this.findOutlineItemRecursive(this.currentOutlineItems, lineNumber);
        
        return result;
    }

    private findOutlineItemRecursive(items: OutlineItem[], lineNumber: number): OutlineItem | null {
        for (const item of items) {
            if (lineNumber >= item.startLine && lineNumber <= item.endLine) {
                // 检查子项中是否有更精确的匹配
                if (item.children && item.children.length > 0) {
                    const childMatch = this.findOutlineItemRecursive(item.children, lineNumber);
                    if (childMatch) {
                        return childMatch;
                    }
                }
                
                return item;
            }
        }
        
        return null;
    }

    // 新增：高亮显示指定行对应的函数
    public highlightFunctionAtLine(lineNumber: number): void {
        const config = getConfig();
        
        // 清除之前的高亮
        this.clearAllHighlights();
        
        // 查找对应的OutlineItem
        const outlineItem = this.findOutlineItemByLine(lineNumber);
        
        if (outlineItem) {
            // 设置高亮
            outlineItem.setHighlighted(true);
            
            // 确保包含该函数的父节点是展开状态
            this.ensureParentExpanded(outlineItem);
            
            // 强制刷新UI以显示高亮
            this.refresh();
        }
    }

    // 新增：防抖刷新机制
    private refreshTimeout: NodeJS.Timeout | undefined;
    private debouncedRefresh(): void {
        const config = getConfig();
        if (this.refreshTimeout) {
            clearTimeout(this.refreshTimeout);
        }
        this.refreshTimeout = setTimeout(() => {
            this.refresh();
        }, config.cursorChangeRefreshDelay); // 使用配置中的延迟时间
    }

    // 新增：处理函数大纲项点击事件
    public onFunctionItemClick(startLine: number): void {
        this.outputChannel.appendLine(`🎯 函数大纲项被点击，行号: ${startLine}`);
        // 延迟一点时间确保光标已经跳转完成
        setTimeout(() => {
            this.highlightFunctionAtLine(startLine);
        }, 100);
    }

    // 新增：清除所有高亮
    private clearAllHighlights(): void {
        if (this.currentOutlineItems) {
            this.clearHighlightsRecursive(this.currentOutlineItems);
        }
    }

    private clearHighlightsRecursive(items: OutlineItem[]): void {
        for (const item of items) {
            item.setHighlighted(false);
            if (item.children && item.children.length > 0) {
                this.clearHighlightsRecursive(item.children);
            }
        }
    }

    // 新增：确保包含指定项的父节点是展开状态
    private ensureParentExpanded(item: OutlineItem): void {
        if (this.currentOutlineItems) {
            this.ensureParentExpandedRecursive(this.currentOutlineItems, item);
        }
    }

    private ensureParentExpandedRecursive(items: OutlineItem[], targetItem: OutlineItem): boolean {
        for (const item of items) {
            if (item.children && item.children.includes(targetItem)) {
                // 找到父节点，确保它是展开状态
                item.setExpanded();
                return true;
            }
            if (item.children && item.children.length > 0) {
                if (this.ensureParentExpandedRecursive(item.children, targetItem)) {
                    // 在子节点中找到目标项，确保当前节点是展开状态
                    item.setExpanded();
                    return true;
                }
            }
        }
        return false;
    }

    // 新增：获取当前文档的所有函数信息
    public getCurrentFunctions(): FunctionInfo[] {
        return this.currentFunctions;
    }

    // 新增：获取当前文档的所有大纲项
    public getCurrentOutlineItems(): OutlineItem[] {
        return this.currentOutlineItems;
    }

    // 新增：检测函数大纲是否加载成功
    public isOutlineLoaded(): boolean {
        const hasFunctions = this.currentFunctions && this.currentFunctions.length > 0;
        const hasOutlineItems = this.currentOutlineItems && this.currentOutlineItems.length > 0;
        const isInitialized = this.isInitialized;
        
        const timestamp = new Date().toLocaleTimeString();
        this.outputChannel.appendLine(`[${timestamp}] 🔍 函数大纲状态检查:`);
        this.outputChannel.appendLine(`[${timestamp}]   - 已初始化: ${isInitialized ? '✅' : '❌'}`);
        this.outputChannel.appendLine(`[${timestamp}]   - 函数数量: ${this.currentFunctions?.length || 0}`);
        this.outputChannel.appendLine(`[${timestamp}]   - 大纲项数量: ${this.currentOutlineItems?.length || 0}`);
        this.outputChannel.appendLine(`[${timestamp}]   - 总体状态: ${hasFunctions && hasOutlineItems && isInitialized ? '✅ 已加载' : '❌ 未加载'}`);
        
        return hasFunctions && hasOutlineItems && isInitialized;
    }

    // 新增：获取函数大纲加载状态详情
    public getOutlineStatus(): {
        isInitialized: boolean;
        hasFunctions: boolean;
        hasOutlineItems: boolean;
        functionCount: number;
        outlineItemCount: number;
        currentLanguage: string;
        parserStatus: string;
    } {
        return {
            isInitialized: this.isInitialized,
            hasFunctions: this.currentFunctions && this.currentFunctions.length > 0,
            hasOutlineItems: this.currentOutlineItems && this.currentOutlineItems.length > 0,
            functionCount: this.currentFunctions?.length || 0,
            outlineItemCount: this.currentOutlineItems?.length || 0,
            currentLanguage: this.currentLanguage,
            parserStatus: this.parser ? '已创建' : '未创建'
        };
    }

    // 新增：清理资源
    public dispose(): void {
        if (this.refreshTimeout) {
            clearTimeout(this.refreshTimeout);
            this.refreshTimeout = undefined;
        }
        this.disposeCursorChangeListener();
    }

    // 新增：C#层级结构解析
    private extractCSharpHierarchy(rootNode: any, functions: FunctionInfo[], language: string): void {
        if (!rootNode.children) return;

        this.outputChannel.appendLine('🔍 开始解析C#层级结构...');
        this.outputChannel.appendLine(`🔍 根节点类型: ${rootNode.type}`);
        this.outputChannel.appendLine(`🔍 根节点子节点数量: ${rootNode.children.length}`);
        
        // 添加调试信息：显示所有根节点的类型
        this.outputChannel.appendLine('🔍 根节点类型列表:');
        rootNode.children.forEach((child: any, index: number) => {
            this.outputChannel.appendLine(`  ${index}: ${child.type} - "${child.text?.substring(0, 100).replace(/\n/g, '\\n')}..."`);
        });
        
        // 首先找到顶级类（不在其他类内部的类）
        const topLevelClasses: any[] = [];
        const nestedClasses: any[] = [];
        
        this.traverseTree(rootNode, (node) => {
            if (node.type === 'class_declaration') {
                // 检查这个类是否是嵌套类
                if (this.isNestedClass(node)) {
                    this.outputChannel.appendLine(`🔍 发现嵌套类: ${this.findClassName(node) || 'unknown'}`);
                    nestedClasses.push(node);
                } else {
                    this.outputChannel.appendLine(`🔍 发现顶级类: ${this.findClassName(node) || 'unknown'}`);
                    topLevelClasses.push(node);
                }
            }
        });
        
        this.outputChannel.appendLine(`📊 找到 ${topLevelClasses.length} 个顶级类，${nestedClasses.length} 个嵌套类`);
        
        // 处理顶级类
        topLevelClasses.forEach(classNode => {
            this.outputChannel.appendLine(`✅ 处理顶级类: ${this.findClassName(classNode)}`);
            this.processCSharpClass(classNode, functions, language);
        });
        
        // 处理嵌套类，确保它们被正确设置为父类的子项
        nestedClasses.forEach(classNode => {
            this.outputChannel.appendLine(`✅ 处理嵌套类: ${this.findClassName(classNode)}`);
            this.processNestedCSharpClass(classNode, functions, language);
        });
        
        // 处理其他顶级成员（方法、事件等）- 只处理不在任何类内的真正顶级成员
        this.outputChannel.appendLine('🔍 开始处理真正的顶级成员...');
        this.traverseTree(rootNode, (node) => {
            if (node.type === 'namespace_declaration') {
                this.outputChannel.appendLine(`✅ 发现命名空间声明节点`);
                this.processCSharpNamespace(node, functions, language);
            } else if (node.type === 'method_declaration' || 
                       node.type === 'constructor_declaration' ||
                       node.type === 'event_declaration') {
                // 只处理不在任何类内的顶级成员，并且不是已经处理过的类
                if (!this.isInsideClass(node) && !this.isAlreadyProcessedClass(node, topLevelClasses, nestedClasses)) {
                    this.outputChannel.appendLine(`✅ 发现真正的顶级C#成员: ${node.type}`);
                    this.processTopLevelCSharpMember(node, functions, language);
                } else {
                    this.outputChannel.appendLine(`⏭️ 跳过已处理或非顶级成员: ${node.type}`);
                }
            }
        });
        
        // 添加调试信息：显示解析结果
        this.outputChannel.appendLine(`📊 C#层级解析完成，找到 ${functions.length} 个项目:`);
        functions.forEach((func, index) => {
            this.outputChannel.appendLine(`  ${index}: ${func.name} (${func.type}) - 行 ${func.startLine}-${func.endLine} - 类名: ${func.className || '无'} - 命名空间: ${func.namespaceName || '无'}`);
        });
    }

    // 新增：Python层级结构解析
    private extractPythonHierarchy(rootNode: any, functions: FunctionInfo[], language: string): void {
        if (!rootNode.children) return;

        this.outputChannel.appendLine('🔍 开始解析Python层级结构...');
        this.outputChannel.appendLine(`🔍 根节点类型: ${rootNode.type}`);
        this.outputChannel.appendLine(`🔍 根节点子节点数量: ${rootNode.children.length}`);
        
        // 遍历所有节点，找到模块、类声明等
        this.traverseTree(rootNode, (node) => {
            this.outputChannel.appendLine(`🔍 检查Python节点: ${node.type}, 文本: "${node.text?.substring(0, 100)}..."`);
            
            if (node.type === 'class_definition') {
                this.outputChannel.appendLine(`✅ 发现类定义节点`);
                this.processPythonClass(node, functions, language);
            } else if (node.type === 'function_definition') {
                // 处理顶级函数（不在类内的）
                this.outputChannel.appendLine(`✅ 发现顶级Python函数`);
                this.processTopLevelPythonFunction(node, functions, language);
            }
        });
    }

    // 新增：处理C#命名空间
    private processCSharpNamespace(namespaceNode: any, functions: FunctionInfo[], language: string): void {
        const namespaceName = this.findNamespaceName(namespaceNode);
        if (!namespaceName) {
            this.outputChannel.appendLine(`❌ 无法找到命名空间名，跳过此命名空间声明`);
            return;
        }

        this.outputChannel.appendLine(`🔍 处理命名空间: ${namespaceName}`);

        // 创建命名空间节点
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
        this.outputChannel.appendLine(`✅ 添加命名空间到函数列表: ${namespaceName}`);

        // 查找命名空间中的类和其他成员，但不包括属性
        let memberCount = 0;
        this.traverseCSharpNamespaceMembers(namespaceNode, (memberNode) => {
            if (memberNode.type === 'class_declaration') {
                this.outputChannel.appendLine(`  ✅ 命名空间中的类: ${memberNode.type}`);
                this.processCSharpClass(memberNode, functions, language, namespaceName);
                memberCount++;
            } else if (this.isFunctionDeclaration(memberNode, language)) {
                this.outputChannel.appendLine(`  ✅ 命名空间中的成员: ${memberNode.type}`);
                const memberInfo = this.extractFunctionInfo(memberNode, language);
                if (memberInfo) {
                    memberInfo.namespaceName = namespaceName;
                    functions.push(memberInfo);
                    memberCount++;
                }
            }
        });
        
        this.outputChannel.appendLine(`📊 命名空间 ${namespaceName} 处理完成，找到 ${memberCount} 个成员`);
    }

    // 新增：处理C#类
    private processCSharpClass(classNode: any, functions: FunctionInfo[], language: string, namespaceName?: string): void {
        const className = this.findClassName(classNode);
        if (!className) {
            this.outputChannel.appendLine(`❌ 无法找到类名，跳过此类声明`);
            return;
        }

        this.outputChannel.appendLine(`🔍 处理C#类: ${className}`);

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
            namespaceName: namespaceName
        };

        functions.push(classInfo);
        this.outputChannel.appendLine(`✅ 添加C#类到函数列表: ${className}`);

        // 查找类中的方法、字段、事件等，但不包括属性
        let memberCount = 0;
        this.traverseCSharpClassMembers(classNode, (memberNode) => {
            if (this.isFunctionDeclaration(memberNode, language)) {
                this.outputChannel.appendLine(`  ✅ 识别为类成员: ${memberNode.type}`);
                const memberInfo = this.extractFunctionInfo(memberNode, language);
                if (memberInfo) {
                    this.outputChannel.appendLine(`✅ 提取C#类成员: ${memberInfo.name}`);
                    // 设置className和namespaceName，这样在convertFunctionsToOutlineItems中就能正确建立父子关系
                    memberInfo.className = className;
                    memberInfo.namespaceName = namespaceName;
                    functions.push(memberInfo);
                    memberCount++;
                } else {
                    this.outputChannel.appendLine(`❌ 提取C#类成员失败: ${memberNode.type}`);
                }
            } else {
                this.outputChannel.appendLine(`  ❌ 不是类成员: ${memberNode.type}`);
            }
        });
        
        this.outputChannel.appendLine(`📊 C#类 ${className} 处理完成，找到 ${memberCount} 个成员`);
    }

    // 新增：处理顶级C#成员
    private processTopLevelCSharpMember(memberNode: any, functions: FunctionInfo[], language: string): void {
        const memberInfo = this.extractFunctionInfo(memberNode, language);
        if (memberInfo) {
            this.outputChannel.appendLine(`✅ 提取顶级C#成员: ${memberInfo.name}`);
            functions.push(memberInfo);
        } else {
            this.outputChannel.appendLine(`❌ 提取顶级C#成员失败: ${memberNode.type}`);
        }
    }

    // 新增：处理Python类
    private processPythonClass(classNode: any, functions: FunctionInfo[], language: string): void {
        const className = this.findPythonClassName(classNode);
        if (!className) {
            this.outputChannel.appendLine(`❌ 无法找到Python类名，跳过此类定义`);
            return;
        }

        this.outputChannel.appendLine(`🔍 处理Python类: ${className}`);

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
        this.outputChannel.appendLine(`✅ 添加Python类到函数列表: ${className}`);

        // 查找类中的方法
        let methodCount = 0;
        this.traversePythonClassMembers(classNode, (memberNode) => {
            if (memberNode.type === 'function_definition') {
                this.outputChannel.appendLine(`  ✅ 识别为Python类方法: ${memberNode.type}`);
                const methodInfo = this.extractFunctionInfo(memberNode, language);
                if (methodInfo) {
                    this.outputChannel.appendLine(`✅ 提取Python类方法: ${methodInfo.name}`);
                    // 设置className，这样在convertFunctionsToOutlineItems中就能正确建立父子关系
                    methodInfo.className = className;
                    functions.push(methodInfo);
                    methodCount++;
                } else {
                    this.outputChannel.appendLine(`❌ 提取Python类方法失败: ${memberNode.type}`);
                }
            } else {
                this.outputChannel.appendLine(`  ❌ 不是Python类方法: ${memberNode.type}`);
            }
        });
        
        this.outputChannel.appendLine(`📊 Python类 ${className} 处理完成，找到 ${methodCount} 个方法`);
    }

    // 新增：处理顶级Python函数
    private processTopLevelPythonFunction(functionNode: any, functions: FunctionInfo[], language: string): void {
        const functionName = this.findPythonFunctionName(functionNode);
        if (!functionName) return;

        this.outputChannel.appendLine(`🔍 处理顶级Python函数: ${functionName}`);

        const functionInfo: FunctionInfo = {
            id: `${language}-${functionName}-${functionNode.startPosition.row}`,
            name: functionName,
            comment: this.extractComment(functionNode, language),
            startLine: functionNode.startPosition.row + 1,
            endLine: functionNode.endPosition.row + 1,
            parameters: this.extractPythonParameters(functionNode.parameters),
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

    // 新增：递归遍历C#命名空间中的所有成员
    private traverseCSharpNamespaceMembers(namespaceNode: any, callback: (memberNode: any) => void): void {
        if (!namespaceNode.children) return;
        
        namespaceNode.children.forEach((child: any) => {
            // 如果是命名空间体，继续遍历其子节点
            if (child.type === 'namespace_body') {
                this.traverseCSharpNamespaceMembers(child, callback);
            }
            // 如果是成员定义，直接调用回调
            else if (this.isFunctionDeclaration(child, 'csharp') || child.type === 'class_declaration') {
                callback(child);
            }
            // 其他情况，递归遍历
            else if (child.children) {
                this.traverseCSharpNamespaceMembers(child, callback);
            }
        });
    }

    // 新增：递归遍历C#类中的所有成员
    private traverseCSharpClassMembers(classNode: any, callback: (memberNode: any) => void): void {
        if (!classNode.children) return;
        
        classNode.children.forEach((child: any) => {
            // 如果是类体，继续遍历其子节点
            if (child.type === 'class_body') {
                this.traverseCSharpClassMembers(child, callback);
            }
            // 如果是成员定义，直接调用回调
            else if (this.isFunctionDeclaration(child, 'csharp')) {
                callback(child);
            }
            // 其他情况，递归遍历
            else if (child.children) {
                this.traverseCSharpClassMembers(child, callback);
            }
        });
    }

    // 新增：递归遍历Python类中的所有成员
    private traversePythonClassMembers(classNode: any, callback: (memberNode: any) => void): void {
        if (!classNode.children) return;
        
        classNode.children.forEach((child: any) => {
            // 如果是类体，继续遍历其子节点
            if (child.type === 'class_body') {
                this.traversePythonClassMembers(child, callback);
            }
            // 如果是方法定义，直接调用回调
            else if (child.type === 'function_definition') {
                callback(child);
            }
            // 其他情况，递归遍历
            else if (child.children) {
                this.traversePythonClassMembers(child, callback);
            }
        });
    }

    // 新增：检查类是否是嵌套类
    private isNestedClass(classNode: any): boolean {
        if (!classNode.parent) {
            this.outputChannel.appendLine(`  🔍 isNestedClass: 节点没有父节点，不是嵌套类`);
            return false;
        }
        
        this.outputChannel.appendLine(`  🔍 isNestedClass: 检查类 "${this.findClassName(classNode) || 'unknown'}" 是否为嵌套类`);
        
        let currentNode = classNode.parent;
        let depth = 0;
        
        while (currentNode && depth < 10) { // 限制递归深度
            this.outputChannel.appendLine(`    🔍 检查父节点 ${depth}: 类型=${currentNode.type}, 文本="${currentNode.text?.substring(0, 50).replace(/\n/g, '\\n')}..."`);
            
            if (currentNode.type === 'class_declaration') {
                const parentClassName = this.findClassName(currentNode);
                this.outputChannel.appendLine(`    ✅ 找到父类声明: ${parentClassName || 'unknown'}`);
                this.outputChannel.appendLine(`    ✅ 类 "${this.findClassName(classNode) || 'unknown'}" 是嵌套类`);
                return true;
            } else if (currentNode.type === 'class_body') {
                this.outputChannel.appendLine(`    🔍 找到类体，继续向上查找父类声明`);
            }
            
            currentNode = currentNode.parent;
            depth++;
        }
        
        this.outputChannel.appendLine(`    ❌ 未找到父类声明，类 "${this.findClassName(classNode) || 'unknown'}" 不是嵌套类`);
        return false; // 没有找到父类
    }
    
    // 新增：检查节点是否在类内部
    private isInsideClass(node: any): boolean {
        if (!node.parent) return false;
        
        let currentNode = node.parent;
        while (currentNode) {
            if (currentNode.type === 'class_declaration' || currentNode.type === 'class_body') {
                return true; // 在类内部
            }
            currentNode = currentNode.parent;
        }
        return false; // 不在类内部
    }
    
    // 新增：处理嵌套的C#类
    private processNestedCSharpClass(classNode: any, functions: FunctionInfo[], language: string): void {
        const className = this.findClassName(classNode);
        if (!className) {
            this.outputChannel.appendLine(`❌ 无法找到嵌套类名，跳过此类声明`);
            return;
        }

        this.outputChannel.appendLine(`🔍 处理嵌套C#类: ${className}`);

        // 查找父类
        const parentClassName = this.findParentClassName(classNode);
        if (!parentClassName) {
            this.outputChannel.appendLine(`❌ 无法找到嵌套类的父类名，跳过此类声明`);
            return;
        }

        this.outputChannel.appendLine(`🔍 嵌套类的父类: ${parentClassName}`);

        // 创建嵌套类节点
        const nestedClassInfo: FunctionInfo = {
            id: `${language}-${parentClassName}-${className}-${classNode.startPosition.row}`,
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
            className: parentClassName, // 设置为父类名
            namespaceName: undefined
        };

        functions.push(nestedClassInfo);
        this.outputChannel.appendLine(`✅ 添加嵌套C#类到函数列表: ${className} (父类: ${parentClassName})`);

        // 查找嵌套类中的方法、事件等
        let memberCount = 0;
        this.traverseCSharpClassMembers(classNode, (memberNode) => {
            if (this.isFunctionDeclaration(memberNode, language)) {
                this.outputChannel.appendLine(`  ✅ 识别为嵌套类成员: ${memberNode.type}`);
                const memberInfo = this.extractFunctionInfo(memberNode, language);
                if (memberInfo) {
                    this.outputChannel.appendLine(`✅ 提取嵌套C#类成员: ${memberInfo.name}`);
                    // 设置className为嵌套类名，这样在convertFunctionsToOutlineItems中就能正确建立父子关系
                    memberInfo.className = className;
                    memberInfo.namespaceName = undefined;
                    functions.push(memberInfo);
                    memberCount++;
                } else {
                    this.outputChannel.appendLine(`❌ 提取嵌套C#类成员失败: ${memberNode.type}`);
                }
            } else {
                this.outputChannel.appendLine(`  ❌ 不是嵌套类成员: ${memberNode.type}`);
            }
        });
        
        this.outputChannel.appendLine(`📊 嵌套C#类 ${className} 处理完成，找到 ${memberCount} 个成员`);
    }
    
    // 新增：查找嵌套类的父类名
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
    
    // 新增：检查节点是否已经处理过
    private isAlreadyProcessedClass(node: any, topLevelClasses: any[], nestedClasses: any[]): boolean {
        // 检查是否在顶级类列表中
        const isInTopLevel = topLevelClasses.some(top => 
            top.startPosition.row === node.startPosition.row && 
            top.startPosition.column === node.startPosition.column
        );
        
        // 检查是否在嵌套类列表中
        const isInNested = nestedClasses.some(nested => 
            nested.startPosition.row === node.startPosition.row && 
            nested.startPosition.column === node.startPosition.column
        );
        
        if (isInTopLevel || isInNested) {
            this.outputChannel.appendLine(`    ⏭️ 节点已处理过，跳过: ${node.type} (行: ${node.startPosition.row + 1})`);
            return true;
        }
        
        return false;
    }
}