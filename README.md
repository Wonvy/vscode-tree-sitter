# Tree-sitter 函数大纲 VSCode 扩展

这是一个基于 **web-tree-sitter** 的 VSCode 扩展，可以在独立的侧边栏中显示函数大纲和中文注释，支持 Python、JavaScript、TypeScript、C# 等编程语言。

## 🚀 功能特性

- 🐍 **Python 支持**: 识别 `def` 定义的函数和类定义
- 🔷 **JavaScript/TypeScript 支持**: 识别函数声明、方法定义、箭头函数等
- 💎 **C# 支持**: 识别方法声明、构造函数、类声明等
- 💬 **智能注释识别**: 自动提取函数前的注释作为描述
- 📍 **跳转功能**: 点击大纲项可跳转到对应代码位置
- 🔄 **实时更新**: 代码修改后大纲自动刷新
- 🎨 **美观图标**: 不同类型函数显示不同图标
- 📱 **独立界面**: 在左侧活动栏有独立的图标，不占用大纲空间

## 🎯 支持的语言

### Python
- 函数定义 (`def`)
- 类定义 (`class`)
- 支持 `#` 开头的单行注释

### JavaScript/TypeScript
- 函数声明 (`function`)
- 方法定义 (`method`)
- 箭头函数 (`=>`)
- 支持 `//` 和 `/* */` 注释

### C#
- 方法声明 (`method`)
- 构造函数 (`constructor`)
- 类声明 (`class`)
- 支持 XML 文档注释 (`///`)

## 📦 安装方法

### 从源码安装

1. 克隆仓库：
```bash
git clone <repository-url>
cd vscode-tree-sitter
```

2. 安装依赖：
```bash
npm install
```

3. 编译扩展：
```bash
npm run compile
```

4. 在 VSCode 中按 `F5` 启动调试模式，或使用 `Ctrl+Shift+P` 运行 "Developer: Reload Window"

### 打包安装

1. 安装 vsce：
```bash
npm install -g vsce
```

2. 打包扩展：
```bash
vsce package
```

3. 在 VSCode 中安装生成的 `.vsix` 文件

## 🎮 使用方法

1. 打开支持的语言文件（Python、JavaScript、TypeScript、C#）
2. 在左侧活动栏中找到 "函数大纲" 图标（📋）
3. 点击打开函数大纲视图
4. 大纲将显示所有函数、方法和类，包含注释描述
5. 点击任意函数项可跳转到对应代码位置
6. 使用刷新按钮手动更新大纲

## 🔧 技术实现

### 核心技术
- **web-tree-sitter**: 使用 WebAssembly 版本的 Tree-sitter 进行语法解析
- **动态加载**: 按需加载不同语言的语法文件
- **实时解析**: 监听文档变化，自动更新函数大纲

### 项目结构
```
src/
├── extension.ts              # 扩展入口点
├── treeSitterOutlineProvider.ts  # 函数大纲提供者
├── outlineItem.ts           # 大纲项定义
└── types/                   # 类型定义
    └── web-tree-sitter.d.ts # web-tree-sitter 类型声明
```

### 构建命令
- `npm run compile`: 编译 TypeScript 代码
- `npm run watch`: 监听文件变化并自动编译
- `npm run lint`: 运行代码检查

## 📋 示例

### Python 示例
```python
# 计算两个数的和
def calculate_sum(a, b):
    return a + b

class Calculator:
    def __init__(self):
        # 初始化计算器
        self.result = 0
```

### JavaScript 示例
```javascript
// 计算两个数的和
function calculateSum(a, b) {
    return a + b;
}

class Calculator {
    constructor() {
        // 初始化计算器
        this.result = 0;
    }
}
```

### C# 示例
```csharp
/// <summary>
/// 计算两个数的和
/// </summary>
public static int CalculateSum(int a, int b)
{
    return a + b;
}

public class Calculator
{
    public Calculator()
    {
        // 初始化计算器
        Result = 0;
    }
}
```

## 🔍 故障排除

### 常见问题

1. **扩展无法激活**
   - 检查 VSCode 版本是否支持（需要 1.74.0 或更高）
   - 查看开发者控制台的错误信息

2. **函数大纲不显示**
   - 确保文件语言被正确识别
   - 检查文件是否包含函数定义
   - 尝试手动刷新大纲

3. **跳转功能不工作**
   - 确保文件已保存
   - 检查文件路径是否正确

### 调试模式
在调试模式下，扩展会在控制台输出详细的日志信息，包括：
- Tree-sitter 初始化过程
- 语法文件加载状态
- 函数解析结果
- 错误信息

## 🤝 贡献

欢迎提交 Issue 和 Pull Request！

### 开发指南
1. Fork 项目
2. 创建功能分支
3. 提交更改
4. 推送到分支
5. 创建 Pull Request

## 📄 许可证

MIT License

## 🙏 致谢

- [Tree-sitter](https://tree-sitter.github.io/tree-sitter/) - 强大的语法解析工具
- [web-tree-sitter](https://github.com/tree-sitter/tree-sitter/tree/master/lib/binding_web) - WebAssembly 版本的 Tree-sitter
- [VSCode](https://code.visualstudio.com/) - 优秀的代码编辑器 