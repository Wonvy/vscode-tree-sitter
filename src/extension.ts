import * as vscode from 'vscode';
import { TreeSitterOutlineProvider } from './treeSitterOutlineProvider';

export function activate(context: vscode.ExtensionContext) {
    console.log('🚀 Tree-sitter Outline 扩展已激活');

    try {
        // 创建大纲提供者
        const outlineProvider = new TreeSitterOutlineProvider(context.extensionUri);
        
        // 注册大纲视图
        const outlineView = vscode.window.registerTreeDataProvider('tree-sitter-outline', outlineProvider);
        
        // 注册刷新命令
        const refreshCommand = vscode.commands.registerCommand('tree-sitter-outline.refresh', () => {
            console.log('🔄 手动刷新函数大纲');
            outlineProvider.refresh();
        });

        // 监听文档变化
        const changeDocumentListener = vscode.workspace.onDidChangeTextDocument((event) => {
            if (event.document === vscode.window.activeTextEditor?.document) {
                console.log('📝 文档内容变化，自动刷新函数大纲');
                outlineProvider.refresh();
            }
        });

        // 监听活动编辑器变化
        const changeActiveEditorListener = vscode.window.onDidChangeActiveTextEditor((editor) => {
            if (editor) {
                console.log('🔍 活动编辑器变化，刷新函数大纲');
                outlineProvider.refresh();
            }
        });

        // 监听语言变化
        const changeLanguageListener = vscode.workspace.onDidChangeTextDocument((event) => {
            const editor = vscode.window.activeTextEditor;
            if (editor && event.document === editor.document) {
                const language = event.document.languageId;
                if (['python', 'javascript', 'typescript', 'csharp'].includes(language)) {
                    console.log(`🌐 语言变化为 ${language}，刷新函数大纲`);
                    outlineProvider.refresh();
                }
            }
        });

        context.subscriptions.push(
            outlineView,
            refreshCommand,
            changeDocumentListener,
            changeActiveEditorListener,
            changeLanguageListener
        );

        console.log('✅ Tree-sitter Outline 扩展初始化完成');
    } catch (error) {
        console.error('❌ Tree-sitter Outline 扩展初始化失败:', error);
        vscode.window.showErrorMessage('Tree-sitter Outline 扩展初始化失败，请查看控制台获取详细信息');
    }
}

export function deactivate() {
    console.log('🛑 Tree-sitter Outline 扩展已停用');
} 