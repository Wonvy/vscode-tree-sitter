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
}

export const defaultConfig: TreeSitterOutlineConfig = {
    enableVerboseLogging: false,
    cursorChangeRefreshDelay: 100,
    documentChangeRefreshDelay: 1000,
    showFunctionNotFoundWarning: false,
    enableDebouncedRefresh: true
};

export function getConfig(): TreeSitterOutlineConfig {
    const config = {
        enableVerboseLogging: false,
        cursorChangeRefreshDelay: 100,
        documentChangeRefreshDelay: 1000,
        showFunctionNotFoundWarning: false,
        enableDebouncedRefresh: true
    };
    
    return config;
} 