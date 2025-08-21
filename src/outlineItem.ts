import * as vscode from 'vscode';

export interface FunctionDetails {
    name: string;
    type: string;
    startLine: number;
    endLine: number;
    parameters?: string[];
    returnType?: string;
    visibility?: string;
    isStatic?: boolean;
    comment?: string;
    className?: string;
    namespaceName?: string;
}

export class OutlineItem extends vscode.TreeItem {
    public readonly children: OutlineItem[] = [];
    public readonly startLine: number;
    public readonly endLine: number;
    public readonly functionName: string; // 新增：函数名
    private _isHighlighted: boolean = false;
    private _functionDetails?: FunctionDetails; // 新增：函数详细信息

    constructor(
        label: string,
        tooltip: string,
        collapsibleState: vscode.TreeItemCollapsibleState,
        startLine: number,
        endLine: number,
        functionName?: string, // 新增：函数名参数
        functionDetails?: FunctionDetails // 新增：函数详细信息参数
    ) {
        super(label, collapsibleState);
        
        this.startLine = startLine;
        this.endLine = endLine;
        this.functionName = functionName || label; // 如果没有提供函数名，使用label
        this._functionDetails = functionDetails;
        
        // 设置描述，这样注释就会显示在函数名的右边
        if (tooltip && tooltip.trim()) {
            this.description = tooltip;
        }
        
        // 设置命令，点击时将光标定位到函数名称前
        this.command = {
            command: 'tree-sitter-outline.jumpToFunction',
            title: '跳转到函数名称前',
            arguments: [startLine, this.functionName] // 传递行号和函数名
        };
        
        // 设置增强的悬浮提示
        this.tooltip = this.generateEnhancedTooltip();
        
        // 设置双击事件处理
        this.contextValue = 'function-item-double-clickable';
    }

    // 新增：生成增强的悬浮提示
    private generateEnhancedTooltip(): vscode.MarkdownString | string {
        if (!this._functionDetails) {
            // 如果没有详细信息，生成基本的tooltip
            const basicTooltip = new vscode.MarkdownString();
            basicTooltip.appendMarkdown(`**${this.label}**\n\n`);
            
            // 如果有描述信息，添加到tooltip中
            if (this.description && typeof this.description === 'string' && this.description.trim()) {
                basicTooltip.appendMarkdown(`**描述:** ${this.description}\n\n`);
            }
            
            basicTooltip.appendMarkdown(`**位置:** 第 ${this.startLine}-${this.endLine} 行\n`);
            
            basicTooltip.isTrusted = true;
            basicTooltip.supportThemeIcons = true;
            return basicTooltip;
        }

        const details = this._functionDetails;
        const tooltip = new vscode.MarkdownString();
        
        // 标题 - 显示函数名称
        tooltip.appendMarkdown(`**${details.name}**\n\n`);
        
        // 基本信息
        tooltip.appendMarkdown(`**类型:** ${details.type}\n`);
        tooltip.appendMarkdown(`**位置:** 第 ${details.startLine}-${details.endLine} 行\n`);
        
        // 访问修饰符和静态标识
        if (details.visibility && details.visibility !== 'public') {
            tooltip.appendMarkdown(`**访问修饰符:** ${details.visibility}\n`);
        }
        if (details.isStatic) {
            tooltip.appendMarkdown(`**静态:** 是\n`);
        }
        
        // 返回类型
        if (details.returnType && details.returnType !== 'void' && details.returnType !== 'any') {
            tooltip.appendMarkdown(`**返回类型:** \`${details.returnType}\`\n`);
        }
        
        // 参数
        if (details.parameters && details.parameters.length > 0) {
            tooltip.appendMarkdown(`**参数:** \n`);
            details.parameters.forEach((param, index) => {
                tooltip.appendMarkdown(`  ${index + 1}. \`${param}\`\n`);
            });
        }
        
        // 所属类
        if (details.className) {
            tooltip.appendMarkdown(`**所属类:** \`${details.className}\`\n`);
        }
        
        // 命名空间
        if (details.namespaceName) {
            tooltip.appendMarkdown(`**命名空间:** \`${details.namespaceName}\`\n`);
        }
        
        // 注释
        if (details.comment && details.comment.trim()) {
            tooltip.appendMarkdown(`**注释:** ${details.comment}\n`);
        }
        
        // 支持Markdown
        tooltip.isTrusted = true;
        tooltip.supportThemeIcons = true;
        
        return tooltip;
    }

    // 新增：设置函数详细信息
    public setFunctionDetails(details: FunctionDetails): void {
        this._functionDetails = details;
        // 重新生成悬浮提示
        this.tooltip = this.generateEnhancedTooltip();
    }

    // 新增：获取函数详细信息
    public getFunctionDetails(): FunctionDetails | undefined {
        return this._functionDetails;
    }

    // 新增：检查是否包含指定行号
    public containsLine(lineNumber: number): boolean {
        return lineNumber >= this.startLine && lineNumber <= this.endLine;
    }

    // 新增：设置高亮状态
    public setHighlighted(highlighted: boolean): void {
        const timestamp = new Date().toLocaleTimeString();
        console.log(`[${timestamp}] 🎨 OutlineItem.setHighlighted: ${this.label} -> ${highlighted}`);
        
        this._isHighlighted = highlighted;
        if (highlighted) {
            // 高亮显示：使用特殊的背景色或图标
            this.iconPath = new vscode.ThemeIcon('symbol-function', new vscode.ThemeColor('editor.findMatchHighlightBackground'));
            
            // 添加高亮标识到描述中
            if (typeof this.description === 'string') {
                this.description = `📍 ${this.description}`;
            } else {
                this.description = '📍 函数';
            }
            
            // 设置高亮样式
            this.contextValue = 'function-item-highlighted';
            
            console.log(`[${timestamp}] ✅ 高亮设置成功: ${this.label}`);
        } else {
            // 恢复正常显示
            this.iconPath = new vscode.ThemeIcon('symbol-function');
            
            // 移除高亮标识
            if (typeof this.description === 'string' && this.description.startsWith('📍 ')) {
                this.description = this.description.substring(2);
            }
            
            // 恢复正常样式
            this.contextValue = 'function-item';
            
            console.log(`[${timestamp}] 🔄 高亮清除: ${this.label}`);
        }
    }

    // 新增：获取高亮状态
    public get isHighlighted(): boolean {
        return this._isHighlighted;
    }

    // 新增：处理双击事件，搜索函数
    public async handleDoubleClick(): Promise<void> {
        try {
            // 执行搜索函数命令
            await vscode.commands.executeCommand('tree-sitter-outline.searchFunction', this.functionName);
        } catch (error) {
            console.error(`双击搜索函数失败: ${error}`);
        }
    }

    // 新增：获取搜索命令
    public getSearchCommand(): vscode.Command {
        return {
            command: 'tree-sitter-outline.searchFunction',
            title: `搜索函数: ${this.functionName}`,
            arguments: [this.functionName]
        };
    }

    addChild(child: OutlineItem): void {
        this.children.push(child);
        if (this.children.length > 0) {
            this.collapsibleState = vscode.TreeItemCollapsibleState.Expanded;
        }
    }

    setExpanded(): void {
        if (this.children.length > 0) {
            this.collapsibleState = vscode.TreeItemCollapsibleState.Expanded;
        }
    }

    setCollapsed(): void {
        if (this.children.length > 0) {
            this.collapsibleState = vscode.TreeItemCollapsibleState.Collapsed;
        }
    }
} 