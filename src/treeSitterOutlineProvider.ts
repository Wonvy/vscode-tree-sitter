import * as vscode from 'vscode';
import { Parser, Language as TreeSitterLanguage } from 'web-tree-sitter';
import { OutlineItem } from './outlineItem';
import { FunctionInfo, Language } from './types';
import { getConfig } from './config';
import { ParserFactory } from './parsers/parserFactory';
import * as path from 'path';

export class TreeSitterOutlineProvider implements vscode.TreeDataProvider<OutlineItem> {
    private _onDidChangeTreeData: vscode.EventEmitter<OutlineItem | undefined | null | void> = new vscode.EventEmitter<OutlineItem | undefined | null | void>();
    readonly onDidChangeTreeData: vscode.Event<OutlineItem | undefined | null | void> = this._onDidChangeTreeData.event;

    // 添加专门的高亮更新事件
    private _onDidChangeHighlight: vscode.EventEmitter<OutlineItem | undefined | null | void> = new vscode.EventEmitter<OutlineItem | undefined | null | void>();
    readonly onDidChangeHighlight: vscode.Event<OutlineItem | undefined | null | void> = this._onDidChangeHighlight.event;

    private parser: Parser | null = null;
    private currentLanguage: string = '';
    private isInitialized = false;
    private jsLanguage: TreeSitterLanguage | null = null;
    private csLanguage: TreeSitterLanguage | null = null;
    private pyLanguage: TreeSitterLanguage | null = null;
    private extensionUri: vscode.Uri;
    private outputChannel: vscode.OutputChannel;
    private parserFactory: ParserFactory;
    
    // 存储当前文档的函数信息，用于反向查找
    private currentFunctions: FunctionInfo[] = [];
    private currentOutlineItems: OutlineItem[] = [];
    private cursorChangeListener: vscode.Disposable | null = null;

    constructor(extensionUri: vscode.Uri, outputChannel: vscode.OutputChannel) {
        this.extensionUri = extensionUri;
        this.outputChannel = outputChannel;
        this.parserFactory = new ParserFactory(outputChannel);
        this.currentDocumentUri = undefined; // 初始化当前文档URI
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
        const timestamp = new Date().toLocaleTimeString();
        const stackTrace = new Error().stack;
        this.outputChannel.appendLine(`[${timestamp}] 🔄 refresh() 被调用，调用栈:`);
        if (stackTrace) {
            const lines = stackTrace.split('\n').slice(1, 6);
            lines.forEach(line => {
                this.outputChannel.appendLine(`[${timestamp}]   ${line.trim()}`);
            });
        }
        
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

        if (!editor.document || !editor.document.fileName) {
            this.outputChannel.appendLine(`[${timestamp}] ⚠️ 编辑器文档无效，不处理文档`);
            return Promise.resolve([]);
        }

        return this.processDocument(editor.document, timestamp);
    }

