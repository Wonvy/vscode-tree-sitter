// 测试函数大纲功能
function testFunction1() {
    console.log("这是测试函数1");
}

function testFunction2() {
    console.log("这是测试函数2");
    
    function nestedFunction() {
        console.log("这是嵌套函数");
    }
    
    nestedFunction();
}

class TestClass {
    constructor() {
        this.name = "测试类";
    }
    
    method1() {
        console.log("类方法1");
    }
    
    method2() {
        console.log("类方法2");
    }
}

// 箭头函数测试
const arrowFunction = () => {
    console.log("这是箭头函数");
};

// 立即执行函数
(function() {
    console.log("立即执行函数");
})(); 