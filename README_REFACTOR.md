# Tree-Sitter 扩展重构说明

## 重构概述

原来的 `treeSitterOutlineProvider.ts` 文件过大（2500行），包含了所有语言的解析逻辑。为了提高代码的可维护性和可扩展性，我们将其按语言类型拆分为多个文件。

## 新的文件结构

### 主要文件
- `src/treeSitterOutlineProvider.ts` - 主要的提供者类，负责协调各个解析器
- `src/parsers/parserFactory.ts` - 解析器工厂，根据语言类型创建相应的解析器

### 语言特定解析器
- `src/parsers/csharpParser.ts` - C# 语言解析器
- `src/parsers/javascriptParser.ts` - JavaScript/TypeScript 语言解析器  
- `src/parsers/pythonParser.ts` - Python 语言解析器

### 工具类
- `src/utils/commentExtractor.ts` - 通用注释提取工具

## 重构的好处

1. **可维护性**: 每个文件都有明确的职责，更容易理解和修改
2. **可扩展性**: 添加新语言支持时，只需创建新的解析器文件
3. **代码复用**: 通用的功能（如注释提取）被提取到工具类中
4. **测试友好**: 每个解析器可以独立测试
5. **团队协作**: 不同开发者可以并行处理不同语言的解析器

## 如何添加新语言支持

1. 在 `src/parsers/` 目录下创建新的解析器文件（如 `goParser.ts`）
2. 实现 `IParser` 接口的方法
3. 在 `parserFactory.ts` 中添加新语言的 case
4. 在 `treeSitterOutlineProvider.ts` 中添加新语言的语法文件加载逻辑

## 接口设计

所有解析器都实现 `IParser` 接口，确保一致性：

```typescript
export interface IParser {
    extractCSharpHierarchy?(rootNode: any, functions: any[], language: string): void;
    extractJavaScriptHierarchy?(rootNode: any, functions: any[], language: string): void;
    extractPythonHierarchy?(rootNode: any, functions: any[], language: string): void;
}
```

## 迁移说明

原有的功能完全保持不变，只是内部实现被重构为更清晰的模块化结构。用户无需做任何更改即可使用重构后的扩展。

## 文件大小对比

- 重构前: `treeSitterOutlineProvider.ts` - 2500行
- 重构后: 
  - `treeSitterOutlineProvider.ts` - ~400行
  - `csharpParser.ts` - ~400行
  - `javascriptParser.ts` - ~300行
  - `pythonParser.ts` - ~200行
  - `parserFactory.ts` - ~30行
  - `commentExtractor.ts` - ~150行

总代码量略有增加，但每个文件的职责更加明确，维护性大大提升。 