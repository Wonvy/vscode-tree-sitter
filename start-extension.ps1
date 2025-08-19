# Tree-sitter 函数大纲扩展启动脚本
Write-Host "🚀 启动 Tree-sitter 函数大纲扩展..." -ForegroundColor Green

# 检查是否在正确的目录
if (-not (Test-Path "package.json")) {
    Write-Host "❌ 错误：请在扩展项目根目录下运行此脚本" -ForegroundColor Red
    exit 1
}

# 检查依赖是否安装
if (-not (Test-Path "node_modules")) {
    Write-Host "📦 安装依赖..." -ForegroundColor Yellow
    npm install
}

# 编译扩展
Write-Host "🔨 编译扩展..." -ForegroundColor Yellow
npm run compile

if ($LASTEXITCODE -eq 0) {
    Write-Host "✅ 编译成功！" -ForegroundColor Green
    Write-Host ""
    Write-Host "📋 下一步操作：" -ForegroundColor Cyan
    Write-Host "1. 在 VSCode 中按 F5 启动调试模式" -ForegroundColor White
    Write-Host "2. 或者使用 Ctrl+Shift+P 运行 'Developer: Reload Window'" -ForegroundColor White
    Write-Host "3. 在左侧活动栏找到 '函数大纲' 图标" -ForegroundColor White
    Write-Host "4. 打开 test.js、test.py 或 test.cs 文件测试功能" -ForegroundColor White
    Write-Host ""
    Write-Host "🎯 支持的语言：Python、JavaScript、TypeScript、C#" -ForegroundColor Cyan
} else {
    Write-Host "❌ 编译失败，请检查错误信息" -ForegroundColor Red
    exit 1
} 