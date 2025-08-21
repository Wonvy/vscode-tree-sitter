# 焦点控制功能调试指南

## 问题描述

如果设置了 `autoFocusOutlineOnLineClick: false` 但仍然自动切换到函数大纲，请按照以下步骤进行调试。

## 调试步骤

### 1. 验证配置设置

首先确认配置是否正确设置：

#### 方法1：通过 VSCode 设置界面
1. 按 `Ctrl+,` 打开设置
2. 搜索 "tree-sitter-outline"
3. 找到 "Auto Focus Outline On Line Click" 选项
4. 确保已取消勾选

#### 方法2：检查 settings.json
1. 按 `Ctrl+Shift+P` 打开命令面板
2. 输入 "Preferences: Open Settings (JSON)"
3. 确认包含以下配置：
```json
{
    "tree-sitter-outline.autoFocusOutlineOnLineClick": false
}
```

### 2. 检查输出面板日志

1. 按 `Ctrl+Shift+U` 打开输出面板
2. 在右上角下拉菜单中选择 "Tree-Sitter Outline"
3. 点击编辑器中的不同行
4. 观察日志输出，查找以下关键信息：

#### 期望的日志输出（autoFocus: false）
```
🎯 highlightFunctionAtLine 开始执行，行号: X
🎯 调用treeView.reveal，参数: select=true, focus=false, expand=true
✅ TreeView.reveal 执行成功
🔄 自动聚焦已禁用，将焦点切回编辑器...
✅ 焦点已切回编辑器
```

#### 异常的日志输出
如果看到 `focus=true` 或没有焦点切回编辑器的日志，说明配置没有生效。

### 3. 使用调试命令

运行以下命令检查扩展状态：

#### 命令1：检查函数大纲状态
1. 按 `Ctrl+Shift+P` 打开命令面板
2. 输入 "Tree-sitter Outline: 检查函数大纲状态"
3. 查看输出面板中的状态信息

#### 命令2：调试TreeView状态
1. 按 `Ctrl+Shift+P` 打开命令面板
2. 输入 "Tree-sitter Outline: 调试TreeView状态"
3. 查看详细的调试信息

### 4. 常见问题排查

#### 问题1：配置没有生效
**症状**：日志显示 `focus=true`
**解决方案**：
1. 重启 VSCode
2. 检查工作区设置和个人设置是否有冲突
3. 确认配置文件语法正确

#### 问题2：焦点仍然切换
**症状**：日志显示 `focus=false` 但界面仍然切换
**解决方案**：
1. 检查是否有其他扩展干扰
2. 尝试禁用其他可能影响焦点的扩展
3. 查看是否有快捷键冲突

#### 问题3：高亮不工作
**症状**：点击行时没有高亮效果
**解决方案**：
1. 确认函数大纲已加载
2. 检查当前文档是否支持
3. 运行刷新命令重新加载大纲

### 5. 测试步骤

1. **准备测试文件**：
   - 打开 `test_focus_control.py` 或 `test_focus_control.js`
   - 确保函数大纲已加载

2. **测试焦点控制**：
   - 点击编辑器中的不同行
   - 观察函数大纲中的高亮状态
   - 验证是否自动切换界面

3. **对比测试**：
   - 设置 `autoFocusOutlineOnLineClick: true`
   - 测试自动聚焦行为
   - 设置 `autoFocusOutlineOnLineClick: false`
   - 测试禁用自动聚焦行为

### 6. 日志分析要点

#### 关键日志标识
- `🎯 highlightFunctionAtLine 开始执行`：高亮方法开始
- `🎯 调用treeView.reveal`：TreeView操作开始
- `focus=true/false`：焦点控制参数
- `🔄 自动聚焦已禁用/启用`：焦点控制逻辑执行
- `✅ 焦点已切回编辑器`：焦点恢复操作

#### 异常日志模式
- 重复的焦点切换操作
- 配置参数不匹配
- 错误或异常信息

### 7. 重置和恢复

如果问题持续存在：

1. **重置扩展**：
   - 禁用 Tree-sitter Outline 扩展
   - 重启 VSCode
   - 重新启用扩展

2. **清除配置**：
   - 删除相关配置项
   - 重新设置配置
   - 重启 VSCode

3. **检查扩展版本**：
   - 确认使用最新版本
   - 检查是否有已知问题

### 8. 反馈信息

如果问题仍然存在，请提供以下信息：

1. **VSCode 版本**：Help > About
2. **扩展版本**：扩展面板中的版本号
3. **操作系统**：Windows/macOS/Linux 版本
4. **配置文件**：相关的 settings.json 内容
5. **日志输出**：完整的错误日志
6. **重现步骤**：详细的操作步骤
7. **期望行为**：您期望的正确行为

## 联系支持

如果以上步骤无法解决问题，请：

1. 在 GitHub 上提交 Issue
2. 提供详细的调试信息
3. 描述您的使用场景和期望行为
4. 附上相关的日志和配置文件 