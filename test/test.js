// 计算斐波那契数列
function fibonacci(n) {
    if (n <= 1) return n;
    return fibonacci(n - 1) + fibonacci(n - 2);
}

// 主函数
function main() {
    const result = fibonacci(10);
    console.log('斐波那契数列第10项:', result);
}

// 箭头函数示例
const multiply = (a, b) => a * b;

// 类定义
class Calculator {
    constructor() {
        // 初始化计算器
        this.result = 0;
    }
    
    // 加法方法
    add(a, b) {
        this.result = a + b;
        return this.result;
    }
    
    // 减法方法
    subtract(a, b) {
        this.result = a - b;
        return this.result;
    }
}

main(); 