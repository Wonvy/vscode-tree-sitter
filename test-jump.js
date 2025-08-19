// 测试文件：验证函数跳转功能
function testFunction1() {
    console.log("这是测试函数1");
}

function testFunction2(param1, param2) {
    const result = param1 + param2;
    return result;
}

class TestClass {
    constructor(name) {
        this.name = name;
    }
    
    getName() {
        return this.name;
    }
    
    setName(newName) {
        this.name = newName;
    }
}

const arrowFunction = (x, y) => {
    return x * y;
};

// 测试异步函数
async function asyncTest() {
    try {
        const result = await Promise.resolve("success");
        return result;
    } catch (error) {
        console.error(error);
    }
}

// 测试生成器函数
function* generatorFunction() {
    yield 1;
    yield 2;
    yield 3;
}

// 测试方法简写
const methodShorthand = {
    method1() {
        return "method1";
    },
    method2: function() {
        return "method2";
    }
}; 