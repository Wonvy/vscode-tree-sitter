# 这是一个Python示例文件
# 用于测试Tree-sitter大纲扩展

def calculate_sum(a, b):
    """计算两个数的和"""
    return a + b

def calculate_product(a, b):
    """计算两个数的乘积"""
    return a * b

def greet_user(name):
    # 问候用户
    print(f"你好, {name}!")

class Calculator:
    """计算器类"""
    
    def __init__(self):
        # 初始化计算器
        self.result = 0
    
    def add(self, value):
        """添加值到结果"""
        self.result += value
        return self.result
    
    def subtract(self, value):
        """从结果中减去值"""
        self.result -= value
        return self.result

# 主函数
def main():
    """主函数"""
    calc = Calculator()
    result = calc.add(10)
    print(f"结果: {result}") 