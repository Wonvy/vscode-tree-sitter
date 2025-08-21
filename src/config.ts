import * as vscode from 'vscode';

export interface TreeSitterOutlineConfig {
    // 是否启用详细日志输出
    enableVerboseLogging: boolean;
    
    // 光标变化时的刷新延迟（毫秒）
    cursorChangeRefreshDelay: number;
    
    // 文档变化时的刷新延迟（毫秒）
    documentChangeRefreshDelay: number;
    
    // 是否在找不到函数时显示警告日志
    showFunctionNotFoundWarning: boolean;
    
    // 是否启用防抖刷新
    enableDebouncedRefresh: boolean;
    
    // 是否在内容变化时自动刷新大纲
    autoRefreshOnContentChange: boolean;
    
    // 是否在点击编辑器行时自动聚焦函数大纲
    autoFocusOutlineOnLineClick: boolean;
}

export const defaultConfig: TreeSitterOutlineConfig = {
    enableVerboseLogging: false,
    cursorChangeRefreshDelay: 100,
    documentChangeRefreshDelay: 1000,
    showFunctionNotFoundWarning: false,
    enableDebouncedRefresh: true,
    autoRefreshOnContentChange: true,
    autoFocusOutlineOnLineClick: false
};

export function getConfig(): TreeSitterOutlineConfig {
    const vscodeConfig = vscode.workspace.getConfiguration('tree-sitter-outline');
    
    const config: TreeSitterOutlineConfig = {
        enableVerboseLogging: vscodeConfig.get('enableVerboseLogging', defaultConfig.enableVerboseLogging),
        cursorChangeRefreshDelay: vscodeConfig.get('cursorChangeRefreshDelay', defaultConfig.cursorChangeRefreshDelay),
        documentChangeRefreshDelay: vscodeConfig.get('documentChangeRefreshDelay', defaultConfig.documentChangeRefreshDelay),
        showFunctionNotFoundWarning: vscodeConfig.get('showFunctionNotFoundWarning', defaultConfig.showFunctionNotFoundWarning),
        enableDebouncedRefresh: vscodeConfig.get('enableDebouncedRefresh', defaultConfig.enableDebouncedRefresh),
        autoRefreshOnContentChange: vscodeConfig.get('autoRefreshOnContentChange', defaultConfig.autoRefreshOnContentChange),
        autoFocusOutlineOnLineClick: vscodeConfig.get('autoFocusOutlineOnLineClick', defaultConfig.autoFocusOutlineOnLineClick)
    };
    
    return config;
} 