    private getLastActiveEditor(): vscode.TextEditor | undefined {
        if (vscode.window.activeTextEditor) {
            return vscode.window.activeTextEditor;
        }
        
        const visibleEditors = vscode.window.visibleTextEditors;
        if (visibleEditors.length > 0) {
            return visibleEditors[0];
        }
        
        const documents = vscode.workspace.textDocuments;
        if (documents.length > 0) {
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

    private processDocument(document: vscode.TextDocument, timestamp: string): Thenable<OutlineItem[]> {
        const language = document.languageId;
        const fileName = document.fileName;
        const documentUri = document.uri.toString();
        
        // 使用新的特殊文档过滤方法
        if (this.isSpecialDocument(documentUri)) {
            this.outputChannel.appendLine(`[${timestamp}] ⚠️ 跳过特殊文档: ${documentUri}`);
            return Promise.resolve([]);
        }
        
        this.outputChannel.appendLine(`[${timestamp}] 🔍 处理文档，语言: ${language}, 文件: ${fileName}`);

        if (!this.parserFactory.isLanguageSupported(language)) {
            this.outputChannel.appendLine(`[${timestamp}] ⚠️ 不支持的语言: ${language}`);
            return Promise.resolve([]);
        }

        if (!this.isInitialized) {
            this.outputChannel.appendLine(`[${timestamp}] ⏳ Tree-Sitter 正在初始化中，稍后再试...`);
            return Promise.resolve([]);
        }

        this.outputChannel.appendLine(`[${timestamp}] ✅ 开始解析文档: ${fileName}`);

        if (this.currentLanguage !== language) {
            this.outputChannel.appendLine(`[${timestamp}] 🔄 语言从 ${this.currentLanguage} 变为 ${language}`);
            this.setLanguage(language);
        }

        return this.parseDocument(document, timestamp);
    }

    private setLanguage(language: string): void {
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
            
            if (rootNode.children) {
                this.outputChannel.appendLine(`[${timestamp}] 🔍 前5个根节点类型:`);
                rootNode.children.slice(0, 5).forEach((child: any, index: number) => {
                    this.outputChannel.appendLine(`[${timestamp}]   ${index}: ${child.type} - "${child.text?.substring(0, 50)}..."`);
                });
            }
            
            const functions = this.extractFunctionInfoFromTree(rootNode, this.currentLanguage);
            this.outputChannel.appendLine(`[${timestamp}] 📊 提取的函数数量: ${functions.length}`);
            
            this.currentFunctions = functions;
            
            if (functions.length === 0) {
                this.outputChannel.appendLine(`[${timestamp}] ⚠️ 没有找到任何函数，开始详细诊断...`);
                this.diagnoseTreeStructure(rootNode, this.currentLanguage, timestamp);
            }
            
            const outlineItems = this.convertFunctionsToOutlineItems(functions);
            this.outputChannel.appendLine(`[${timestamp}] 🎯 生成的轮廓项数量: ${outlineItems.length}`);
            
            this.currentOutlineItems = outlineItems;
            
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
        
        // 使用解析器工厂创建相应的解析器
        const parser = this.parserFactory.createParser(language);
        if (parser) {
            if (language === 'csharp' && parser.extractCSharpHierarchy) {
                parser.extractCSharpHierarchy(rootNode, functions, language);
            } else if ((language === 'javascript' || language === 'typescript') && parser.extractJavaScriptHierarchy) {
                parser.extractJavaScriptHierarchy(rootNode, functions, language);
            } else if (language === 'python' && parser.extractPythonHierarchy) {
                parser.extractPythonHierarchy(rootNode, functions, language);
            }
        }

        return functions;
    }

    private convertFunctionsToOutlineItems(functions: FunctionInfo[]): OutlineItem[] {
        const oc = this.outputChannel;

        // 1) 预清洗 & 去重（按 name+type+startLine+endLine）
        const uniqMap = new Map<string, FunctionInfo>();
        for (const f of functions) {
            const key = `${f.name}|${f.type}|${f.startLine}|${f.endLine}`;
            if (!uniqMap.has(key)) uniqMap.set(key, f);
        }
        const items = Array.from(uniqMap.values());

        // 2) 只允许这些类型成为“容器”节点（可拥有子节点）
        const CONTAINER = new Set(['namespace', 'class', 'method']); 
        // ↑ 如果你只想让 “namespace / class” 才能容纳子级，把 'method' 去掉；
        //   如果你要支持“方法内本地函数”，就保留 'method'

        // 3) 排序：按起始行升序，结束行降序（大区间在前，可作为父）
        items.sort((a, b) => {
            if (a.startLine !== b.startLine) return a.startLine - b.startLine;
            return b.endLine - a.endLine;
        });

        // 4) 构建 OutlineItem 节点缓存
        const nodeMap = new Map<FunctionInfo, OutlineItem>();
        const makeNode = (f: FunctionInfo) => {
            const det = {
                name: f.name,
                type: f.type,
                startLine: f.startLine,
                endLine: f.endLine,
                parameters: f.parameters,
                returnType: f.returnType,
                visibility: f.visibility,
                isStatic: f.isStatic,
                comment: f.comment,
                className: f.className,
                namespaceName: f.namespaceName
            };
            const item = new OutlineItem(
                f.type === 'class' || f.type === 'namespace' ? f.name : (f.name.split('.').pop() || f.name),
                f.comment || this.getDefaultDescription(f.type),
                vscode.TreeItemCollapsibleState.None,
                f.startLine,
                f.endLine,
                f.name,
                det
            );
            item.iconPath = this.getIconForType(f.type);
            return item;
        };

        // 5) 栈式扫描：最近合法父节点挂载策略（只挂一次）
        const stack: FunctionInfo[] = [];
        const roots: OutlineItem[] = [];

        const contains = (parent: FunctionInfo, child: FunctionInfo) =>
            parent.startLine <= child.startLine && parent.endLine >= child.endLine;

        const canContain = (parent: FunctionInfo, child: FunctionInfo) => {
            // 类型约束，禁止“函数成为命名空间的父”等奇怪结构
            if (!CONTAINER.has(parent.type)) return false;

            // C# 常识：namespace 可含 namespace/class；class 可含 class/method/event/constructor 等；
            // method 可含 function（本地函数）
            if (parent.type === 'namespace') {
                return child.type === 'namespace' || child.type === 'class' || child.type === 'method' || child.type === 'event' || child.type === 'constructor';
            }
            if (parent.type === 'class') {
                return child.type === 'class' || child.type === 'method' || child.type === 'constructor' || child.type === 'event' || child.type === 'function';
            }
            if (parent.type === 'method') {
                return child.type === 'function'; // 本地函数
            }
            return false;
        };

        for (const f of items) {
            // 收缩栈至能包含当前节点的最近祖先
            while (stack.length && !contains(stack[stack.length - 1], f)) {
                stack.pop();
            }

            const node = makeNode(f);
            nodeMap.set(f, node);

            const parent = stack[stack.length - 1];
            if (parent && canContain(parent, f)) {
                nodeMap.get(parent)!.addChild(node);
            } else {
                // 没有合法父节点 => 顶级
                roots.push(node);
            }

            // 只有容器才入栈
            if (CONTAINER.has(f.type)) {
                stack.push(f);
            }
        }

        // 6) 展开有子节点的容器
        const expandIfHasChildren = (n: OutlineItem) => {
            if (n.children && n.children.length) n.setExpanded();
            n.children.forEach(expandIfHasChildren);
        };
        roots.forEach(expandIfHasChildren);

        oc.appendLine(`✅ 构建完成：roots=${roots.length}, total=${items.length}`);
        return roots;
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

        const eventNodes = rootNode.children.filter((node: any) => node.type === 'event_declaration');
        if (eventNodes.length === 0) {
            this.outputChannel.appendLine(`[${timestamp}] ⚠️ 未找到任何事件声明`);
        } else {
            this.outputChannel.appendLine(`[${timestamp}] ✅ 找到 ${eventNodes.length} 个事件声明`);
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

    private setupCursorChangeListener(): void {
        let currentDocumentUri: string | undefined;
        let isUserClicking = false; // 标记是否是用户点击操作
        let lastClickTime = 0;
        const CLICK_THRESHOLD = 500; // 500ms内的光标变化认为是点击操作
        
        this.cursorChangeListener = vscode.workspace.onDidChangeTextDocument(event => {
            const editor = vscode.window.activeTextEditor;
            if (editor && event.document === editor.document) {
                // 过滤掉输出窗口和其他特殊文档
                const documentUri = event.document.uri.toString();
                if (this.isSpecialDocument(documentUri)) {
                    return; // 跳过特殊文档
                }
                
                if (event.contentChanges && event.contentChanges.length > 0) {
                    // 检查是否需要刷新大纲
                    if (this.shouldRefreshOutline(documentUri, true)) {
                        const timestamp = new Date().toLocaleTimeString();
                        this.outputChannel.appendLine(`[${timestamp}] 📝 文档内容变化，刷新函数大纲`);
                        this.refresh();
                    }
                }
            }
        });

        let lastHighlightedLine = -1;
        let lastLogTime = 0;
        const LOG_INTERVAL = 3000; // 增加到3秒，进一步减少日志频率
        
        vscode.window.onDidChangeTextEditorSelection(event => {
            // 检查当前编辑器是否是代码文档
            const currentEditor = vscode.window.activeTextEditor;
            if (!currentEditor || event.textEditor !== currentEditor) {
                return; // 不是当前活动编辑器，跳过
            }
            
            // 检查当前文档是否是代码文档
            const documentUri = currentEditor.document.uri.toString();
            if (this.isSpecialDocument(documentUri)) {
                return; // 是特殊文档（如输出窗口），跳过
            }
            
            const lineNumber = event.selections[0].active.line + 1;
            const currentTime = Date.now();
            
            // 检查是否是用户点击操作
            if (currentTime - lastClickTime < CLICK_THRESHOLD) {
                isUserClicking = true;
                // 延迟重置标记，避免影响正常的光标移动
                setTimeout(() => {
                    isUserClicking = false;
                }, CLICK_THRESHOLD);
            }
            
            // 只有当行号真正改变时才处理高亮
            if (lineNumber !== lastHighlightedLine) {
                // 只有在非用户点击状态下才记录日志，并且减少日志频率
                if (currentTime - lastLogTime > LOG_INTERVAL && !isUserClicking) {
                    const timestamp = new Date().toLocaleTimeString();
                    this.outputChannel.appendLine(`[${timestamp}] 🖱️ 光标位置变化: ${lastHighlightedLine} -> ${lineNumber}`);
                    lastLogTime = currentTime;
                }
                
                lastHighlightedLine = lineNumber;
                
                // 检查当前行是否在已加载的函数范围内
                if (this.isOutlineLoaded() && this.isLineInLoadedFunctions(lineNumber)) {
                    // 如果是用户点击操作，延迟处理高亮，避免与大纲刷新冲突
                    if (isUserClicking) {
                        setTimeout(() => {
                            this.highlightFunctionAtLine(lineNumber);
                        }, 200); // 增加延迟时间
                    } else {
                        setTimeout(() => {
                            this.highlightFunctionAtLine(lineNumber);
                        }, 100);
                    }
                } else {
                    // 如果当前行不在已加载的函数范围内，不进行高亮操作
                    // 这样可以避免触发不必要的文档解析
                    if (currentTime - lastLogTime > LOG_INTERVAL) {
                        const timestamp = new Date().toLocaleTimeString();
                        this.outputChannel.appendLine(`[${timestamp}] ℹ️ 第${lineNumber}行不在已加载函数范围内，跳过高亮`);
                        lastLogTime = currentTime;
                    }
                }
            }
        });

        vscode.window.onDidChangeActiveTextEditor(editor => {
            if (editor) {
                const newDocumentUri = editor.document.uri.toString();
                
                // 过滤掉特殊文档
                if (this.isSpecialDocument(newDocumentUri)) {
                    return; // 跳过特殊文档
                }
                
                if (newDocumentUri !== currentDocumentUri) {
                    const timestamp = new Date().toLocaleTimeString();
                    this.outputChannel.appendLine(`[${timestamp}] 🔄 切换文档: ${newDocumentUri}`);
                    
                    lastHighlightedLine = -1;
                    lastLogTime = 0;
                    isUserClicking = false; // 重置点击标记
                    
                    this.clearAllHighlights();
                    
                    currentDocumentUri = newDocumentUri;
                    this.currentDocumentUri = newDocumentUri; // 更新当前文档URI
                    
                    this.refresh();
                } else {
                    // 同一文档内操作，只清除高亮，不刷新大纲
                    this.clearAllHighlights();
                }
            }
        });
    }

    private disposeCursorChangeListener(): void {
        if (this.cursorChangeListener) {
            this.cursorChangeListener.dispose();
            this.cursorChangeListener = null;
        }
    }

    public findFunctionByLine(lineNumber: number): FunctionInfo | null {
        if (!this.currentFunctions || this.currentFunctions.length === 0) {
            return null;
        }

        for (const func of this.currentFunctions) {
            if (lineNumber >= func.startLine && lineNumber <= func.endLine) {
                return func;
            }
        }

        return null;
    }

    public findOutlineItemByLine(lineNumber: number): OutlineItem | null {
        if (!this.currentOutlineItems || this.currentOutlineItems.length === 0) {
            return null;
        }

        const result = this.findOutlineItemRecursive(this.currentOutlineItems, lineNumber);
        return result;
    }

    private findOutlineItemRecursive(items: OutlineItem[], lineNumber: number): OutlineItem | null {
        for (const item of items) {
            if (lineNumber >= item.startLine && lineNumber <= item.endLine) {
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

    public highlightFunctionAtLine(lineNumber: number): void {
        // 检查当前编辑器是否是代码文档
        const currentEditor = vscode.window.activeTextEditor;
        if (!currentEditor) {
            return; // 没有活动编辑器，跳过
        }
        
        // 检查当前文档是否是代码文档
        const documentUri = currentEditor.document.uri.toString();
        if (this.isSpecialDocument(documentUri)) {
            return; // 是特殊文档（如输出窗口），跳过
        }
        
        // 检查是否有加载的函数大纲
        if (!this.isOutlineLoaded()) {
            return; // 没有加载函数大纲，跳过
        }
        
        // 清除之前的高亮
        this.clearAllHighlights();
        
        // 查找对应的OutlineItem
        const outlineItem = this.findOutlineItemByLine(lineNumber);
        
        if (outlineItem) {
            // 设置高亮
            outlineItem.setHighlighted(true);
            
            // 确保包含该函数的父节点是展开状态
            this.ensureParentExpanded(outlineItem);
            
            // 强制刷新高亮状态，但不重新解析文档
            this.forceRefreshHighlight();
            
            const timestamp = new Date().toLocaleTimeString();
            this.outputChannel.appendLine(`[${timestamp}] 🎯 高亮函数: ${outlineItem.label} (第${lineNumber}行)`);
        } else {
            // 只在代码文档中记录未找到函数的警告，避免在输出窗口等地方产生大量日志
            const timestamp = new Date().toLocaleTimeString();
            this.outputChannel.appendLine(`[${timestamp}] ⚠️ 第${lineNumber}行未找到对应的函数`);
        }
    }

    private refreshTimeout: NodeJS.Timeout | undefined;
    private debouncedRefresh(): void {
        const config = getConfig();
        if (this.refreshTimeout) {
            clearTimeout(this.refreshTimeout);
        }
        this.refreshTimeout = setTimeout(() => {
            this.refresh();
        }, config.cursorChangeRefreshDelay);
    }

    public onFunctionItemClick(startLine: number): void {
        // 使用新的用户点击处理方法
        this.handleUserClick(startLine);
    }

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

    private ensureParentExpanded(item: OutlineItem): void {
        if (this.currentOutlineItems) {
            this.ensureParentExpandedRecursive(this.currentOutlineItems, item);
        }
    }

    private ensureParentExpandedRecursive(items: OutlineItem[], targetItem: OutlineItem): boolean {
        for (const item of items) {
            if (item.children && item.children.includes(targetItem)) {
                item.setExpanded();
                return true;
            }
            if (item.children && item.children.length > 0) {
                if (this.ensureParentExpandedRecursive(item.children, targetItem)) {
                    item.setExpanded();
                    return true;
                }
            }
        }
        return false;
    }

    public getCurrentFunctions(): FunctionInfo[] {
        return this.currentFunctions;
    }

    public getCurrentOutlineItems(): OutlineItem[] {
        return this.currentOutlineItems;
    }

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

    public dispose(): void {
        if (this.refreshTimeout) {
            clearTimeout(this.refreshTimeout);
            this.refreshTimeout = undefined;
        }
        this.disposeCursorChangeListener();
    }

    public forceRefreshHighlight(): void {
        if (this.currentOutlineItems) {
            // 使用专门的高亮事件，避免触发整个树的重新加载
            // 这样可以只更新高亮状态，而不重新解析文档
            this._onDidChangeHighlight.fire(undefined);
        }
    }

    /**
     * 检查指定行是否在已加载的函数范围内
     */
    private isLineInLoadedFunctions(lineNumber: number): boolean {
        if (!this.currentFunctions || this.currentFunctions.length === 0) {
            return false;
        }
        
        return this.currentFunctions.some(func => 
            lineNumber >= func.startLine && lineNumber <= func.endLine
        );
    }

    /**
     * 检查一个嵌套类是否是另一个类的子类（递归查找）
     */
    private isNestedClassChild(childClassName: string, parentClassName: string, allNestedItems: FunctionInfo[]): boolean {
        // 直接检查
        if (childClassName === parentClassName) {
            return true;
        }
        
        // 递归查找父类
        const parentItem = allNestedItems.find(item => item.name === childClassName);
        if (parentItem && parentItem.className) {
            return this.isNestedClassChild(parentItem.className, parentClassName, allNestedItems);
        }
        
        return false;
    }

    /**
     * 处理用户点击函数大纲项的操作
     * 这个方法专门用于处理用户点击，避免与文档内容变化冲突
     */
    public handleUserClick(startLine: number): void {
        this.outputChannel.appendLine(`🎯 用户点击函数大纲项，行号: ${startLine}`);
        
        // 延迟处理，确保光标跳转完成
        setTimeout(() => {
            // 检查当前光标位置
            const editor = vscode.window.activeTextEditor;
            if (editor) {
                const currentLine = editor.selection.active.line + 1;
                if (currentLine === startLine) {
                    // 光标位置匹配，执行高亮
                    this.highlightFunctionAtLine(startLine);
                } else {
                    // 光标位置不匹配，记录警告并尝试高亮
                    this.outputChannel.appendLine(`⚠️ 光标跳转可能失败，当前行: ${currentLine}, 目标行: ${startLine}`);
                    this.highlightFunctionAtLine(startLine);
                }
            } else {
                // 没有活动编辑器，直接高亮
                this.highlightFunctionAtLine(startLine);
            }
        }, 200); // 使用较长的延迟时间
    }

    /**
     * 检查是否需要刷新大纲
     * 只有在真正需要时才刷新，避免不必要的重新加载
     */
    private shouldRefreshOutline(documentUri: string, contentChanged: boolean): boolean {
        // 如果文档URI改变，需要刷新
        if (this.currentDocumentUri !== documentUri) {
            return true;
        }
        
        // 如果内容没有变化，不需要刷新
        if (!contentChanged) {
            return false;
        }
        
        // 如果当前没有加载大纲，需要刷新
        if (!this.isOutlineLoaded()) {
            return true;
        }
        
        // 其他情况，根据配置决定是否刷新
        const config = getConfig();
        return config.autoRefreshOnContentChange !== false;
    }

    // 添加当前文档URI的跟踪
    private currentDocumentUri: string | undefined;

    private isSpecialDocument(uri: string): boolean {
        // 过滤掉输出窗口和其他特殊文档
        const specialPatterns = [
            'extension-output',      // 扩展输出窗口
            'output',                // 输出面板
            'debug-console',         // 调试控制台
            'terminal',              // 终端
            'git:',                  // Git相关
            'vscode:',               // VSCode内部
            'untitled:',             // 未保存的文档
            'data:',                 // 数据URI
            'webview-panel'          // WebView面板
        ];
        
        // 检查是否包含特殊模式
        for (const pattern of specialPatterns) {
            if (uri.includes(pattern)) {
                return true;
            }
        }
        
        // 检查是否是有效的文件路径
        if (uri.startsWith('file:')) {
            try {
                const fileUri = vscode.Uri.parse(uri);
                const filePath = fileUri.fsPath;
                
                // 如果文件路径有效且是真实的文件系统路径，认为是正常文档
                if (filePath && filePath.length > 0) {
                    // 检查是否是常见的代码文件扩展名
                    const validExtensions = ['.cs', '.js', '.ts', '.py', '.cpp', '.c', '.h', '.java', '.php', '.rb', '.go', '.rs', '.swift', '.kt', '.scala'];
                    const hasValidExtension = validExtensions.some(ext => filePath.toLowerCase().endsWith(ext));
                    
                    if (hasValidExtension) {
                        return false; // 这是正常的代码文件
                    }
                    
                    // 如果没有有效扩展名，检查路径是否包含常见的代码目录
                    const codeDirectories = ['src', 'test', 'lib', 'include', 'source', 'app', 'main'];
                    const hasCodeDirectory = codeDirectories.some(dir => filePath.toLowerCase().includes(dir));
                    
                    if (hasCodeDirectory) {
                        return false; // 这可能是代码文件
                    }
                }
                
                // 其他情况，认为是特殊文档
                return true;
            } catch (error) {
                // 解析失败，认为是特殊文档
                return true;
            }
        }
        
        return false;
    }
}