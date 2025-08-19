# Tree-Sitter Outline 跳转功能改进说明

## 功能改进

### 之前的问题
- 点击函数大纲中的函数名时，光标会跳转到函数开始行（第1列）
- 无法精确定位到函数名称前
- 用户需要手动移动光标到函数名位置

### 现在的改进
- 点击函数大纲中的函数名时，光标会精确定位到函数名称前
- 支持各种函数声明格式的精确定位
- 提供详细的调试信息

## 实现原理

### 1. 参数传递
```typescript
// 之前：只传递行号
arguments: [startLine]

// 现在：传递行号和函数名
arguments: [startLine, this.functionName]
```

### 2. 精确定位算法
```typescript
function findFunctionNamePosition(document: vscode.TextDocument, lineNumber: number, functionName: string): vscode.Position | null {
    const line = document.lineAt(lineNumber - 1);
    const lineText = line.text;
    
    // 1. 精确匹配
    const functionNameIndex = lineText.indexOf(functionName);
    if (functionNameIndex !== -1) {
        return new vscode.Position(lineNumber - 1, functionNameIndex);
    }
    
    // 2. 模糊匹配（处理空格、括号等）
    const words = lineText.split(/\s+/);
    // ... 模糊匹配逻辑
}
```

### 3. 支持的函数格式

#### JavaScript/TypeScript 函数声明
```javascript
function getLoadedRelsFiles() {          // 光标定位到 'g' 前
async function processData() {            // 光标定位到 'p' 前
const arrowFunction = () => {};          // 光标定位到 'a' 前
```

#### 类方法
```javascript
class MyClass {
    constructor(name) {                   // 光标定位到 'c' 前
        this.name = name;
    }
    
    getName() {                           // 光标定位到 'g' 前
        return this.name;
    }
}
```

#### 对象方法
```javascript
const obj = {
    method1() {                           // 光标定位到 'm' 前
        return "method1";
    },
    method2: function() {                 // 光标定位到 'm' 前
        return "method2";
    }
};
```

## 使用方法

### 1. 自动跳转
- 在函数大纲面板中点击任意函数名
- 光标会自动跳转到对应函数名称前
- 支持所有支持的编程语言

### 2. 手动测试
- 使用命令面板执行 "Tree-sitter Outline: 测试高亮功能"
- 查看跳转是否准确

### 3. 调试信息
在输出面板的 "Tree-sitter Outline" 通道中查看详细日志：
```
[14:30:25] 🎯 执行跳转命令，目标行号: 15, 函数名: getLoadedRelsFiles
[14:30:25] 🔍 精确定位到函数名称: getLoadedRelsFiles
[14:30:25] 🔍 查找函数名 "getLoadedRelsFiles" 在行 "function getLoadedRelsFiles() {" 中的位置
[14:30:25] ✅ 函数名位置: 列 9
[14:30:25] ✅ 找到函数名称位置: 行 15, 列 9
[14:30:25] ✅ 跳转命令执行成功
```

## 技术细节

### 1. 行号转换
- 输入：1-based 行号（用户视角）
- 内部：0-based 行号（VS Code API）
- 输出：1-based 行号（日志显示）

### 2. 列号计算
- 精确匹配：使用 `indexOf()` 查找函数名位置
- 模糊匹配：按空格分割，计算前缀长度
- 特殊字符处理：移除括号、方括号等

### 3. 错误处理
- 函数名未找到：回退到行首位置
- 文档访问失败：显示错误信息
- 位置计算错误：使用默认位置

## 性能优化

### 1. 延迟处理
- 跳转后延迟触发高亮，避免冲突
- 减少不必要的UI刷新

### 2. 智能匹配
- 优先使用精确匹配
- 精确匹配失败时使用模糊匹配
- 避免重复计算

### 3. 缓存机制
- 行文本只读取一次
- 位置计算结果可复用

## 测试用例

### 测试文件：test-jump.js
包含各种函数声明格式，用于验证跳转功能：

1. **普通函数声明**
   - `function testFunction1()`
   - 光标应定位到 't' 前

2. **带参数的函数**
   - `function testFunction2(param1, param2)`
   - 光标应定位到 't' 前

3. **类构造函数**
   - `constructor(name)`
   - 光标应定位到 'c' 前

4. **类方法**
   - `getName()`
   - 光标应定位到 'g' 前

5. **箭头函数**
   - `const arrowFunction = (x, y) =>`
   - 光标应定位到 'a' 前

6. **异步函数**
   - `async function asyncTest()`
   - 光标应定位到 'a' 前

7. **生成器函数**
   - `function* generatorFunction()`
   - 光标应定位到 'g' 前

8. **对象方法简写**
   - `method1()`
   - 光标应定位到 'm' 前

## 注意事项

### 1. 函数名匹配
- 区分大小写
- 支持Unicode字符
- 处理特殊字符（下划线、美元符号等）

### 2. 边界情况
- 函数名在行首：列号 = 0
- 函数名在行尾：列号 = 行长度
- 函数名包含空格：使用模糊匹配

### 3. 兼容性
- 向后兼容：没有函数名时使用原来的逻辑
- 支持所有VS Code版本
- 不影响其他功能

## 预期效果

改进后的跳转功能应该能够：
1. **精确定位**：光标准确放置在函数名称前
2. **智能匹配**：支持各种函数声明格式
3. **快速响应**：跳转速度与之前相当
4. **详细日志**：提供完整的调试信息
5. **向后兼容**：不影响现有功能

## 未来改进

### 1. 多光标支持
- 支持同时跳转到多个函数
- 批量操作功能

### 2. 跳转历史
- 记录跳转历史
- 支持前进/后退

### 3. 自定义定位
- 用户可配置跳转位置
- 支持跳转到函数体开始、结束等 