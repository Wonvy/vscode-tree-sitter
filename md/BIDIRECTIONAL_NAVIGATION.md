# 双向导航功能实现

## 🎯 功能概述

实现了Tree-sitter扩展的双向导航功能：
- **正向导航**：从函数大纲点击跳转到代码对应位置
- **反向导航**：从代码位置自动高亮函数大纲中对应的函数

## 🔧 技术实现

### 1. 核心组件

#### TreeSitterOutlineProvider类
```typescript
export class TreeSitterOutlineProvider implements vscode.TreeDataProvider<OutlineItem> {
    // 存储当前文档的函数信息，用于反向查找
    private currentFunctions: FunctionInfo[] = [];
    private currentOutlineItems: OutlineItem[] = [];
    private cursorChangeListener: vscode.Disposable | null = null;
}
```

#### OutlineItem类
```typescript
export class OutlineItem extends vscode.TreeItem {
    private _isHighlighted: boolean = false;
    
    // 检查是否包含指定行号
    public containsLine(lineNumber: number): boolean;
    
    // 设置高亮状态
    public setHighlighted(highlighted: boolean): void;
}
```

### 2. 事件监听

#### 光标位置变化监听
```typescript
private setupCursorChangeListener(): void {
    // 监听光标位置变化
    vscode.window.onDidChangeTextEditorSelection(event => {
        if (event.textEditor === vscode.window.activeTextEditor) {
            const lineNumber = event.selections[0].active.line + 1;
            this.highlightFunctionAtLine(lineNumber);
        }
    });
}
```

#### 文档变化监听
```typescript
// 监听文档变化
this.cursorChangeListener = vscode.workspace.onDidChangeTextDocument(event => {
    const editor = vscode.window.activeTextEditor;
    if (editor && event.document === editor.document) {
        this.refresh();
    }
});
```

#### 活动编辑器变化监听
```typescript
// 监听活动编辑器变化
vscode.window.onDidChangeActiveTextEditor(editor => {
    if (editor) {
        this.refresh();
    }
});
```

### 3. 核心方法

#### 根据行号查找函数
```typescript
public findFunctionByLine(lineNumber: number): FunctionInfo | null {
    if (!this.currentFunctions || this.currentFunctions.length === 0) {
        return null;
    }

    // 查找包含当前行的函数
    for (const func of this.currentFunctions) {
        if (lineNumber >= func.startLine && lineNumber <= func.endLine) {
            return func;
        }
    }

    return null;
}
```

#### 根据行号查找大纲项
```typescript
public findOutlineItemByLine(lineNumber: number): OutlineItem | null {
    if (!this.currentOutlineItems || this.currentOutlineItems.length === 0) {
        return null;
    }

    // 递归查找包含当前行的OutlineItem
    return this.findOutlineItemRecursive(this.currentOutlineItems, lineNumber);
}
```

#### 高亮显示函数
```typescript
public highlightFunctionAtLine(lineNumber: number): void {
    // 清除之前的高亮
    this.clearAllHighlights();
    
    const outlineItem = this.findOutlineItemByLine(lineNumber);
    if (outlineItem) {
        // 设置高亮
        outlineItem.setHighlighted(true);
        
        // 确保包含该函数的父节点是展开状态
        this.ensureParentExpanded(outlineItem);
        
        // 触发UI更新
        this.refresh();
    }
}
```

## 📊 功能特性

### 1. 正向导航（函数大纲 → 代码）
- ✅ 点击函数大纲中的任意函数
- ✅ 光标自动定位到函数开始处
- ✅ 不选中任何文本，直接可以编辑
- ✅ 支持类方法、顶级函数等所有类型

### 2. 反向导航（代码 → 函数大纲）
- ✅ 在代码中移动光标
- ✅ 自动高亮函数大纲中对应的函数
- ✅ 自动展开包含该函数的节点
- ✅ 清除之前的高亮状态

### 3. 智能匹配
- ✅ 根据行号范围精确匹配函数
- ✅ 支持嵌套结构（类中的方法）
- ✅ 递归查找最佳匹配项
- ✅ 自动处理父节点展开状态

## 🎨 高亮效果

### 1. 高亮状态
- **图标变化**：使用特殊的主题色图标
- **描述标记**：在描述前添加📍标记
- **视觉区分**：与普通函数项明显区分

### 2. 高亮管理
- **自动清除**：新位置自动清除旧高亮
- **状态同步**：高亮状态与光标位置同步
- **UI更新**：实时更新函数大纲显示

## 🧪 使用方法

### 1. 安装扩展
```bash
# 使用新打包的扩展
vscode-tree-sitter-outline-0.0.1.vsix
```

### 2. 正向导航
1. 打开支持的文件（JavaScript、TypeScript、Python、C#等）
2. 查看"函数大纲"侧边栏
3. 点击任意函数，光标自动跳转到对应位置

### 3. 反向导航
1. 在代码编辑器中移动光标
2. 观察函数大纲中的高亮变化
3. 对应的函数会自动高亮并展开

### 4. 功能特点
- **实时响应**：光标移动立即触发高亮
- **智能展开**：自动展开包含函数的节点
- **状态同步**：高亮状态与代码位置完全同步

## 📝 技术细节

### 1. 性能优化
- **事件节流**：避免频繁的UI更新
- **缓存机制**：缓存解析结果，避免重复计算
- **智能刷新**：只在必要时触发UI更新

### 2. 错误处理
- **边界检查**：检查行号范围的有效性
- **空值处理**：安全处理空数组和空对象
- **异常捕获**：捕获并记录可能的错误

### 3. 扩展性
- **模块化设计**：功能模块独立，易于扩展
- **配置支持**：支持自定义高亮样式和行为
- **多语言支持**：支持多种编程语言

## 🚀 未来改进

### 1. 功能增强
- **多光标支持**：支持多光标位置的高亮
- **高亮样式**：支持自定义高亮颜色和样式
- **动画效果**：添加平滑的高亮过渡动画

### 2. 性能优化
- **虚拟滚动**：支持大文件的虚拟滚动
- **增量更新**：只更新变化的部分
- **后台处理**：在后台线程中处理复杂计算

### 3. 用户体验
- **快捷键支持**：添加快捷键操作
- **状态指示**：显示当前高亮状态
- **历史记录**：记录导航历史

## 📝 总结

通过这次实现，我们：
- 完成了双向导航功能的开发
- 提供了流畅的代码导航体验
- 实现了智能的函数匹配和高亮
- 为后续功能扩展奠定了良好基础

现在用户可以：
1. 从函数大纲快速跳转到代码位置
2. 在代码中移动时自动看到对应的函数高亮
3. 享受更加直观和高效的代码导航体验 