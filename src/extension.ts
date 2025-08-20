import * as vscode from 'vscode';
import { TreeSitterOutlineProvider } from './treeSitterOutlineProvider';
import { OutlineItem } from './outlineItem';

/**
 * 入口
 */
/**
 * 入口
 */
export function activate(context: vscode.ExtensionContext) {
    const outputChannel = vscode.window.createOutputChannel('Tree-Sitter Outline');
    context.subscriptions.push(outputChannel);

    // 创建 Provider 与 TreeView，并绑定
    const outlineProvider = new TreeSitterOutlineProvider(context.extensionUri, outputChannel);
    const treeView = vscode.window.createTreeView('tree-sitter-outline', {
        treeDataProvider: outlineProvider,
        showCollapseAll: true,
    });
    outlineProvider.bindTreeView(treeView);

    context.subscriptions.push(treeView);

    // ✅ 统一命令ID：tree-sitter-outline.refresh
    context.subscriptions.push(
        vscode.commands.registerCommand('tree-sitter-outline.refresh', () => {
            outlineProvider.refresh();
        })
    );

    // ✅ 统一命令ID：tree-sitter-outline.jumpToFunction
    // 期望参数：(startLine: number, functionName?: string)
    context.subscriptions.push(
        vscode.commands.registerCommand('tree-sitter-outline.jumpToFunction', async (startLine?: number, functionName?: string) => {
            try {
                const editor = vscode.window.activeTextEditor;
                if (!editor || startLine == null) return;

                const document = editor.document;

                // 从大纲中找到对应的 OutlineItem，以便获取准确的 endLine
                const items = outlineProvider.getCurrentOutlineItems();
                const flat = flattenOutline(items);
                const matched = flat.find(n =>
                    n.startLine === startLine && (!functionName || n.functionName === functionName)
                );

                // 没命中就给一个合理的搜索范围兜底
                let endLine = matched ? matched.endLine : Math.min(document.lineCount, startLine + 30);

                const pos = findFunctionNamePosition(document, startLine, endLine, functionName);
                const finalPos = pos ?? new vscode.Position(
                    startLine - 1,
                    document.lineAt(startLine - 1).firstNonWhitespaceCharacterIndex ?? 0
                );

                // 精准把光标移动到函数名（或行首非空白）
                const sel = new vscode.Selection(finalPos, finalPos);
                editor.selections = [sel];
                editor.revealRange(new vscode.Range(finalPos, finalPos), vscode.TextEditorRevealType.InCenter);

                // 通知 provider 高亮并同步 TreeView 选中
                await outlineProvider.highlightFunctionAtLine(startLine);
            } catch (e) {
                console.error(e);
            }
        })
    );

    // ✅ 新增：调试命令 - 检查TreeView状态
    context.subscriptions.push(
        vscode.commands.registerCommand('tree-sitter-outline.debugTreeView', async () => {
            try {
                const status = outlineProvider.getOutlineStatus();
                const timestamp = new Date().toLocaleTimeString();
                
                outputChannel.appendLine(`[${timestamp}] 🔍 === TreeView 调试信息 ===`);
                outputChannel.appendLine(`[${timestamp}] 📊 基本状态:`);
                outputChannel.appendLine(`[${timestamp}]   - 已初始化: ${status.isInitialized ? '✅' : '❌'}`);
                outputChannel.appendLine(`[${timestamp}]   - 函数数量: ${status.functionCount}`);
                outputChannel.appendLine(`[${timestamp}]   - 大纲项数量: ${status.outlineItemCount}`);
                outputChannel.appendLine(`[${timestamp}]   - 当前语言: ${status.currentLanguage}`);
                outputChannel.appendLine(`[${timestamp}]   - 解析器状态: ${status.parserStatus}`);
                
                // 检查TreeView绑定状态
                const treeViewStatus = outlineProvider.getTreeViewStatus();
                outputChannel.appendLine(`[${timestamp}] 🎯 TreeView状态:`);
                outputChannel.appendLine(`[${timestamp}]   - TreeView已绑定: ${treeViewStatus.isBound ? '✅' : '❌'}`);
                outputChannel.appendLine(`[${timestamp}]   - 抑制标志: ${treeViewStatus.suppressSelectionSync ? '🔒' : '🔓'}`);
                outputChannel.appendLine(`[${timestamp}]   - 当前选中项: ${treeViewStatus.currentSelection || '无'}`);
                
                // 测试 getParent 方法
                const currentItems = outlineProvider.getCurrentOutlineItems();
                if (currentItems.length > 0) {
                    outputChannel.appendLine(`[${timestamp}] 🧪 测试 getParent 方法:`);
                    const firstItem = currentItems[0];
                    outputChannel.appendLine(`[${timestamp}]   - 测试项: ${firstItem.label}`);
                    
                    try {
                        const parent = await outlineProvider.getParent(firstItem);
                        if (parent) {
                            outputChannel.appendLine(`[${timestamp}]   - getParent 结果: ${parent.label} ✅`);
                        } else {
                            outputChannel.appendLine(`[${timestamp}]   - getParent 结果: undefined (正常，顶级项) ✅`);
                        }
                    } catch (error) {
                        outputChannel.appendLine(`[${timestamp}]   - getParent 执行失败: ${error} ❌`);
                    }
                }
                
                // 检查当前文档信息
                const editor = vscode.window.activeTextEditor;
                if (editor) {
                    outputChannel.appendLine(`[${timestamp}] 📄 当前文档:`);
                    outputChannel.appendLine(`[${timestamp}]   - 文件名: ${editor.document.fileName}`);
                    outputChannel.appendLine(`[${timestamp}]   - 语言: ${editor.document.languageId}`);
                    outputChannel.appendLine(`[${timestamp}]   - 行数: ${editor.document.lineCount}`);
                    outputChannel.appendLine(`[${timestamp}]   - 光标位置: ${editor.selection.active.line + 1}:${editor.selection.active.character + 1}`);
                }
                
                outputChannel.appendLine(`[${timestamp}] 🔍 === 调试信息结束 ===`);
                
                // 显示通知
                vscode.window.showInformationMessage(`TreeView调试信息已输出到输出面板`);
            } catch (e) {
                outputChannel.appendLine(`[${new Date().toLocaleTimeString()}] ❌ 调试命令执行失败: ${e}`);
                console.error(e);
            }
        })
    );

    // ✅ 新增：强制刷新TreeView选中状态命令
    context.subscriptions.push(
        vscode.commands.registerCommand('tree-sitter-outline.forceRefreshSelection', async () => {
            try {
                outputChannel.appendLine(`[${new Date().toLocaleTimeString()}] 🔄 开始强制刷新TreeView选中状态...`);
                await outlineProvider.forceRefreshTreeViewSelection();
                outputChannel.appendLine(`[${new Date().toLocaleTimeString()}] ✅ 强制刷新TreeView选中状态完成`);
                vscode.window.showInformationMessage(`TreeView选中状态已强制刷新`);
            } catch (e) {
                outputChannel.appendLine(`[${new Date().toLocaleTimeString()}] ❌ 强制刷新TreeView选中状态失败: ${e}`);
                console.error(e);
            }
        })
    );
}

