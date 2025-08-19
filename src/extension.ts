import * as vscode from 'vscode';
import { TreeSitterOutlineProvider } from './treeSitterOutlineProvider';

export function activate(context: vscode.ExtensionContext) {
    // 创建输出通道
    const outputChannel = vscode.window.createOutputChannel('Tree-sitter Outline');
    context.subscriptions.push(outputChannel);
    
    outputChannel.appendLine('🚀 Tree-sitter Outline 扩展已激活');

    try {
        // 创建大纲提供者
        const outlineProvider = new TreeSitterOutlineProvider(context.extensionUri, outputChannel);
        
        // 注册大纲视图
        const outlineView = vscode.window.registerTreeDataProvider('tree-sitter-outline', outlineProvider);
        
        // 注册刷新命令
        const refreshCommand = vscode.commands.registerCommand('tree-sitter-outline.refresh', () => {
            outputChannel.appendLine('🔄 手动刷新函数大纲');
            try {
                outlineProvider.refresh();
                outputChannel.appendLine('✅ 刷新命令执行成功');
            } catch (error) {
                outputChannel.appendLine(`❌ 刷新命令执行失败: ${error}`);
            }
        });

        // 注册跳转命令
        const jumpToFunctionCommand = vscode.commands.registerCommand('tree-sitter-outline.jumpToFunction', (startLine: number) => {
            outputChannel.appendLine(`🎯 执行跳转命令，目标行号: ${startLine}`);
            try {
                const editor = vscode.window.activeTextEditor;
                if (editor) {
                    // 跳转到指定行
                    const position = new vscode.Position(startLine - 1, 0);
                    editor.selection = new vscode.Selection(position, position);
                    editor.revealRange(new vscode.Range(position, position));
                    
                    // 触发高亮
                    outlineProvider.onFunctionItemClick(startLine);
                    
                    outputChannel.appendLine('✅ 跳转命令执行成功');
                } else {
                    outputChannel.appendLine('❌ 没有活动编辑器');
                }
            } catch (error) {
                outputChannel.appendLine(`❌ 跳转命令执行失败: ${error}`);
            }
        });

        // 防抖机制 - 优化：增加延迟时间减少刷新频率
        let refreshTimeout: NodeJS.Timeout | undefined;
        const debouncedRefresh = () => {
            if (refreshTimeout) {
                clearTimeout(refreshTimeout);
            }
            refreshTimeout = setTimeout(() => {
                outputChannel.appendLine('🔄 防抖刷新函数大纲');
                outlineProvider.refresh();
            }, 1000); // 增加到1000ms延迟，减少刷新频率
        };

        // 监听文档变化（使用防抖）
        const changeDocumentListener = vscode.workspace.onDidChangeTextDocument((event) => {
            if (event.document === vscode.window.activeTextEditor?.document) {
                // 只有在支持的语言时才刷新
                const language = event.document.languageId;
                if (['python', 'javascript', 'typescript', 'csharp'].includes(language)) {
                    outputChannel.appendLine('📝 文档内容变化，准备刷新函数大纲');
                    debouncedRefresh();
                }
            }
        });

        // 监听活动编辑器变化（使用防抖）
        const changeActiveEditorListener = vscode.window.onDidChangeActiveTextEditor((editor) => {
            if (editor) {
                const language = editor.document.languageId;
                if (['python', 'javascript', 'typescript', 'csharp'].includes(language)) {
                    outputChannel.appendLine('🔍 活动编辑器变化，准备刷新函数大纲');
                    debouncedRefresh();
                }
            }
        });

        // 监听语言变化（移除，因为已经在上面处理了）
        // const changeLanguageListener = vscode.workspace.onDidChangeTextDocument((event) => {
        //     const editor = vscode.window.activeTextEditor;
        //     if (editor && event.document === editor.document) {
        //         const language = event.document.languageId;
        //         if (['python', 'javascript', 'typescript', 'csharp'].includes(language)) {
        //             outputChannel.appendLine(`🌐 语言变化为 ${language}，刷新函数大纲`);
        //             outlineProvider.refresh();
        //         }
        //     }
        // });

        context.subscriptions.push(
            outlineView,
            refreshCommand,
            jumpToFunctionCommand, // 添加跳转命令
            changeDocumentListener,
            changeActiveEditorListener,
            // 添加清理资源的订阅
            { dispose: () => outlineProvider.dispose() }
            // changeLanguageListener 已移除
        );

        outputChannel.appendLine('✅ Tree-sitter Outline 扩展初始化完成');
    } catch (error) {
        outputChannel.appendLine(`❌ Tree-sitter Outline 扩展初始化失败: ${error}`);
        vscode.window.showErrorMessage('Tree-sitter Outline 扩展初始化失败，请查看控制台获取详细信息');
    }
}

export function deactivate() {
    // 注意：deactivate 函数中无法访问 outputChannel，所以使用 console.log
    console.log('🛑 Tree-sitter Outline 扩展已停用');
} 