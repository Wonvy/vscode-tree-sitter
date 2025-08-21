# TypeScript 支持设置指南

## 概述

本扩展现在支持 TypeScript 文件的专门解析，能够识别 TypeScript 特有的语法结构，如：
- `interface` 声明
- `type` 别名
- `enum` 枚举
- `namespace` 命名空间
- 装饰器语法
- 泛型类型
- 联合类型和交叉类型

## 设置步骤

### 1. 下载 TypeScript 语法文件

运行以下命令下载 TypeScript 语法文件：

```bash
node download-typescript-grammar.js
```

这将在 `public/` 目录下创建 `tree-sitter-typescript.wasm` 文件。

### 2. 验证文件

确保以下文件存在：
```
public/
├── tree-sitter-typescript.wasm  # TypeScript 语法文件
├── tree-sitter-javascript.wasm  # JavaScript 语法文件
├── tree-sitter-c-sharp.wasm     # C# 语法文件
└── tree-sitter-python.wasm      # Python 语法文件
```

### 3. 重启扩展

下载完成后，重启 VS Code 或重新加载扩展窗口。

## 功能特性

### TypeScript 特有结构识别

- **接口 (Interface)**: 识别接口声明及其成员
- **类型别名 (Type Alias)**: 支持复杂类型定义
- **枚举 (Enum)**: 识别枚举声明和成员
- **命名空间 (Namespace)**: 支持命名空间嵌套
- **装饰器 (Decorator)**: 识别装饰器语法

### 增强的类型信息

- **泛型支持**: 显示泛型类型参数
- **联合类型**: 支持 `type | type` 语法
- **交叉类型**: 支持 `type & type` 语法
- **函数类型**: 显示参数类型和返回类型

### 智能解析

- **备用机制**: 如果没有 TypeScript 语法文件，自动回退到 JavaScript 解析器
- **混合语法**: 支持 `.ts` 和 `.tsx` 文件
- **向后兼容**: 保持对现有 JavaScript 文件的完全支持

## 故障排除

### 问题：TypeScript 语法文件加载失败

**解决方案**:
1. 确保已运行 `node download-typescript-grammar.js`
2. 检查 `public/tree-sitter-typescript.wasm` 文件是否存在
3. 检查文件大小是否正常（通常 1-2 MB）

### 问题：TypeScript 文件解析不完整

**解决方案**:
1. 检查输出面板中的错误信息
2. 确保 TypeScript 语法文件加载成功
3. 重启扩展或 VS Code

### 问题：性能问题

**解决方案**:
1. TypeScript 文件通常比 JavaScript 文件解析稍慢
2. 大型项目可能需要等待几秒钟
3. 检查输出面板中的性能信息

## 示例

### 接口声明
```typescript
interface UserService {
  getUser(id: string): Promise<User>;
  createUser(user: User): Promise<void>;
}
```

### 类型别名
```typescript
type UserStatus = 'active' | 'inactive' | 'pending';
type ApiResponse<T> = {
  data: T;
  status: number;
  message: string;
};
```

### 枚举
```typescript
enum UserRole {
  ADMIN = 'admin',
  USER = 'user',
  GUEST = 'guest'
}
```

### 命名空间
```typescript
namespace Utils {
  export function formatDate(date: Date): string {
    return date.toISOString();
  }
}
```

## 技术细节

### 解析器架构

- **TypeScriptParser**: 专门处理 TypeScript 语法
- **JavaScriptParser**: 处理 JavaScript 语法（作为备用）
- **ParserFactory**: 根据文件类型自动选择解析器

### 语法文件

- **tree-sitter-typescript.wasm**: 官方 TypeScript 语法文件
- 支持最新的 TypeScript 语法特性
- 与 VS Code 内置的 TypeScript 支持兼容

### 性能优化

- 异步加载语法文件
- 智能缓存解析结果
- 渐进式解析大型文件

## 更新日志

- **v1.0.0**: 初始 TypeScript 支持
- 支持基本的 TypeScript 语法结构
- 集成专门的 TypeScript 解析器
- 保持向后兼容性 