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
        const jumpToFunctionCommand = vscode.commands.registerCommand('tree-sitter-outline.jumpToFunction', (startLine: number | string, functionName?: string) => {
            // 处理不同的参数格式
            let targetLine: number;
            
            if (typeof startLine === 'string') {
                // 如果是字符串，尝试解析行号
                if (startLine.startsWith('/')) {
                    // 处理 /888 格式
                    targetLine = parseInt(startLine.substring(1));
                } else {
                    // 尝试直接解析数字
                    targetLine = parseInt(startLine);
                }
                
                if (isNaN(targetLine)) {
                    outputChannel.appendLine(`❌ 无法解析行号: ${startLine}`);
                    vscode.window.showErrorMessage(`无法解析行号: ${startLine}`);
                    return;
                }
            } else {
                targetLine = startLine;
            }
            
            outputChannel.appendLine(`🎯 执行跳转命令，目标行号: ${targetLine}, 函数名: ${functionName || '未指定'}`);
            try {
                const editor = vscode.window.activeTextEditor;
                if (editor) {
                    let targetPosition: vscode.Position;
                    
                    if (functionName) {
                        // 精确定位到函数名称前
                        outputChannel.appendLine(`🔍 精确定位到函数名称: ${functionName}`);
                        const foundPosition = findFunctionNamePosition(editor.document, targetLine, functionName);
                        
                        if (foundPosition) {
                            outputChannel.appendLine(`✅ 找到函数名称位置: 行 ${foundPosition.line + 1}, 列 ${foundPosition.character}`);
                            targetPosition = foundPosition;
                        } else {
                            outputChannel.appendLine(`⚠️ 未找到函数名称，使用行首位置`);
                            targetPosition = new vscode.Position(targetLine - 1, 0);
                        }
                    } else {
                        // 如果没有函数名，使用原来的逻辑
                        outputChannel.appendLine(`⚠️ 未提供函数名，使用行首位置`);
                        targetPosition = new vscode.Position(targetLine - 1, 0);
                    }
                    
                    // 设置光标位置
                    editor.selection = new vscode.Selection(targetPosition, targetPosition);
                    editor.revealRange(new vscode.Range(targetPosition, targetPosition), vscode.TextEditorRevealType.InCenter);
                    
                    // 添加视觉反馈：闪烁光标
                    setTimeout(() => {
                        // 触发高亮
                        outlineProvider.onFunctionItemClick(targetLine);
                        
                        // 显示成功消息
                        vscode.window.showInformationMessage(`已跳转到第 ${targetLine} 行`);
                        
                        outputChannel.appendLine('✅ 跳转命令执行成功');
                    }, 100); // 延迟100ms确保光标位置稳定
                    
                } else {
                    outputChannel.appendLine('❌ 没有活动编辑器');
                    vscode.window.showWarningMessage('没有活动编辑器，无法执行跳转');
                }
            } catch (error) {
                outputChannel.appendLine(`❌ 跳转命令执行失败: ${error}`);
                vscode.window.showErrorMessage(`跳转命令执行失败: ${error}`);
            }
        });

        // 添加命令注册成功的日志
        outputChannel.appendLine('✅ 跳转命令注册成功: tree-sitter-outline.jumpToFunction');
        
        // 验证命令是否真的被注册
        vscode.commands.getCommands(true).then(commands => {
            if (commands.includes('tree-sitter-outline.jumpToFunction')) {
                outputChannel.appendLine('✅ 命令验证成功: tree-sitter-outline.jumpToFunction 已注册');
            } else {
                outputChannel.appendLine('❌ 命令验证失败: tree-sitter-outline.jumpToFunction 未找到');
            }
        });

        // 新增：查找函数名称在行中的位置
        function findFunctionNamePosition(document: vscode.TextDocument, lineNumber: number, functionName: string): vscode.Position | null {
            try {
                const line = document.lineAt(lineNumber - 1); // 转换为0-based行号
                const lineText = line.text;
                
                outputChannel.appendLine(`🔍 查找函数名 "${functionName}" 在行 "${lineText}" 中的位置`);
                
                // 查找函数名在行中的位置
                const functionNameIndex = lineText.indexOf(functionName);
                
                if (functionNameIndex !== -1) {
                    // 找到函数名，返回函数名前的字符位置（如果可能的话）
                    const position = new vscode.Position(lineNumber - 1, Math.max(0, functionNameIndex));
                    outputChannel.appendLine(`✅ 函数名位置: 列 ${functionNameIndex}`);
                    return position;
                } else {
                    // 没有找到函数名，尝试模糊匹配
                    outputChannel.appendLine(`⚠️ 精确匹配失败，尝试模糊匹配`);
                    
                    // 查找包含函数名的部分（处理可能的空格、括号等）
                    const words = lineText.split(/\s+/);
                    for (let i = 0; i < words.length; i++) {
                        const word = words[i].replace(/[(){}[\]]/g, ''); // 移除括号等字符
                        if (word === functionName || word.includes(functionName)) {
                            // 找到包含函数名的词，计算其在行中的位置
                            const beforeWords = words.slice(0, i).join(' ');
                            const position = new vscode.Position(lineNumber - 1, beforeWords.length + (i > 0 ? 1 : 0)); // +1 for space
                            outputChannel.appendLine(`✅ 模糊匹配成功，位置: 列 ${position.character}`);
                            return position;
                        }
                    }
                    
                    // 如果还是找不到，尝试查找行中第一个标识符
                    outputChannel.appendLine(`⚠️ 模糊匹配也失败，尝试查找第一个标识符`);
                    const identifierMatch = lineText.match(/\b[a-zA-Z_][a-zA-Z0-9_]*\b/);
                    if (identifierMatch) {
                        const position = new vscode.Position(lineNumber - 1, identifierMatch.index || 0);
                        outputChannel.appendLine(`✅ 找到第一个标识符: "${identifierMatch[0]}" 在列 ${position.character}`);
                        return position;
                    }
                    
                    outputChannel.appendLine(`❌ 所有匹配方法都失败`);
                    return null;
                }
            } catch (error) {
                outputChannel.appendLine(`❌ 查找函数名位置时出错: ${error}`);
                return null;
            }
        }

        // 注册状态检查命令
        const checkStatusCommand = vscode.commands.registerCommand('tree-sitter-outline.checkStatus', () => {
            outputChannel.appendLine('🔍 检查函数大纲状态...');
            try {
                const status = outlineProvider.getOutlineStatus();
                const isLoaded = outlineProvider.isOutlineLoaded();
                
                outputChannel.appendLine('📊 函数大纲状态详情:');
                outputChannel.appendLine(`  - 已初始化: ${status.isInitialized ? '✅' : '❌'}`);
                outputChannel.appendLine(`  - 有函数: ${status.hasFunctions ? '✅' : '❌'}`);
                outputChannel.appendLine(`  - 有大纲项: ${status.hasOutlineItems ? '✅' : '❌'}`);
                outputChannel.appendLine(`  - 函数数量: ${status.functionCount}`);
                outputChannel.appendLine(`  - 大纲项数量: ${status.outlineItemCount}`);
                outputChannel.appendLine(`  - 当前语言: ${status.currentLanguage}`);
                outputChannel.appendLine(`  - 解析器状态: ${status.parserStatus}`);
                outputChannel.appendLine(`  - 总体状态: ${isLoaded ? '✅ 已加载' : '❌ 未加载'}`);
                
                // 显示状态通知
                if (isLoaded) {
                    vscode.window.showInformationMessage(`函数大纲已加载，共 ${status.outlineItemCount} 个项目`);
                } else {
                    vscode.window.showWarningMessage('函数大纲未加载，请检查文档和语言支持');
                }
                
                outputChannel.appendLine('✅ 状态检查完成');
            } catch (error) {
                outputChannel.appendLine(`❌ 状态检查失败: ${error}`);
                vscode.window.showErrorMessage('状态检查失败，请查看控制台获取详细信息');
            }
        });

        // 注册测试高亮命令
        const testHighlightCommand = vscode.commands.registerCommand('tree-sitter-outline.testHighlight', () => {
            outputChannel.appendLine('🧪 开始测试高亮功能...');
            try {
                const editor = vscode.window.activeTextEditor;
                if (editor) {
                    const currentLine = editor.selection.active.line + 1;
                    outputChannel.appendLine(`🎯 测试高亮第 ${currentLine} 行...`);
                    
                    // 手动触发高亮
                    outlineProvider.highlightFunctionAtLine(currentLine);
                    
                    outputChannel.appendLine('✅ 高亮测试完成，请查看函数大纲面板');
                    vscode.window.showInformationMessage(`高亮测试完成，当前行: ${currentLine}`);
                } else {
                    outputChannel.appendLine('❌ 没有活动编辑器');
                    vscode.window.showWarningMessage('没有活动编辑器，无法测试高亮功能');
                }
            } catch (error) {
                outputChannel.appendLine(`❌ 高亮测试失败: ${error}`);
                vscode.window.showErrorMessage('高亮测试失败，请查看控制台获取详细信息');
            }
        });

        // 防抖机制 - 优化：增加延迟时间减少刷新频率
        let refreshTimeout: NodeJS.Timeout | undefined;
        let currentDocumentUri: string | undefined;
        
        const debouncedRefresh = () => {
            if (refreshTimeout) {
                clearTimeout(refreshTimeout);
            }
            refreshTimeout = setTimeout(() => {
                const timestamp = new Date().toLocaleTimeString();
                const stackTrace = new Error().stack;
                outputChannel.appendLine(`[${timestamp}] 🔄 debouncedRefresh() 被调用，调用栈:`);
                if (stackTrace) {
                    const lines = stackTrace.split('\n').slice(1, 6); // 只显示前5行调用栈
                    lines.forEach(line => {
                        outputChannel.appendLine(`[${timestamp}]   ${line.trim()}`);
                    });
                }
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
                    // 检查是否有实际的内容变化
                    if (event.contentChanges && event.contentChanges.length > 0) {
                        outputChannel.appendLine('📝 文档内容变化，准备刷新函数大纲');
                        debouncedRefresh();
                    }
                }
            }
        });

        // 监听活动编辑器变化（使用防抖）- 只在真正切换文档时刷新
        const changeActiveEditorListener = vscode.window.onDidChangeActiveTextEditor((editor) => {
            if (editor) {
                const language = editor.document.languageId;
                if (['python', 'javascript', 'typescript', 'csharp'].includes(language)) {
                    const newDocumentUri = editor.document.uri.toString();
                    
                    // 只有在真正切换文档时才刷新
                    if (newDocumentUri !== currentDocumentUri) {
                        outputChannel.appendLine('🔍 切换文档，准备刷新函数大纲');
                        currentDocumentUri = newDocumentUri;
                        debouncedRefresh();
                    } else {
                        outputChannel.appendLine('🖱️ 同一文档内操作，不刷新函数大纲');
                    }
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
            checkStatusCommand, // 添加状态检查命令
            testHighlightCommand, // 添加测试高亮命令
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