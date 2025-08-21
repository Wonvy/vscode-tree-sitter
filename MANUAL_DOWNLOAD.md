# 手动下载 TypeScript 语法文件

如果自动下载脚本失败，可以手动下载 TypeScript 语法文件。

## 方法 1：从 GitHub Releases 下载

### 步骤 1：访问发布页面
打开浏览器，访问：
```
https://github.com/tree-sitter/tree-sitter-typescript/releases
```

### 步骤 2：找到最新版本
在页面中找到最新的发布版本（通常在顶部），点击版本号。

### 步骤 3：下载 WASM 文件
在版本详情页面中，找到并下载：
```
tree-sitter-typescript.wasm
```

### 步骤 4：放置文件
将下载的文件放到项目的 `public/` 目录下，确保文件名为：
```
public/tree-sitter-typescript.wasm
```

## 方法 2：使用 wget 或 curl

如果你有 wget 或 curl 工具，可以使用以下命令：

### 使用 wget
```bash
wget -O public/tree-sitter-typescript.wasm https://github.com/tree-sitter/tree-sitter-typescript/releases/latest/download/tree-sitter-typescript.wasm
```

### 使用 curl
```bash
curl -L -o public/tree-sitter-typescript.wasm https://github.com/tree-sitter/tree-sitter-typescript/releases/latest/download/tree-sitter-typescript.wasm
```

## 方法 3：从 npm 包下载

### 步骤 1：安装 tree-sitter-typescript
```bash
npm install tree-sitter-typescript
```

### 步骤 2：复制 WASM 文件
找到安装的包中的 WASM 文件：
```bash
cp node_modules/tree-sitter-typescript/tree-sitter-typescript.wasm public/
```

## 验证下载

下载完成后，检查文件：

1. **文件存在性**：确保 `public/tree-sitter-typescript.wasm` 文件存在
2. **文件大小**：文件大小应该在 1-2 MB 之间
3. **文件类型**：应该是二进制 WASM 文件

## 常见问题

### 问题：下载的文件很小（几 KB）
**原因**：下载的是 HTML 错误页面而不是实际的 WASM 文件
**解决**：检查下载链接，确保访问的是正确的 GitHub 页面

### 问题：文件下载中断
**原因**：网络不稳定或文件较大
**解决**：使用支持断点续传的下载工具，或重新下载

### 问题：无法访问 GitHub
**原因**：网络限制或防火墙
**解决**：使用代理、VPN，或寻找镜像源

## 文件结构

下载完成后，你的项目应该有以下结构：
```
your-project/
├── public/
│   ├── tree-sitter-typescript.wasm  # TypeScript 语法文件
│   ├── tree-sitter-javascript.wasm  # JavaScript 语法文件
│   ├── tree-sitter-c-sharp.wasm     # C# 语法文件
│   └── tree-sitter-python.wasm      # Python 语法文件
├── src/
├── package.json
└── ...
```

## 重启扩展

文件下载并放置正确后：
1. 重启 VS Code
2. 或者按 `Ctrl+Shift+P`，输入 "Developer: Reload Window"
3. 打开一个 TypeScript 文件测试功能

## 备用下载源

如果 GitHub 下载失败，可以尝试：

1. **GitHub 镜像**：使用 GitHub 的镜像站点
2. **CDN 源**：寻找托管的 WASM 文件
3. **社区分享**：在相关社区寻找分享的文件

## 技术支持

如果仍然遇到问题：
1. 检查网络连接
2. 确认防火墙设置
3. 尝试使用不同的网络环境
4. 在项目 Issues 中寻求帮助 