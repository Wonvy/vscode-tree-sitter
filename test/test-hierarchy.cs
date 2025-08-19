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


        private class SimpleOutlineForm : Form
        {
            private System.Drawing.Rectangle outlineRectangle;
            private bool isVisible = true;
            private PowerPoint.DocumentWindow powerPointWindow;
            private System.Windows.Forms.Timer focusTimer;
            private System.Windows.Forms.Timer viewChangeTimer;

            // 轮廓信息结构
            private class OutlineInfo
            {
                public System.Drawing.Rectangle Rectangle { get; set; }
                public float Rotation { get; set; }
            }

        }



        // 使用Windows API获取GVML数据  
        private byte[] GetGVMLDataViaAPI()
        {
            try
            {
                Debug.WriteLine("=== 使用Windows API获取剪贴板数据 ===");

                // 使用Windows API获取剪贴板数据
                IntPtr hClipboard = OpenClipboard(IntPtr.Zero);
                if (hClipboard == IntPtr.Zero)
                {
                    int error = Marshal.GetLastWin32Error();
                    Debug.WriteLine($"打开剪贴板失败，错误代码: {error}");
                    return null;
                }

                try
                {
                    // 注册Art::GVML ClipFormat
                    uint gvmlFormat = RegisterClipboardFormat("Art::GVML ClipFormat");
                    if (gvmlFormat == 0)
                    {
                        int error = Marshal.GetLastWin32Error();
                        Debug.WriteLine($"注册剪贴板格式失败，错误代码: {error}");

                        // 尝试其他格式名称
                        string[] possibleFormats = {
                            "Art::GVML",
                            "GVML ClipFormat",
                            "GVML"
                        };

                        foreach (string format in possibleFormats)
                        {
                            gvmlFormat = RegisterClipboardFormat(format);
                            if (gvmlFormat != 0)
                            {
                                Debug.WriteLine($"成功注册格式: '{format}', ID: {gvmlFormat}");
                                break;
                            }
                        }

                        if (gvmlFormat == 0)
                        {
                            Debug.WriteLine("所有格式注册都失败");
                            return null;
                        }
                    }
                    else
                    {
                        Debug.WriteLine($"成功注册格式 'Art::GVML ClipFormat', ID: {gvmlFormat}");
                    }

                    // 获取数据句柄
                    IntPtr hData = GetClipboardData(gvmlFormat);
                    if (hData == IntPtr.Zero)
                    {
                        int error = Marshal.GetLastWin32Error();
                        Debug.WriteLine($"获取剪贴板数据失败，错误代码: {error}");
                        return null;
                    }

                    Debug.WriteLine($"成功获取数据句柄: {hData}");

                    // 锁定内存并复制数据
                    IntPtr pData = GlobalLock(hData);
                    if (pData == IntPtr.Zero)
                    {
                        int error = Marshal.GetLastWin32Error();
                        Debug.WriteLine($"锁定内存失败，错误代码: {error}");
                        return null;
                    }

                    try
                    {
                        // 获取数据大小
                        int dataSize = GlobalSize(hData);
                        Debug.WriteLine($"数据大小: {dataSize} 字节");

                        if (dataSize <= 0)
                        {
                            Debug.WriteLine("数据大小为0或负数");
                            return null;
                        }

                        byte[] data = new byte[dataSize];

                        // 复制数据
                        Marshal.Copy(pData, data, 0, dataSize);
                        Debug.WriteLine($"成功复制 {dataSize} 字节数据");
                        return data;
                    }
                    finally
                    {
                        GlobalUnlock(hData);
                    }
                }
                finally
                {
                    CloseClipboard();
                }
            }
            catch (Exception ex)
            {
                Debug.WriteLine($"通过API获取GVML数据失败: {ex.Message}");
                Debug.WriteLine($"异常堆栈: {ex.StackTrace}");
                return null;
            }
        }


        // 获取图片数据
        private byte[] GetImageDataFromShape(PowerPoint.Shape shape)
        {
        }

        // 将数据转换为字节数组
        private byte[] ConvertDataToBytes(object data)
        {
          
        }


        // API Key管理方法 - 已过时，使用新的插件设置窗口管理API Key
        [System.Obsolete("此方法已过时，请使用GetApiKeyFromRegistry(string platformName)方法")]
        private string GetApiKey()
        {
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

        // 查找具有指定ID的形状
        private DocumentFormat.OpenXml.OpenXmlElement FindShapeById(DocumentFormat.OpenXml.Presentation.Slide slide, string shapeId)
        {
            try
            {
                Debug.WriteLine($"开始查找形状ID: {shapeId}");

                // 查找具有指定ID的形状
                var shapeElements = slide.Descendants<DocumentFormat.OpenXml.Presentation.Shape>();
                Debug.WriteLine($"找到 {shapeElements.Count()} 个Shape元素");

                foreach (var shape in shapeElements)
                {
                    var id = shape.NonVisualShapeProperties?.NonVisualDrawingProperties?.Id?.Value;
                    Debug.WriteLine($"检查Shape元素，ID: {id}");

                    if (shape.NonVisualShapeProperties != null &&
                        shape.NonVisualShapeProperties.NonVisualDrawingProperties != null &&
                        shape.NonVisualShapeProperties.NonVisualDrawingProperties.Id != null &&
                        shape.NonVisualShapeProperties.NonVisualDrawingProperties.Id.Value.ToString() == shapeId)
                    {
                        Debug.WriteLine($"找到匹配的Shape元素，ID: {shapeId}");
                        return shape;
                    }
                }

                // 如果没找到，尝试查找图片形状
                var pictureElements = slide.Descendants<DocumentFormat.OpenXml.Presentation.Picture>();
                Debug.WriteLine($"找到 {pictureElements.Count()} 个Picture元素");

                foreach (var picture in pictureElements)
                {
                    var id = picture.NonVisualPictureProperties?.NonVisualDrawingProperties?.Id?.Value;
                    Debug.WriteLine($"检查Picture元素，ID: {id}");

                    if (picture.NonVisualPictureProperties != null &&
                        picture.NonVisualPictureProperties.NonVisualDrawingProperties != null &&
                        picture.NonVisualPictureProperties.NonVisualDrawingProperties.Id != null &&
                        picture.NonVisualPictureProperties.NonVisualDrawingProperties.Id.Value.ToString() == shapeId)
                    {
                        Debug.WriteLine($"找到匹配的Picture元素，ID: {shapeId}");
                        return picture;
                    }
                }

                // 如果还是没找到，尝试查找所有可能的形状类型
                Debug.WriteLine("尝试查找所有可能的形状类型...");
                var allShapes = slide.Descendants<DocumentFormat.OpenXml.OpenXmlElement>()
                    .Where(e => e is DocumentFormat.OpenXml.Presentation.Shape ||
                               e is DocumentFormat.OpenXml.Presentation.Picture ||
                               e is DocumentFormat.OpenXml.Presentation.GroupShape ||
                               e is DocumentFormat.OpenXml.Presentation.GraphicFrame);

                Debug.WriteLine($"总共找到 {allShapes.Count()} 个形状元素");

                foreach (var element in allShapes)
                {
                    string elementType = element.GetType().Name;
                    string elementId = "未知";

                    // 尝试获取ID
                    if (element is DocumentFormat.OpenXml.Presentation.Shape shape)
                    {
                        var id = shape.NonVisualShapeProperties?.NonVisualDrawingProperties?.Id?.Value;
                        elementId = id?.ToString() ?? "无ID";
                    }
                    else if (element is DocumentFormat.OpenXml.Presentation.Picture picture)
                    {
                        var id = picture.NonVisualPictureProperties?.NonVisualDrawingProperties?.Id?.Value;
                        elementId = id?.ToString() ?? "无ID";
                    }
                    else if (element is DocumentFormat.OpenXml.Presentation.GroupShape groupShape)
                    {
                        var id = groupShape.NonVisualGroupShapeProperties?.NonVisualDrawingProperties?.Id?.Value;
                        elementId = id?.ToString() ?? "无ID";
                    }
                    else if (element is DocumentFormat.OpenXml.Presentation.GraphicFrame graphicFrame)
                    {
                        var id = graphicFrame.NonVisualGraphicFrameProperties?.NonVisualDrawingProperties?.Id?.Value;
                        elementId = id?.ToString() ?? "无ID";
                    }

                    Debug.WriteLine($"形状类型: {elementType}, ID: {elementId}");
                }

                Debug.WriteLine($"未找到ID为 {shapeId} 的形状");
                return null;
            }
            catch (Exception ex)
            {
                Debug.WriteLine($"查找形状失败: {ex.Message}");
                return null;
            }
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