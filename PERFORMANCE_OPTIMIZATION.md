# Tree-Sitter Outline 性能优化说明

## 问题描述

用户反馈了两个主要问题：
1. 编辑器点击对应函数时出现频繁刷新
2. 一直显示"在第xxxx行没有找到函数"的日志信息

## 优化方案

### 1. 减少不必要的刷新

**问题原因：**
- 光标位置变化时立即刷新
- 文档内容变化时频繁刷新
- 缺少防抖机制

**解决方案：**
- 添加光标位置变化检测，避免重复处理同一行
- 实现防抖刷新机制，减少刷新频率
- 优化刷新时机，只在真正需要时刷新

### 2. 改善日志输出

**问题原因：**
- 找不到函数时总是输出警告日志
- 日志输出过于频繁

**解决方案：**
- 添加配置控制，可选择性显示日志
- 减少不必要的日志输出
- 提供调试模式开关

### 3. 具体优化内容

#### 光标变化监听优化
```typescript
// 优化前：每次光标变化都高亮
vscode.window.onDidChangeTextEditorSelection(event => {
    const lineNumber = event.selections[0].active.line + 1;
    this.highlightFunctionAtLine(lineNumber);
});

// 优化后：只在行号真正变化时高亮
let lastHighlightedLine = -1;
vscode.window.onDidChangeTextEditorSelection(event => {
    const lineNumber = event.selections[0].active.line + 1;
    if (lineNumber !== lastHighlightedLine) {
        lastHighlightedLine = lineNumber;
        this.highlightFunctionAtLine(lineNumber);
    }
});
```

#### 防抖刷新机制
```typescript
// 光标变化刷新延迟：100ms
// 文档变化刷新延迟：1000ms
private debouncedRefresh(): void {
    if (this.refreshTimeout) {
        clearTimeout(this.refreshTimeout);
    }
    this.refreshTimeout = setTimeout(() => {
        this.refresh();
    }, config.cursorChangeRefreshDelay);
}
```

#### 配置化日志控制
```typescript
// 可配置的日志输出
if (config.enableVerboseLogging) {
    this.outputChannel.appendLine(`🔍 在第 ${lineNumber} 行找到函数: ${outlineItem.label}`);
}

if (config.showFunctionNotFoundWarning) {
    this.outputChannel.appendLine(`⚠️ 在第 ${lineNumber} 行没有找到函数`);
}
```

## 使用方法

### 启用详细日志（调试模式）
```typescript
// 在 config.ts 中设置
enableVerboseLogging: true
```

### 显示函数未找到警告
```typescript
// 在 config.ts 中设置
showFunctionNotFoundWarning: true
```

### 调整刷新延迟
```typescript
// 光标变化刷新延迟
cursorChangeRefreshDelay: 100  // 100ms

// 文档变化刷新延迟
documentChangeRefreshDelay: 1000  // 1000ms
```

## 预期效果

1. **减少刷新频率**：光标移动时不会频繁刷新，只在真正需要时刷新
2. **改善用户体验**：减少卡顿和闪烁
3. **控制日志输出**：避免日志信息过多，提供调试选项
4. **提高性能**：减少不必要的计算和UI更新

## 注意事项

- 刷新延迟设置过低可能导致响应不及时
- 刷新延迟设置过高可能影响实时性
- 建议根据实际使用情况调整配置参数 