/* ----------------------------- 工具函数 ----------------------------- */

function flattenOutline(items: OutlineItem[]): OutlineItem[] {
    const out: OutlineItem[] = [];
    const walk = (arr: OutlineItem[]) => {
        for (const it of arr) {
            out.push(it);
            if (it.children && it.children.length) {
                walk(it.children);
            }
        }
    };
    walk(items);
    return out;
}

function findFunctionNamePosition(
    document: vscode.TextDocument,
    startLine: number,
    endLine: number,
    functionName?: string
): vscode.Position | null {
    try {
        const minLine = Math.max(1, Math.min(startLine, endLine));
        const maxLine = Math.min(document.lineCount, Math.max(startLine, endLine));

        const escapeReg = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

        const patterns = (name: string) => [
            // JS/TS
            new RegExp(`\\bfunction\\s+${escapeReg(name)}\\b`),
            new RegExp(`\\b${escapeReg(name)}\\s*=\\s*\\(?[^=]*\\)?\\s*=>`),
            new RegExp(`\\b(get|set)\\s+${escapeReg(name)}\\b`),
            new RegExp(`\\b${escapeReg(name)}\\s*\\(`),
            // C#
            new RegExp(`\\b${escapeReg(name)}\\s*\\(`),
            // Python
            new RegExp(`\\bdef\\s+${escapeReg(name)}\\b`),
        ];

        // 有名字：优先精准匹配
        if (functionName && functionName.trim()) {
            const regs = patterns(functionName);
            for (let ln = minLine - 1; ln <= maxLine - 1; ln++) {
                const text = document.lineAt(ln).text;

                const idx = text.indexOf(functionName);
                if (idx >= 0) return new vscode.Position(ln, idx);

                for (const re of regs) {
                    const m = text.match(re);
                    if (m && m.index !== undefined) return new vscode.Position(ln, m.index);
                }
            }
        } else {
            // 匿名 / constructor 等：典型关键字探测
            const generic = [
                /\bfunction\b/,              // JS
                /\bconstructor\b/,           // C#/TS
                /\bdef\b/,                   // Python
                /\b(public|private|protected|internal|static|async)\b/, // 修饰符
            ];
            for (let ln = minLine - 1; ln <= maxLine - 1; ln++) {
                const text = document.lineAt(ln).text;
                for (const re of generic) {
                    const m = text.match(re);
                    if (m && m.index !== undefined) return new vscode.Position(ln, m.index);
                }
            }
        }

        return null;
    } catch {
        return null;
    }
}

/**
 * 反注册
 */
export function deactivate() {
    // no-op
}

