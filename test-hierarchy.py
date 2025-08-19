#!/usr/bin/env python3
# -*- coding: utf-8 -*-

"""测试模块：验证Python层级结构解析"""

import os
import sys
from typing import List, Dict, Optional
import asyncio

def top_level_function():
    """顶级函数：不在类内的函数"""
    print("This is a top level function")
    return "top level"

class BaseClass:
    """基类"""
    
    def __init__(self, name: str):
        self.name = name
    
    def get_name(self) -> str:
        """获取名称"""
        return self.name
    
    def set_name(self, new_name: str) -> None:
        """设置名称"""
        self.name = new_name
    
    @classmethod
    def class_method(cls) -> str:
        """类方法"""
        return f"Class method from {cls.__name__}"
    
    @staticmethod
    def static_method() -> str:
        """静态方法"""
        return "Static method"

class DerivedClass(BaseClass):
    """派生类"""
    
    def __init__(self, name: str, value: int):
        super().__init__(name)
        self.value = value
    
    def get_value(self) -> int:
        """获取值"""
        return self.value
    
    def process_data(self, data: List[int]) -> List[int]:
        """处理数据"""
        return [x * self.value for x in data]

class UtilityClass:
    """工具类"""
    
    @staticmethod
    def helper_function(text: str) -> str:
        """辅助函数"""
        return text.upper()
    
    @staticmethod
    async def async_helper(data: List[str]) -> List[str]:
        """异步辅助函数"""
        await asyncio.sleep(0.1)
        return [item.upper() for item in data]

# 顶级函数
def another_top_level_function():
    """另一个顶级函数"""
    return "another top level"

def main():
    """主函数"""
    print("Testing hierarchy structure")
    
    # 创建实例
    base = BaseClass("Base")
    derived = DerivedClass("Derived", 10)
    utility = UtilityClass()
    
    # 调用方法
    print(base.get_name())
    print(derived.get_value())
    print(utility.helper_function("hello"))

if __name__ == "__main__":
    main() 