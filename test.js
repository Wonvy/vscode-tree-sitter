// 测试函数名定位和高亮功能
function simpleFunction() {
    console.log("这是一个简单函数");
}

const arrowFunction = () => {
    console.log("这是一个箭头函数");
};

const complexFunction = (param1, param2) => {
    if (param1 > param2) {
        return param1;
    }
    return param2;
};

// 多行函数声明
function multiLineFunction(
    param1,
    param2,
    param3
) {
    return param1 + param2 + param3;
}

// 嵌套函数
function outerFunction() {
    function innerFunction() {
        console.log("这是嵌套函数");
    }
    
    return innerFunction;
}

// 类方法
class TestClass {
    constructor() {
        this.name = "TestClass";
    }
    
    getClassName() {
        return this.name;
    }
    
    setClassName(newName) {
        this.name = newName;
    }
}

// 导出函数
export function exportedFunction() {
    console.log("这是导出的函数");
}

export default function defaultFunction() {
    console.log("这是默认导出的函数");
} 