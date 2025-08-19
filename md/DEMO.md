# Tree-sitter Outline 扩展演示

## 功能演示

这个扩展可以在VSCode中显示代码的函数大纲，并自动提取中文注释作为描述。

### 支持的代码示例

#### Python 代码
```python
# 计算两个数的和
def calculate_sum(a, b):
    return a + b

# 计算两个数的乘积
def calculate_product(a, b):
    return a * b

class Calculator:
    def __init__(self):
        # 初始化计算器
        self.result = 0
    
    def add(self, value):
        # 添加值到结果
        self.result += value
        return self.result
```

#### JavaScript 代码
```javascript
// 计算两个数的和
function calculateSum(a, b) {
    return a + b;
}

// 计算两个数的乘积
function calculateProduct(a, b) {
    return a * b;
}

class Calculator {
    constructor() {
        // 初始化计算器
        this.result = 0;
    }
    
    add(value) {
        // 添加值到结果
        this.result += value;
        return this.result;
    }
}
```

### 使用方法

1. 在VSCode中打开上述代码文件
2. 在左侧活动栏找到 "Tree-sitter 大纲" 图标
3. 点击打开大纲视图
4. 您将看到所有函数和方法，以及它们的中文注释描述

### 预期效果

大纲将显示：
- `calculate_sum` - 计算两个数的和
- `calculate_product` - 计算两个数的乘积
- `Calculator.__init__` - 初始化计算器
- `Calculator.add` - 添加值到结果

点击任意函数项可以跳转到对应的代码位置。

## 技术特点

- 使用Tree-sitter进行语法解析
- 支持多种编程语言
- 自动识别函数前的注释
- 实时更新大纲内容
- 支持代码跳转功能 