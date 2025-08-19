using System;

namespace FunctionOutlineDemo
{
    /// <summary>
    /// 计算器类，提供基本的数学运算
    /// </summary>
    public class Calculator
    {
        private int result;
        
        /// <summary>
        /// 初始化计算器
        /// </summary>
        public Calculator()
        {
            this.result = 0;
        }
        
        /// <summary>
        /// 计算斐波那契数列的第n项
        /// </summary>
        /// <param name="n">项数</param>
        /// <returns>斐波那契数列值</returns>
        public static int Fibonacci(int n)
        {
            if (n <= 1) return n;
            return Fibonacci(n - 1) + Fibonacci(n - 2);
        }
        
        /// <summary>
        /// 加法运算
        /// </summary>
        /// <param name="a">第一个数</param>
        /// <param name="b">第二个数</param>
        /// <returns>两数之和</returns>
        public int Add(int a, int b)
        {
            this.result = a + b;
            return this.result;
        }
        
        /// <summary>
        /// 减法运算
        /// </summary>
        /// <param name="a">被减数</param>
        /// <param name="b">减数</param>
        /// <returns>两数之差</returns>
        public int Subtract(int a, int b)
        {
            this.result = a - b;
            return this.result;
        }
    }
    
    /// <summary>
    /// 主程序类
    /// </summary>
    public class Program
    {
        /// <summary>
        /// 主函数
        /// </summary>
        /// <param name="args">命令行参数</param>
        public static void Main(string[] args)
        {
            int result = Calculator.Fibonacci(10);
            Console.WriteLine($"斐波那契数列第10项: {result}");
            
            var calc = new Calculator();
            int sum = calc.Add(5, 3);
            Console.WriteLine($"5 + 3 = {sum}");
        }
    }
} 