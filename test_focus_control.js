                                                    // 测试 Tree-sitter Outline 焦点控制功能

function testFunction1() {
    console.log("这是测试函数1");
    let x = 1 + 1;
    return x;
}

function testFunction2() {
    console.log("这是测试函数2");
    let y = 2 * 2;
    return y;
}

class TestClass {
    constructor() {
        this.value = 0;
    }
    
    method1() {
        this.value += 1;
        return this.value;
    }
    
    method2() {
        this.value *= 2;
        return this.value;
    }
}

function main() {
    console.log("开始测试焦点控制功能");
    
    // 测试函数调用
    let result1 = testFunction1();
    let result2 = testFunction2();
    
    // 测试类实例化
    let obj = new TestClass();
    obj.method1();
    obj.method2();
    
    console.log(`测试完成: ${result1}, ${result2}`);
    return 0;
}

// 执行主函数
main(); 