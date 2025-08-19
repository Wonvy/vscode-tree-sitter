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
                outlineProvider.highlightFunctionAtLine(startLine);
            } catch (e) {
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

