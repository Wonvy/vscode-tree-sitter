# 计算斐波那契数列
def fibonacci(n):
    """计算斐波那契数列的第n项"""
    if n <= 1:
        return n
    return fibonacci(n - 1) + fibonacci(n - 2)

# 主函数
def main():
    """主函数，计算并输出结果"""
    result = fibonacci(10)
    print(f'斐波那契数列第10项: {result}')

# 类定义
class Calculator:
    """计算器类，提供基本的数学运算"""
    
    def __init__(self):
        """初始化计算器"""
        self.result = 0
    
    def add(self, a, b):
        """加法运算"""
        self.result = a + b
        return self.result
    
    def subtract(self, a, b):
        """减法运算"""
        self.result = a - b
        return self.result

if __name__ == "__main__":
    main() 