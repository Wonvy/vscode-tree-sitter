# Tree-Sitter Outline 层级结构解析修复说明

## 问题描述

用户反馈：解析C#和Python代码时，函数没有保留结构，都在一级显示。

**问题表现：**
- C#代码中，所有方法、属性、字段都平铺显示
- 没有命名空间和类的层级结构
- Python代码中，类内的方法没有嵌套显示
- 所有函数都在同一层级，难以区分归属关系

## 修复方案

### 1. 为C#和Python添加专门的层级结构解析

#### 之前的问题
```typescript
// 之前：所有语言都使用相同的扁平化解析
this.traverseTree(rootNode, (node) => {
    if (this.isFunctionDeclaration(node, language)) {
        const functionInfo = this.extractFunctionInfo(node, language);
        if (functionInfo) {
            functions.push(functionInfo); // 直接添加到一级
        }
    }
});
```

#### 现在的改进
```typescript
// 现在：为不同语言使用专门的层级解析
if (language === 'javascript' || language === 'typescript') {
    this.extractJavaScriptHierarchy(rootNode, functions, language);
} else if (language === 'csharp') {
    this.extractCSharpHierarchy(rootNode, functions, language);
} else if (language === 'python') {
    this.extractPythonHierarchy(rootNode, functions, language);
}
```

### 2. C#层级结构解析

#### 支持的层级结构
1. **命名空间** (namespace)
   - 包含类、方法、属性等
   - 支持嵌套命名空间

2. **类** (class)
   - 包含方法、构造函数、属性、字段、事件
   - 支持继承关系

3. **顶级成员**
   - 不在命名空间或类内的成员
   - 直接显示在根级别

#### 解析逻辑
```typescript
private extractCSharpHierarchy(rootNode: any, functions: FunctionInfo[], language: string): void {
    this.traverseTree(rootNode, (node) => {
        if (node.type === 'namespace_declaration') {
            this.processCSharpNamespace(node, functions, language);
        } else if (node.type === 'class_declaration') {
            this.processCSharpClass(node, functions, language);
        } else if (this.isFunctionDeclaration(node, language)) {
            this.processTopLevelCSharpMember(node, functions, language);
        }
    });
}
```

#### 示例C#代码结构
```csharp
namespace TestNamespace
{
    public class TestClass
    {
        public string GetName() { ... }        // 嵌套在TestClass下
        public void SetName(string name) { ... } // 嵌套在TestClass下
    }
}

public class TopLevelClass                     // 顶级类
{
    public void TopLevelMethod() { ... }      // 嵌套在TopLevelClass下
}
```

**解析结果：**
```
📁 TestNamespace (命名空间)
  📁 TestClass (类)
    🔧 GetName() (方法)
    🔧 SetName() (方法)
📁 TopLevelClass (类)
  🔧 TopLevelMethod() (方法)
```

### 3. Python层级结构解析

#### 支持的层级结构
1. **模块级别**
   - 顶级函数和类
   - 导入语句和全局变量

2. **类定义** (class_definition)
   - 包含方法、静态方法、类方法
   - 支持继承和多重继承

3. **函数定义** (function_definition)
   - 顶级函数
   - 类内方法

#### 解析逻辑
```typescript
private extractPythonHierarchy(rootNode: any, functions: FunctionInfo[], language: string): void {
    this.traverseTree(rootNode, (node) => {
        if (node.type === 'class_definition') {
            this.processPythonClass(node, functions, language);
        } else if (node.type === 'function_definition') {
            this.processTopLevelPythonFunction(node, functions, language);
        }
    });
}
```

#### 示例Python代码结构
```python
def top_level_function():                     # 顶级函数
    pass

class BaseClass:                              # 基类
    def __init__(self, name):                # 嵌套在BaseClass下
        self.name = name
    
    def get_name(self):                      # 嵌套在BaseClass下
        return self.name

class DerivedClass(BaseClass):               # 派生类
    def process_data(self, data):            # 嵌套在DerivedClass下
        return [x * 2 for x in data]
```

**解析结果：**
```
🔧 top_level_function() (函数)
📁 BaseClass (类)
  🔧 __init__() (方法)
  🔧 get_name() (方法)
📁 DerivedClass (类)
  🔧 process_data() (方法)
```

### 4. 递归遍历优化

#### C#命名空间成员遍历
```typescript
private traverseCSharpNamespaceMembers(namespaceNode: any, callback: (memberNode: any) => void): void {
    namespaceNode.children.forEach((child: any) => {
        if (child.type === 'namespace_body') {
            this.traverseCSharpNamespaceMembers(child, callback);
        } else if (this.isFunctionDeclaration(child, 'csharp') || child.type === 'class_declaration') {
            callback(child);
        }
    });
}
```

#### C#类成员遍历
```typescript
private traverseCSharpClassMembers(classNode: any, callback: (memberNode: any) => void): void {
    classNode.children.forEach((child: any) => {
        if (child.type === 'class_body') {
            this.traverseCSharpClassMembers(child, callback);
        } else if (this.isFunctionDeclaration(child, 'csharp')) {
            callback(child);
        }
    });
}
```

#### Python类成员遍历
```typescript
private traversePythonClassMembers(classNode: any, callback: (memberNode: any) => void): void {
    classNode.children.forEach((child: any) => {
        if (child.type === 'class_body') {
            this.traversePythonClassMembers(child, callback);
        } else if (child.type === 'function_definition') {
            callback(child);
        }
    });
}
```

## 测试用例

### C#测试文件：test-hierarchy.cs
包含：
- 命名空间嵌套
- 类定义和方法
- 顶级类和方法
- 静态方法和扩展方法

### Python测试文件：test-hierarchy.py
包含：
- 顶级函数
- 基类和派生类
- 类方法和静态方法
- 异步方法

## 预期效果

修复后的层级结构解析应该能够：

1. **保持代码结构**：正确显示命名空间、类、方法的层级关系
2. **清晰的分组**：相关的方法和属性按类分组显示
3. **易于导航**：用户可以快速找到特定类或命名空间下的成员
4. **支持复杂结构**：处理嵌套的命名空间和继承关系
5. **保持性能**：高效的递归遍历，不影响解析速度

## 技术细节

### 1. 节点类型识别
- C#: `namespace_declaration`, `class_declaration`, `method_declaration` 等
- Python: `class_definition`, `function_definition` 等

### 2. 父子关系建立
- 通过 `className` 和 `namespaceName` 字段建立关系
- 在 `convertFunctionsToOutlineItems` 中构建树形结构

### 3. 递归深度控制
- 避免无限递归
- 合理的遍历深度限制

### 4. 错误处理
- 节点类型不匹配时的优雅降级
- 详细的调试日志输出

## 使用方法

1. **自动解析**：打开C#或Python文件，扩展自动解析层级结构
2. **查看结果**：在函数大纲面板中查看层级化的结构
3. **调试信息**：在输出面板中查看详细的解析过程

## 注意事项

- 确保Tree-Sitter语法文件正确加载
- 复杂的代码结构可能需要更多解析时间
- 某些特殊的语法结构可能需要额外处理
- 建议在大型项目中启用详细日志以便调试 