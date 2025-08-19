import * as vscode from 'vscode';

export class OutlineItem extends vscode.TreeItem {
    public readonly children: OutlineItem[] = [];
    public readonly startLine: number;
    public readonly endLine: number;

    constructor(
        label: string,
        tooltip: string,
        collapsibleState: vscode.TreeItemCollapsibleState,
        startLine: number,
        endLine: number
    ) {
        super(label, collapsibleState);
        
        this.tooltip = tooltip;
        this.startLine = startLine;
        this.endLine = endLine;
        
        // 设置命令，点击时跳转到对应行
        this.command = {
            command: 'vscode.open',
            title: '跳转到函数',
            arguments: [
                vscode.Uri.file(vscode.window.activeTextEditor?.document.uri.fsPath || ''),
                {
                    selection: new vscode.Range(
                        new vscode.Position(startLine - 1, 0),
                        new vscode.Position(endLine - 1, 0)
                    )
                }
            ]
        };
    }

    addChild(child: OutlineItem): void {
        this.children.push(child);
        if (this.children.length > 0) {
            this.collapsibleState = vscode.TreeItemCollapsibleState.Collapsed;
        }
    }

    setExpanded(): void {
        if (this.children.length > 0) {
            this.collapsibleState = vscode.TreeItemCollapsibleState.Expanded;
        }
    }
} 