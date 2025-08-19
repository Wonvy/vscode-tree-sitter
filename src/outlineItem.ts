import * as vscode from 'vscode';

export class OutlineItem extends vscode.TreeItem {
    public readonly children: OutlineItem[] = [];
    public readonly startLine: number;
    public readonly endLine: number;
    private _isHighlighted: boolean = false;

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
        
        // 设置描述，这样注释就会显示在函数名的右边
        if (tooltip && tooltip.trim()) {
            this.description = tooltip;
        }
        
        // 设置命令，点击时将光标定位到函数开始处，不选中函数
        this.command = {
            command: 'tree-sitter-outline.jumpToFunction',
            title: '跳转到函数开始处',
            arguments: [startLine]
        };
        
        // 添加点击事件处理，在跳转后主动触发高亮
        this.contextValue = 'function-item';
    }

    // 新增：检查是否包含指定行号
    public containsLine(lineNumber: number): boolean {
        return lineNumber >= this.startLine && lineNumber <= this.endLine;
    }

    // 新增：设置高亮状态
    public setHighlighted(highlighted: boolean): void {
        this._isHighlighted = highlighted;
        if (highlighted) {
            // 高亮显示：使用特殊的背景色或图标
            this.iconPath = new vscode.ThemeIcon('symbol-function', new vscode.ThemeColor('editor.findMatchHighlightBackground'));
            if (typeof this.description === 'string') {
                this.description = `📍 ${this.description}`;
            } else {
                this.description = '📍 函数';
            }
        } else {
            // 恢复正常显示
            this.iconPath = new vscode.ThemeIcon('symbol-function');
            if (typeof this.description === 'string' && this.description.startsWith('📍 ')) {
                this.description = this.description.substring(2);
            }
        }
    }

    // 新增：获取高亮状态
    public get isHighlighted(): boolean {
        return this._isHighlighted;
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