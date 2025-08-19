using System;
using System.Collections.Generic;
using System.Threading.Tasks;

namespace TestNamespace
{
    public class TestClass
    {
        private string _name;
        
        public TestClass(string name)
        {
            _name = name;
        }
        
        public string GetName()
        {
            return _name;
        }
        
        public void SetName(string newName)
        {
            _name = newName;
        }
        
        public static void StaticMethod()
        {
            Console.WriteLine("Static method called");
        }
    }
    
    public class AnotherClass
    {
        public int Value { get; set; }
        
        public async Task<int> ProcessValueAsync()
        {
            await Task.Delay(100);
            return Value * 2;
        }
    }
}

namespace AnotherNamespace
{
    public class UtilityClass
    {
        public static void HelperMethod()
        {
            Console.WriteLine("Helper method");
        }
    }
}

// 顶级函数（不在命名空间内）
public class TopLevelClass
{
    public void TopLevelMethod()
    {
        Console.WriteLine("Top level method");
    }
}

public static class Extensions
{
    public static string ToUpper(this string str)
    {
        return str.ToUpper();
    }
} 