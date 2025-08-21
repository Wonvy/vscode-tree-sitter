#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
测试 Tree-sitter Outline 焦点控制功能
"""

def test_function_1():
    """测试函数1 - 用于测试高亮功能"""
    print("这是测试函数1")
    x = 1 + 1
    return x

def test_function_2():
    """测试函数2 - 用于测试高亮功能"""
    print("这是测试函数2")
    y = 2 * 2
    return y

class TestClass:
    """测试类 - 用于测试类方法高亮"""
    
    def __init__(self):
        """初始化方法"""
        self.value = 0
    
    def method_1(self):
        """类方法1"""
        self.value += 1
        return self.value
    
    def method_2(self):
        """类方法2"""
        self.value *= 2
        return self.value

def main():
    """主函数"""
    print("开始测试焦点控制功能")
    
    # 测试函数调用
    result1 = test_function_1()
    result2 = test_function_2()
    
    # 测试类实例化
    obj = TestClass()
    obj.method_1()
    obj.method_2()
    
    print(f"测试完成: {result1}, {result2}")
    return 0

if __name__ == "__main__":
    exit(main()) 