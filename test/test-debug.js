// 测试类方法识别的JavaScript文件
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
    
    // 乘法方法
    multiply(a, b) {
        this.result = a * b;
        return this.result;
    }
    
    // 除法方法
    divide(a, b) {
        if (b === 0) {
            throw new Error('除数不能为零');
        }
        this.result = a / b;
        return this.result;
    }
    
    // 获取结果
    getResult() {
        return this.result;
    }
    
    // 重置计算器
    reset() {
        this.result = 0;
    }
}

// 顶级函数
function fibonacci(n) {
    if (n <= 1) return n;
    return fibonacci(n - 1) + fibonacci(n - 2);
}

// 箭头函数
const multiply = (a, b) => a * b;

// 创建计算器实例
const calc = new Calculator();
console.log('计算器已创建'); 