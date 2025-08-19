# 测试函数名定位和高亮功能

def simple_function():
    """这是一个简单函数"""
    print("这是一个简单函数")

def multi_line_function(
    param1,
    param2,
    param3
):
    """这是一个多行函数"""
    return param1 + param2 + param3

def complex_function(param1, param2):
    """这是一个复杂函数"""
    if param1 > param2:
        return param1
    return param2

# 嵌套函数
def outer_function():
    """外层函数"""
    def inner_function():
        """内层函数"""
        print("这是嵌套函数")
    
    return inner_function

# 类方法
class TestClass:
    """测试类"""
    
    def __init__(self):
        """构造函数"""
        self.name = "TestClass"
    
    def get_class_name(self):
        """获取类名"""
        return self.name
    
    def set_class_name(self, new_name):
        """设置类名"""
        self.name = new_name

# 异步函数
async def async_function():
    """异步函数"""
    await asyncio.sleep(1)
    return "异步函数执行完成"

# 生成器函数
def generator_function():
    """生成器函数"""
    for i in range(10):
        yield i

# 装饰器函数
def decorator_function(func):
    """装饰器函数"""
    def wrapper(*args, **kwargs):
        print(f"调用函数: {func.__name__}")
        return func(*args, **kwargs)
    return wrapper

@decorator_function
def decorated_function():
    """被装饰的函数"""
    print("这是被装饰的函数") 