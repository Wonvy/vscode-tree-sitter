using DocumentFormat.OpenXml;
using DocumentFormat.OpenXml.Drawing;
using DocumentFormat.OpenXml.Packaging;
using DocumentFormat.OpenXml.Presentation;
using Microsoft.Office.Interop.PowerPoint;
using Microsoft.Office.Tools.Ribbon;
using Microsoft.Win32;
using System;
using System.Collections.Generic;
using System.Diagnostics;
using System.Drawing;
using System.Drawing.Drawing2D;
using System.IO;
using System.IO.Compression;
using System.Linq;
using System.Net.Http;
using System.Runtime.InteropServices;
using System.Text;
using System.Threading.Tasks;
using System.Windows.Forms;
using System.Xml.Linq;
using Office = Microsoft.Office.Core;
using PowerPoint = Microsoft.Office.Interop.PowerPoint;
using shibappt.Core.Utils; // 添加PathHelper引用
using shibappt.mod_translation; // 添加翻译模块引用

namespace shibappt
{
    public partial class Ribbon1
    {
        // 边框管理
        private static shibappt.SmartOutlineForm currentOutlineForm = null;

        private void Ribbon1_Load(object sender, RibbonUIEventArgs e)
        {
            // 设置TLS版本以支持现代HTTPS连接
            System.Net.ServicePointManager.SecurityProtocol =
                System.Net.SecurityProtocolType.Tls12 |
                System.Net.SecurityProtocolType.Tls11 |
                System.Net.SecurityProtocolType.Tls;

            // 初始化comboBox1的语言选项
            InitializeLanguageComboBox();
        }

        // 初始化语言选择下拉框1
        private void InitializeLanguageComboBox()
        {
            try
            {
                // 清空现有选项
                comboBox1.Items.Clear();

                // 创建语言选项数组
                string[] languages = {
                    "中文", "英语", "日语", "韩语", "法语",
                    "德语", "西班牙语", "意大利语", "葡萄牙语", "俄语"
                };

                // 添加语言选项
                foreach (string language in languages)
                {
                    var item = this.Factory.CreateRibbonDropDownItem();
                    item.Label = language;
                    comboBox1.Items.Add(item);
                }

                // 设置默认选择为英语
                comboBox1.Text = "英语";

                Debug.WriteLine("语言选择下拉框初始化完成，默认选择：英语");
            }
            catch (Exception ex)
            {
                Debug.WriteLine($"初始化语言选择下拉框失败: {ex.Message}");
            }
        }


        // <summary>
        // 解密API Key（Base64解码）
        // </summary>
        // <param name="encryptedText">加密的文本</param>
        // <returns>解密后的文本</returns>
        private string DecryptApiKey(string encryptedText)
        {
            try
            {
                var bytes = Convert.FromBase64String(encryptedText);
                return Encoding.UTF8.GetString(bytes);
            }
            catch
            {
                return encryptedText;
            }
        }

        // <summary>
        // 从注册表获取指定平台的API Key
        // </summary>
        // <param name="platformName">平台名称</param>
        // <returns>API Key，如果未找到返回null</returns>
        private string GetApiKeyFromRegistry(string platformName)
        {
            try
            {
                const string REGISTRY_KEY = @"SOFTWARE\ShibAppt\ApiKeys";

                using (var key = Registry.CurrentUser.OpenSubKey(REGISTRY_KEY))
                {
                    if (key != null)
                    {
                        var valueNames = key.GetValueNames();

                        foreach (var valueName in valueNames)
                        {
                            var encryptedData = key.GetValue(valueName) as string;
                            if (!string.IsNullOrEmpty(encryptedData))
                            {
                                try
                                {
                                    var decryptedData = DecryptApiKey(encryptedData);
                                    var parts = decryptedData.Split('|');
                                    if (parts.Length >= 2 && parts[0].Equals(platformName, StringComparison.OrdinalIgnoreCase))
                                    {
                                        Debug.WriteLine($"从注册表获取到 {platformName} 的API Key");
                                        return parts[1];
                                    }
                                }
                                catch (Exception ex)
                                {
                                    Debug.WriteLine($"解密API Key失败 {valueName}: {ex.Message}");
                                }
                            }
                        }
                    }
                }

                Debug.WriteLine($"未找到 {platformName} 的API Key");
                return null;
            }
            catch (Exception ex)
            {
                Debug.WriteLine($"从注册表获取API Key失败: {ex.Message}");
                return null;
            }
        }



        // 图片抠图处理按钮点击事件
        private async void button1_Click(object sender, RibbonControlEventArgs e)
        {
            try
            {
                Debug.WriteLine("=== 开始图片抠图处理 ===");

                // 从注册表获取koukoutu的API Key
                string apiKey = Core.Utils.PathHelper.GetApiKeyFromRegistry("koukoutu");
                if (string.IsNullOrEmpty(apiKey))
                {
                    string errorInfo = "请先在插件设置中配置koukoutu的API Key！";
                    Debug.WriteLine(errorInfo);
                    MessageBox.Show(errorInfo, "提示", MessageBoxButtons.OK, MessageBoxIcon.Information);
                    return;
                }

                // 测试网络连接
                if (!await TestNetworkConnection())
                {
                    string errorInfo = "网络连接测试失败，请检查网络连接。";
                    Debug.WriteLine(errorInfo);
                    MessageBox.Show(errorInfo, "网络错误", MessageBoxButtons.OK, MessageBoxIcon.Error);
                    return;
                }

                Debug.WriteLine("网络连接测试通过");

                // 获取当前PowerPoint应用程序
                PowerPoint.Application app = Globals.ThisAddIn.Application;
                if (app == null || app.ActivePresentation == null)
                {
                    string errorInfo = "请先打开一个PowerPoint演示文稿。";
                    Debug.WriteLine(errorInfo);
                    MessageBox.Show(errorInfo, "提示", MessageBoxButtons.OK, MessageBoxIcon.Information);
                    return;
                }

                var presentation = app.ActivePresentation;
                var slide = app.ActiveWindow.View.Slide;

                if (slide == null)
                {
                    string errorInfo = "无法获取当前幻灯片。";
                    Debug.WriteLine(errorInfo);
                    MessageBox.Show(errorInfo, "错误", MessageBoxButtons.OK, MessageBoxIcon.Error);
                    return;
                }

                Debug.WriteLine($"当前幻灯片索引: {slide.SlideIndex + 1}");

                // 获取当前选中的图片
                var imageInfo = GetSelectedImageInfo(slide);

                if (imageInfo == null || imageInfo.ImageBytes == null)
                {
                    string errorInfo = "请先选中一张图片。";
                    Debug.WriteLine(errorInfo);
                    //MessageBox.Show(errorInfo, "提示", MessageBoxButtons.OK, MessageBoxIcon.Information);
                    return;
                }

                Debug.WriteLine($"成功获取图片，开始API处理...");

                // 显示处理中的提示
                string processInfo = "正在处理图片，请稍候...";
                Debug.WriteLine(processInfo);
                //MessageBox.Show(processInfo, "处理中", MessageBoxButtons.OK, MessageBoxIcon.Information);

                // 调用抠图API处理图片
                var processedImageBytes = await ProcessImageWithKoukoutu(imageInfo.ImageBytes);

                if (processedImageBytes != null)
                {
                    Debug.WriteLine("API处理成功，开始插入图片...");

                    // 将处理后的图片插入到当前幻灯片，并删除原图片
                    InsertImageToSlide(slide, processedImageBytes, imageInfo);

                    string successInfo = "图片抠图完成并已插入到当前幻灯片！";
                    Debug.WriteLine(successInfo);
                    //MessageBox.Show(successInfo, "成功", MessageBoxButtons.OK, MessageBoxIcon.Information);
                }
                else
                {
                    string errorInfo = "图片处理失败。";
                    Debug.WriteLine(errorInfo);
                    MessageBox.Show(errorInfo, "错误", MessageBoxButtons.OK, MessageBoxIcon.Error);
                }

                Debug.WriteLine("=== 图片抠图处理结束 ===");
            }
            catch (Exception ex)
            {
                string errorInfo = $"发生错误: {ex.Message}";
                Debug.WriteLine(errorInfo);
                MessageBox.Show(errorInfo, "错误", MessageBoxButtons.OK, MessageBoxIcon.Error);
            }
        }

        // 图片信息类
        public class ImageInfo
        {
            public byte[] ImageBytes { get; set; }
            public PowerPoint.Shape OriginalShape { get; set; }
            public float Left { get; set; }
            public float Top { get; set; }
            public float Width { get; set; }
            public float Height { get; set; }
        }

        private ImageInfo GetSelectedImageInfo(PowerPoint.Slide slide)
        {
            try
            {
                Debug.WriteLine("开始获取选中图片信息...");

                // 方法1：通过Selection获取
                var result = GetImageInfoFromSelection(slide);
                if (result != null)
                {
                    Debug.WriteLine("方法1成功获取图片信息");
                    return result;
                }

                // 方法2：遍历幻灯片中的所有图片
                string debugInfo = "尝试从幻灯片中查找图片...";
                Debug.WriteLine(debugInfo);
                return GetImageInfoFromSlide(slide);
            }
            catch (Exception ex)
            {
                string errorInfo = $"获取选中图片信息时发生错误: {ex.Message}";
                Debug.WriteLine(errorInfo);
                return null;
            }
        }

        // 获取图片
        private ImageInfo GetImageInfoFromSelection(PowerPoint.Slide slide)
        {
            try
            {
                // 获取当前选中的形状
                var selection = slide.Application.ActiveWindow.Selection;

                string debugInfo = $"选中对象数量: {selection.ShapeRange.Count}";
                Debug.WriteLine(debugInfo);

                // 检查是否有选中的形状
                if (selection.ShapeRange.Count > 0)
                {
                    foreach (PowerPoint.Shape shape in selection.ShapeRange)
                    {
                        debugInfo = $"形状类型: {shape.Type}";
                        Debug.WriteLine(debugInfo);

                        // 检查形状类型是否为图片 (msoPicture = 13)
                        if ((int)shape.Type == 13)
                        {
                            debugInfo = "找到图片形状，正在获取图片数据...";
                            Debug.WriteLine(debugInfo);

                            try
                            {
                                // 获取图片数据
                                var imageBytes = GetImageDataFromShape(shape);
                                if (imageBytes != null)
                                {
                                    // 获取位置和大小信息
                                    var imageInfo = new ImageInfo
                                    {
                                        ImageBytes = imageBytes,
                                        OriginalShape = shape,
                                        Left = shape.Left,
                                        Top = shape.Top,
                                        Width = shape.Width,
                                        Height = shape.Height
                                    };

                                    debugInfo = $"成功获取图片信息：位置({imageInfo.Left}, {imageInfo.Top})，大小({imageInfo.Width} x {imageInfo.Height})";
                                    Debug.WriteLine(debugInfo);
                                    return imageInfo;
                                }
                            }
                            catch (Exception ex)
                            {
                                debugInfo = $"获取图片数据时出错: {ex.Message}";
                                Debug.WriteLine(debugInfo);
                            }
                        }
                        else
                        {
                            debugInfo = $"形状类型 {shape.Type} 不是图片类型";
                            Debug.WriteLine(debugInfo);
                        }
                    }
                }
                else
                {
                    debugInfo = "没有选中任何形状";
                    Debug.WriteLine(debugInfo);
                }

                return null;
            }
            catch (Exception ex)
            {
                string errorInfo = $"从选择中获取图片信息失败: {ex.Message}";
                Debug.WriteLine(errorInfo);
                return null;
            }
        }

        private ImageInfo GetImageInfoFromSlide(PowerPoint.Slide slide)
        {
            try
            {
                var shapes = slide.Shapes;
                string debugInfo = $"幻灯片中形状总数: {shapes.Count}";
                Debug.WriteLine(debugInfo);

                int imageCount = 0;
                foreach (PowerPoint.Shape shape in shapes)
                {
                    debugInfo = $"检查形状 {imageCount + 1}，类型: {shape.Type}";
                    Debug.WriteLine(debugInfo);

                    if ((int)shape.Type == 13) // msoPicture
                    {
                        imageCount++;
                        debugInfo = $"找到第 {imageCount} 个图片形状，正在获取图片数据...";
                        Debug.WriteLine(debugInfo);

                        // 尝试多种方法获取图片数据
                        var imageBytes = GetImageDataFromShape(shape);
                        if (imageBytes != null)
                        {
                            var imageInfo = new ImageInfo
                            {
                                ImageBytes = imageBytes,
                                OriginalShape = shape,
                                Left = shape.Left,
                                Top = shape.Top,
                                Width = shape.Width,
                                Height = shape.Height
                            };

                            debugInfo = $"成功获取第 {imageCount} 个图片信息：位置({imageInfo.Left}, {imageInfo.Top})，大小({imageInfo.Width} x {imageInfo.Height})";
                            Debug.WriteLine(debugInfo);
                            return imageInfo;
                        }
                    }
                }

                debugInfo = $"幻灯片中总共找到 {imageCount} 个图片，但都无法获取数据";
                Debug.WriteLine(debugInfo);
                return null;
            }
            catch (Exception ex)
            {
                string errorInfo = $"从幻灯片获取图片信息失败: {ex.Message}";
                Debug.WriteLine(errorInfo);
                return null;
            }
        }

        private byte[] GetImageDataFromShape(PowerPoint.Shape shape)
        {
            try
            {
                // 方法1：直接导出图片（最快最可靠）
                string debugInfo = "方法1：尝试直接导出图片...";
                Debug.WriteLine(debugInfo);

                try
                {
                    string tempPath = System.IO.Path.GetTempFileName() + ".png";
                    shape.Export(tempPath, PowerPoint.PpShapeFormat.ppShapeFormatPNG);

                    if (System.IO.File.Exists(tempPath))
                    {
                        var imageBytes = System.IO.File.ReadAllBytes(tempPath);
                        System.IO.File.Delete(tempPath);

                        debugInfo = $"方法1成功：导出图片大小 {imageBytes.Length} 字节";
                        Debug.WriteLine(debugInfo);
                        return imageBytes;
                    }
                }
                catch (Exception ex)
                {
                    debugInfo = $"方法1失败：{ex.Message}";
                    Debug.WriteLine(debugInfo);
                }

                // 方法2：通过Open XML SDK获取原始图片
                debugInfo = "方法2：尝试通过Open XML SDK获取原始图片...";
                Debug.WriteLine(debugInfo);

                var originalImageBytes = GetOriginalImageFromOpenXml(shape);
                if (originalImageBytes != null)
                {
                    debugInfo = $"方法2成功：通过Open XML获取原始图片大小 {originalImageBytes.Length} 字节";
                    Debug.WriteLine(debugInfo);
                    return originalImageBytes;
                }

                // 方法3：尝试从GVML数据直接提取图片（最后尝试，因为需要等待剪贴板）
                debugInfo = "方法3：尝试从GVML数据直接提取图片...";
                Debug.WriteLine(debugInfo);

                var gvmlImageBytes = GetImageFromGVMLData(shape);
                if (gvmlImageBytes != null)
                {
                    debugInfo = $"方法3成功：从GVML数据提取图片大小 {gvmlImageBytes.Length} 字节";
                    Debug.WriteLine(debugInfo);
                    return gvmlImageBytes;
                }

                debugInfo = "所有方法都失败了";
                Debug.WriteLine(debugInfo);
                return null;
            }
            catch (Exception ex)
            {
                string errorInfo = $"获取图片数据时出错: {ex.Message}";
                Debug.WriteLine(errorInfo);
                return null;
            }
        }

        // 从GVML数据中直接提取图片
        private byte[] GetImageFromGVMLData(PowerPoint.Shape shape)
        {
            try
            {
                Debug.WriteLine("=== 尝试从GVML数据提取图片 ===");

                // 1. 使用SendKeys方法复制形状到剪贴板
                Debug.WriteLine("使用SendKeys方法复制形状到剪贴板...");
                bool copySuccess = FastCopyUsingSendKeys();
                if (!copySuccess)
                {
                    Debug.WriteLine("SendKeys复制失败");
                    return null;
                }

                // 2. 等待剪贴板数据可用
                bool dataAvailable = WaitForClipboardData(5000, 100);
                if (!dataAvailable)
                {
                    Debug.WriteLine("剪贴板数据等待超时");
                    return null;
                }

                // 3. 获取GVML数据
                Debug.WriteLine("获取GVML数据...");
                var gvmlData = GetGVMLDataFromClipboard();
                if (gvmlData == null || gvmlData.Length == 0)
                {
                    Debug.WriteLine("未能获取GVML数据");
                    return null;
                }

                Debug.WriteLine($"获取到GVML数据，大小: {gvmlData.Length} 字节");

                // 4. 直接从GVML数据中提取图片
                var imageBytes = ExtractImageFromGVMLData(gvmlData);
                if (imageBytes != null)
                {
                    Debug.WriteLine($"成功从GVML数据提取图片，大小: {imageBytes.Length} 字节");
                    return imageBytes;
                }

                Debug.WriteLine("从GVML数据提取图片失败");
                return null;
            }
            catch (Exception ex)
            {
                Debug.WriteLine($"从GVML数据提取图片时出错: {ex.Message}");
                return null;
            }
        }

        private byte[] GetOriginalImageFromOpenXml(PowerPoint.Shape shape)
        {
            try
            {
                // 获取当前演示文稿的路径
                var presentation = shape.Parent.Parent as PowerPoint.Presentation;
                if (presentation == null)
                {
                    Debug.WriteLine("无法获取演示文稿对象");
                    return null;
                }

                string presentationPath = presentation.FullName;
                if (string.IsNullOrEmpty(presentationPath) || !System.IO.File.Exists(presentationPath))
                {
                    Debug.WriteLine("演示文稿文件不存在或未保存");
                    return null;
                }

                Debug.WriteLine($"演示文稿路径: {presentationPath}");

                // 获取形状的ID
                string shapeId = shape.Id.ToString();
                Debug.WriteLine($"形状ID: {shapeId}");

                // 获取当前幻灯片索引
                var slide = shape.Parent as PowerPoint.Slide;
                int slideIndex = slide.SlideIndex - 1; // Open XML中索引从0开始
                Debug.WriteLine($"幻灯片索引: {slideIndex}");
                Debug.WriteLine($"PowerPoint中的幻灯片索引: {slide.SlideIndex}");
                // 移除对SlideID的引用，因为该属性不存在

                using (var presentationDocument = DocumentFormat.OpenXml.Packaging.PresentationDocument.Open(presentationPath, false))
                {
                    var presentationPart = presentationDocument.PresentationPart;
                    if (presentationPart == null)
                    {
                        Debug.WriteLine("无法获取演示文稿部分");
                        return null;
                    }

                    var slideParts = presentationPart.SlideParts.ToList();
                    Debug.WriteLine($"Open XML中找到 {slideParts.Count} 个幻灯片");

                    if (slideIndex >= slideParts.Count)
                    {
                        Debug.WriteLine($"幻灯片索引超出范围: {slideIndex} >= {slideParts.Count}");
                        return null;
                    }

                    var slidePart = slideParts[slideIndex];
                    Debug.WriteLine($"找到幻灯片部分: {slideIndex}");

                    // 移除对SlideId的检查，因为该属性不存在

                    // 检查幻灯片中的形状数量
                    var allShapesInSlide = slidePart.Slide.Descendants<DocumentFormat.OpenXml.OpenXmlElement>()
                        .Where(e => e is DocumentFormat.OpenXml.Presentation.Shape ||
                                   e is DocumentFormat.OpenXml.Presentation.Picture ||
                                   e is DocumentFormat.OpenXml.Presentation.GroupShape ||
                                   e is DocumentFormat.OpenXml.Presentation.GraphicFrame);
                    Debug.WriteLine($"幻灯片中总共有 {allShapesInSlide.Count()} 个形状元素");

                    // 查找形状
                    var shapeElement = FindShapeById(slidePart.Slide, shapeId);
                    if (shapeElement == null)
                    {
                        Debug.WriteLine($"未找到ID为 {shapeId} 的形状");
                        return null;
                    }

                    Debug.WriteLine("找到形状元素，开始提取图片...");

                    // 提取图片数据
                    var imageBytes = ExtractImageFromShape(slidePart, shapeElement);
                    if (imageBytes != null)
                    {
                        Debug.WriteLine($"成功提取图片，大小: {imageBytes.Length} 字节");
                        return imageBytes;
                    }
                }

                return null;
            }
            catch (Exception ex)
            {
                Debug.WriteLine($"Open XML提取图片失败: {ex.Message}");
                return null;
            }
        }

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

        private byte[] ExtractImageFromShape(DocumentFormat.OpenXml.Packaging.SlidePart slidePart, DocumentFormat.OpenXml.OpenXmlElement shapeElement)
        {
            try
            {
                // 方法1：从图片形状中提取
                if (shapeElement is DocumentFormat.OpenXml.Presentation.Picture picture)
                {
                    return ExtractImageFromPicture(slidePart, picture);
                }

                // 方法2：从形状的填充中提取
                if (shapeElement is DocumentFormat.OpenXml.Presentation.Shape shape)
                {
                    return ExtractImageFromShapeFill(slidePart, shape);
                }

                return null;
            }
            catch (Exception ex)
            {
                Debug.WriteLine($"提取图片失败: {ex.Message}");
                return null;
            }
        }

        private byte[] ExtractImageFromPicture(DocumentFormat.OpenXml.Packaging.SlidePart slidePart, DocumentFormat.OpenXml.Presentation.Picture picture)
        {
            try
            {
                // 使用Descendants方法查找BlipFill
                var blipFill = picture.Descendants<DocumentFormat.OpenXml.Drawing.BlipFill>().FirstOrDefault();
                if (blipFill?.Blip?.Embed?.Value == null)
                {
                    Debug.WriteLine("图片没有嵌入引用");
                    return null;
                }

                string imageId = blipFill.Blip.Embed.Value;
                Debug.WriteLine($"图片ID: {imageId}");

                // 从媒体部分获取图片
                var imagePart = slidePart.GetPartById(imageId) as DocumentFormat.OpenXml.Packaging.ImagePart;
                if (imagePart == null)
                {
                    Debug.WriteLine("无法获取图片部分");
                    return null;
                }

                using (var stream = imagePart.GetStream())
                {
                    var imageBytes = new byte[stream.Length];
                    stream.Read(imageBytes, 0, imageBytes.Length);
                    Debug.WriteLine($"成功从图片部分提取，大小: {imageBytes.Length} 字节");
                    return imageBytes;
                }
            }
            catch (Exception ex)
            {
                Debug.WriteLine($"从图片形状提取失败: {ex.Message}");
                return null;
            }
        }

        private byte[] ExtractImageFromShapeFill(DocumentFormat.OpenXml.Packaging.SlidePart slidePart, DocumentFormat.OpenXml.Presentation.Shape shape)
        {
            try
            {
                // 使用Descendants方法查找BlipFill
                var blipFill = shape.Descendants<DocumentFormat.OpenXml.Drawing.BlipFill>().FirstOrDefault();
                if (blipFill?.Blip?.Embed?.Value == null)
                {
                    Debug.WriteLine("形状没有图片填充");
                    return null;
                }

                string imageId = blipFill.Blip.Embed.Value;
                Debug.WriteLine($"填充图片ID: {imageId}");

                // 从媒体部分获取图片
                var imagePart = slidePart.GetPartById(imageId) as DocumentFormat.OpenXml.Packaging.ImagePart;
                if (imagePart == null)
                {
                    Debug.WriteLine("无法获取填充图片部分");
                    return null;
                }

                using (var stream = imagePart.GetStream())
                {
                    var imageBytes = new byte[stream.Length];
                    stream.Read(imageBytes, 0, imageBytes.Length);
                    Debug.WriteLine($"成功从填充图片部分提取，大小: {imageBytes.Length} 字节");
                    return imageBytes;
                }
            }
            catch (Exception ex)
            {
                Debug.WriteLine($"从形状填充提取失败: {ex.Message}");
                return null;
            }
        }

        private async Task<byte[]> ProcessImageWithKoukoutu(byte[] imageBytes)
        {
            string apiKey = Core.Utils.PathHelper.GetApiKeyFromRegistry("koukoutu");
            if (string.IsNullOrEmpty(apiKey))
            {
                MessageBox.Show("请先在插件设置中配置koukoutu的API Key！", "提示", MessageBoxButtons.OK, MessageBoxIcon.Information);
                return null;
            }

            const string apiUrl = "https://sync.koukoutu.com/v1/create";

            using (var httpClient = new HttpClient())
            {
                httpClient.Timeout = TimeSpan.FromMinutes(2);
                httpClient.DefaultRequestHeaders.Add("X-API-Key", apiKey);

                // 设置TLS
                System.Net.ServicePointManager.SecurityProtocol =
                    System.Net.SecurityProtocolType.Tls12 |
                    System.Net.SecurityProtocolType.Tls11 |
                    System.Net.SecurityProtocolType.Tls;

                try
                {
                    using (var formData = new MultipartFormDataContent())
                    {
                        // 1. 直接上传图片文件流
                        var fileContent = new ByteArrayContent(imageBytes);
                        fileContent.Headers.ContentType = new System.Net.Http.Headers.MediaTypeHeaderValue("image/png");
                        formData.Add(fileContent, "image_file", "image.png");

                        // 2. 其它参数
                        formData.Add(new StringContent("background-removal"), "model_key");
                        formData.Add(new StringContent("png"), "output_format");
                        formData.Add(new StringContent("0"), "crop");

                        // 3. 发送POST请求
                        var response = await httpClient.PostAsync(apiUrl, formData);
                        var responseContent = await response.Content.ReadAsStringAsync();

                        if (response.IsSuccessStatusCode)
                        {
                            // 返回图片二进制
                            return await response.Content.ReadAsByteArrayAsync();
                        }
                        else
                        {
                            MessageBox.Show($"HTTP请求失败: {response.StatusCode} - {responseContent}", "网络错误", MessageBoxButtons.OK, MessageBoxIcon.Error);
                            return null;
                        }
                    }
                }
                catch (Exception ex)
                {
                    MessageBox.Show($"网络请求异常: {ex.Message}", "网络错误", MessageBoxButtons.OK, MessageBoxIcon.Error);
                    return null;
                }
            }
        }

        private void InsertImageToSlide(PowerPoint.Slide slide, byte[] imageBytes, ImageInfo originalImageInfo)
        {
            // 创建临时文件
            string tempPath = System.IO.Path.GetTempFileName() + ".png";
            System.IO.File.WriteAllBytes(tempPath, imageBytes);

            try
            {
                // 获取幻灯片形状集合
                var shapes = slide.Shapes;

                // 使用原图片的位置和大小
                float left = originalImageInfo.Left;
                float top = originalImageInfo.Top;
                float width = originalImageInfo.Width;
                float height = originalImageInfo.Height;

                Debug.WriteLine($"插入图片：位置({left}, {top})，大小({width} x {height})");

                // 插入图片
                var picture = shapes.AddPicture(tempPath, Office.MsoTriState.msoFalse,
                    Office.MsoTriState.msoTrue, left, top, width, height);

                // 删除原来的图片
                if (originalImageInfo.OriginalShape != null)
                {
                    originalImageInfo.OriginalShape.Delete();
                    Debug.WriteLine("已删除原图片");
                }

                // 自动打开图片文件
                try
                {
                    Debug.WriteLine($"正在打开图片文件: {tempPath}");
                    // Process.Start("explorer.exe", $"/select,\"{tempPath}\"");
                    Debug.WriteLine("图片文件已打开");
                }
                catch (Exception ex)
                {
                    Debug.WriteLine($"打开图片文件失败: {ex.Message}");
                    // 尝试使用默认程序打开
                    try
                    {
                        Process.Start(tempPath);
                        Debug.WriteLine("使用默认程序打开图片成功");
                    }
                    catch (Exception ex2)
                    {
                        Debug.WriteLine($"使用默认程序打开图片也失败: {ex2.Message}");
                    }
                }

                // 清理临时文件
                if (System.IO.File.Exists(tempPath))
                {
                    System.IO.File.Delete(tempPath);
                }
            }
            catch (Exception ex)
            {
                MessageBox.Show($"插入图片时发生错误: {ex.Message}", "错误", MessageBoxButtons.OK, MessageBoxIcon.Error);
            }
        }

        // 测试网络连接的方法
        private async Task<bool> TestNetworkConnection()
        {
            try
            {
                // 设置TLS版本
                System.Net.ServicePointManager.SecurityProtocol =
                    System.Net.SecurityProtocolType.Tls12 |
                    System.Net.SecurityProtocolType.Tls11 |
                    System.Net.SecurityProtocolType.Tls;

                using (var httpClient = new HttpClient())
                {
                    httpClient.Timeout = TimeSpan.FromSeconds(10);
                    var response = await httpClient.GetAsync("https://www.baidu.com");
                    return response.IsSuccessStatusCode;
                }
            }
            catch (Exception ex)
            {
                Debug.WriteLine($"网络连接测试失败: {ex.Message}");
                return false;
            }
        }

        // 测试API连接的方法
        private async Task<bool> TestApiConnection()
        {
            string apiKey = Core.Utils.PathHelper.GetApiKeyFromRegistry("koukoutu");
            if (string.IsNullOrEmpty(apiKey))
            {
                return false;
            }

            const string apiUrl = "https://sync.koukoutu.com/v1/create";

            using (var httpClient = new HttpClient())
            {
                httpClient.DefaultRequestHeaders.Add("X-API-Key", apiKey);
                httpClient.Timeout = TimeSpan.FromSeconds(30);

                try
                {
                    // 发送一个简单的测试请求
                    var response = await httpClient.GetAsync($"{apiUrl}?model_key=background-removal");
                    return response.IsSuccessStatusCode;
                }
                catch
                {
                    return false;
                }
            }
        }

        // API Key管理方法 - 已过时，使用新的插件设置窗口管理API Key
        [System.Obsolete("此方法已过时，请使用GetApiKeyFromRegistry(string platformName)方法")]
        private string GetApiKey()
        {
            try
            {
                using (RegistryKey key = Registry.CurrentUser.OpenSubKey(@"SOFTWARE\ShibAppt", false))
                {
                    if (key != null)
                    {
                        return key.GetValue("ApiKey") as string;
                    }
                }
            }
            catch (Exception ex)
            {
                Debug.WriteLine($"读取API Key失败: {ex.Message}");
            }
            return null;
        }

        [System.Obsolete("此方法已过时，请使用插件设置窗口管理API Key")]
        private void SaveApiKey(string apiKey)
        {
            try
            {
                using (RegistryKey key = Registry.CurrentUser.CreateSubKey(@"SOFTWARE\ShibAppt"))
                {
                    if (key != null)
                    {
                        key.SetValue("ApiKey", apiKey);
                        Debug.WriteLine("API Key已保存到注册表");
                    }
                }
            }
            catch (Exception ex)
            {
                Debug.WriteLine($"保存API Key失败: {ex.Message}");
                MessageBox.Show($"保存API Key失败: {ex.Message}", "错误", MessageBoxButtons.OK, MessageBoxIcon.Error);
            }
        }

        private void button2_Click(object sender, RibbonControlEventArgs e)
        {
            try
            {
                // 打开插件设置窗口
                var settingsWindow = new PluginSettingsWindow();
                settingsWindow.ShowDialog();
            }
            catch (Exception ex)
            {
                Debug.WriteLine($"打开插件设置窗口失败: {ex.Message}");
                MessageBox.Show($"打开插件设置窗口失败: {ex.Message}", "错误", MessageBoxButtons.OK, MessageBoxIcon.Error);
            }
        }

        private void button4_Click(object sender, RibbonControlEventArgs e)
        {
            Form1 form = Form1.GetInstance();
            form.Show(); // 不阻塞当前线程
        }

        private void toggleButton1_Click(object sender, RibbonControlEventArgs e)
        {

        }

        private void button5_Click(object sender, RibbonControlEventArgs e)
        {
            Form1 form = Form1.GetInstance();
            form.Show(); // 不阻塞当前线程
        }

        // 获取选中形状的XML
        private static shibappt.mod_xml.XmlEditorWpfWindow xmlEditorWindow = null;

        private void button6_Click(object sender, RibbonControlEventArgs e)
        {
            try
            {
                if (xmlEditorWindow == null || !xmlEditorWindow.IsVisible)
                {
                    // 创建新的XML编辑器窗口
                    xmlEditorWindow = new shibappt.mod_xml.XmlEditorWpfWindow();

                    // 订阅获取PowerPoint选中元素XML的事件
                    xmlEditorWindow.GetSelectedPowerPointXmlRequested += XmlEditorWindow_GetSelectedPowerPointXmlRequested;

                    // 订阅解析XML到PowerPoint的事件
                    xmlEditorWindow.ParseXmlToPowerPointRequested += XmlEditorWindow_ParseXmlToPowerPointRequested;

                    // 1. 优化：先显示窗口
                    xmlEditorWindow.Show();
                    xmlEditorWindow.Activate();

                    // 2. 自动加载当前PPT到临时文件夹，并选中当前幻灯片
                    System.Threading.Tasks.Task.Run(() =>
                    {
                        try
                        {
                            System.Diagnostics.Debug.WriteLine("开始自动加载当前PPT到临时文件夹");

                            // 获取当前PowerPoint应用
                            var app = Globals.ThisAddIn.Application;
                            if (app?.ActivePresentation == null)
                            {
                                System.Diagnostics.Debug.WriteLine("没有活动的演示文稿");
                                return;
                            }

                            // 获取当前幻灯片索引
                            int currentSlideIndex = 1;
                            try
                            {
                                currentSlideIndex = app.ActiveWindow.View.Slide.SlideIndex;
                                System.Diagnostics.Debug.WriteLine($"当前幻灯片索引: {currentSlideIndex}");
                            }
                            catch (Exception ex)
                            {
                                System.Diagnostics.Debug.WriteLine($"获取当前幻灯片索引失败: {ex.Message}");
                            }

                            // 调用PowerPointXmlService加载PPT文件结构
                            string xmlContent = shibappt.mod_xml.Core.PowerPointXmlService.GetSelectedPowerPointXmlContent(app);

                            // 延迟一下，确保文件树加载完成后再选中文件
                            System.Threading.Thread.Sleep(1000);

                            // 在UI线程中选中当前幻灯片文件
                            xmlEditorWindow.Dispatcher.BeginInvoke(new System.Action(() =>
                            {
                                try
                                {
                                    SelectCurrentSlideInExplorer(currentSlideIndex);
                                }
                                catch (Exception ex)
                                {
                                    System.Diagnostics.Debug.WriteLine($"选中当前幻灯片文件失败: {ex.Message}");
                                }
                            }));
                        }
                        catch (Exception ex)
                        {
                            System.Diagnostics.Debug.WriteLine($"自动加载PPT失败: {ex.Message}");
                        }
                    });
                }
                else
                {
                    // 如果窗口已经存在，将其激活
                    xmlEditorWindow.Activate();

                    // 自动执行一次getSelectedPowerPointXml()
                    System.Threading.Tasks.Task.Delay(200).ContinueWith(_ =>
                    {
                        try
                        {
                            xmlEditorWindow.Dispatcher.Invoke(() =>
                            {
                                // 触发获取PowerPoint选中元素XML的事件
                                xmlEditorWindow.TriggerGetSelectedPowerPointXmlRequest();
                                System.Diagnostics.Debug.WriteLine("窗口激活时自动执行getSelectedPowerPointXml()完成");
                            });
                        }
                        catch (Exception autoEx)
                        {
                            System.Diagnostics.Debug.WriteLine($"窗口激活时自动执行getSelectedPowerPointXml()失败: {autoEx.Message}");
                        }
                    });
                }
            }
            catch (Exception ex)
            {
                System.Windows.Forms.MessageBox.Show($"打开XML编辑器失败: {ex.Message}", "错误",
                    System.Windows.Forms.MessageBoxButtons.OK, System.Windows.Forms.MessageBoxIcon.Error);
            }
        }

        // <summary>
        // 在资源管理器中选中当前幻灯片文件
        // </summary>
        private void SelectCurrentSlideInExplorer(int slideIndex)
        {
            try
            {
                System.Diagnostics.Debug.WriteLine($"尝试选中幻灯片文件: slide{slideIndex}.xml");

                // 构建幻灯片文件路径
                string slideFileName = $"slide{slideIndex}.xml";

                // 发送消息到WebView选中文件
                var message = new
                {
                    action = "selectSlideFile",
                    slideIndex = slideIndex,
                    fileName = slideFileName
                };

                if (xmlEditorWindow != null)
                {
                    xmlEditorWindow.SendMessageToWebView(message);
                    System.Diagnostics.Debug.WriteLine($"已发送选中幻灯片文件的消息: {slideFileName}");
                }
            }
            catch (Exception ex)
            {
                System.Diagnostics.Debug.WriteLine($"选中幻灯片文件失败: {ex.Message}");
            }
        }

        //显示剪贴板图片
        private void button7_Click(object sender, RibbonControlEventArgs e)
        {
            try
            {
                Debug.WriteLine("=== 开始处理GVML数据 ===");

                var app = Globals.ThisAddIn.Application;

                // 检查是否选中了形状
                if (app.ActiveWindow.Selection.Type != PpSelectionType.ppSelectionShapes)
                {
                    string errorMsg = "请先选中一个形状。";
                    Debug.WriteLine(errorMsg);
                    MessageBox.Show(errorMsg, "提示", MessageBoxButtons.OK, MessageBoxIcon.Information);
                    return;
                }

                var shapeRange = app.ActiveWindow.Selection.ShapeRange;
                if (shapeRange.Count == 0)
                {
                    string errorMsg = "未选中任何形状。";
                    Debug.WriteLine(errorMsg);
                    MessageBox.Show(errorMsg, "提示", MessageBoxButtons.OK, MessageBoxIcon.Information);
                    return;
                }

                Debug.WriteLine($"选中了 {shapeRange.Count} 个形状");

                // 1. 使用SendKeys方法复制选中图形到剪贴板
                Debug.WriteLine("正在使用SendKeys方法复制选中图形到剪贴板...");

                bool copySuccess = FastCopyUsingSendKeys();

                if (!copySuccess)
                {
                    Debug.WriteLine("SendKeys复制失败");
                    MessageBox.Show($"复制形状到剪贴板失败。\n请尝试手动复制（Ctrl+C）后再运行此功能。", "错误", MessageBoxButtons.OK, MessageBoxIcon.Error);
                    return;
                }

                Debug.WriteLine("SendKeys复制操作成功");

                // 检查剪贴板是否有内容
                Debug.WriteLine("检查剪贴板内容...");

                // 获取所有剪贴板数据
                GetAllClipboardData();

                // 尝试获取GVML数据的十六进制表示
                string gvmlHexData = GetGVMLDataAsHex();
                if (!string.IsNullOrEmpty(gvmlHexData))
                {
                    Debug.WriteLine($"成功获取GVML十六进制数据，长度: {gvmlHexData.Length}");

                    // 将十六进制字符串转换为字节数组
                    byte[] gvmlData = HexStringToByteArray(gvmlHexData);
                    Debug.WriteLine($"转换为字节数组，大小: {gvmlData.Length} 字节");

                    // 检查数据的前几个字节，判断是否为有效的zip文件
                    if (gvmlData.Length >= 4)
                    {
                        string header = BitConverter.ToString(gvmlData.Take(4).ToArray());
                        Debug.WriteLine($"数据头部: {header}");

                        // ZIP文件的魔数是 50 4B 03 04
                        if (gvmlData[0] == 0x50 && gvmlData[1] == 0x4B && gvmlData[2] == 0x03 && gvmlData[3] == 0x04)
                        {
                            Debug.WriteLine("数据头部匹配ZIP文件格式");
                        }
                        else
                        {
                            Debug.WriteLine("警告：数据头部不匹配ZIP文件格式");
                        }
                    }

                    // 3. 将数据存储为临时zip文件并解压
                    Debug.WriteLine("开始解压GVML数据...");
                    string tempDir = ExtractGVMLData(gvmlData);

                    if (!string.IsNullOrEmpty(tempDir))
                    {
                        Debug.WriteLine($"解压成功，目录: {tempDir}");

                        // 检查解压后的文件
                        try
                        {
                            var files = Directory.GetFiles(tempDir, "*", SearchOption.AllDirectories);
                            Debug.WriteLine($"解压后找到 {files.Length} 个文件");
                            foreach (var file in files.Take(5)) // 只显示前5个文件
                            {
                                Debug.WriteLine($"  - {file}");
                            }
                        }
                        catch (Exception ex)
                        {
                            Debug.WriteLine($"检查解压文件失败: {ex.Message}");
                        }

                        // 打开解压后的文件夹
                        try
                        {
                            Process.Start("explorer.exe", tempDir);
                            string successMsg = $"GVML数据已解压到: {tempDir}";
                            Debug.WriteLine(successMsg);
                            MessageBox.Show(successMsg, "成功", MessageBoxButtons.OK, MessageBoxIcon.Information);
                        }
                        catch (Exception ex)
                        {
                            Debug.WriteLine($"打开文件夹失败: {ex.Message}");
                            MessageBox.Show($"解压成功，但打开文件夹失败: {ex.Message}\n解压目录: {tempDir}", "部分成功", MessageBoxButtons.OK, MessageBoxIcon.Warning);
                        }
                    }
                    else
                    {
                        string errorMsg = "解压GVML数据失败。";
                        Debug.WriteLine(errorMsg);
                        MessageBox.Show(errorMsg, "错误", MessageBoxButtons.OK, MessageBoxIcon.Error);
                    }
                }
                else
                {
                    // 尝试原来的方法作为备选
                    Debug.WriteLine("未找到GVML十六进制数据，尝试原来的方法...");
                    var gvmlData = GetGVMLDataFromClipboard();

                    if (gvmlData != null && gvmlData.Length > 0)
                    {
                        Debug.WriteLine($"使用原方法成功获取GVML数据，大小: {gvmlData.Length} 字节");

                        // 检查数据的前几个字节，判断是否为有效的zip文件
                        if (gvmlData.Length >= 4)
                        {
                            string header = BitConverter.ToString(gvmlData.Take(4).ToArray());
                            Debug.WriteLine($"数据头部: {header}");

                            // ZIP文件的魔数是 50 4B 03 04
                            if (gvmlData[0] == 0x50 && gvmlData[1] == 0x4B && gvmlData[2] == 0x03 && gvmlData[3] == 0x04)
                            {
                                Debug.WriteLine("数据头部匹配ZIP文件格式");
                            }
                            else
                            {
                                Debug.WriteLine("警告：数据头部不匹配ZIP文件格式");
                            }
                        }

                        // 3. 将数据存储为临时zip文件并解压
                        Debug.WriteLine("开始解压GVML数据...");
                        string tempDir = ExtractGVMLData(gvmlData);

                        if (!string.IsNullOrEmpty(tempDir))
                        {
                            Debug.WriteLine($"解压成功，目录: {tempDir}");

                            // 检查解压后的文件
                            try
                            {
                                var files = Directory.GetFiles(tempDir, "*", SearchOption.AllDirectories);
                                Debug.WriteLine($"解压后找到 {files.Length} 个文件");
                                foreach (var file in files.Take(5)) // 只显示前5个文件
                                {
                                    Debug.WriteLine($"  - {file}");
                                }
                            }
                            catch (Exception ex)
                            {
                                Debug.WriteLine($"检查解压文件失败: {ex.Message}");
                            }

                            // 打开解压后的文件夹
                            try
                            {
                                Process.Start("explorer.exe", tempDir);
                                string successMsg = $"GVML数据已解压到: {tempDir}";
                                Debug.WriteLine(successMsg);
                                MessageBox.Show(successMsg, "成功", MessageBoxButtons.OK, MessageBoxIcon.Information);
                            }
                            catch (Exception ex)
                            {
                                Debug.WriteLine($"打开文件夹失败: {ex.Message}");
                                MessageBox.Show($"解压成功，但打开文件夹失败: {ex.Message}\n解压目录: {tempDir}", "部分成功", MessageBoxButtons.OK, MessageBoxIcon.Warning);
                            }
                        }
                        else
                        {
                            string errorMsg = "解压GVML数据失败。";
                            Debug.WriteLine(errorMsg);
                            MessageBox.Show(errorMsg, "错误", MessageBoxButtons.OK, MessageBoxIcon.Error);
                        }
                    }
                    else
                    {
                        string errorMsg = "剪贴板中没有找到GVML数据。\n请确保选中的是PowerPoint形状。";
                        Debug.WriteLine(errorMsg);
                        MessageBox.Show(errorMsg, "错误", MessageBoxButtons.OK, MessageBoxIcon.Error);
                    }
                }

                Debug.WriteLine("=== GVML数据处理结束 ===");
            }
            catch (Exception ex)
            {
                Debug.WriteLine($"处理GVML数据时发生错误: {ex.Message}");
                Debug.WriteLine($"异常堆栈: {ex.StackTrace}");
                MessageBox.Show($"处理GVML数据时发生错误: {ex.Message}", "错误", MessageBoxButtons.OK, MessageBoxIcon.Error);
            }
        }

        // 将十六进制字符串转换为字节数组
        private byte[] HexStringToByteArray(string hex)
        {
            try
            {
                int numberChars = hex.Length;
                byte[] bytes = new byte[numberChars / 2];
                for (int i = 0; i < numberChars; i += 2)
                {
                    bytes[i / 2] = Convert.ToByte(hex.Substring(i, 2), 16);
                }
                return bytes;
            }
            catch (Exception ex)
            {
                Debug.WriteLine($"十六进制字符串转换失败: {ex.Message}");
                return null;
            }
        }

        private byte[] GetGVMLDataFromClipboard()
        {
            try
            {
                Debug.WriteLine("=== 开始获取剪贴板数据 ===");

                // 检查剪贴板是否为空
                if (!Clipboard.ContainsData("Art::GVML ClipFormat"))
                {
                    Debug.WriteLine("剪贴板中不包含 'Art::GVML ClipFormat' 格式数据");

                    // 列出剪贴板中所有可用的格式
                    ListAvailableClipboardFormats();

                    // 尝试其他可能的格式名称
                    string[] possibleFormats = {
                        "CF_BITMAP", "CF_DIB", "CF_ENHMETAFILE", "CF_METAFILEPICT"
                    };

                    foreach (string format in possibleFormats)
                    {
                        Debug.WriteLine($"尝试格式: '{format}'");
                        if (Clipboard.ContainsData(format))
                        {
                            Debug.WriteLine($"找到格式: '{format}'");
                            var data = Clipboard.GetData(format);
                            if (data != null)
                            {
                                Debug.WriteLine($"数据类型: {data.GetType().Name}");
                                return ConvertDataToBytes(data);
                            }
                        }
                    }

                    Debug.WriteLine("所有尝试的格式都未找到数据");
                }
                else
                {
                    Debug.WriteLine("找到 'Art::GVML ClipFormat' 格式数据");
                    var data = Clipboard.GetData("Art::GVML ClipFormat");
                    if (data != null)
                    {
                        Debug.WriteLine($"数据类型: {data.GetType().Name}");
                        return ConvertDataToBytes(data);
                    }
                }

                // 如果直接获取失败，尝试使用Windows API
                Debug.WriteLine("尝试使用Windows API获取数据...");
                return GetGVMLDataViaAPI();
            }
            catch (Exception ex)
            {
                Debug.WriteLine($"获取GVML数据失败: {ex.Message}");
                Debug.WriteLine($"异常堆栈: {ex.StackTrace}");
                return null;
            }
        }

        private void ListAvailableClipboardFormats()
        {
            try
            {
                Debug.WriteLine("=== 剪贴板中可用的格式 ===");

                // 使用Windows API枚举所有格式
                IntPtr hClipboard = OpenClipboard(IntPtr.Zero);
                if (hClipboard == IntPtr.Zero)
                {
                    Debug.WriteLine("无法打开剪贴板");
                    return;
                }

                try
                {
                    uint format = 0;
                    while ((format = EnumClipboardFormats(format)) != 0)
                    {
                        string formatName = GetClipboardFormatName(format);
                        Debug.WriteLine($"格式ID: {format}, 名称: '{formatName}'");
                    }
                }
                finally
                {
                    CloseClipboard();
                }
            }
            catch (Exception ex)
            {
                Debug.WriteLine($"枚举剪贴板格式失败: {ex.Message}");
            }
        }

        private byte[] ConvertDataToBytes(object data)
        {
            try
            {
                if (data is byte[] bytes)
                {
                    Debug.WriteLine($"直接返回字节数组，大小: {bytes.Length}");
                    return bytes;
                }
                else if (data is MemoryStream stream)
                {
                    Debug.WriteLine($"从MemoryStream转换，大小: {stream.Length}");
                    return stream.ToArray();
                }
                else if (data is Stream stream2)
                {
                    Debug.WriteLine($"从Stream转换，大小: {stream2.Length}");
                    using (var ms = new MemoryStream())
                    {
                        stream2.CopyTo(ms);
                        return ms.ToArray();
                    }
                }
                else if (data is string str)
                {
                    Debug.WriteLine($"从字符串转换，长度: {str.Length}");
                    return Encoding.UTF8.GetBytes(str);
                }
                else
                {
                    Debug.WriteLine($"未知数据类型: {data.GetType().Name}");
                    // 尝试序列化
                    try
                    {
                        using (var ms = new MemoryStream())
                        {
                            var formatter = new System.Runtime.Serialization.Formatters.Binary.BinaryFormatter();
                            formatter.Serialize(ms, data);
                            return ms.ToArray();
                        }
                    }
                    catch (Exception ex)
                    {
                        Debug.WriteLine($"序列化失败: {ex.Message}");
                        return null;
                    }
                }
            }
            catch (Exception ex)
            {
                Debug.WriteLine($"转换数据失败: {ex.Message}");
                return null;
            }
        }

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

        private string ExtractGVMLData(byte[] gvmlData)
        {
            try
            {
                // 创建临时目录
                string tempDir = System.IO.Path.Combine(System.IO.Path.GetTempPath(), $"GVML_Extract_{DateTime.Now:yyyyMMdd_HHmmss}");
                Directory.CreateDirectory(tempDir);

                // 保存为临时zip文件
                string zipPath = System.IO.Path.Combine(tempDir, "gvml_data.zip");
                File.WriteAllBytes(zipPath, gvmlData);

                Debug.WriteLine($"GVML数据已保存到: {zipPath}");

                // 解压zip文件
                string extractDir = System.IO.Path.Combine(tempDir, "extracted");
                Directory.CreateDirectory(extractDir);

                // 使用System.IO.Compression解压
                using (var archive = System.IO.Compression.ZipFile.OpenRead(zipPath))
                {
                    foreach (var entry in archive.Entries)
                    {
                        string entryPath = System.IO.Path.Combine(extractDir, entry.FullName);
                        string entryDir = System.IO.Path.GetDirectoryName(entryPath);

                        if (!Directory.Exists(entryDir))
                        {
                            Directory.CreateDirectory(entryDir);
                        }

                        if (!string.IsNullOrEmpty(entry.Name))
                        {
                            entry.ExtractToFile(entryPath, true);
                        }
                    }
                }

                Debug.WriteLine($"GVML数据已解压到: {extractDir}");
                return extractDir;
            }
            catch (Exception ex)
            {
                Debug.WriteLine($"解压GVML数据失败: {ex.Message}");
                return null;
            }
        }

        // Windows API声明
        [System.Runtime.InteropServices.DllImport("user32.dll")]
        private static extern IntPtr OpenClipboard(IntPtr hWndNewOwner);

        [System.Runtime.InteropServices.DllImport("user32.dll")]
        private static extern bool CloseClipboard();

        [System.Runtime.InteropServices.DllImport("user32.dll")]
        private static extern IntPtr GetClipboardData(uint uFormat);

        [System.Runtime.InteropServices.DllImport("user32.dll")]
        private static extern uint RegisterClipboardFormat(string lpszFormat);

        [System.Runtime.InteropServices.DllImport("kernel32.dll")]
        private static extern IntPtr GlobalLock(IntPtr hMem);

        [System.Runtime.InteropServices.DllImport("kernel32.dll")]
        private static extern bool GlobalUnlock(IntPtr hMem);

        [System.Runtime.InteropServices.DllImport("kernel32.dll")]
        private static extern int GlobalSize(IntPtr hMem);

        // 新增Windows API声明
        [System.Runtime.InteropServices.DllImport("user32.dll")]
        private static extern uint EnumClipboardFormats(uint format);

        [System.Runtime.InteropServices.DllImport("user32.dll")]
        private static extern int GetClipboardFormatName(uint format, StringBuilder lpszFormatName, int cchMaxCount);

        // 智能等待剪贴板数据可用
        private bool WaitForClipboardData(int maxWaitTime = 10000, int checkInterval = 100)
        {
            Debug.WriteLine("开始智能等待剪贴板数据...");

            bool dataAvailable = false;
            int totalWaitTime = 0;

            while (!dataAvailable && totalWaitTime < maxWaitTime)
            {
                System.Threading.Thread.Sleep(checkInterval);
                totalWaitTime += checkInterval;

                // 检查剪贴板是否有数据
                try
                {
                    var dataObj = Clipboard.GetDataObject();
                    var formats = dataObj?.GetFormats();

                    if (formats != null && formats.Length > 0)
                    {
                        // 检查是否有GVML相关格式
                        var gvmlFormats = formats.Where(f => f.Contains("GVML") || f.Contains("Art::")).ToArray();
                        if (gvmlFormats.Length > 0)
                        {
                            dataAvailable = true;
                            Debug.WriteLine($"检测到GVML数据，等待时间: {totalWaitTime}ms");
                            break;
                        }

                        // 或者检查是否有其他有用的格式
                        var usefulFormats = formats.Where(f =>
                            f.Contains("CF_") ||
                            f.Contains("Bitmap") ||
                            f.Contains("Image") ||
                            f.Contains("Picture")).ToArray();

                        if (usefulFormats.Length > 0)
                        {
                            dataAvailable = true;
                            Debug.WriteLine($"检测到其他格式数据，等待时间: {totalWaitTime}ms");
                            break;
                        }

                        // 如果有任何格式，也认为数据可用
                        dataAvailable = true;
                        Debug.WriteLine($"检测到剪贴板数据，等待时间: {totalWaitTime}ms");
                        break;
                    }

                    Debug.WriteLine($"等待中... {totalWaitTime}ms，剪贴板格式数量: {formats?.Length ?? 0}");
                }
                catch (Exception ex)
                {
                    Debug.WriteLine($"检查剪贴板时出错: {ex.Message}");
                }
            }

            if (!dataAvailable)
            {
                Debug.WriteLine($"等待超时，总等待时间: {totalWaitTime}ms");
            }

            return dataAvailable;
        }

        // 测试剪贴板功能的方法
        private void TestClipboardFunctionality()
        {
            try
            {
                Debug.WriteLine("=== 测试剪贴板功能 ===");

                // 1. 测试基本剪贴板操作
                Debug.WriteLine("1. 测试基本剪贴板操作...");
                string testText = "测试文本 " + DateTime.Now.ToString();
                Clipboard.SetText(testText);

                if (Clipboard.ContainsText())
                {
                    string retrievedText = Clipboard.GetText();
                    Debug.WriteLine($"文本测试成功: {retrievedText}");
                }
                else
                {
                    Debug.WriteLine("文本测试失败");
                }

                // 2. 检查剪贴板格式
                Debug.WriteLine("2. 检查剪贴板格式...");
                ListAvailableClipboardFormats();

                // 3. 获取所有剪贴板数据
                Debug.WriteLine("3. 获取所有剪贴板数据...");
                GetAllClipboardData();

                // 4. 测试PowerPoint形状复制
                Debug.WriteLine("4. 测试PowerPoint形状复制...");
                var app = Globals.ThisAddIn.Application;
                if (app.ActiveWindow.Selection.Type == PpSelectionType.ppSelectionShapes)
                {
                    var shapeRange = app.ActiveWindow.Selection.ShapeRange;
                    Debug.WriteLine($"选中了 {shapeRange.Count} 个形状");

                    // 尝试复制
                    try
                    {
                        bool copySuccess = FastCopyUsingSendKeys();
                        Debug.WriteLine($"SendKeys复制操作: {(copySuccess ? "成功" : "失败")}");

                        if (copySuccess)
                        {
                            // 智能等待：检测剪贴板数据是否可用
                            bool dataAvailable = WaitForClipboardData();

                            if (!dataAvailable)
                            {
                                Debug.WriteLine("剪贴板数据等待超时，但继续尝试获取数据...");
                            }

                            // 等待并检查剪贴板
                            ListAvailableClipboardFormats();

                            // 获取所有剪贴板数据
                            GetAllClipboardData();

                            // 尝试获取GVML数据
                            var gvmlData = GetGVMLDataFromClipboard();
                            if (gvmlData != null && gvmlData.Length > 0)
                            {
                                Debug.WriteLine($"成功获取GVML数据，大小: {gvmlData.Length} 字节");

                                // 尝试提取图片
                                var imageBytes = ExtractImageFromGVMLData(gvmlData);
                                if (imageBytes != null && imageBytes.Length > 0)
                                {
                                    Debug.WriteLine($"成功提取图片，大小: {imageBytes.Length} 字节");
                                }
                                else
                                {
                                    Debug.WriteLine("未能提取图片");
                                }
                            }
                            else
                            {
                                Debug.WriteLine("未能获取GVML数据");
                            }
                        }
                    }
                    catch (Exception ex)
                    {
                        Debug.WriteLine($"SendKeys复制失败: {ex.Message}");
                    }
                }
                else
                {
                    Debug.WriteLine("未选中PowerPoint形状");
                }

                Debug.WriteLine("=== 剪贴板功能测试结束 ===");
            }
            catch (Exception ex)
            {
                Debug.WriteLine($"剪贴板功能测试失败: {ex.Message}");
            }
        }

        // 获取剪贴板中所有格式的数据
        private void GetAllClipboardData()
        {
            try
            {
                Debug.WriteLine("=== 获取剪贴板中所有格式的数据 ===");

                // 获取剪贴板数据
                var dataObj = Clipboard.GetDataObject();
                var formats = dataObj?.GetFormats();
                var localShapeData = new Dictionary<string, object>();

                if (formats != null)
                {
                    Debug.WriteLine($"剪贴板中包含 {formats.Length} 种格式:");

                    foreach (var format in formats)
                    {
                        Debug.WriteLine($"\n--- 格式: {format} ---");

                        try
                        {
                            var data = dataObj.GetData(format);
                            if (data is string str)
                            {
                                Debug.WriteLine($"类型: string, 长度: {str.Length}");
                                Debug.WriteLine($"数据: {str}");
                                localShapeData[format] = new Dictionary<string, object>
                                {
                                    ["type"] = "string",
                                    ["data"] = str
                                };
                            }
                            else if (data is MemoryStream ms)
                            {
                                var bytes = ms.ToArray();
                                Debug.WriteLine($"类型: MemoryStream, 大小: {bytes.Length} 字节");
                                Debug.WriteLine($"十六进制数据: {BitConverter.ToString(bytes).Replace("-", "")}");
                                localShapeData[format] = new Dictionary<string, object>
                                {
                                    ["type"] = "hex",
                                    ["data"] = BitConverter.ToString(bytes).Replace("-", "")
                                };
                            }
                            else if (data is byte[] bytes)
                            {
                                Debug.WriteLine($"类型: byte[], 大小: {bytes.Length} 字节");
                                Debug.WriteLine($"十六进制数据: {BitConverter.ToString(bytes).Replace("-", "")}");
                                localShapeData[format] = new Dictionary<string, object>
                                {
                                    ["type"] = "hex",
                                    ["data"] = BitConverter.ToString(bytes).Replace("-", "")
                                };
                            }
                            else if (data is System.Drawing.Image img)
                            {
                                using (var msImg = new MemoryStream())
                                {
                                    img.Save(msImg, System.Drawing.Imaging.ImageFormat.Png);
                                    var imgBytes = msImg.ToArray();
                                    Debug.WriteLine($"类型: Image, 大小: {imgBytes.Length} 字节");
                                    Debug.WriteLine($"十六进制数据: {BitConverter.ToString(imgBytes).Replace("-", "")}");
                                    localShapeData[format] = new Dictionary<string, object>
                                    {
                                        ["type"] = "hex",
                                        ["data"] = BitConverter.ToString(imgBytes).Replace("-", "")
                                    };
                                }
                            }
                            else if (data != null)
                            {
                                Debug.WriteLine($"类型: {data.GetType().Name}");
                                Debug.WriteLine($"数据: {data.ToString()}");
                                localShapeData[format] = new Dictionary<string, object>
                                {
                                    ["type"] = "toString",
                                    ["data"] = data.ToString()
                                };
                            }
                            else
                            {
                                Debug.WriteLine("类型: null");
                                localShapeData[format] = new Dictionary<string, object>
                                {
                                    ["type"] = "null",
                                    ["data"] = "null"
                                };
                            }
                        }
                        catch (Exception ex)
                        {
                            Debug.WriteLine($"处理格式 {format} 时出错: {ex.Message}");
                            localShapeData[format] = new Dictionary<string, object>
                            {
                                ["type"] = "error",
                                ["data"] = ex.Message
                            };
                        }
                    }
                }
                else
                {
                    Debug.WriteLine("剪贴板中没有数据");
                }

                Debug.WriteLine("=== 剪贴板数据获取完成 ===");
            }
            catch (Exception ex)
            {
                Debug.WriteLine($"获取剪贴板数据失败: {ex.Message}");
            }
        }

        // 专门获取GVML数据的十六进制表示
        private string GetGVMLDataAsHex()
        {
            try
            {
                Debug.WriteLine("=== 获取GVML数据的十六进制表示 ===");

                var dataObj = Clipboard.GetDataObject();
                var formats = dataObj?.GetFormats();

                if (formats != null)
                {
                    // 查找GVML相关的格式
                    var gvmlFormats = formats.Where(f => f.Contains("GVML") || f.Contains("Art::")).ToArray();

                    if (gvmlFormats.Length > 0)
                    {
                        Debug.WriteLine($"找到 {gvmlFormats.Length} 个GVML相关格式:");

                        foreach (var format in gvmlFormats)
                        {
                            Debug.WriteLine($"\n--- GVML格式: {format} ---");

                            try
                            {
                                var data = dataObj.GetData(format);
                                if (data is MemoryStream ms)
                                {
                                    var bytes = ms.ToArray();
                                    string hexData = BitConverter.ToString(bytes).Replace("-", "");
                                    Debug.WriteLine($"大小: {bytes.Length} 字节");
                                    Debug.WriteLine($"十六进制: {hexData}");
                                    return hexData;
                                }
                                else if (data is byte[] bytes)
                                {
                                    string hexData = BitConverter.ToString(bytes).Replace("-", "");
                                    Debug.WriteLine($"大小: {bytes.Length} 字节");
                                    Debug.WriteLine($"十六进制: {hexData}");
                                    return hexData;
                                }
                                else if (data is string str)
                                {
                                    Debug.WriteLine($"字符串数据: {str}");
                                    return str;
                                }
                                else if (data != null)
                                {
                                    Debug.WriteLine($"其他类型数据: {data.GetType().Name}");
                                    return data.ToString();
                                }
                            }
                            catch (Exception ex)
                            {
                                Debug.WriteLine($"处理GVML格式 {format} 时出错: {ex.Message}");
                            }
                        }
                    }
                    else
                    {
                        Debug.WriteLine("未找到GVML相关格式");

                        // 显示所有可用格式
                        Debug.WriteLine("所有可用格式:");
                        foreach (var format in formats)
                        {
                            Debug.WriteLine($"  - {format}");
                        }
                    }
                }

                return null;
            }
            catch (Exception ex)
            {
                Debug.WriteLine($"获取GVML十六进制数据失败: {ex.Message}");
                return null;
            }
        }

        private string GetClipboardFormatName(uint format)
        {
            try
            {
                StringBuilder sb = new StringBuilder(256);
                int result = GetClipboardFormatName(format, sb, sb.Capacity);
                if (result > 0)
                {
                    return sb.ToString();
                }
                else
                {
                    // 如果是预定义格式，返回标准名称
                    switch (format)
                    {
                        case 1: return "CF_TEXT";
                        case 2: return "CF_BITMAP";
                        case 3: return "CF_METAFILEPICT";
                        case 4: return "CF_SYLK";
                        case 5: return "CF_DIF";
                        case 6: return "CF_TIFF";
                        case 7: return "CF_OEMTEXT";
                        case 8: return "CF_DIB";
                        case 9: return "CF_PALETTE";
                        case 10: return "CF_PENDATA";
                        case 11: return "CF_RIFF";
                        case 12: return "CF_WAVE";
                        case 13: return "CF_UNICODETEXT";
                        case 14: return "CF_ENHMETAFILE";
                        case 15: return "CF_HDROP";
                        case 16: return "CF_LOCALE";
                        case 17: return "CF_DIBV5";
                        default: return $"CF_{format}";
                    }
                }
            }
            catch (Exception ex)
            {
                Debug.WriteLine($"获取格式名称失败: {ex.Message}");
                return $"Unknown_{format}";
            }
        }

        //测试剪贴板按钮事件
        private void button8_Click(object sender, RibbonControlEventArgs e)
        {
            try
            {
                TestClipboardFunctionality();
                MessageBox.Show("剪贴板功能测试完成，请查看调试输出窗口获取详细信息。", "测试完成", MessageBoxButtons.OK, MessageBoxIcon.Information);
            }
            catch (Exception ex)
            {
                Debug.WriteLine($"测试剪贴板功能时发生错误: {ex.Message}");
                MessageBox.Show($"测试剪贴板功能时发生错误: {ex.Message}", "错误", MessageBoxButtons.OK, MessageBoxIcon.Error);
            }
        }

        // 显示GVML十六进制数据按钮事件
        private void button9_Click(object sender, RibbonControlEventArgs e)
        {
            try
            {
                var app = Globals.ThisAddIn.Application;

                // 检查是否选中了形状
                if (app.ActiveWindow.Selection.Type != PpSelectionType.ppSelectionShapes)
                {
                    MessageBox.Show("请先选中一个形状。", "提示", MessageBoxButtons.OK, MessageBoxIcon.Information);
                    return;
                }

                var shapeRange = app.ActiveWindow.Selection.ShapeRange;
                if (shapeRange.Count == 0)
                {
                    MessageBox.Show("未选中任何形状。", "提示", MessageBoxButtons.OK, MessageBoxIcon.Information);
                    return;
                }

                // 使用SendKeys方法复制形状到剪贴板
                Debug.WriteLine("正在使用SendKeys方法复制选中图形到剪贴板...");

                bool copySuccess = FastCopyUsingSendKeys();

                if (!copySuccess)
                {
                    Debug.WriteLine("SendKeys复制失败");
                    MessageBox.Show($"复制形状到剪贴板失败。\n请尝试手动复制（Ctrl+C）后再运行此功能。", "错误", MessageBoxButtons.OK, MessageBoxIcon.Error);
                    return;
                }

                Debug.WriteLine("SendKeys复制操作成功");

                // 获取GVML十六进制数据
                string gvmlHexData = GetGVMLDataAsHex();

                if (!string.IsNullOrEmpty(gvmlHexData))
                {
                    // 将十六进制字符串转换为字节数组
                    byte[] gvmlData = HexStringToByteArray(gvmlHexData);

                    if (gvmlData != null && gvmlData.Length > 0)
                    {
                        // 直接从GVML数据中提取图片
                        var imageBytes = ExtractImageFromGVMLData(gvmlData);

                        if (imageBytes != null && imageBytes.Length > 0)
                        {
                            Debug.WriteLine($"成功提取图片，大小: {imageBytes.Length} 字节");
                            // 保存图片到临时文件并显示
                            string tempPath = System.IO.Path.GetTempFileName() + ".png";
                            System.IO.File.WriteAllBytes(tempPath, imageBytes);
                            try
                            {
                                Process.Start("explorer.exe", $"/select,\"{tempPath}\""); // 打开图片文件
                            }
                            catch (Exception ex)
                            {
                                Debug.WriteLine($"打开图片文件失败: {ex.Message}");
                            }
                        }
                        else
                        {
                            string errorMsg = "未能从GVML数据中提取到图片。";
                            Debug.WriteLine(errorMsg);
                            MessageBox.Show(errorMsg, "错误", MessageBoxButtons.OK, MessageBoxIcon.Error);
                        }
                    }
                    else
                    {
                        string errorMsg = "GVML数据转换失败。";
                        Debug.WriteLine(errorMsg);
                        MessageBox.Show(errorMsg, "错误", MessageBoxButtons.OK, MessageBoxIcon.Error);
                    }
                }
                else
                {
                    MessageBox.Show("未找到GVML数据。\n请确保选中的是PowerPoint形状。", "提示", MessageBoxButtons.OK, MessageBoxIcon.Information);
                }
            }
            catch (Exception ex)
            {
                Debug.WriteLine($"显示GVML十六进制数据时发生错误: {ex.Message}");
                MessageBox.Show($"显示GVML十六进制数据时发生错误: {ex.Message}", "错误", MessageBoxButtons.OK, MessageBoxIcon.Error);
            }
        }

        // 测试快速复制按钮事件
        private void button10_Click(object sender, RibbonControlEventArgs e)
        {
            try
            {
                var app = Globals.ThisAddIn.Application;

                // 检查是否选中了形状
                if (app.ActiveWindow.Selection.Type != PpSelectionType.ppSelectionShapes)
                {
                    MessageBox.Show("请先选中一个形状。", "提示", MessageBoxButtons.OK, MessageBoxIcon.Information);
                    return;
                }

                var shapeRange = app.ActiveWindow.Selection.ShapeRange;
                if (shapeRange.Count == 0)
                {
                    MessageBox.Show("未选中任何形状。", "提示", MessageBoxButtons.OK, MessageBoxIcon.Information);
                    return;
                }

                Debug.WriteLine("=== 开始测试SendKeys复制 ===");

                // 测试SendKeys方法
                Debug.WriteLine("测试SendKeys方法...");
                var stopwatch = System.Diagnostics.Stopwatch.StartNew();
                bool result = FastCopyUsingSendKeys();
                stopwatch.Stop();
                Debug.WriteLine($"SendKeys方法: {(result ? "成功" : "失败")}, 耗时: {stopwatch.ElapsedMilliseconds}ms");

                if (result)
                {
                    bool dataAvailable = WaitForClipboardData(3000, 50);
                    Debug.WriteLine($"SendKeys数据检测: {(dataAvailable ? "成功" : "失败")}");

                    if (dataAvailable)
                    {
                        // 获取GVML数据
                        var gvmlData = GetGVMLDataFromClipboard();
                        if (gvmlData != null && gvmlData.Length > 0)
                        {
                            Debug.WriteLine($"成功获取GVML数据，大小: {gvmlData.Length} 字节");

                            // 尝试提取图片
                            var imageBytes = ExtractImageFromGVMLData(gvmlData);
                            if (imageBytes != null && imageBytes.Length > 0)
                            {
                                Debug.WriteLine($"成功提取图片，大小: {imageBytes.Length} 字节");
                            }
                            else
                            {
                                Debug.WriteLine("未能提取图片");
                            }
                        }
                        else
                        {
                            Debug.WriteLine("未能获取GVML数据");
                        }
                    }
                }

                Debug.WriteLine("=== SendKeys复制测试结束 ===");

                string resultMsg = result ? "SendKeys复制测试成功！" : "SendKeys复制测试失败！";
                MessageBox.Show($"{resultMsg}\n请查看调试输出窗口获取详细结果。", "测试完成", MessageBoxButtons.OK, MessageBoxIcon.Information);
            }
            catch (Exception ex)
            {
                Debug.WriteLine($"测试SendKeys复制时发生错误: {ex.Message}");
                MessageBox.Show($"测试SendKeys复制时发生错误: {ex.Message}", "错误", MessageBoxButtons.OK, MessageBoxIcon.Error);
            }
        }

        // 快速复制方法1：使用SendKeys模拟Ctrl+C
        private bool FastCopyUsingSendKeys()
        {
            try
            {
                Debug.WriteLine("使用SendKeys快速复制...");

                // 确保PowerPoint窗口处于活动状态
                var app = Globals.ThisAddIn.Application;
                app.ActiveWindow.Activate();

                // 等待窗口激活
                System.Threading.Thread.Sleep(100);

                // 发送Ctrl+C
                System.Windows.Forms.SendKeys.SendWait("^c");

                Debug.WriteLine("SendKeys复制完成");
                return true;
            }
            catch (Exception ex)
            {
                Debug.WriteLine($"SendKeys复制失败: {ex.Message}");
                return false;
            }
        }

        // 快速复制方法2：使用Windows API直接操作剪贴板
        private bool FastCopyUsingAPI()
        {
            try
            {
                Debug.WriteLine("使用Windows API快速复制...");

                // 获取当前选中的形状
                var app = Globals.ThisAddIn.Application;
                if (app.ActiveWindow.Selection.Type != PpSelectionType.ppSelectionShapes)
                {
                    return false;
                }

                var shapeRange = app.ActiveWindow.Selection.ShapeRange;
                if (shapeRange.Count == 0)
                {
                    return false;
                }

                // 使用PowerPoint的Copy方法，但设置更短的超时
                shapeRange.Copy();

                Debug.WriteLine("API复制完成");
                return true;
            }
            catch (Exception ex)
            {
                Debug.WriteLine($"API复制失败: {ex.Message}");
                return false;
            }
        }

        // 快速复制方法3：使用PowerPoint的快速复制
        private bool FastCopyUsingPowerPoint()
        {
            try
            {
                Debug.WriteLine("使用PowerPoint快速复制...");

                var app = Globals.ThisAddIn.Application;
                if (app.ActiveWindow.Selection.Type != PpSelectionType.ppSelectionShapes)
                {
                    return false;
                }

                var shapeRange = app.ActiveWindow.Selection.ShapeRange;
                if (shapeRange.Count == 0)
                {
                    return false;
                }

                // 尝试使用更直接的方法
                foreach (PowerPoint.Shape shape in shapeRange)
                {
                    // 选中单个形状
                    shape.Select();
                    System.Threading.Thread.Sleep(50);

                    // 复制单个形状
                    shape.Copy();
                    System.Threading.Thread.Sleep(50);
                }

                Debug.WriteLine("PowerPoint快速复制完成");
                return true;
            }
            catch (Exception ex)
            {
                Debug.WriteLine($"PowerPoint快速复制失败: {ex.Message}");
                return false;
            }
        }

        // 智能快速复制：尝试多种方法
        private bool SmartFastCopy()
        {
            Debug.WriteLine("开始智能快速复制...");

            // 方法1：尝试SendKeys（最快）
            if (FastCopyUsingSendKeys())
            {
                // 等待较短时间
                if (WaitForClipboardData(3000, 50)) // 3秒，每50ms检查
                {
                    Debug.WriteLine("SendKeys复制成功");
                    return true;
                }
            }

            // 方法2：尝试PowerPoint快速复制
            if (FastCopyUsingPowerPoint())
            {
                if (WaitForClipboardData(5000, 100)) // 5秒，每100ms检查
                {
                    Debug.WriteLine("PowerPoint快速复制成功");
                    return true;
                }
            }

            // 方法3：使用原始方法（最慢但最可靠）
            Debug.WriteLine("尝试原始复制方法...");
            try
            {
                var app = Globals.ThisAddIn.Application;
                var shapeRange = app.ActiveWindow.Selection.ShapeRange;
                shapeRange.Copy();

                if (WaitForClipboardData(10000, 100)) // 10秒，每100ms检查
                {
                    Debug.WriteLine("原始复制方法成功");
                    return true;
                }
            }
            catch (Exception ex)
            {
                Debug.WriteLine($"原始复制方法失败: {ex.Message}");
            }

            Debug.WriteLine("所有复制方法都失败");
            return false;
        }

        // 直接从GVML数据中提取图片，无需解压到磁盘
        private byte[] ExtractImageFromGVMLData(byte[] gvmlData)
        {
            try
            {
                Debug.WriteLine("=== 直接从GVML数据中提取图片 ===");

                if (gvmlData == null || gvmlData.Length == 0)
                {
                    Debug.WriteLine("GVML数据为空");
                    return null;
                }

                // 检查是否为有效的ZIP文件
                if (gvmlData.Length < 4 ||
                    gvmlData[0] != 0x50 || gvmlData[1] != 0x4B ||
                    gvmlData[2] != 0x03 || gvmlData[3] != 0x04)
                {
                    Debug.WriteLine("GVML数据不是有效的ZIP文件格式");
                    return null;
                }

                Debug.WriteLine("GVML数据是有效的ZIP文件，开始读取...");

                using (var memoryStream = new MemoryStream(gvmlData))
                using (var archive = new System.IO.Compression.ZipArchive(memoryStream, System.IO.Compression.ZipArchiveMode.Read))
                {
                    Debug.WriteLine($"ZIP文件中包含 {archive.Entries.Count} 个条目");

                    // 查找media文件夹中的图片文件
                    var imageEntries = archive.Entries.Where(entry =>
                        entry.FullName.StartsWith("media/", StringComparison.OrdinalIgnoreCase) &&
                        IsImageFile(entry.Name)).ToList();

                    Debug.WriteLine($"在media文件夹中找到 {imageEntries.Count} 个图片文件:");

                    foreach (var entry in imageEntries)
                    {
                        Debug.WriteLine($"  - {entry.FullName} (大小: {entry.Length} 字节)");
                    }

                    // 如果找到图片，返回第一个
                    if (imageEntries.Count > 0)
                    {
                        var firstImage = imageEntries.First();
                        Debug.WriteLine($"提取图片: {firstImage.FullName}");

                        using (var imageStream = firstImage.Open())
                        using (var imageMemoryStream = new MemoryStream())
                        {
                            imageStream.CopyTo(imageMemoryStream);
                            var imageBytes = imageMemoryStream.ToArray();

                            Debug.WriteLine($"成功提取图片，大小: {imageBytes.Length} 字节");
                            return imageBytes;
                        }
                    }
                    else
                    {
                        Debug.WriteLine("未在media文件夹中找到图片文件");

                        // 如果没有在media文件夹中找到，尝试查找其他位置的图片
                        var allImageEntries = archive.Entries.Where(entry => IsImageFile(entry.Name)).ToList();

                        Debug.WriteLine($"在整个ZIP文件中找到 {allImageEntries.Count} 个图片文件:");
                        foreach (var entry in allImageEntries)
                        {
                            Debug.WriteLine($"  - {entry.FullName} (大小: {entry.Length} 字节)");
                        }

                        if (allImageEntries.Count > 0)
                        {
                            var firstImage = allImageEntries.First();
                            Debug.WriteLine($"提取图片: {firstImage.FullName}");

                            using (var imageStream = firstImage.Open())
                            using (var imageMemoryStream = new MemoryStream())
                            {
                                imageStream.CopyTo(imageMemoryStream);
                                var imageBytes = imageMemoryStream.ToArray();

                                Debug.WriteLine($"成功提取图片，大小: {imageBytes.Length} 字节");
                                return imageBytes;
                            }
                        }
                    }
                }

                Debug.WriteLine("未能从GVML数据中提取到图片");
                return null;
            }
            catch (Exception ex)
            {
                Debug.WriteLine($"从GVML数据提取图片失败: {ex.Message}");
                Debug.WriteLine($"异常堆栈: {ex.StackTrace}");
                return null;
            }
        }

        // 判断文件是否为图片
        private bool IsImageFile(string fileName)
        {
            if (string.IsNullOrEmpty(fileName))
                return false;

            string extension = System.IO.Path.GetExtension(fileName).ToLowerInvariant();
            string[] imageExtensions = { ".jpg", ".jpeg", ".png", ".gif", ".bmp", ".tiff", ".tif", ".webp" };

            return imageExtensions.Contains(extension);
        }

        // 获取GVML数据中的所有文件信息
        private List<GVMLFileInfo> GetGVMLFileList(byte[] gvmlData)
        {
            var fileList = new List<GVMLFileInfo>();

            try
            {
                Debug.WriteLine("=== 获取GVML文件列表 ===");

                if (gvmlData == null || gvmlData.Length == 0)
                {
                    Debug.WriteLine("GVML数据为空");
                    return fileList;
                }

                using (var memoryStream = new MemoryStream(gvmlData))
                using (var archive = new System.IO.Compression.ZipArchive(memoryStream, System.IO.Compression.ZipArchiveMode.Read))
                {
                    Debug.WriteLine($"ZIP文件中包含 {archive.Entries.Count} 个条目");

                    foreach (var entry in archive.Entries)
                    {
                        var fileInfo = new GVMLFileInfo
                        {
                            FileName = entry.Name,
                            FullPath = entry.FullName,
                            Size = entry.Length,
                            IsImage = IsImageFile(entry.Name),
                            IsInMediaFolder = entry.FullName.StartsWith("media/", StringComparison.OrdinalIgnoreCase)
                        };

                        fileList.Add(fileInfo);

                        Debug.WriteLine($"  - {entry.FullName} (大小: {entry.Length} 字节, 图片: {fileInfo.IsImage}, Media文件夹: {fileInfo.IsInMediaFolder})");
                    }
                }
            }
            catch (Exception ex)
            {
                Debug.WriteLine($"获取GVML文件列表失败: {ex.Message}");
            }

            return fileList;
        }

        // GVML文件信息类
        private class GVMLFileInfo
        {
            public string FileName { get; set; }
            public string FullPath { get; set; }
            public long Size { get; set; }
            public bool IsImage { get; set; }
            public bool IsInMediaFolder { get; set; }
        }

        // 测试直接从GVML数据提取图片按钮事件
        private void button11_Click(object sender, RibbonControlEventArgs e)
        {
            try
            {
                Debug.WriteLine("=== 测试直接从GVML数据提取图片 ===");

                var app = Globals.ThisAddIn.Application;

                // 检查是否选中了形状
                if (app.ActiveWindow.Selection.Type != PpSelectionType.ppSelectionShapes)
                {
                    MessageBox.Show("请先选中一个形状。", "提示", MessageBoxButtons.OK, MessageBoxIcon.Information);
                    return;
                }

                var shapeRange = app.ActiveWindow.Selection.ShapeRange;
                if (shapeRange.Count == 0)
                {
                    MessageBox.Show("未选中任何形状。", "提示", MessageBoxButtons.OK, MessageBoxIcon.Information);
                    return;
                }

                Debug.WriteLine($"选中了 {shapeRange.Count} 个形状");
                shapeRange.Copy();


                // 等待剪贴板数据可用
                bool dataAvailable = WaitForClipboardData(2000, 100);
                if (!dataAvailable)
                {
                    Debug.WriteLine("剪贴板数据等待超时");
                    MessageBox.Show("复制操作超时，请重试。", "错误", MessageBoxButtons.OK, MessageBoxIcon.Error);
                    return;
                }

                // 获取GVML数据
                Debug.WriteLine("获取GVML数据...");
                var gvmlData = GetGVMLDataFromClipboard();
                if (gvmlData == null || gvmlData.Length == 0)
                {
                    Debug.WriteLine("未能获取GVML数据");
                    MessageBox.Show("未能获取GVML数据。", "错误", MessageBoxButtons.OK, MessageBoxIcon.Error);
                    return;
                }

                Debug.WriteLine($"获取到GVML数据，大小: {gvmlData.Length} 字节");

                // 直接从GVML数据中提取图片
                var imageBytes = ExtractImageFromGVMLData(gvmlData);

                if (imageBytes != null && imageBytes.Length > 0)
                {
                    Debug.WriteLine($"成功提取图片，大小: {imageBytes.Length} 字节");

                    // 保存图片到临时文件并显示
                    string tempPath = System.IO.Path.GetTempFileName() + ".png";
                    System.IO.File.WriteAllBytes(tempPath, imageBytes);

                    try
                    {
                        // 打开图片文件
                        Process.Start("explorer.exe", $"/select,\"{tempPath}\"");

                        string successMsg = $"成功从GVML数据提取图片！\n图片大小: {imageBytes.Length} 字节\n保存位置: {tempPath}";
                        Debug.WriteLine(successMsg);
                        MessageBox.Show(successMsg, "成功", MessageBoxButtons.OK, MessageBoxIcon.Information);
                    }
                    catch (Exception ex)
                    {
                        Debug.WriteLine($"打开图片文件失败: {ex.Message}");
                        MessageBox.Show($"提取成功，但打开文件失败: {ex.Message}\n文件位置: {tempPath}", "部分成功", MessageBoxButtons.OK, MessageBoxIcon.Warning);
                    }
                }
                else
                {
                    string errorMsg = "未能从GVML数据中提取到图片。";
                    Debug.WriteLine(errorMsg);
                    MessageBox.Show(errorMsg, "错误", MessageBoxButtons.OK, MessageBoxIcon.Error);
                }

                Debug.WriteLine("=== GVML图片提取测试结束 ===");
            }
            catch (Exception ex)
            {
                Debug.WriteLine($"测试GVML图片提取时发生错误: {ex.Message}");
                Debug.WriteLine($"异常堆栈: {ex.StackTrace}");
                MessageBox.Show($"测试GVML图片提取时发生错误: {ex.Message}", "错误", MessageBoxButtons.OK, MessageBoxIcon.Error);
            }
        }

        // 显示GVML文件列表按钮事件
        private void button12_Click(object sender, RibbonControlEventArgs e)
        {
            try
            {
                Debug.WriteLine("=== 显示GVML文件列表 ===");

                var app = Globals.ThisAddIn.Application;

                // 检查是否选中了形状
                if (app.ActiveWindow.Selection.Type != PpSelectionType.ppSelectionShapes)
                {
                    MessageBox.Show("请先选中一个形状。", "提示", MessageBoxButtons.OK, MessageBoxIcon.Information);
                    return;
                }

                var shapeRange = app.ActiveWindow.Selection.ShapeRange;
                if (shapeRange.Count == 0)
                {
                    MessageBox.Show("未选中任何形状。", "提示", MessageBoxButtons.OK, MessageBoxIcon.Information);
                    return;
                }

                Debug.WriteLine($"选中了 {shapeRange.Count} 个形状");

                // 使用SendKeys方法复制形状到剪贴板
                Debug.WriteLine("使用SendKeys方法复制形状到剪贴板...");
                bool copySuccess = FastCopyUsingSendKeys();
                if (!copySuccess)
                {
                    Debug.WriteLine("SendKeys复制失败");
                    MessageBox.Show("复制操作失败，请重试。", "错误", MessageBoxButtons.OK, MessageBoxIcon.Error);
                    return;
                }

                // 等待剪贴板数据可用
                bool dataAvailable = WaitForClipboardData(5000, 100);
                if (!dataAvailable)
                {
                    Debug.WriteLine("剪贴板数据等待超时");
                    MessageBox.Show("复制操作超时，请重试。", "错误", MessageBoxButtons.OK, MessageBoxIcon.Error);
                    return;
                }

                // 获取GVML数据
                Debug.WriteLine("获取GVML数据...");
                var gvmlData = GetGVMLDataFromClipboard();
                if (gvmlData == null || gvmlData.Length == 0)
                {
                    Debug.WriteLine("未能获取GVML数据");
                    MessageBox.Show("未能获取GVML数据。", "错误", MessageBoxButtons.OK, MessageBoxIcon.Error);
                    return;
                }

                Debug.WriteLine($"获取到GVML数据，大小: {gvmlData.Length} 字节");

                // 获取文件列表
                var fileList = GetGVMLFileList(gvmlData);

                if (fileList.Count > 0)
                {
                    // 构建显示内容
                    var displayContent = new StringBuilder();
                    displayContent.AppendLine("=== GVML文件列表 ===");
                    displayContent.AppendLine();

                    // 按文件夹分组显示
                    var mediaFiles = fileList.Where(f => f.IsInMediaFolder).ToList();
                    var otherFiles = fileList.Where(f => !f.IsInMediaFolder).ToList();

                    if (mediaFiles.Count > 0)
                    {
                        displayContent.AppendLine("📁 media/ 文件夹:");
                        foreach (var file in mediaFiles)
                        {
                            string icon = file.IsImage ? "🖼️" : "📄";
                            displayContent.AppendLine($"  {icon} {file.FullPath} ({file.Size} 字节)");
                        }
                        displayContent.AppendLine();
                    }

                    if (otherFiles.Count > 0)
                    {
                        displayContent.AppendLine("📁 其他文件:");
                        foreach (var file in otherFiles)
                        {
                            string icon = file.IsImage ? "🖼️" : "📄";
                            displayContent.AppendLine($"  {icon} {file.FullPath} ({file.Size} 字节)");
                        }
                    }

                    // 显示在Form_xml窗口中
                    var xmlForm = new Form_xml();
                    xmlForm.SetXmlContent(displayContent.ToString());
                    xmlForm.Show();
                }
                else
                {
                    MessageBox.Show("GVML数据中没有找到任何文件。", "提示", MessageBoxButtons.OK, MessageBoxIcon.Information);
                }

                Debug.WriteLine("=== GVML文件列表显示结束 ===");
            }
            catch (Exception ex)
            {
                Debug.WriteLine($"显示GVML文件列表时发生错误: {ex.Message}");
                Debug.WriteLine($"异常堆栈: {ex.StackTrace}");
                MessageBox.Show($"显示GVML文件列表时发生错误: {ex.Message}", "错误", MessageBoxButtons.OK, MessageBoxIcon.Error);
            }
        }

        // 处理剪贴板中的GVML数据，通过抠图API处理后重新设置回剪贴板
        private async void ProcessClipboardGVMLWithKoukoutu()
        {
            try
            {
                Debug.WriteLine("=== 开始处理剪贴板中的GVML数据 ===");

                // 从注册表获取koukoutu的API Key
                string apiKey = Core.Utils.PathHelper.GetApiKeyFromRegistry("koukoutu");
                if (string.IsNullOrEmpty(apiKey))
                {
                    string errorInfo = "请先在插件设置中配置koukoutu的API Key！";
                    Debug.WriteLine(errorInfo);
                    MessageBox.Show(errorInfo, "提示", MessageBoxButtons.OK, MessageBoxIcon.Information);
                    return;
                }

                // 测试网络连接
                if (!await TestNetworkConnection())
                {
                    string errorInfo = "网络连接测试失败，请检查网络连接。";
                    Debug.WriteLine(errorInfo);
                    MessageBox.Show(errorInfo, "网络错误", MessageBoxButtons.OK, MessageBoxIcon.Error);
                    return;
                }

                Debug.WriteLine("网络连接测试通过");

                // 1. 首先复制原始形状的所有格式到剪贴板
                Debug.WriteLine("复制原始形状的所有格式到剪贴板...");
                bool copySuccess = CopyOriginalShapeFormats();
                if (!copySuccess)
                {
                    string errorInfo = "复制原始形状失败。\n\n可能的原因：\n" +
                                      "1. 选中的不是PowerPoint形状\n" +
                                      "2. 形状被锁定或受保护\n" +
                                      "3. PowerPoint正在处理其他操作\n" +
                                      "4. 剪贴板被其他程序占用\n\n" +
                                      "请尝试：\n" +
                                      "1. 确保选中了一个图片形状\n" +
                                      "2. 手动复制形状（Ctrl+C）后再试\n" +
                                      "3. 关闭其他可能占用剪贴板的程序";
                    Debug.WriteLine(errorInfo);
                    MessageBox.Show(errorInfo, "复制失败", MessageBoxButtons.OK, MessageBoxIcon.Error);
                    return;
                }

                // 2. 获取剪贴板中的GVML数据
                Debug.WriteLine("获取剪贴板中的GVML数据...");
                var gvmlData = GetGVMLDataFromClipboard();
                if (gvmlData == null || gvmlData.Length == 0)
                {
                    string errorInfo = "剪贴板中没有找到GVML数据。\n请先复制一个PowerPoint形状到剪贴板。";
                    Debug.WriteLine(errorInfo);
                    MessageBox.Show(errorInfo, "错误", MessageBoxButtons.OK, MessageBoxIcon.Error);
                    return;
                }

                Debug.WriteLine($"获取到GVML数据，大小: {gvmlData.Length} 字节");

                // 3. 从GVML数据中提取图片
                Debug.WriteLine("从GVML数据中提取图片...");
                var originalImageBytes = ExtractImageFromGVMLData(gvmlData);
                if (originalImageBytes == null || originalImageBytes.Length == 0)
                {
                    string errorInfo = "未能从GVML数据中提取到图片。";
                    Debug.WriteLine(errorInfo);
                    MessageBox.Show(errorInfo, "错误", MessageBoxButtons.OK, MessageBoxIcon.Error);
                    return;
                }

                Debug.WriteLine($"成功提取原始图片，大小: {originalImageBytes.Length} 字节");

                // 4. 调用抠图API处理图片
                Debug.WriteLine("调用抠图API处理图片...");
                var processedImageBytes = await ProcessImageWithKoukoutu(originalImageBytes);
                if (processedImageBytes == null || processedImageBytes.Length == 0)
                {
                    string errorInfo = "抠图API处理失败。";
                    Debug.WriteLine(errorInfo);
                    MessageBox.Show(errorInfo, "错误", MessageBoxButtons.OK, MessageBoxIcon.Error);
                    return;
                }

                Debug.WriteLine($"抠图API处理成功，处理后图片大小: {processedImageBytes.Length} 字节");

                // 5. 将处理后的图片重新打包成GVML数据
                Debug.WriteLine("将处理后的图片重新打包成GVML数据...");
                var newGvmlData = CreateGVMLDataWithNewImage(gvmlData, processedImageBytes);
                if (newGvmlData == null || newGvmlData.Length == 0)
                {
                    string errorInfo = "重新打包GVML数据失败。";
                    Debug.WriteLine(errorInfo);
                    MessageBox.Show(errorInfo, "错误", MessageBoxButtons.OK, MessageBoxIcon.Error);
                    return;
                }

                Debug.WriteLine($"重新打包GVML数据成功，大小: {newGvmlData.Length} 字节");

                // 6. 将新的GVML数据设置到剪贴板，保持其他格式
                Debug.WriteLine("将新的GVML数据设置到剪贴板，保持其他格式...");
                bool setClipboardSuccess = SetProcessedGVMLWithOriginalFormats(newGvmlData);
                if (!setClipboardSuccess)
                {
                    string errorInfo = "设置剪贴板数据失败。";
                    Debug.WriteLine(errorInfo);
                    MessageBox.Show(errorInfo, "错误", MessageBoxButtons.OK, MessageBoxIcon.Error);
                    return;
                }

                Debug.WriteLine("成功将处理后的GVML数据设置到剪贴板");

                string successInfo = "剪贴板中的GVML数据已成功通过抠图API处理！\n现在可以粘贴处理后的形状。";
                Debug.WriteLine(successInfo);
                MessageBox.Show(successInfo, "成功", MessageBoxButtons.OK, MessageBoxIcon.Information);

                Debug.WriteLine("=== 剪贴板GVML数据处理完成 ===");
            }
            catch (Exception ex)
            {
                string errorInfo = $"处理剪贴板GVML数据时发生错误: {ex.Message}";
                Debug.WriteLine(errorInfo);
                Debug.WriteLine($"异常堆栈: {ex.StackTrace}");
                MessageBox.Show(errorInfo, "错误", MessageBoxButtons.OK, MessageBoxIcon.Error);
            }
        }

        // 将处理后的图片重新打包成GVML数据
        private byte[] CreateGVMLDataWithNewImage(byte[] originalGvmlData, byte[] newImageBytes)
        {
            try
            {
                Debug.WriteLine("=== 开始重新打包GVML数据 ===");

                if (originalGvmlData == null || originalGvmlData.Length == 0)
                {
                    Debug.WriteLine("原始GVML数据为空");
                    return null;
                }

                if (newImageBytes == null || newImageBytes.Length == 0)
                {
                    Debug.WriteLine("新图片数据为空");
                    return null;
                }

                // 创建临时目录
                string tempDir = System.IO.Path.Combine(System.IO.Path.GetTempPath(), $"GVML_Repack_{DateTime.Now:yyyyMMdd_HHmmss}");
                Directory.CreateDirectory(tempDir);

                try
                {
                    // 1. 解压原始GVML数据
                    Debug.WriteLine("解压原始GVML数据...");
                    string extractDir = System.IO.Path.Combine(tempDir, "original");
                    Directory.CreateDirectory(extractDir);

                    using (var memoryStream = new MemoryStream(originalGvmlData))
                    using (var archive = new System.IO.Compression.ZipArchive(memoryStream, System.IO.Compression.ZipArchiveMode.Read))
                    {
                        foreach (var entry in archive.Entries)
                        {
                            string entryPath = System.IO.Path.Combine(extractDir, entry.FullName);
                            string entryDir = System.IO.Path.GetDirectoryName(entryPath);

                            if (!Directory.Exists(entryDir))
                            {
                                Directory.CreateDirectory(entryDir);
                            }

                            if (!string.IsNullOrEmpty(entry.Name))
                            {
                                entry.ExtractToFile(entryPath, true);
                            }
                        }
                    }

                    Debug.WriteLine("原始GVML数据解压完成");

                    // 2. 查找并替换media文件夹中的图片
                    string mediaDir = System.IO.Path.Combine(extractDir, "media");
                    if (Directory.Exists(mediaDir))
                    {
                        Debug.WriteLine("查找media文件夹中的图片文件...");
                        var imageFiles = Directory.GetFiles(mediaDir, "*.*", SearchOption.TopDirectoryOnly)
                            .Where(file => IsImageFile(System.IO.Path.GetFileName(file)))
                            .ToList();

                        if (imageFiles.Count > 0)
                        {
                            // 替换第一个图片文件
                            string firstImageFile = imageFiles.First();
                            Debug.WriteLine($"替换图片文件: {firstImageFile}");

                            // 保存新图片
                            System.IO.File.WriteAllBytes(firstImageFile, newImageBytes);
                            Debug.WriteLine($"新图片已保存到: {firstImageFile}");
                        }
                        else
                        {
                            Debug.WriteLine("media文件夹中没有找到图片文件，创建新的图片文件...");
                            string newImagePath = System.IO.Path.Combine(mediaDir, "image1.png");
                            System.IO.File.WriteAllBytes(newImagePath, newImageBytes);
                            Debug.WriteLine($"新图片已创建: {newImagePath}");
                        }
                    }
                    else
                    {
                        Debug.WriteLine("未找到media文件夹，创建media文件夹并添加图片...");
                        Directory.CreateDirectory(mediaDir);
                        string newImagePath = System.IO.Path.Combine(mediaDir, "image1.png");
                        System.IO.File.WriteAllBytes(newImagePath, newImageBytes);
                        Debug.WriteLine($"新图片已创建: {newImagePath}");
                    }

                    // 3. 重新打包成ZIP文件
                    Debug.WriteLine("重新打包成ZIP文件...");
                    string newZipPath = System.IO.Path.Combine(tempDir, "new_gvml.zip");

                    using (var zipStream = new FileStream(newZipPath, FileMode.Create))
                    using (var archive = new System.IO.Compression.ZipArchive(zipStream, System.IO.Compression.ZipArchiveMode.Create))
                    {
                        // 添加所有文件到新的ZIP
                        var allFiles = Directory.GetFiles(extractDir, "*.*", SearchOption.AllDirectories);
                        foreach (var file in allFiles)
                        {
                            string relativePath = file.Substring(extractDir.Length + 1);
                            var entry = archive.CreateEntry(relativePath);

                            using (var entryStream = entry.Open())
                            using (var fileStream = File.OpenRead(file))
                            {
                                fileStream.CopyTo(entryStream);
                            }
                        }
                    }

                    Debug.WriteLine($"新ZIP文件已创建: {newZipPath}");

                    // 4. 读取新的ZIP文件并返回字节数组
                    var newGvmlBytes = System.IO.File.ReadAllBytes(newZipPath);
                    Debug.WriteLine($"新GVML数据大小: {newGvmlBytes.Length} 字节");

                    return newGvmlBytes;
                }
                finally
                {
                    // 清理临时文件
                    try
                    {
                        if (Directory.Exists(tempDir))
                        {
                            Directory.Delete(tempDir, true);
                            Debug.WriteLine("临时文件已清理");
                        }
                    }
                    catch (Exception ex)
                    {
                        Debug.WriteLine($"清理临时文件失败: {ex.Message}");
                    }
                }
            }
            catch (Exception ex)
            {
                Debug.WriteLine($"重新打包GVML数据失败: {ex.Message}");
                Debug.WriteLine($"异常堆栈: {ex.StackTrace}");
                return null;
            }
        }

        // 将GVML数据设置到剪贴板
        private bool SetGVMLDataToClipboard(byte[] gvmlData)
        {
            try
            {
                Debug.WriteLine("=== 设置GVML数据到剪贴板 ===");

                if (gvmlData == null || gvmlData.Length == 0)
                {
                    Debug.WriteLine("GVML数据为空");
                    return false;
                }

                // 创建DataObject来设置多种格式
                var dataObject = new System.Windows.Forms.DataObject();

                // 1. 设置GVML格式数据
                try
                {
                    Debug.WriteLine("设置Art::GVML ClipFormat格式...");
                    dataObject.SetData("Art::GVML ClipFormat", gvmlData);
                    Debug.WriteLine("Art::GVML ClipFormat设置成功");
                }
                catch (Exception ex)
                {
                    Debug.WriteLine($"设置Art::GVML ClipFormat失败: {ex.Message}");
                }

                // 2. 尝试从GVML数据中提取图片并设置图片格式
                try
                {
                    Debug.WriteLine("从GVML数据提取图片并设置图片格式...");
                    var imageBytes = ExtractImageFromGVMLData(gvmlData);
                    if (imageBytes != null && imageBytes.Length > 0)
                    {
                        // 设置Bitmap格式
                        using (var imageStream = new MemoryStream(imageBytes))
                        {
                            var image = System.Drawing.Image.FromStream(imageStream);
                            dataObject.SetData(System.Windows.Forms.DataFormats.Bitmap, image);
                            Debug.WriteLine("Bitmap格式设置成功");
                        }

                        // 设置DIB格式
                        dataObject.SetData(System.Windows.Forms.DataFormats.Dib, imageBytes);
                        Debug.WriteLine("DIB格式设置成功");

                        // 设置PNG格式
                        dataObject.SetData("PNG", imageBytes);
                        Debug.WriteLine("PNG格式设置成功");
                    }
                }
                catch (Exception ex)
                {
                    Debug.WriteLine($"设置图片格式失败: {ex.Message}");
                }

                // 3. 设置其他PowerPoint需要的格式
                try
                {
                    // 设置PowerPoint形状格式
                    dataObject.SetData("PowerPoint Shape", gvmlData);
                    Debug.WriteLine("PowerPoint Shape格式设置成功");

                    // 设置Office形状格式
                    dataObject.SetData("Office Shape", gvmlData);
                    Debug.WriteLine("Office Shape格式设置成功");

                    // 设置增强型图元文件格式
                    dataObject.SetData(System.Windows.Forms.DataFormats.EnhancedMetafile, gvmlData);
                    Debug.WriteLine("EnhancedMetafile格式设置成功");
                }
                catch (Exception ex)
                {
                    Debug.WriteLine($"设置其他格式失败: {ex.Message}");
                }

                // 4. 将DataObject设置到剪贴板
                try
                {
                    Debug.WriteLine("将DataObject设置到剪贴板...");
                    System.Windows.Forms.Clipboard.SetDataObject(dataObject, true);
                    Debug.WriteLine("剪贴板设置成功");

                    // 验证设置是否成功
                    var verifyData = System.Windows.Forms.Clipboard.GetDataObject();
                    var formats = verifyData?.GetFormats();
                    if (formats != null && formats.Length > 0)
                    {
                        Debug.WriteLine($"剪贴板中设置的格式数量: {formats.Length}");
                        foreach (var format in formats)
                        {
                            Debug.WriteLine($"  - {format}");
                        }
                        return true;
                    }
                    else
                    {
                        Debug.WriteLine("剪贴板验证失败，没有找到任何格式");
                        return false;
                    }
                }
                catch (Exception ex)
                {
                    Debug.WriteLine($"设置DataObject到剪贴板失败: {ex.Message}");
                }

                // 5. 如果DataObject方法失败，尝试直接设置GVML格式
                try
                {
                    Debug.WriteLine("尝试直接设置GVML格式...");
                    System.Windows.Forms.Clipboard.SetData("Art::GVML ClipFormat", gvmlData);
                    Debug.WriteLine("直接设置GVML格式成功");
                    return true;
                }
                catch (Exception ex)
                {
                    Debug.WriteLine($"直接设置GVML格式失败: {ex.Message}");
                }

                // 6. 最后尝试使用Windows API
                try
                {
                    Debug.WriteLine("尝试使用Windows API设置数据...");
                    return SetGVMLDataViaAPI(gvmlData);
                }
                catch (Exception ex)
                {
                    Debug.WriteLine($"Windows API设置失败: {ex.Message}");
                }

                Debug.WriteLine("所有设置方法都失败");
                return false;
            }
            catch (Exception ex)
            {
                Debug.WriteLine($"设置GVML数据到剪贴板失败: {ex.Message}");
                return false;
            }
        }

        // 使用Windows API设置GVML数据到剪贴板
        private bool SetGVMLDataViaAPI(byte[] gvmlData)
        {
            try
            {
                Debug.WriteLine("=== 使用Windows API设置GVML数据 ===");

                // 打开剪贴板
                IntPtr hClipboard = OpenClipboard(IntPtr.Zero);
                if (hClipboard == IntPtr.Zero)
                {
                    int error = Marshal.GetLastWin32Error();
                    Debug.WriteLine($"打开剪贴板失败，错误代码: {error}");
                    return false;
                }

                try
                {
                    // 清空剪贴板
                    if (!EmptyClipboard())
                    {
                        int error = Marshal.GetLastWin32Error();
                        Debug.WriteLine($"清空剪贴板失败，错误代码: {error}");
                        return false;
                    }

                    // 注册GVML格式
                    uint gvmlFormat = RegisterClipboardFormat("Art::GVML ClipFormat");
                    if (gvmlFormat == 0)
                    {
                        int error = Marshal.GetLastWin32Error();
                        Debug.WriteLine($"注册剪贴板格式失败，错误代码: {error}");
                        return false;
                    }

                    Debug.WriteLine($"成功注册格式 'Art::GVML ClipFormat', ID: {gvmlFormat}");

                    // 分配全局内存
                    IntPtr hGlobal = Marshal.AllocHGlobal(gvmlData.Length);
                    if (hGlobal == IntPtr.Zero)
                    {
                        Debug.WriteLine("分配全局内存失败");
                        return false;
                    }

                    try
                    {
                        // 复制数据到全局内存
                        Marshal.Copy(gvmlData, 0, hGlobal, gvmlData.Length);
                        Debug.WriteLine($"数据已复制到全局内存，大小: {gvmlData.Length} 字节");

                        // 设置剪贴板数据
                        if (SetClipboardData(gvmlFormat, hGlobal) == IntPtr.Zero)
                        {
                            int error = Marshal.GetLastWin32Error();
                            Debug.WriteLine($"设置剪贴板数据失败，错误代码: {error}");
                            return false;
                        }

                        Debug.WriteLine("成功设置GVML数据到剪贴板");
                        return true;
                    }
                    catch
                    {
                        Marshal.FreeHGlobal(hGlobal);
                        throw;
                    }
                }
                finally
                {
                    CloseClipboard();
                }
            }
            catch (Exception ex)
            {
                Debug.WriteLine($"通过API设置GVML数据失败: {ex.Message}");
                return false;
            }
        }

        // Windows API声明 - 添加SetClipboardData和EmptyClipboard
        [System.Runtime.InteropServices.DllImport("user32.dll")]
        private static extern IntPtr SetClipboardData(uint uFormat, IntPtr data);

        [System.Runtime.InteropServices.DllImport("user32.dll")]
        private static extern bool EmptyClipboard();

        // 处理剪贴板GVML数据按钮事件
        private void button13_Click(object sender, RibbonControlEventArgs e)
        {
            try
            {
                Debug.WriteLine("=== 开始处理剪贴板GVML数据 ===");

                var app = Globals.ThisAddIn.Application;

                // 检查是否选中了形状
                if (app.ActiveWindow.Selection.Type != PpSelectionType.ppSelectionShapes)
                {
                    MessageBox.Show("请先选中一个PowerPoint形状。", "提示", MessageBoxButtons.OK, MessageBoxIcon.Information);
                    return;
                }

                var shapeRange = app.ActiveWindow.Selection.ShapeRange;
                if (shapeRange.Count == 0)
                {
                    MessageBox.Show("未选中任何形状。", "提示", MessageBoxButtons.OK, MessageBoxIcon.Information);
                    return;
                }

                Debug.WriteLine($"选中了 {shapeRange.Count} 个形状");

                // 显示确认对话框
                string confirmMsg = $"检测到选中的PowerPoint形状。\n\n" +
                                   "此操作将：\n" +
                                   "1. 复制选中形状的所有格式到剪贴板\n" +
                                   "2. 提取GVML数据中的图片\n" +
                                   "3. 通过抠图API处理图片\n" +
                                   "4. 将处理后的图片重新打包成GVML数据\n" +
                                   "5. 替换剪贴板中的GVML数据，保持其他格式\n\n" +
                                   "是否继续？";

                DialogResult result = MessageBox.Show(confirmMsg, "确认处理", MessageBoxButtons.YesNo, MessageBoxIcon.Question);
                if (result == DialogResult.Yes)
                {
                    // 调用异步处理方法
                    ProcessClipboardGVMLWithKoukoutu();
                }
                else
                {
                    Debug.WriteLine("用户取消了操作");
                }
            }
            catch (Exception ex)
            {
                Debug.WriteLine($"处理剪贴板GVML数据时发生错误: {ex.Message}");
                MessageBox.Show($"处理剪贴板GVML数据时发生错误: {ex.Message}", "错误", MessageBoxButtons.OK, MessageBoxIcon.Error);
            }
        }

        // 测试剪贴板设置功能按钮事件
        private void button14_Click(object sender, RibbonControlEventArgs e)
        {
            try
            {
                Debug.WriteLine("=== 测试剪贴板设置功能 ===");

                // 检查剪贴板中是否有GVML数据
                var originalGvmlData = GetGVMLDataFromClipboard();
                if (originalGvmlData == null || originalGvmlData.Length == 0)
                {
                    MessageBox.Show("剪贴板中没有找到GVML数据。\n请先复制一个PowerPoint形状到剪贴板。", "提示", MessageBoxButtons.OK, MessageBoxIcon.Information);
                    return;
                }

                Debug.WriteLine($"原始GVML数据大小: {originalGvmlData.Length} 字节");

                // 显示原始剪贴板格式
                Debug.WriteLine("原始剪贴板格式:");
                var originalDataObj = System.Windows.Forms.Clipboard.GetDataObject();
                var originalFormats = originalDataObj?.GetFormats();
                if (originalFormats != null)
                {
                    foreach (var format in originalFormats)
                    {
                        Debug.WriteLine($"  - {format}");
                    }
                }

                // 提取原始图片
                var originalImageBytes = ExtractImageFromGVMLData(originalGvmlData);
                if (originalImageBytes == null || originalImageBytes.Length == 0)
                {
                    MessageBox.Show("未能从GVML数据中提取到图片。", "错误", MessageBoxButtons.OK, MessageBoxIcon.Error);
                    return;
                }

                Debug.WriteLine($"原始图片大小: {originalImageBytes.Length} 字节");

                // 创建一个简单的测试图片（将原图片转换为PNG格式）
                byte[] testImageBytes = null;
                try
                {
                    using (var originalStream = new MemoryStream(originalImageBytes))
                    using (var image = System.Drawing.Image.FromStream(originalStream))
                    using (var newStream = new MemoryStream())
                    {
                        image.Save(newStream, System.Drawing.Imaging.ImageFormat.Png);
                        testImageBytes = newStream.ToArray();
                    }
                }
                catch (Exception ex)
                {
                    Debug.WriteLine($"转换图片格式失败: {ex.Message}");
                    // 如果转换失败，直接使用原图片
                    testImageBytes = originalImageBytes;
                }

                Debug.WriteLine($"测试图片大小: {testImageBytes.Length} 字节");

                // 重新打包GVML数据
                var newGvmlData = CreateGVMLDataWithNewImage(originalGvmlData, testImageBytes);
                if (newGvmlData == null || newGvmlData.Length == 0)
                {
                    MessageBox.Show("重新打包GVML数据失败。", "错误", MessageBoxButtons.OK, MessageBoxIcon.Error);
                    return;
                }

                Debug.WriteLine($"新GVML数据大小: {newGvmlData.Length} 字节");

                // 设置到剪贴板
                bool setSuccess = SetGVMLDataToClipboard(newGvmlData);
                if (!setSuccess)
                {
                    MessageBox.Show("设置剪贴板数据失败。", "错误", MessageBoxButtons.OK, MessageBoxIcon.Error);
                    return;
                }

                // 验证设置是否成功并显示详细信息
                var verifyDataObj = System.Windows.Forms.Clipboard.GetDataObject();
                var verifyFormats = verifyDataObj?.GetFormats();

                if (verifyFormats != null && verifyFormats.Length > 0)
                {
                    var formatInfo = new StringBuilder();
                    formatInfo.AppendLine("剪贴板设置测试成功！");
                    formatInfo.AppendLine();
                    formatInfo.AppendLine($"原始数据大小: {originalGvmlData.Length} 字节");
                    formatInfo.AppendLine($"新数据大小: {newGvmlData.Length} 字节");
                    formatInfo.AppendLine($"剪贴板中格式数量: {verifyFormats.Length}");
                    formatInfo.AppendLine();
                    formatInfo.AppendLine("剪贴板中的格式:");

                    foreach (var format in verifyFormats)
                    {
                        try
                        {
                            var data = verifyDataObj.GetData(format);
                            string dataInfo = "";
                            if (data is byte[] bytes)
                            {
                                dataInfo = $" ({bytes.Length} 字节)";
                            }
                            else if (data is System.Drawing.Image img)
                            {
                                dataInfo = $" (图片: {img.Width}x{img.Height})";
                            }
                            else if (data != null)
                            {
                                dataInfo = $" ({data.GetType().Name})";
                            }
                            formatInfo.AppendLine($"  - {format}{dataInfo}");
                        }
                        catch (Exception ex)
                        {
                            formatInfo.AppendLine($"  - {format} (获取数据失败: {ex.Message})");
                        }
                    }

                    string successMsg = formatInfo.ToString();
                    Debug.WriteLine(successMsg);
                    MessageBox.Show(successMsg, "测试成功", MessageBoxButtons.OK, MessageBoxIcon.Information);
                }
                else
                {
                    MessageBox.Show("剪贴板设置验证失败。", "错误", MessageBoxButtons.OK, MessageBoxIcon.Error);
                }

                Debug.WriteLine("=== 剪贴板设置功能测试结束 ===");
            }
            catch (Exception ex)
            {
                Debug.WriteLine($"测试剪贴板设置功能时发生错误: {ex.Message}");
                Debug.WriteLine($"异常堆栈: {ex.StackTrace}");
                MessageBox.Show($"测试剪贴板设置功能时发生错误: {ex.Message}", "错误", MessageBoxButtons.OK, MessageBoxIcon.Error);
            }
        }

        // 复制原始PowerPoint形状的所有格式到剪贴板
        private bool CopyOriginalShapeFormats()
        {
            try
            {
                Debug.WriteLine("=== 复制原始PowerPoint形状的所有格式 ===");

                var app = Globals.ThisAddIn.Application;

                // 检查是否选中了形状
                if (app.ActiveWindow.Selection.Type != PpSelectionType.ppSelectionShapes)
                {
                    Debug.WriteLine("未选中PowerPoint形状");
                    return false;
                }

                var shapeRange = app.ActiveWindow.Selection.ShapeRange;
                if (shapeRange.Count == 0)
                {
                    Debug.WriteLine("未选中任何形状");
                    return false;
                }

                Debug.WriteLine($"选中了 {shapeRange.Count} 个形状");

                // 使用强制复制方法
                Debug.WriteLine("使用强制复制方法...");
                bool copySuccess = ForceCopyShape();

                if (copySuccess)
                {
                    // 获取并显示所有格式
                    var dataObj = System.Windows.Forms.Clipboard.GetDataObject();
                    var formats = dataObj?.GetFormats();

                    if (formats != null && formats.Length > 0)
                    {
                        Debug.WriteLine($"强制复制成功，剪贴板中包含 {formats.Length} 种格式:");
                        foreach (var format in formats)
                        {
                            Debug.WriteLine($"  - {format}");
                        }
                        return true;
                    }
                }

                Debug.WriteLine("强制复制失败");
                return false;
            }
            catch (Exception ex)
            {
                Debug.WriteLine($"复制原始形状格式失败: {ex.Message}");
                Debug.WriteLine($"异常堆栈: {ex.StackTrace}");
                return false;
            }
        }

        // 将处理后的图片重新打包成GVML数据并保持其他格式
        private bool SetProcessedGVMLWithOriginalFormats(byte[] newGvmlData)
        {
            try
            {
                Debug.WriteLine("=== 设置处理后的GVML数据并保持其他格式 ===");

                if (newGvmlData == null || newGvmlData.Length == 0)
                {
                    Debug.WriteLine("新的GVML数据为空");
                    return false;
                }

                // 获取当前剪贴板中的所有数据
                var originalDataObj = System.Windows.Forms.Clipboard.GetDataObject();
                if (originalDataObj == null)
                {
                    Debug.WriteLine("无法获取原始剪贴板数据");
                    return false;
                }

                // 创建新的DataObject
                var newDataObj = new System.Windows.Forms.DataObject();

                // 复制所有原始格式，但替换GVML数据
                var originalFormats = originalDataObj.GetFormats();
                Debug.WriteLine($"复制 {originalFormats.Length} 种原始格式:");

                foreach (var format in originalFormats)
                {
                    try
                    {
                        if (format == "Art::GVML ClipFormat")
                        {
                            // 替换GVML数据
                            newDataObj.SetData(format, newGvmlData);
                            Debug.WriteLine($"  - {format} (已替换为新数据)");
                        }
                        else
                        {
                            // 保持其他格式不变
                            var originalData = originalDataObj.GetData(format);
                            newDataObj.SetData(format, originalData);
                            Debug.WriteLine($"  - {format} (保持原数据)");
                        }
                    }
                    catch (Exception ex)
                    {
                        Debug.WriteLine($"  - {format} (复制失败: {ex.Message})");
                    }
                }

                // 设置新的DataObject到剪贴板
                System.Windows.Forms.Clipboard.SetDataObject(newDataObj, true);

                // 验证设置是否成功
                var verifyDataObj = System.Windows.Forms.Clipboard.GetDataObject();
                var verifyFormats = verifyDataObj?.GetFormats();

                if (verifyFormats != null && verifyFormats.Length > 0)
                {
                    Debug.WriteLine($"剪贴板设置成功，包含 {verifyFormats.Length} 种格式");
                    return true;
                }
                else
                {
                    Debug.WriteLine("剪贴板设置验证失败");
                    return false;
                }
            }
            catch (Exception ex)
            {
                Debug.WriteLine($"设置处理后的GVML数据失败: {ex.Message}");
                return false;
            }
        }

        // 测试复制功能按钮事件
        private void button15_Click(object sender, RibbonControlEventArgs e)
        {
            try
            {
                Debug.WriteLine("=== 测试复制功能 ===");

                var app = Globals.ThisAddIn.Application;

                // 检查是否选中了形状
                if (app.ActiveWindow.Selection.Type != PpSelectionType.ppSelectionShapes)
                {
                    MessageBox.Show("请先选中一个PowerPoint形状。", "提示", MessageBoxButtons.OK, MessageBoxIcon.Information);
                    return;
                }

                var shapeRange = app.ActiveWindow.Selection.ShapeRange;
                if (shapeRange.Count == 0)
                {
                    MessageBox.Show("未选中任何形状。", "提示", MessageBoxButtons.OK, MessageBoxIcon.Information);
                    return;
                }

                Debug.WriteLine($"选中了 {shapeRange.Count} 个形状");

                // 显示形状信息
                var shapeInfo = new StringBuilder();
                shapeInfo.AppendLine($"选中了 {shapeRange.Count} 个形状:");
                for (int i = 1; i <= shapeRange.Count; i++)
                {
                    var shape = shapeRange[i];
                    shapeInfo.AppendLine($"  形状 {i}: {shape.Name}, 类型: {shape.Type}, ID: {shape.Id}");
                }
                Debug.WriteLine(shapeInfo.ToString());

                // 测试复制功能
                bool copySuccess = CopyOriginalShapeFormats();

                if (copySuccess)
                {
                    // 获取剪贴板信息
                    var dataObj = System.Windows.Forms.Clipboard.GetDataObject();
                    var formats = dataObj?.GetFormats();

                    var resultInfo = new StringBuilder();
                    resultInfo.AppendLine("复制测试成功！");
                    resultInfo.AppendLine();
                    resultInfo.AppendLine($"剪贴板中包含 {formats?.Length ?? 0} 种格式:");

                    if (formats != null)
                    {
                        foreach (var format in formats)
                        {
                            try
                            {
                                var data = dataObj.GetData(format);
                                string dataInfo = "";
                                if (data is byte[] bytes)
                                {
                                    dataInfo = $" ({bytes.Length} 字节)";
                                }
                                else if (data is System.Drawing.Image img)
                                {
                                    dataInfo = $" (图片: {img.Width}x{img.Height})";
                                }
                                else if (data != null)
                                {
                                    dataInfo = $" ({data.GetType().Name})";
                                }
                                resultInfo.AppendLine($"  - {format}{dataInfo}");
                            }
                            catch (Exception ex)
                            {
                                resultInfo.AppendLine($"  - {format} (获取数据失败: {ex.Message})");
                            }
                        }
                    }

                    string successMsg = resultInfo.ToString();
                    Debug.WriteLine(successMsg);
                    MessageBox.Show(successMsg, "复制测试成功", MessageBoxButtons.OK, MessageBoxIcon.Information);
                }
                else
                {
                    string errorMsg = "复制测试失败。\n\n请检查：\n" +
                                     "1. 选中的是否是图片形状\n" +
                                     "2. 形状是否被锁定\n" +
                                     "3. 是否有其他程序占用剪贴板\n" +
                                     "4. 尝试手动复制（Ctrl+C）是否成功";
                    Debug.WriteLine(errorMsg);
                    MessageBox.Show(errorMsg, "复制测试失败", MessageBoxButtons.OK, MessageBoxIcon.Error);
                }

                Debug.WriteLine("=== 复制功能测试结束 ===");
            }
            catch (Exception ex)
            {
                Debug.WriteLine($"测试复制功能时发生错误: {ex.Message}");
                Debug.WriteLine($"异常堆栈: {ex.StackTrace}");
                MessageBox.Show($"测试复制功能时发生错误: {ex.Message}", "错误", MessageBoxButtons.OK, MessageBoxIcon.Error);
            }
        }

        // 诊断PowerPoint形状复制问题
        private void DiagnoseShapeCopyIssue()
        {
            try
            {
                Debug.WriteLine("=== 开始诊断PowerPoint形状复制问题 ===");

                var app = Globals.ThisAddIn.Application;
                var diagnosticInfo = new StringBuilder();

                // 1. 检查PowerPoint应用程序状态
                diagnosticInfo.AppendLine("=== PowerPoint应用程序状态 ===");
                diagnosticInfo.AppendLine($"应用程序版本: {app.Version}");
                diagnosticInfo.AppendLine($"活动窗口: {(app.ActiveWindow != null ? "存在" : "不存在")}");
                diagnosticInfo.AppendLine($"活动演示文稿: {(app.ActivePresentation != null ? "存在" : "不存在")}");

                if (app.ActiveWindow != null)
                {
                    diagnosticInfo.AppendLine($"窗口标题: {app.ActiveWindow.Caption}");
                    diagnosticInfo.AppendLine($"视图类型: {app.ActiveWindow.View.Type}");
                }

                if (app.ActivePresentation != null)
                {
                    diagnosticInfo.AppendLine($"演示文稿名称: {app.ActivePresentation.Name}");
                    diagnosticInfo.AppendLine($"演示文稿路径: {app.ActivePresentation.FullName}");
                    diagnosticInfo.AppendLine($"演示文稿是否只读: {app.ActivePresentation.ReadOnly}");
                }

                // 2. 检查选择状态
                diagnosticInfo.AppendLine("\n=== 选择状态 ===");
                if (app.ActiveWindow != null)
                {
                    var selection = app.ActiveWindow.Selection;
                    diagnosticInfo.AppendLine($"选择类型: {selection.Type}");
                    diagnosticInfo.AppendLine($"选择范围数量: {selection.ShapeRange.Count}");

                    if (selection.ShapeRange.Count > 0)
                    {
                        for (int i = 1; i <= selection.ShapeRange.Count; i++)
                        {
                            var shape = selection.ShapeRange[i];
                            diagnosticInfo.AppendLine($"\n形状 {i}:");
                            diagnosticInfo.AppendLine($"  名称: {shape.Name}");
                            diagnosticInfo.AppendLine($"  类型: {shape.Type} ({(int)shape.Type})");
                            diagnosticInfo.AppendLine($"  ID: {shape.Id}");
                            diagnosticInfo.AppendLine($"  位置: ({shape.Left}, {shape.Top})");
                            diagnosticInfo.AppendLine($"  大小: {shape.Width} x {shape.Height}");

                            // 检查形状属性
                            try
                            {
                                diagnosticInfo.AppendLine($"  可见性: {shape.Visible}");
                                //diagnosticInfo.AppendLine($"  锁定: {shape.Locked}");
                                diagnosticInfo.AppendLine($"  可编辑: {shape.TextFrame.HasText}");
                            }
                            catch (Exception ex)
                            {
                                diagnosticInfo.AppendLine($"  属性检查失败: {ex.Message}");
                            }
                        }
                    }
                }

                // 3. 检查剪贴板状态
                diagnosticInfo.AppendLine("\n=== 剪贴板状态 ===");
                try
                {
                    var dataObj = System.Windows.Forms.Clipboard.GetDataObject();
                    var formats = dataObj?.GetFormats();
                    diagnosticInfo.AppendLine($"剪贴板格式数量: {formats?.Length ?? 0}");

                    if (formats != null && formats.Length > 0)
                    {
                        diagnosticInfo.AppendLine("剪贴板中的格式:");
                        foreach (var format in formats)
                        {
                            diagnosticInfo.AppendLine($"  - {format}");
                        }
                    }
                    else
                    {
                        diagnosticInfo.AppendLine("剪贴板为空");
                    }
                }
                catch (Exception ex)
                {
                    diagnosticInfo.AppendLine($"剪贴板检查失败: {ex.Message}");
                }

                // 4. 测试基本剪贴板操作
                diagnosticInfo.AppendLine("\n=== 基本剪贴板测试 ===");
                try
                {
                    string testText = "剪贴板测试 " + DateTime.Now.ToString("HH:mm:ss");
                    System.Windows.Forms.Clipboard.SetText(testText);

                    if (System.Windows.Forms.Clipboard.ContainsText())
                    {
                        string retrievedText = System.Windows.Forms.Clipboard.GetText();
                        diagnosticInfo.AppendLine($"文本剪贴板测试: 成功 ({retrievedText})");
                    }
                    else
                    {
                        diagnosticInfo.AppendLine("文本剪贴板测试: 失败");
                    }
                }
                catch (Exception ex)
                {
                    diagnosticInfo.AppendLine($"文本剪贴板测试失败: {ex.Message}");
                }

                // 5. 尝试不同的复制方法
                diagnosticInfo.AppendLine("\n=== 复制方法测试 ===");

                if (app.ActiveWindow?.Selection?.ShapeRange?.Count > 0)
                {
                    var shapeRange = app.ActiveWindow.Selection.ShapeRange;

                    // 方法1: 直接调用Copy方法
                    try
                    {
                        diagnosticInfo.AppendLine("测试方法1: 直接Copy...");
                        shapeRange.Copy();
                        System.Threading.Thread.Sleep(1000);

                        var dataObj = System.Windows.Forms.Clipboard.GetDataObject();
                        var formats = dataObj?.GetFormats();
                        diagnosticInfo.AppendLine($"方法1结果: {(formats?.Length > 0 ? "成功" : "失败")} (格式数量: {formats?.Length ?? 0})");
                    }
                    catch (Exception ex)
                    {
                        diagnosticInfo.AppendLine($"方法1失败: {ex.Message}");
                    }

                    // 方法2: 逐个复制
                    try
                    {
                        diagnosticInfo.AppendLine("测试方法2: 逐个复制...");
                        foreach (PowerPoint.Shape shape in shapeRange)
                        {
                            shape.Copy();
                            System.Threading.Thread.Sleep(500);

                            var dataObj = System.Windows.Forms.Clipboard.GetDataObject();
                            var formats = dataObj?.GetFormats();
                            if (formats?.Length > 0)
                            {
                                diagnosticInfo.AppendLine($"方法2成功: 形状 {shape.Name} 复制成功");
                                break;
                            }
                        }
                    }
                    catch (Exception ex)
                    {
                        diagnosticInfo.AppendLine($"方法2失败: {ex.Message}");
                    }

                    // 方法3: 使用SendKeys
                    try
                    {
                        diagnosticInfo.AppendLine("测试方法3: SendKeys...");
                        app.ActiveWindow.Activate();
                        System.Threading.Thread.Sleep(100);
                        System.Windows.Forms.SendKeys.SendWait("^c");
                        System.Threading.Thread.Sleep(1000);

                        var dataObj = System.Windows.Forms.Clipboard.GetDataObject();
                        var formats = dataObj?.GetFormats();
                        diagnosticInfo.AppendLine($"方法3结果: {(formats?.Length > 0 ? "成功" : "失败")} (格式数量: {formats?.Length ?? 0})");
                    }
                    catch (Exception ex)
                    {
                        diagnosticInfo.AppendLine($"方法3失败: {ex.Message}");
                    }
                }

                // 6. 提供解决方案建议
                diagnosticInfo.AppendLine("\n=== 解决方案建议 ===");
                diagnosticInfo.AppendLine("1. 确保PowerPoint窗口处于活动状态");
                diagnosticInfo.AppendLine("2. 关闭其他可能占用剪贴板的程序（如截图工具、OCR软件等）");
                diagnosticInfo.AppendLine("3. 尝试手动复制（Ctrl+C）看是否成功");
                diagnosticInfo.AppendLine("4. 检查形状是否被锁定或受保护");
                diagnosticInfo.AppendLine("5. 重启PowerPoint应用程序");
                diagnosticInfo.AppendLine("6. 检查Windows剪贴板服务是否正常");
                diagnosticInfo.AppendLine("7. 尝试以管理员身份运行PowerPoint");

                // 显示诊断结果
                string result = diagnosticInfo.ToString();
                Debug.WriteLine(result);

                // 显示在Form_xml窗口中
                var xmlForm = new Form_xml();
                xmlForm.SetXmlContent(result);
                xmlForm.Show();

                Debug.WriteLine("=== 诊断完成 ===");
            }
            catch (Exception ex)
            {
                Debug.WriteLine($"诊断过程中发生错误: {ex.Message}");
                MessageBox.Show($"诊断过程中发生错误: {ex.Message}", "错误", MessageBoxButtons.OK, MessageBoxIcon.Error);
            }
        }

        // 强制复制方法 - 尝试多种策略
        private bool ForceCopyShape()
        {
            try
            {
                Debug.WriteLine("=== 开始强制复制形状 ===");

                var app = Globals.ThisAddIn.Application;
                if (app.ActiveWindow?.Selection?.ShapeRange?.Count == 0)
                {
                    Debug.WriteLine("没有选中的形状");
                    return false;
                }

                var shapeRange = app.ActiveWindow.Selection.ShapeRange;
                Debug.WriteLine($"尝试强制复制 {shapeRange.Count} 个形状");

                // 策略1: 确保PowerPoint窗口激活
                try
                {
                    app.ActiveWindow.Activate();
                    System.Threading.Thread.Sleep(200);
                    Debug.WriteLine("PowerPoint窗口已激活");
                }
                catch (Exception ex)
                {
                    Debug.WriteLine($"激活窗口失败: {ex.Message}");
                }

                // 策略2: 清空剪贴板
                try
                {
                    System.Windows.Forms.Clipboard.Clear();
                    System.Threading.Thread.Sleep(100);
                    Debug.WriteLine("剪贴板已清空");
                }
                catch (Exception ex)
                {
                    Debug.WriteLine($"清空剪贴板失败: {ex.Message}");
                }

                // 策略3: 尝试多种复制方法
                bool copySuccess = false;

                // 方法1: 直接Copy
                try
                {
                    Debug.WriteLine("尝试方法1: 直接Copy");
                    shapeRange.Copy();
                    System.Threading.Thread.Sleep(2000);

                    var dataObj = System.Windows.Forms.Clipboard.GetDataObject();
                    var formats = dataObj?.GetFormats();
                    if (formats?.Length > 0)
                    {
                        Debug.WriteLine($"方法1成功，格式数量: {formats.Length}");
                        copySuccess = true;
                    }
                }
                catch (Exception ex)
                {
                    Debug.WriteLine($"方法1失败: {ex.Message}");
                }

                // 方法2: 逐个复制
                if (!copySuccess)
                {
                    try
                    {
                        Debug.WriteLine("尝试方法2: 逐个复制");
                        foreach (PowerPoint.Shape shape in shapeRange)
                        {
                            shape.Copy();
                            System.Threading.Thread.Sleep(1000);

                            var dataObj = System.Windows.Forms.Clipboard.GetDataObject();
                            var formats = dataObj?.GetFormats();
                            if (formats?.Length > 0)
                            {
                                Debug.WriteLine($"方法2成功，形状 {shape.Name} 复制成功");
                                copySuccess = true;
                                break;
                            }
                        }
                    }
                    catch (Exception ex)
                    {
                        Debug.WriteLine($"方法2失败: {ex.Message}");
                    }
                }

                // 方法3: SendKeys
                if (!copySuccess)
                {
                    try
                    {
                        Debug.WriteLine("尝试方法3: SendKeys");
                        app.ActiveWindow.Activate();
                        System.Threading.Thread.Sleep(200);
                        System.Windows.Forms.SendKeys.SendWait("^c");
                        System.Threading.Thread.Sleep(2000);

                        var dataObj = System.Windows.Forms.Clipboard.GetDataObject();
                        var formats = dataObj?.GetFormats();
                        if (formats?.Length > 0)
                        {
                            Debug.WriteLine($"方法3成功，格式数量: {formats.Length}");
                            copySuccess = true;
                        }
                    }
                    catch (Exception ex)
                    {
                        Debug.WriteLine($"方法3失败: {ex.Message}");
                    }
                }

                // 方法4: 使用Windows API
                if (!copySuccess)
                {
                    try
                    {
                        Debug.WriteLine("尝试方法4: Windows API");
                        copySuccess = CopyUsingWindowsAPI();
                    }
                    catch (Exception ex)
                    {
                        Debug.WriteLine($"方法4失败: {ex.Message}");
                    }
                }

                Debug.WriteLine($"强制复制结果: {(copySuccess ? "成功" : "失败")}");
                return copySuccess;
            }
            catch (Exception ex)
            {
                Debug.WriteLine($"强制复制过程中发生错误: {ex.Message}");
                return false;
            }
        }

        // 使用Windows API复制
        private bool CopyUsingWindowsAPI()
        {
            try
            {
                Debug.WriteLine("使用Windows API复制...");

                // 发送Ctrl+C到活动窗口
                IntPtr hwnd = GetForegroundWindow();
                if (hwnd != IntPtr.Zero)
                {
                    // 发送Ctrl+C消息
                    SendMessage(hwnd, WM_KEYDOWN, (IntPtr)VK_CONTROL, IntPtr.Zero);
                    SendMessage(hwnd, WM_KEYDOWN, (IntPtr)'C', IntPtr.Zero);
                    SendMessage(hwnd, WM_KEYUP, (IntPtr)'C', IntPtr.Zero);
                    SendMessage(hwnd, WM_KEYUP, (IntPtr)VK_CONTROL, IntPtr.Zero);

                    System.Threading.Thread.Sleep(1000);

                    var dataObj = System.Windows.Forms.Clipboard.GetDataObject();
                    var formats = dataObj?.GetFormats();
                    if (formats?.Length > 0)
                    {
                        Debug.WriteLine("Windows API复制成功");
                        return true;
                    }
                }

                Debug.WriteLine("Windows API复制失败");
                return false;
            }
            catch (Exception ex)
            {
                Debug.WriteLine($"Windows API复制失败: {ex.Message}");
                return false;
            }
        }

        // Windows API声明
        [System.Runtime.InteropServices.DllImport("user32.dll")]
        private static extern IntPtr GetForegroundWindow();

        [System.Runtime.InteropServices.DllImport("user32.dll")]
        private static extern IntPtr SendMessage(IntPtr hWnd, uint Msg, IntPtr wParam, IntPtr lParam);

        private const uint WM_KEYDOWN = 0x0100;
        private const uint WM_KEYUP = 0x0101;
        private const int VK_CONTROL = 0x11;

        // 诊断按钮事件
        private void button16_Click(object sender, RibbonControlEventArgs e)
        {
            try
            {
                DiagnoseShapeCopyIssue();
            }
            catch (Exception ex)
            {
                Debug.WriteLine($"诊断按钮事件失败: {ex.Message}");
                MessageBox.Show($"诊断失败: {ex.Message}", "错误", MessageBoxButtons.OK, MessageBoxIcon.Error);
            }
        }

        // 强制复制按钮事件
        private void button17_Click(object sender, RibbonControlEventArgs e)
        {
            try
            {
                Debug.WriteLine("=== 开始强制复制 ===");

                var app = Globals.ThisAddIn.Application;
                if (app.ActiveWindow?.Selection?.ShapeRange?.Count == 0)
                {
                    MessageBox.Show("请先选中一个PowerPoint形状。", "提示", MessageBoxButtons.OK, MessageBoxIcon.Information);
                    return;
                }

                bool success = ForceCopyShape();

                if (success)
                {
                    // 验证复制结果
                    var dataObj = System.Windows.Forms.Clipboard.GetDataObject();
                    var formats = dataObj?.GetFormats();

                    var resultInfo = new StringBuilder();
                    resultInfo.AppendLine("强制复制成功！");
                    resultInfo.AppendLine();
                    resultInfo.AppendLine($"剪贴板中包含 {formats?.Length ?? 0} 种格式:");

                    if (formats != null)
                    {
                        foreach (var format in formats)
                        {
                            resultInfo.AppendLine($"  - {format}");
                        }
                    }

                    string successMsg = resultInfo.ToString();
                    Debug.WriteLine(successMsg);
                    MessageBox.Show(successMsg, "强制复制成功", MessageBoxButtons.OK, MessageBoxIcon.Information);
                }
                else
                {
                    string errorMsg = "强制复制失败。\n\n建议：\n" +
                                     "1. 运行诊断功能查看详细信息\n" +
                                     "2. 关闭其他可能占用剪贴板的程序\n" +
                                     "3. 重启PowerPoint\n" +
                                     "4. 尝试手动复制（Ctrl+C）";
                    Debug.WriteLine(errorMsg);
                    MessageBox.Show(errorMsg, "强制复制失败", MessageBoxButtons.OK, MessageBoxIcon.Error);
                }

                Debug.WriteLine("=== 强制复制结束 ===");
            }
            catch (Exception ex)
            {
                Debug.WriteLine($"强制复制按钮事件失败: {ex.Message}");
                MessageBox.Show($"强制复制失败: {ex.Message}", "错误", MessageBoxButtons.OK, MessageBoxIcon.Error);
            }
        }

        //复制所选图形
        private void button18_Click(object sender, RibbonControlEventArgs e)
        {
            try
            {
                var app = Globals.ThisAddIn.Application;

                // 检查是否选中了形状
                if (app.ActiveWindow.Selection.Type != PpSelectionType.ppSelectionShapes)
                {
                    MessageBox.Show("请先选中一个PowerPoint形状。", "提示", MessageBoxButtons.OK, MessageBoxIcon.Information);
                    return;
                }

                var shapeRange = app.ActiveWindow.Selection.ShapeRange;
                if (shapeRange.Count == 0)
                {
                    MessageBox.Show("未选中任何形状。", "提示", MessageBoxButtons.OK, MessageBoxIcon.Information);
                    return;
                }

                // 最简单的复制方法
                shapeRange.Copy();

                // 获取GVML十六进制数据
                string gvmlHexData = GetGVMLDataAsHex();

                if (!string.IsNullOrEmpty(gvmlHexData))
                {
                    // 直接从GVML数据中提取图片
                    var imageBytes = ExtractImageFromGVMLData(HexStringToByteArray(gvmlHexData));

                    if (imageBytes != null && imageBytes.Length > 0)
                    {
                        Debug.WriteLine($"成功提取图片，大小: {imageBytes.Length} 字节");
                        // 保存图片到临时文件并显示
                        string tempPath = System.IO.Path.GetTempFileName() + ".png";
                        System.IO.File.WriteAllBytes(tempPath, imageBytes);
                        try
                        {
                            Process.Start("explorer.exe", $"/select,\"{tempPath}\""); // 打开图片文件
                        }
                        catch (Exception ex)
                        {
                            Debug.WriteLine($"打开图片文件失败: {ex.Message}");
                        }
                    }
                    else
                    {
                        string errorMsg = "未能从GVML数据中提取到图片。";
                        Debug.WriteLine(errorMsg);
                        MessageBox.Show(errorMsg, "错误", MessageBoxButtons.OK, MessageBoxIcon.Error);
                    }
                }
                else
                {
                    MessageBox.Show("未找到GVML数据。\n请确保选中的是PowerPoint形状。", "提示", MessageBoxButtons.OK, MessageBoxIcon.Information);
                }
                //MessageBox.Show("复制成功！", "成功", MessageBoxButtons.OK, MessageBoxIcon.Information);
            }
            catch (Exception ex)
            {
                MessageBox.Show($"复制失败: {ex.Message}", "错误", MessageBoxButtons.OK, MessageBoxIcon.Error);
            }
        }

        //粘贴所选图形
        private void button19_Click(object sender, RibbonControlEventArgs e)
        {
            try
            {
                var app = Globals.ThisAddIn.Application;
                var slide = app.ActiveWindow.View.Slide;

                if (slide == null)
                {
                    MessageBox.Show("无法获取当前幻灯片。", "错误", MessageBoxButtons.OK, MessageBoxIcon.Error);
                    return;
                }

                // 最简单的粘贴方法
                slide.Shapes.Paste();

                //MessageBox.Show("粘贴成功！", "成功", MessageBoxButtons.OK, MessageBoxIcon.Information);
            }
            catch (Exception ex)
            {
                MessageBox.Show($"粘贴失败: {ex.Message}", "错误", MessageBoxButtons.OK, MessageBoxIcon.Error);
            }
        }

        //替换图片
        private async void button20_Click(object sender, RibbonControlEventArgs e)
        {
            try
            {
                Debug.WriteLine("=== 开始图片抠图处理 ===");

                // 从注册表获取koukoutu的API Key
                string apiKey = Core.Utils.PathHelper.GetApiKeyFromRegistry("koukoutu");
                if (string.IsNullOrEmpty(apiKey))
                {
                    string errorInfo = "请先在插件设置中配置koukoutu的API Key！";
                    Debug.WriteLine(errorInfo);
                    MessageBox.Show(errorInfo, "提示", MessageBoxButtons.OK, MessageBoxIcon.Information);
                    return;
                }

                // 测试网络连接
                if (!await TestNetworkConnection())
                {
                    string errorInfo = "网络连接测试失败，请检查网络连接。";
                    Debug.WriteLine(errorInfo);
                    MessageBox.Show(errorInfo, "网络错误", MessageBoxButtons.OK, MessageBoxIcon.Error);
                    return;
                }

                Debug.WriteLine("网络连接测试通过");

                var app = Globals.ThisAddIn.Application;

                // 检查是否选中了形状
                if (app.ActiveWindow.Selection.Type != PpSelectionType.ppSelectionShapes)
                {
                    MessageBox.Show("请先选中一个PowerPoint形状。", "提示", MessageBoxButtons.OK, MessageBoxIcon.Information);
                    return;
                }

                var shapeRange = app.ActiveWindow.Selection.ShapeRange;
                if (shapeRange.Count == 0)
                {
                    MessageBox.Show("未选中任何形状。", "提示", MessageBoxButtons.OK, MessageBoxIcon.Information);
                    return;
                }

                // 最简单的复制方法
                shapeRange.Copy();

                // 获取GVML十六进制数据
                string gvmlHexData = GetGVMLDataAsHex();

                if (!string.IsNullOrEmpty(gvmlHexData))
                {
                    // 直接从GVML数据中提取图片
                    var imageBytes = ExtractImageFromGVMLData(HexStringToByteArray(gvmlHexData));

                    if (imageBytes != null && imageBytes.Length > 0)
                    {
                        Debug.WriteLine($"成功提取图片，大小: {imageBytes.Length} 字节");
                        // 保存图片到临时文件并显示
                        string tempPath = System.IO.Path.GetTempFileName() + ".png";
                        System.IO.File.WriteAllBytes(tempPath, imageBytes);
                        try
                        {
                            // 1. 从临时文件读取图片并发送到抠图API
                            Debug.WriteLine($"从临时文件读取图片: {tempPath}");
                            var originalImageBytes = System.IO.File.ReadAllBytes(tempPath);

                            // 2. 调用抠图API处理图片
                            Debug.WriteLine("调用抠图API处理图片...");
                            var processedImageBytes = await ProcessImageWithKoukoutu(originalImageBytes);

                            if (processedImageBytes != null && processedImageBytes.Length > 0)
                            {
                                Debug.WriteLine($"抠图API处理成功，处理后图片大小: {processedImageBytes.Length} 字节");

                                // 3. 将处理后的图片重新打包成GVML数据
                                Debug.WriteLine("将处理后的图片重新打包成GVML数据...");
                                var newGvmlData = CreateGVMLDataWithNewImage(HexStringToByteArray(gvmlHexData), processedImageBytes);

                                if (newGvmlData != null && newGvmlData.Length > 0)
                                {
                                    Debug.WriteLine($"重新打包GVML数据成功，大小: {newGvmlData.Length} 字节");

                                    // 4. 将新的GVML数据设置到剪贴板
                                    Debug.WriteLine("将新的GVML数据设置到剪贴板...");
                                    bool setClipboardSuccess = SetGVMLDataToClipboard(newGvmlData);

                                    if (setClipboardSuccess)
                                    {
                                        string successMsg = $"图片抠图处理完成！\n原始图片大小: {originalImageBytes.Length} 字节\n处理后图片大小: {processedImageBytes.Length} 字节\n新的GVML数据已设置到剪贴板，可以粘贴使用。";
                                        Debug.WriteLine(successMsg);
                                        MessageBox.Show(successMsg, "处理成功", MessageBoxButtons.OK, MessageBoxIcon.Information);
                                    }
                                    else
                                    {
                                        string errorMsg = "设置剪贴板数据失败。";
                                        Debug.WriteLine(errorMsg);
                                        MessageBox.Show(errorMsg, "错误", MessageBoxButtons.OK, MessageBoxIcon.Error);
                                    }
                                }
                                else
                                {
                                    string errorMsg = "重新打包GVML数据失败。";
                                    Debug.WriteLine(errorMsg);
                                    MessageBox.Show(errorMsg, "错误", MessageBoxButtons.OK, MessageBoxIcon.Error);
                                }
                            }
                            else
                            {
                                string errorMsg = "抠图API处理失败。";
                                Debug.WriteLine(errorMsg);
                                MessageBox.Show(errorMsg, "错误", MessageBoxButtons.OK, MessageBoxIcon.Error);
                            }
                        }
                        catch (Exception ex)
                        {
                            string errorInfo = $"图片抠图处理时发生错误: {ex.Message}";
                            Debug.WriteLine(errorInfo);
                            MessageBox.Show(errorInfo, "错误", MessageBoxButtons.OK, MessageBoxIcon.Error);
                        }
                        finally
                        {
                            // 清理临时文件
                            try
                            {
                                if (System.IO.File.Exists(tempPath))
                                {
                                    System.IO.File.Delete(tempPath);
                                    Debug.WriteLine($"临时文件已清理: {tempPath}");
                                }
                            }
                            catch (Exception ex)
                            {
                                Debug.WriteLine($"清理临时文件失败: {ex.Message}");
                            }
                        }
                    }
                    else
                    {
                        string errorMsg = "未能从GVML数据中提取到图片。";
                        Debug.WriteLine(errorMsg);
                        MessageBox.Show(errorMsg, "错误", MessageBoxButtons.OK, MessageBoxIcon.Error);
                    }
                }
                else
                {
                    MessageBox.Show("未找到GVML数据。\n请确保选中的是PowerPoint形状。", "提示", MessageBoxButtons.OK, MessageBoxIcon.Information);
                }

                Debug.WriteLine("=== 图片抠图处理结束 ===");
            }
            catch (Exception ex)
            {
                MessageBox.Show($"复制失败: {ex.Message}", "错误", MessageBoxButtons.OK, MessageBoxIcon.Error);
            }
        }
        //获取幻灯片屏幕坐标
        private void button21_Click(object sender, RibbonControlEventArgs e)
        {
            try
            {
                Debug.WriteLine("=== 获取选中形状屏幕坐标 ===");

                var app = Globals.ThisAddIn.Application;

                // 检查是否有活动的演示文稿
                if (app.ActivePresentation == null)
                {
                    MessageBox.Show("请先打开一个PowerPoint演示文稿。", "提示", MessageBoxButtons.OK, MessageBoxIcon.Information);
                    return;
                }

                // 检查是否有活动的窗口
                if (app.ActiveWindow == null)
                {
                    MessageBox.Show("无法获取活动窗口。", "错误", MessageBoxButtons.OK, MessageBoxIcon.Error);
                    return;
                }

                var window = app.ActiveWindow;

                // 检查是否有选中的形状
                if (window.Selection.Type != PowerPoint.PpSelectionType.ppSelectionShapes)
                {
                    MessageBox.Show("请先选中一个形状。", "提示", MessageBoxButtons.OK, MessageBoxIcon.Information);
                    return;
                }

                var shapeRange = window.Selection.ShapeRange;
                if (shapeRange.Count == 0)
                {
                    MessageBox.Show("未选中任何形状。", "提示", MessageBoxButtons.OK, MessageBoxIcon.Information);
                    return;
                }

                // 获取所有选中形状的屏幕坐标
                var shapeInfos = new List<SlideEditPositionInfo>();
                for (int i = 1; i <= shapeRange.Count; i++)
                {
                    var shape = shapeRange[i];
                    var shapeInfo = GetShapeScreenPosition(window, shape);
                    if (shapeInfo != null)
                    {
                        shapeInfos.Add(shapeInfo);
                    }
                }

                if (shapeInfos.Count > 0)
                {
                    // 显示红色轮廓
                    ShowRedOutlines(shapeInfos);

                    Debug.WriteLine($"显示 {shapeInfos.Count} 个形状的红色边框");
                }
                else
                {
                    MessageBox.Show("无法获取选中形状的坐标。", "错误", MessageBoxButtons.OK, MessageBoxIcon.Error);
                }

                Debug.WriteLine("=== 选中形状坐标获取完成 ===");
            }
            catch (Exception ex)
            {
                string errorMsg = $"获取选中形状坐标时发生错误: {ex.Message}";
                Debug.WriteLine(errorMsg);
                Debug.WriteLine($"异常堆栈: {ex.StackTrace}");
                MessageBox.Show(errorMsg, "错误", MessageBoxButtons.OK, MessageBoxIcon.Error);
            }
        }

        // 显示红色轮廓
        private void ShowRedOutline(SlideEditPositionInfo slideEditInfo)
        {
            try
            {
                Debug.WriteLine("=== 开始显示红色轮廓 ===");

                // 创建轮廓显示窗口
                var outlineForm = new SimpleOutlineForm();
                outlineForm.ShowOutline(slideEditInfo);
                outlineForm.Show();

                Debug.WriteLine("红色轮廓显示窗口已创建");
            }
            catch (Exception ex)
            {
                Debug.WriteLine($"显示红色轮廓失败: {ex.Message}");
                MessageBox.Show($"显示红色轮廓失败: {ex.Message}", "错误", MessageBoxButtons.OK, MessageBoxIcon.Error);
            }
        }

        // 获取窗口屏幕位置信息
        private WindowPositionInfo GetWindowScreenPosition(PowerPoint.DocumentWindow window)
        {
            try
            {
                var info = new WindowPositionInfo();

                // 获取窗口位置和大小
                info.Left = window.Left;
                info.Top = window.Top;
                info.Width = window.Width;
                info.Height = window.Height;

                Debug.WriteLine($"窗口位置: Left={info.Left}, Top={info.Top}, Width={info.Width}, Height={info.Height}");

                return info;
            }
            catch (Exception ex)
            {
                Debug.WriteLine($"获取窗口屏幕位置失败: {ex.Message}");
                return new WindowPositionInfo();
            }
        }

        // 获取幻灯片编辑区域屏幕位置
        private SlideEditPositionInfo GetSlideEditScreenPosition(PowerPoint.DocumentWindow window)
        {
            try
            {
                var info = new SlideEditPositionInfo();

                // 获取窗口位置
                float windowLeft = window.Left;
                float windowTop = window.Top;
                float windowWidth = window.Width;
                float windowHeight = window.Height;

                Debug.WriteLine($"窗口位置: Left={windowLeft}, Top={windowTop}, Width={windowWidth}, Height={windowHeight}");

                // 使用PointsToScreenPixels方法获取准确的屏幕坐标
                // 获取幻灯片区域的左上角和右下角坐标
                float slideLeft = window.PointsToScreenPixelsX(0);
                float slideTop = window.PointsToScreenPixelsY(0);
                float slideRight = window.PointsToScreenPixelsX(windowWidth);
                float slideBottom = window.PointsToScreenPixelsY(windowHeight);

                Debug.WriteLine($"幻灯片区域屏幕坐标: Left={slideLeft}, Top={slideTop}, Right={slideRight}, Bottom={slideBottom}");

                // 根据视图类型计算编辑区域
                if (window.View.Type == PowerPoint.PpViewType.ppViewNormal)
                {
                    // 普通视图：左侧有幻灯片缩略图，右侧是编辑区域
                    float sidePanelWidth = 200; // 左侧面板宽度
                    float toolbarHeight = 100; // 顶部工具栏高度
                    float statusBarHeight = 30; // 底部状态栏高度
                    float margin = 50; // 编辑区域边距

                    // 计算编辑区域的PowerPoint坐标
                    float editLeft = sidePanelWidth + margin;
                    float editTop = toolbarHeight + margin;
                    float editWidth = windowWidth - sidePanelWidth - 2 * margin;
                    float editHeight = windowHeight - toolbarHeight - statusBarHeight - 2 * margin;

                    // 转换为屏幕坐标
                    info.Left = window.PointsToScreenPixelsX(editLeft);
                    info.Top = window.PointsToScreenPixelsY(editTop);
                    info.Width = window.PointsToScreenPixelsX(editLeft + editWidth) - info.Left;
                    info.Height = window.PointsToScreenPixelsY(editTop + editHeight) - info.Top;
                }
                else if (window.View.Type == PowerPoint.PpViewType.ppViewSlide)
                {
                    // 幻灯片放映视图：全屏显示
                    float margin = 50;
                    float editLeft = margin;
                    float editTop = margin;
                    float editWidth = windowWidth - 2 * margin;
                    float editHeight = windowHeight - 2 * margin;

                    // 转换为屏幕坐标
                    info.Left = window.PointsToScreenPixelsX(editLeft);
                    info.Top = window.PointsToScreenPixelsY(editTop);
                    info.Width = window.PointsToScreenPixelsX(editLeft + editWidth) - info.Left;
                    info.Height = window.PointsToScreenPixelsY(editTop + editHeight) - info.Top;
                }
                else
                {
                    // 其他视图类型
                    float toolbarHeight = 100;
                    float statusBarHeight = 30;
                    float margin = 50;

                    float editLeft = margin;
                    float editTop = toolbarHeight + margin;
                    float editWidth = windowWidth - 2 * margin;
                    float editHeight = windowHeight - toolbarHeight - statusBarHeight - 2 * margin;

                    // 转换为屏幕坐标
                    info.Left = window.PointsToScreenPixelsX(editLeft);
                    info.Top = window.PointsToScreenPixelsY(editTop);
                    info.Width = window.PointsToScreenPixelsX(editLeft + editWidth) - info.Left;
                    info.Height = window.PointsToScreenPixelsY(editTop + editHeight) - info.Top;
                }

                Debug.WriteLine($"幻灯片编辑区域屏幕坐标: Left={info.Left}, Top={info.Top}, Width={info.Width}, Height={info.Height}");

                return info;
            }
            catch (Exception ex)
            {
                Debug.WriteLine($"获取幻灯片编辑区域位置失败: {ex.Message}");
                return new SlideEditPositionInfo();
            }
        }

        // 获取屏幕信息
        private ScreenInfo GetScreenInfo()
        {
            try
            {
                var info = new ScreenInfo();

                // 获取主屏幕信息
                var primaryScreen = System.Windows.Forms.Screen.PrimaryScreen;
                info.PrimaryWidth = primaryScreen.Bounds.Width;
                info.PrimaryHeight = primaryScreen.Bounds.Height;
                info.WorkAreaWidth = primaryScreen.WorkingArea.Width;
                info.WorkAreaHeight = primaryScreen.WorkingArea.Height;
                info.ScreenCount = System.Windows.Forms.Screen.AllScreens.Length;

                Debug.WriteLine($"屏幕信息: 主屏幕={info.PrimaryWidth}x{info.PrimaryHeight}, 工作区域={info.WorkAreaWidth}x{info.WorkAreaHeight}, 屏幕数量={info.ScreenCount}");

                return info;
            }
            catch (Exception ex)
            {
                Debug.WriteLine($"获取屏幕信息失败: {ex.Message}");
                return new ScreenInfo();
            }
        }

        // 窗口位置信息类
        private class WindowPositionInfo
        {
            public float Left { get; set; }
            public float Top { get; set; }
            public float Width { get; set; }
            public float Height { get; set; }
        }

        // 幻灯片视图区域位置信息类
        private class SlideViewPositionInfo
        {
            public float Left { get; set; }
            public float Top { get; set; }
            public float Width { get; set; }
            public float Height { get; set; }
        }

        // 幻灯片编辑区域位置信息类
        public class SlideEditPositionInfo
        {
            public float Left { get; set; }
            public float Top { get; set; }
            public float Width { get; set; }
            public float Height { get; set; }
            public float Rotation { get; set; } // 添加旋转角度属性
        }

        // 屏幕信息类
        private class ScreenInfo
        {
            public int PrimaryWidth { get; set; }
            public int PrimaryHeight { get; set; }
            public int WorkAreaWidth { get; set; }
            public int WorkAreaHeight { get; set; }
            public int ScreenCount { get; set; }
        }

        // 简化的轮廓显示窗口类
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

            public SimpleOutlineForm()
            {
                // 设置窗口属性
                this.FormBorderStyle = FormBorderStyle.None;
                this.ShowInTaskbar = false;
                this.TopMost = true;
                this.BackColor = Color.Black;
                this.TransparencyKey = Color.Black;
                this.WindowState = FormWindowState.Maximized;
                this.Cursor = Cursors.Cross;

                // 设置窗口样式 - 移除可能导致问题的样式
                this.SetStyle(ControlStyles.AllPaintingInWmPaint | ControlStyles.UserPaint, true);

                // 添加键盘事件处理
                this.KeyPreview = true;
                this.KeyDown += SimpleOutlineForm_KeyDown;

                // 添加鼠标事件处理
                this.MouseClick += SimpleOutlineForm_MouseClick;

                Debug.WriteLine("简化轮廓显示窗口已初始化");
            }

            public void ShowOutline(SlideEditPositionInfo slideEditInfo)
            {
                try
                {
                    // 设置轮廓矩形
                    outlineRectangle = new System.Drawing.Rectangle(
                        (int)slideEditInfo.Left,
                        (int)slideEditInfo.Top,
                        (int)slideEditInfo.Width,
                        (int)slideEditInfo.Height
                    );

                    Debug.WriteLine($"设置轮廓区域: X={outlineRectangle.X}, Y={outlineRectangle.Y}, Width={outlineRectangle.Width}, Height={outlineRectangle.Height}");

                    // 强制重绘
                    this.Invalidate();
                }
                catch (Exception ex)
                {
                    Debug.WriteLine($"设置轮廓失败: {ex.Message}");
                }
            }

            protected override void OnPaint(PaintEventArgs e)
            {
                try
                {
                    if (!isVisible) return;

                    using (var g = e.Graphics)
                    {
                        // 绘制红色轮廓 - 使用简单的线条
                        using (var pen = new Pen(Color.Red, 3))
                        {
                            g.DrawRectangle(pen, outlineRectangle);
                        }

                        // 绘制中心点
                        var centerX = outlineRectangle.X + outlineRectangle.Width / 2;
                        var centerY = outlineRectangle.Y + outlineRectangle.Height / 2;

                        using (var pen = new Pen(Color.Red, 2))
                        {
                            g.DrawLine(pen, centerX - 5, centerY, centerX + 5, centerY);
                            g.DrawLine(pen, centerX, centerY - 5, centerX, centerY + 5);
                        }
                    }
                }
                catch (Exception ex)
                {
                    Debug.WriteLine($"绘制轮廓失败: {ex.Message}");
                    // 如果绘制失败，直接关闭窗口
                    this.Close();
                }
            }

            private void SimpleOutlineForm_KeyDown(object sender, KeyEventArgs e)
            {
                if (e.KeyCode == Keys.Escape)
                {
                    Debug.WriteLine("用户按下了ESC键，关闭轮廓显示");
                    CloseOutline();
                }
            }

            private void SimpleOutlineForm_MouseClick(object sender, MouseEventArgs e)
            {
                Debug.WriteLine($"用户点击了位置: ({e.X}, {e.Y})");
                CloseOutline();
            }

            private void CloseOutline()
            {
                try
                {
                    isVisible = false;
                    this.Close();
                    Debug.WriteLine("简化轮廓显示已关闭");
                }
                catch (Exception ex)
                {
                    Debug.WriteLine($"关闭简化轮廓显示失败: {ex.Message}");
                }
            }

            protected override void OnFormClosing(FormClosingEventArgs e)
            {
                try
                {
                    Debug.WriteLine("简化轮廓显示窗口正在关闭");
                    base.OnFormClosing(e);
                }
                catch (Exception ex)
                {
                    Debug.WriteLine($"关闭窗口时发生错误: {ex.Message}");
                }
            }
        }

        // 获取选中形状的屏幕坐标
        private SlideEditPositionInfo GetSelectedShapeScreenPosition(PowerPoint.DocumentWindow window)
        {
            try
            {
                // 检查是否有选中的形状
                if (window.Selection.Type != PowerPoint.PpSelectionType.ppSelectionShapes)
                {
                    Debug.WriteLine("没有选中形状");
                    return null;
                }

                var shapeRange = window.Selection.ShapeRange;
                if (shapeRange.Count == 0)
                {
                    Debug.WriteLine("选中的形状数量为0");
                    return null;
                }

                // 获取第一个选中形状的坐标
                var shape = shapeRange[1];
                var info = new SlideEditPositionInfo();

                // 使用PointsToScreenPixels方法获取准确的屏幕坐标
                info.Left = window.PointsToScreenPixelsX(shape.Left);
                info.Top = window.PointsToScreenPixelsY(shape.Top);
                info.Width = window.PointsToScreenPixelsX(shape.Left + shape.Width) - info.Left;
                info.Height = window.PointsToScreenPixelsY(shape.Top + shape.Height) - info.Top;

                Debug.WriteLine($"选中形状屏幕坐标: Left={info.Left}, Top={info.Top}, Width={info.Width}, Height={info.Height}");
                Debug.WriteLine($"形状PowerPoint坐标: Left={shape.Left}, Top={shape.Top}, Width={shape.Width}, Height={shape.Height}");

                return info;
            }
            catch (Exception ex)
            {
                Debug.WriteLine($"获取选中形状屏幕坐标失败: {ex.Message}");
                return null;
            }
        }

        // 获取单个形状的屏幕坐标
        private SlideEditPositionInfo GetShapeScreenPosition(PowerPoint.DocumentWindow window, PowerPoint.Shape shape)
        {
            try
            {
                var info = new SlideEditPositionInfo();

                // 使用PointsToScreenPixels方法获取准确的屏幕坐标
                info.Left = window.PointsToScreenPixelsX(shape.Left);
                info.Top = window.PointsToScreenPixelsY(shape.Top);
                info.Width = window.PointsToScreenPixelsX(shape.Left + shape.Width) - info.Left;
                info.Height = window.PointsToScreenPixelsY(shape.Top + shape.Height) - info.Top;

                // 获取形状的旋转角度
                info.Rotation = shape.Rotation;

                Debug.WriteLine($"形状屏幕坐标: Left={info.Left}, Top={info.Top}, Width={info.Width}, Height={info.Height}, Rotation={info.Rotation}");
                Debug.WriteLine($"形状PowerPoint坐标: Left={shape.Left}, Top={shape.Top}, Width={shape.Width}, Height={shape.Height}, Rotation={shape.Rotation}");

                return info;
            }
            catch (Exception ex)
            {
                Debug.WriteLine($"获取形状屏幕坐标失败: {ex.Message}");
                return null;
            }
        }

        // 显示多个红色轮廓
        private void ShowRedOutlines(List<SlideEditPositionInfo> shapeInfos)
        {
            try
            {
                Debug.WriteLine("=== 开始显示多个红色轮廓 ===");

                // 关闭现有的边框窗口
                if (currentOutlineForm != null && !currentOutlineForm.IsDisposed)
                {
                    currentOutlineForm.Close();
                    currentOutlineForm = null;
                }

                // 获取PowerPoint窗口
                var app = Globals.ThisAddIn.Application;
                var window = app.ActiveWindow;

                // 创建新的智能边框窗口
                currentOutlineForm = new shibappt.SmartOutlineForm();
                currentOutlineForm.ShowOutlines(shapeInfos, window);
                currentOutlineForm.Show();

                Debug.WriteLine($"创建了包含 {shapeInfos.Count} 个形状的红色边框");
            }
            catch (Exception ex)
            {
                Debug.WriteLine($"显示红色轮廓失败: {ex.Message}");
                MessageBox.Show($"显示红色轮廓失败: {ex.Message}", "错误", MessageBoxButtons.OK, MessageBoxIcon.Error);
            }
        }

        //创建WPF窗口
        private void button22_Click(object sender, RibbonControlEventArgs e)
        {

        }
        //编辑原图
        private void button23_Click(object sender, RibbonControlEventArgs e)
        {
            try
            {
                var imageEditorManager = new ImageEditor.ImageEditorManager();
                imageEditorManager.EditOriginalImage();
            }
            catch (Exception ex)
            {
                Debug.WriteLine($"编辑原图失败: {ex.Message}");
                MessageBox.Show($"编辑原图失败: {ex.Message}", "错误", MessageBoxButtons.OK, MessageBoxIcon.Error);
            }
        }

        private void ApplyProcessedImageToSlide(PowerPoint.Slide slide, byte[] processedImageBytes, ImageInfo originalImageInfo)
        {
            try
            {
                // 创建临时文件来保存处理后的图片
                var tempFile = System.IO.Path.GetTempFileName() + ".png";
                File.WriteAllBytes(tempFile, processedImageBytes);

                // 删除原图片（如果存在）
                if (originalImageInfo.OriginalShape != null)
                {
                    originalImageInfo.OriginalShape.Delete();
                }

                // 插入新的处理后的图片
                var newShape = slide.Shapes.AddPicture(
                    tempFile,
                    Microsoft.Office.Core.MsoTriState.msoFalse,
                    Microsoft.Office.Core.MsoTriState.msoTrue,
                    originalImageInfo.Left,
                    originalImageInfo.Top,
                    originalImageInfo.Width,
                    originalImageInfo.Height);

                // 清理临时文件
                try
                {
                    File.Delete(tempFile);
                }
                catch
                {
                    // 忽略临时文件删除失败的错误
                }
            }
            catch (Exception ex)
            {
                Debug.WriteLine($"应用处理后的图片失败: {ex.Message}");
                throw;
            }
        }

        // 图标
        private void button25_Click(object sender, RibbonControlEventArgs e)
        {
            try
            {
                // 获取PowerPoint中选中形状的文本
                string selectedText = GetSelectedTextFromPowerPoint();

                // 创建WPF窗口
                var wpfWindow = new IconSearchWindow();
                wpfWindow.Show();

                Debug.WriteLine("WPF窗口已创建并显示");

                // 如果有选中的文本，直接尝试搜索
                if (!string.IsNullOrEmpty(selectedText))
                {
                    // 直接尝试导航，如果WebView2还没初始化就重试
                    var timer = new System.Windows.Forms.Timer();
                    timer.Interval = 200; // 每200毫秒重试一次
                    int maxAttempts = 50; // 最多重试50次（10秒）
                    int attempts = 0;

                    // 立即尝试第一次
                    TryNavigateToSearch(wpfWindow, selectedText, timer, maxAttempts, attempts);
                }
                else
                {
                    // 如果没有选中文本，直接尝试导航到首页
                    var timer = new System.Windows.Forms.Timer();
                    timer.Interval = 200; // 每200毫秒重试一次
                    int maxAttempts = 50; // 最多重试50次（10秒）
                    int attempts = 0;

                    // 立即尝试第一次
                    TryNavigateToHomepage(wpfWindow, timer, maxAttempts, attempts);
                }

                // TODO: 后续可以替换为ImageEditorWpf
                // var imageEditorWindow = new ImageEditorWpf();
                // imageEditorWindow.Show();
            }
            catch (Exception ex)
            {
                Debug.WriteLine($"创建WPF窗口失败: {ex.Message}");
                MessageBox.Show($"创建WPF窗口失败: {ex.Message}", "错误", MessageBoxButtons.OK, MessageBoxIcon.Error);
            }
        }

        // 获取PowerPoint中选中形状的文本
        private string GetSelectedTextFromPowerPoint()
        {
            try
            {
                if (Globals.ThisAddIn.Application.ActiveWindow != null)
                {
                    Selection selection = Globals.ThisAddIn.Application.ActiveWindow.Selection;

                    if (selection.Type == PpSelectionType.ppSelectionShapes)
                    {
                        // 获取选中的形状
                        ShapeRange shapes = selection.ShapeRange;
                        string text = "";

                        // 遍历所有选中的形状
                        for (int i = 1; i <= shapes.Count; i++)
                        {
                            Microsoft.Office.Interop.PowerPoint.Shape shape = shapes[i];

                            // 检查形状是否有文本
                            if (shape.HasTextFrame == Office.MsoTriState.msoTrue)
                            {
                                TextFrame textFrame = shape.TextFrame;
                                if (textFrame.HasText == Office.MsoTriState.msoTrue)
                                {
                                    string shapeText = textFrame.TextRange.Text.Trim();
                                    if (!string.IsNullOrEmpty(shapeText))
                                    {
                                        text += shapeText + " ";
                                    }
                                }
                            }
                        }

                        return text.Trim();
                    }
                    else if (selection.Type == PpSelectionType.ppSelectionText)
                    {
                        // 如果选中的是文本，直接获取文本内容
                        return selection.TextRange.Text.Trim();
                    }
                }

                return string.Empty;
            }
            catch (Exception ex)
            {
                Debug.WriteLine($"获取PowerPoint选中文本失败: {ex.Message}");
                return string.Empty;
            }
        }

        // 人物抠图
        private async void button26_Click(object sender, RibbonControlEventArgs e)
        {
            try
            {
                // 获取当前选中的幻灯片
                var slide = Globals.ThisAddIn.Application.ActiveWindow.View.Slide;
                if (slide == null)
                {
                    return; // 静默返回，不显示对话框
                }

                // 获取选中的图片信息
                var imageInfo = GetSelectedImageInfo(slide);
                if (imageInfo == null || imageInfo.ImageBytes == null || imageInfo.ImageBytes.Length == 0)
                {
                    return; // 静默返回，不显示对话框
                }

                // 调用exe进行抠图处理
                var processedImageBytes = await ProcessImageWithExe(imageInfo.ImageBytes);

                if (processedImageBytes != null && processedImageBytes.Length > 0)
                {
                    // 将处理后的图片插入到幻灯片
                    InsertImageToSlide(slide, processedImageBytes, imageInfo);
                }
                // 处理失败时静默返回，不显示错误对话框
            }
            catch (Exception ex)
            {
                // 只在调试模式下输出错误信息，不显示对话框
                System.Diagnostics.Debug.WriteLine($"人物抠图处理时发生错误：{ex.Message}");
            }
        }

        // <summary>
        // 调用exe程序进行图片抠图处理
        // </summary>
        // <param name="imageBytes">输入图片字节数组</param>
        // <returns>处理后的图片字节数组</returns>
        private async Task<byte[]> ProcessImageWithExe(byte[] imageBytes)
        {
            string inputFile = null;
            string outputFile = null;

            try
            {
                // 使用PathHelper获取exe路径
                string exePath = PathHelper.GetApplicationPath("Tools", "PaddleSegSharp", "PersonSegmentationExe.exe");

                System.Diagnostics.Debug.WriteLine($"Exe完整路径: {exePath}");
                System.Diagnostics.Debug.WriteLine($"输入图片大小: {imageBytes.Length} 字节");

                // 检查exe文件是否存在
                if (!System.IO.File.Exists(exePath))
                {
                    throw new Exception($"找不到exe文件：{exePath}");
                }

                // 创建临时文件路径
                string tempDir = System.IO.Path.GetTempPath();
                inputFile = System.IO.Path.Combine(tempDir, $"input_{Guid.NewGuid()}.png");
                outputFile = System.IO.Path.Combine(tempDir, $"output_{Guid.NewGuid()}.png");

                System.Diagnostics.Debug.WriteLine($"临时输入文件: {inputFile}");
                System.Diagnostics.Debug.WriteLine($"临时输出文件: {outputFile}");

                // 保存输入图片到临时文件
                System.IO.File.WriteAllBytes(inputFile, imageBytes);
                System.Diagnostics.Debug.WriteLine($"输入文件已保存，大小: {new System.IO.FileInfo(inputFile).Length} 字节");

                // 调用exe程序
                bool success = await CallExeAsync(exePath, inputFile, outputFile);

                if (success && System.IO.File.Exists(outputFile))
                {
                    // 读取输出文件
                    var processedImageBytes = System.IO.File.ReadAllBytes(outputFile);
                    System.Diagnostics.Debug.WriteLine($"输出文件读取成功，大小: {processedImageBytes.Length} 字节");

                    // 验证文件内容
                    if (processedImageBytes.Length == 0)
                    {
                        throw new Exception("输出文件为空");
                    }

                    return processedImageBytes;
                }
                else
                {
                    throw new Exception($"exe程序处理失败或输出文件不存在。Success: {success}, OutputExists: {System.IO.File.Exists(outputFile)}");
                }
            }
            catch (Exception ex)
            {
                System.Diagnostics.Debug.WriteLine($"调用exe处理图片失败: {ex.Message}");
                throw;
            }
            finally
            {
                // 清理临时文件 - 延迟清理，确保文件读取完成
                try
                {
                    if (!string.IsNullOrEmpty(inputFile) && System.IO.File.Exists(inputFile))
                    {
                        System.IO.File.Delete(inputFile);
                        System.Diagnostics.Debug.WriteLine($"已删除输入文件: {inputFile}");
                    }

                    if (!string.IsNullOrEmpty(outputFile) && System.IO.File.Exists(outputFile))
                    {
                        System.IO.File.Delete(outputFile);
                        System.Diagnostics.Debug.WriteLine($"已删除输出文件: {outputFile}");
                    }
                }
                catch (Exception ex)
                {
                    System.Diagnostics.Debug.WriteLine($"清理临时文件失败: {ex.Message}");
                }
            }
        }
        // <summary>
        // 异步调用exe程序
        // </summary>
        // <param name="exePath">exe文件路径</param>
        // <param name="inputFile">输入文件路径</param>
        // <param name="outputFile">输出文件路径</param>
        // <returns>是否成功</returns>
        private async Task<bool> CallExeAsync(string exePath, string inputFile, string outputFile)
        {
            return await Task.Run(() =>
            {
                try
                {
                    System.Diagnostics.Debug.WriteLine($"调用exe程序: {exePath}");
                    System.Diagnostics.Debug.WriteLine($"输入文件: {inputFile}");
                    System.Diagnostics.Debug.WriteLine($"输出文件: {outputFile}");

                    // 创建进程启动信息
                    var startInfo = new System.Diagnostics.ProcessStartInfo
                    {
                        FileName = exePath,
                        Arguments = $"\"{inputFile}\" \"{outputFile}\"",
                        UseShellExecute = false,
                        RedirectStandardOutput = true,
                        RedirectStandardError = true,
                        CreateNoWindow = true
                    };

                    // 启动进程
                    using (var process = new System.Diagnostics.Process { StartInfo = startInfo })
                    {
                        process.Start();

                        // 读取输出
                        string output = process.StandardOutput.ReadToEnd();
                        string error = process.StandardError.ReadToEnd();

                        // 等待进程结束
                        process.WaitForExit();

                        // 记录输出
                        if (!string.IsNullOrEmpty(output))
                        {
                            System.Diagnostics.Debug.WriteLine($"程序输出: {output}");
                        }
                        if (!string.IsNullOrEmpty(error))
                        {
                            System.Diagnostics.Debug.WriteLine($"程序错误: {error}");
                        }

                        // 检查退出码
                        if (process.ExitCode == 0)
                        {
                            System.Diagnostics.Debug.WriteLine("exe程序执行成功");
                            return true;
                        }
                        else
                        {
                            System.Diagnostics.Debug.WriteLine($"exe程序执行失败，退出码: {process.ExitCode}");
                            return false;
                        }
                    }
                }
                catch (Exception ex)
                {
                    System.Diagnostics.Debug.WriteLine($"调用exe程序异常: {ex.Message}");
                    return false;
                }
            });
        }

        // 尝试导航到搜索结果的辅助方法
        private void TryNavigateToSearch(IconSearchWindow wpfWindow, string selectedText, System.Windows.Forms.Timer timer, int maxAttempts, int attempts)
        {
            try
            {
                // 首先检查WebViewControl是否为null
                if (wpfWindow.WebViewControl == null)
                {
                    Debug.WriteLine($"WebViewControl为null，尝试次数: {attempts}");
                    attempts++;
                    if (attempts >= maxAttempts)
                    {
                        timer.Stop();
                        timer.Dispose();
                        Debug.WriteLine("WebView2初始化超时，无法导航");
                    }
                    else
                    {
                        // 设置重试
                        timer.Tick += (s, args) =>
                        {
                            TryNavigateToSearch(wpfWindow, selectedText, timer, maxAttempts, attempts);
                        };
                        timer.Start();
                    }
                    return;
                }

                // 然后检查CoreWebView2是否为null
                if (wpfWindow.WebViewControl.CoreWebView2 != null)
                {
                    // 构建搜索URL
                    string searchUrl = $"https://www.iconfont.cn/search/index?searchType=icon&q={Uri.EscapeDataString(selectedText)}";

                    // 导航到搜索结果
                    wpfWindow.WebViewControl.CoreWebView2.Navigate(searchUrl);
                    Debug.WriteLine($"直接导航到搜索结果: {searchUrl} (尝试次数: {attempts})");

                    timer.Stop();
                    timer.Dispose();
                }
                else
                {
                    attempts++;
                    if (attempts >= maxAttempts)
                    {
                        timer.Stop();
                        timer.Dispose();
                        Debug.WriteLine("WebView2初始化超时，无法导航");
                    }
                    else
                    {
                        // 设置重试
                        timer.Tick += (s, args) =>
                        {
                            TryNavigateToSearch(wpfWindow, selectedText, timer, maxAttempts, attempts);
                        };
                        timer.Start();
                    }
                }
            }
            catch (Exception ex)
            {
                Debug.WriteLine($"直接搜索失败: {ex.Message}");
                timer.Stop();
                timer.Dispose();
            }
        }

        // 尝试导航到首页的辅助方法
        private void TryNavigateToHomepage(IconSearchWindow wpfWindow, System.Windows.Forms.Timer timer, int maxAttempts, int attempts)
        {
            try
            {
                // 首先检查WebViewControl是否为null
                if (wpfWindow.WebViewControl == null)
                {
                    Debug.WriteLine($"WebViewControl为null，尝试次数: {attempts}");
                    attempts++;
                    if (attempts >= maxAttempts)
                    {
                        timer.Stop();
                        timer.Dispose();
                        Debug.WriteLine("WebView2初始化超时，无法导航到首页");
                    }
                    else
                    {
                        // 设置重试
                        timer.Tick += (s, args) =>
                        {
                            TryNavigateToHomepage(wpfWindow, timer, maxAttempts, attempts);
                        };
                        timer.Start();
                    }
                    return;
                }

                // 然后检查CoreWebView2是否为null
                if (wpfWindow.WebViewControl.CoreWebView2 != null)
                {
                    string targetUrl = wpfWindow.CurrentWebsite?.HomeUrl ?? "https://www.iconfont.cn/";
                    wpfWindow.WebViewControl.CoreWebView2.Navigate(targetUrl);
                    Debug.WriteLine($"导航到网站首页: {targetUrl} (尝试次数: {attempts})");

                    timer.Stop();
                    timer.Dispose();
                }
                else
                {
                    attempts++;
                    if (attempts >= maxAttempts)
                    {
                        timer.Stop();
                        timer.Dispose();
                        Debug.WriteLine("WebView2初始化超时，无法导航到首页");
                    }
                    else
                    {
                        // 设置重试
                        timer.Tick += (s, args) =>
                        {
                            TryNavigateToHomepage(wpfWindow, timer, maxAttempts, attempts);
                        };
                        timer.Start();
                    }
                }
            }
            catch (Exception ex)
            {
                Debug.WriteLine($"导航到首页失败: {ex.Message}");
                timer.Stop();
                timer.Dispose();
            }
        }

        // ollama
        private void button27_Click(object sender, RibbonControlEventArgs e)
        {
            try
            {
                var chatWindow = new ChatWindow();
                chatWindow.Show();
            }
            catch (Exception ex)
            {
                MessageBox.Show($"打开AI聊天窗口失败: {ex.Message}", "错误", MessageBoxButtons.OK, MessageBoxIcon.Error);
            }
        }

        private void gallery1_Click(object sender, RibbonControlEventArgs e)
        {

        }

        //轮盘
        private void splitButton1_Click(object sender, RibbonControlEventArgs e)
        {
            try
            {
                // 显示圆盘菜单
                if (Globals.ThisAddIn.CircularWindowController != null)
                {
                    Globals.ThisAddIn.CircularWindowController.ShowWindow();
                }
                else
                {
                    MessageBox.Show("圆盘窗口控制器未初始化", "错误", MessageBoxButtons.OK, MessageBoxIcon.Error);
                }
            }
            catch (Exception ex)
            {
                Debug.WriteLine($"显示圆盘菜单失败: {ex.Message}");
                MessageBox.Show($"显示圆盘菜单失败: {ex.Message}", "错误", MessageBoxButtons.OK, MessageBoxIcon.Error);
            }
        }

        //轮盘菜单设置
        private void button30_Click(object sender, RibbonControlEventArgs e)
        {
            try
            {
                // 显示圆盘设置界面
                CircularMenuConfigEditor.ShowInstance();
            }
            catch (Exception ex)
            {
                Debug.WriteLine($"打开圆盘设置界面失败: {ex.Message}");
                MessageBox.Show($"打开圆盘设置界面失败: {ex.Message}", "错误", MessageBoxButtons.OK, MessageBoxIcon.Error);
            }
        }
        //时间轴
        private void button31_Click(object sender, RibbonControlEventArgs e)
        {
            try
            {
                // 切换动画任务窗格显示/隐藏
                Globals.ThisAddIn.ToggleAnimationTaskPane();
            }
            catch (Exception ex)
            {
                Debug.WriteLine($"切换动画任务窗格失败: {ex.Message}");
                MessageBox.Show($"切换动画任务窗格失败: {ex.Message}", "错误", MessageBoxButtons.OK, MessageBoxIcon.Error);
            }
        }

        //字体
        private void button32_Click(object sender, RibbonControlEventArgs e)
        {
            try
            {
                // 获取当前PowerPoint应用程序
                var app = Globals.ThisAddIn.Application;
                if (app == null || app.ActivePresentation == null)
                {
                    MessageBox.Show("请先打开一个PowerPoint演示文稿。", "提示", MessageBoxButtons.OK, MessageBoxIcon.Information);
                    return;
                }

                var presentation = app.ActivePresentation;

                // 切换字体管理任务窗格的显示/隐藏
                Globals.ThisAddIn.ToggleFontTaskPane();
            }
            catch (Exception ex)
            {
                Debug.WriteLine($"切换字体管理任务窗格失败: {ex.Message}");
                MessageBox.Show($"切换字体管理任务窗格失败: {ex.Message}", "错误", MessageBoxButtons.OK, MessageBoxIcon.Error);
            }
        }

        //转矢量
        private async void button34_Click(object sender, RibbonControlEventArgs e)
        {
            try
            {
                // 检测是否按下了Ctrl键
                bool isCtrlPressed = (System.Windows.Forms.Control.ModifierKeys & System.Windows.Forms.Keys.Control) != 0;

                if (isCtrlPressed)
                {
                    Debug.WriteLine("=== 开始多色图片转矢量处理 ===");
                    await Task.Run(() => ConvertImageToMultiColorVector());
                }
                else
                {
                    Debug.WriteLine("=== 开始单色图片转矢量处理 ===");
                    await Task.Run(() => ConvertImageToSingleColorVector());
                }
            }
            catch (Exception ex)
            {
                string errorInfo = $"图片转矢量失败: {ex.Message}";
                Debug.WriteLine(errorInfo);
                Debug.WriteLine($"详细错误信息: {ex}");
                // MessageBox.Show(errorInfo, "错误", MessageBoxButtons.OK, MessageBoxIcon.Error);
            }
        }

        // <summary>
        // 单色转矢量处理
        // </summary>
        private void ConvertImageToSingleColorVector()
        {
            // 获取当前PowerPoint应用程序
            var app = Globals.ThisAddIn.Application;
            if (app == null || app.ActivePresentation == null)
            {
                string errorInfo = "请先打开一个PowerPoint演示文稿。";
                Debug.WriteLine(errorInfo);
                return;
            }

            Debug.WriteLine("PowerPoint应用程序获取成功");

            // 检查是否有选中的形状
            if (app.ActiveWindow?.Selection?.Type != PpSelectionType.ppSelectionShapes)
            {
                string errorInfo = "请先选择一个图片。";
                Debug.WriteLine(errorInfo);
                return;
            }

            var selection = app.ActiveWindow.Selection;
            if (selection.ShapeRange.Count == 0)
            {
                string errorInfo = "请先选择一个图片。";
                Debug.WriteLine(errorInfo);
                return;
            }

            Debug.WriteLine($"选中了 {selection.ShapeRange.Count} 个形状");

            var shape = selection.ShapeRange[1];
            Debug.WriteLine($"第一个形状类型: {shape.Type}");

            // 检查是否为图片类型
            if (shape.Type != Office.MsoShapeType.msoPicture)
            {
                string errorInfo = "请选择一个图片对象。";
                Debug.WriteLine(errorInfo);
                return;
            }

            Debug.WriteLine("图片类型验证通过，开始单色转矢量");

            // 初始化并执行图片转矢量
            try
            {
                Debug.WriteLine("开始执行单色图片转矢量功能");

                // 直接在这里实现图片转矢量功能
                ConvertImageToVector(app, shape);

                Debug.WriteLine("单色图片转矢量处理完成");
            }
            catch (FileNotFoundException ex)
            {
                string errorInfo = $"Potrace工具未找到: {ex.Message}\n\n请确保已安装Potrace工具并将potrace.exe放在项目根目录或Tools目录下。";
                Debug.WriteLine(errorInfo);
            }
            catch (OperationCanceledException ex)
            {
                Debug.WriteLine($"用户取消了操作: {ex.Message}");
            }
            catch (Exception ex)
            {
                string errorInfo = $"图片转矢量失败: {ex.Message}";
                Debug.WriteLine(errorInfo);
                Debug.WriteLine($"详细错误信息: {ex}");
            }
        }

        // <summary>
        // 多色转矢量处理
        // </summary>
        private void ConvertImageToMultiColorVector()
        {
            // 获取当前PowerPoint应用程序
            var app = Globals.ThisAddIn.Application;
            if (app == null || app.ActivePresentation == null)
            {
                string errorInfo = "请先打开一个PowerPoint演示文稿。";
                Debug.WriteLine(errorInfo);
                return;
            }

            Debug.WriteLine("PowerPoint应用程序获取成功");

            // 检查是否有选中的形状
            if (app.ActiveWindow?.Selection?.Type != PpSelectionType.ppSelectionShapes)
            {
                string errorInfo = "请先选择一个图片。";
                Debug.WriteLine(errorInfo);
                return;
            }

            var selection = app.ActiveWindow.Selection;
            if (selection.ShapeRange.Count == 0)
            {
                string errorInfo = "请先选择一个图片。";
                Debug.WriteLine(errorInfo);
                return;
            }

            Debug.WriteLine($"选中了 {selection.ShapeRange.Count} 个形状");

            var shape = selection.ShapeRange[1];
            Debug.WriteLine($"第一个形状类型: {shape.Type}");

            // 检查是否为图片类型
            if (shape.Type != Office.MsoShapeType.msoPicture)
            {
                string errorInfo = "请选择一个图片对象。";
                Debug.WriteLine(errorInfo);
                return;
            }

            Debug.WriteLine("图片类型验证通过，开始多色转矢量");

            try
            {
                Debug.WriteLine("开始执行多色图片转矢量功能");

                // 执行多色转矢量
                ConvertImageToMultiColorVectorInternal(app, shape);

                Debug.WriteLine("多色图片转矢量处理完成");
            }
            catch (Exception ex)
            {
                string errorInfo = $"多色图片转矢量失败: {ex.Message}";
                Debug.WriteLine(errorInfo);
                Debug.WriteLine($"详细错误信息: {ex}");
            }
        }

        // <summary>
        // 将选中的图片转换为矢量图
        // </summary>
        private void ConvertImageToVector(PowerPoint.Application app, PowerPoint.Shape shape)
        {
            try
            {
                // 显示颜色处理提示（注释掉，不弹窗）
                /*
                DialogResult result = MessageBox.Show(
                    "Potrace工具会将图片转换为黑白矢量图，可能会丢失颜色信息。\n\n是否继续？",
                    "颜色处理提示",
                    MessageBoxButtons.YesNo,
                    MessageBoxIcon.Question
                );

                if (result == DialogResult.No)
                {
                    throw new OperationCanceledException("用户取消了转换操作");
                }
                */

                Debug.WriteLine("开始图片转矢量处理，将转换为黑白矢量图");

                // 查找Potrace工具
                string potracePath = FindPotraceExecutable();
                if (string.IsNullOrEmpty(potracePath))
                {
                    throw new FileNotFoundException("找不到potrace.exe，请确保已安装Potrace工具");
                }

                // 创建临时目录
                string tempDir = System.IO.Path.Combine(System.IO.Path.GetTempPath(), "PotraceVectorizer");
                if (!System.IO.Directory.Exists(tempDir))
                {
                    System.IO.Directory.CreateDirectory(tempDir);
                }

                // 导出图片
                string imagePath = ExportShapeAsImage(shape, tempDir);
                if (string.IsNullOrEmpty(imagePath))
                {
                    throw new Exception("无法导出图片");
                }

                // 预处理图片（转换为黑白）
                string processedImagePath = PreprocessImage(imagePath, tempDir);
                if (string.IsNullOrEmpty(processedImagePath))
                {
                    throw new Exception("图片预处理失败");
                }

                // 转换为SVG
                string svgPath = ConvertImageToSvg(processedImagePath, potracePath, tempDir);
                if (string.IsNullOrEmpty(svgPath))
                {
                    throw new Exception("图片转换失败");
                }

                // 插入SVG到PowerPoint
                InsertSvgToPowerPoint(svgPath, shape);

                // 清理临时文件
                CleanupTempFiles(imagePath, processedImagePath, svgPath);

                Debug.WriteLine("图片转矢量完成！转换后的SVG为黑白矢量图");
                // MessageBox.Show("图片转矢量完成！\n注意：转换后的SVG为黑白矢量图", "成功", MessageBoxButtons.OK, MessageBoxIcon.Information);
            }
            catch (Exception ex)
            {
                throw new Exception($"图片转矢量失败: {ex.Message}", ex);
            }
        }

        // <summary>
        // 查找potrace.exe工具路径
        // </summary>
        private string FindPotraceExecutable()
        {
            try
            {
                // 使用PathHelper查找potrace.exe
                string potraceExe = PathHelper.FindPotraceExecutable();
                if (!string.IsNullOrEmpty(potraceExe) && System.IO.File.Exists(potraceExe))
                {
                    return potraceExe;
                }

                // 未找到potrace.exe
                System.Diagnostics.Debug.WriteLine("未找到potrace.exe工具");
                return null;
            }
            catch (Exception ex)
            {
                System.Diagnostics.Debug.WriteLine($"查找potrace.exe失败: {ex.Message}");
                return null;
            }
        }

        // <summary>
        // 从注册表获取VSTO插件的Manifest路径
        // </summary>
        private string GetVSTOManifestPath()
        {
            try
            {
                // 尝试从HKCU注册表获取
                string manifestPath = GetManifestPathFromRegistry("HKEY_CURRENT_USER\\Software\\Microsoft\\Office\\PowerPoint\\Addins\\shibappt", "Manifest");
                if (!string.IsNullOrEmpty(manifestPath))
                {
                    return manifestPath;
                }

                // 尝试从HKLM注册表获取
                manifestPath = GetManifestPathFromRegistry("HKEY_LOCAL_MACHINE\\Software\\Microsoft\\Office\\PowerPoint\\Addins\\shibappt", "Manifest");
                if (!string.IsNullOrEmpty(manifestPath))
                {
                    return manifestPath;
                }

                // 尝试64位注册表
                manifestPath = GetManifestPathFromRegistry("HKEY_CURRENT_USER\\Software\\Microsoft\\Office\\PowerPoint\\Addins\\shibappt", "Manifest", true);
                if (!string.IsNullOrEmpty(manifestPath))
                {
                    return manifestPath;
                }

                manifestPath = GetManifestPathFromRegistry("HKEY_LOCAL_MACHINE\\Software\\Microsoft\\Office\\PowerPoint\\Addins\\shibappt", "Manifest", true);
                if (!string.IsNullOrEmpty(manifestPath))
                {
                    return manifestPath;
                }

                return null;
            }
            catch (Exception ex)
            {
                System.Diagnostics.Debug.WriteLine($"获取VSTO Manifest路径失败: {ex.Message}");
                return null;
            }
        }

        // <summary>
        // 从指定注册表路径获取Manifest值
        // </summary>
        private string GetManifestPathFromRegistry(string registryPath, string valueName, bool use64Bit = false)
        {
            try
            {
                Microsoft.Win32.RegistryKey baseKey = null;
                string[] pathParts = registryPath.Split('\\');

                if (pathParts[0].Equals("HKEY_CURRENT_USER", StringComparison.OrdinalIgnoreCase))
                {
                    baseKey = use64Bit ? Microsoft.Win32.RegistryKey.OpenBaseKey(Microsoft.Win32.RegistryHive.CurrentUser, Microsoft.Win32.RegistryView.Registry64)
                                      : Microsoft.Win32.Registry.CurrentUser;
                }
                else if (pathParts[0].Equals("HKEY_LOCAL_MACHINE", StringComparison.OrdinalIgnoreCase))
                {
                    baseKey = use64Bit ? Microsoft.Win32.RegistryKey.OpenBaseKey(Microsoft.Win32.RegistryHive.LocalMachine, Microsoft.Win32.RegistryView.Registry64)
                                      : Microsoft.Win32.Registry.LocalMachine;
                }

                if (baseKey != null)
                {
                    string subKeyPath = string.Join("\\", pathParts, 1, pathParts.Length - 1);
                    using (var key = baseKey.OpenSubKey(subKeyPath))
                    {
                        if (key != null)
                        {
                            object value = key.GetValue(valueName);
                            if (value != null)
                            {
                                string manifestPath = value.ToString();
                                // 移除可能的|vstolocal后缀
                                if (manifestPath.EndsWith("|vstolocal"))
                                {
                                    manifestPath = manifestPath.Substring(0, manifestPath.Length - 10);
                                }
                                return manifestPath;
                            }
                        }
                    }
                }

                return null;
            }
            catch (Exception ex)
            {
                System.Diagnostics.Debug.WriteLine($"从注册表获取Manifest失败: {ex.Message}");
                return null;
            }
        }

        // <summary>
        // 获取项目源代码目录
        // </summary>
        private string GetProjectDirectory()
        {
            try
            {
                // 使用应用程序目录作为基础路径
                string appDir = System.IO.Path.GetDirectoryName(System.Reflection.Assembly.GetExecutingAssembly().Location);

                if (System.IO.Directory.Exists(appDir))
                {
                    return appDir;
                }

                // 如果应用程序目录不存在，返回当前目录
                return System.IO.Directory.GetCurrentDirectory();
            }
            catch (Exception ex)
            {
                System.Diagnostics.Debug.WriteLine($"获取项目目录失败: {ex.Message}");
                return System.IO.Directory.GetCurrentDirectory();
            }
        }

        // <summary>
        // 导出形状为图片
        // </summary>
        private string ExportShapeAsImage(PowerPoint.Shape shape, string tempDir)
        {
            try
            {
                string tempImagePath = System.IO.Path.Combine(tempDir, $"temp_image_{Guid.NewGuid()}.png");

                float width = shape.Width;
                float height = shape.Height;

                using (Bitmap bitmap = new Bitmap((int)width, (int)height))
                {
                    using (Graphics graphics = Graphics.FromImage(bitmap))
                    {
                        graphics.SmoothingMode = System.Drawing.Drawing2D.SmoothingMode.HighQuality;
                        graphics.InterpolationMode = System.Drawing.Drawing2D.InterpolationMode.HighQualityBicubic;
                        graphics.PixelOffsetMode = System.Drawing.Drawing2D.PixelOffsetMode.HighQuality;

                        string tempExportPath = System.IO.Path.Combine(tempDir, $"export_{Guid.NewGuid()}.png");
                        shape.Export(tempExportPath, PpShapeFormat.ppShapeFormatPNG);

                        if (System.IO.File.Exists(tempExportPath))
                        {
                            using (Bitmap exportedBitmap = new Bitmap(tempExportPath))
                            {
                                graphics.DrawImage(exportedBitmap, 0, 0, (int)width, (int)height);
                            }
                            System.IO.File.Delete(tempExportPath);
                        }
                    }

                    bitmap.Save(tempImagePath, System.Drawing.Imaging.ImageFormat.Png);
                }

                return tempImagePath;
            }
            catch (Exception ex)
            {
                Debug.WriteLine($"导出图片失败: {ex.Message}");
                return null;
            }
        }

        // <summary>
        // 预处理图片（转换为灰度并保存为BMP格式）
        // </summary>
        private string PreprocessImage(string imagePath, string tempDir)
        {
            try
            {
                Debug.WriteLine($"开始预处理图片: {imagePath}");

                // 生成输出文件名
                string fileName = System.IO.Path.GetFileNameWithoutExtension(imagePath);
                string outputPath = System.IO.Path.Combine(tempDir, $"{fileName}_processed.bmp");

                using (var originalImage = System.Drawing.Image.FromFile(imagePath))
                {
                    // 创建灰度图像
                    using (var grayImage = new System.Drawing.Bitmap(originalImage.Width, originalImage.Height, System.Drawing.Imaging.PixelFormat.Format24bppRgb))
                    {
                        using (var graphics = System.Drawing.Graphics.FromImage(grayImage))
                        {
                            // 设置高质量绘图
                            graphics.InterpolationMode = System.Drawing.Drawing2D.InterpolationMode.HighQualityBicubic;
                            graphics.SmoothingMode = System.Drawing.Drawing2D.SmoothingMode.HighQuality;
                            graphics.PixelOffsetMode = System.Drawing.Drawing2D.PixelOffsetMode.HighQuality;

                            // 创建灰度颜色矩阵
                            var colorMatrix = new System.Drawing.Imaging.ColorMatrix(
                                new float[][]
                                {
                                    new float[] {0.299f, 0.299f, 0.299f, 0, 0},
                                    new float[] {0.587f, 0.587f, 0.587f, 0, 0},
                                    new float[] {0.114f, 0.114f, 0.114f, 0, 0},
                                    new float[] {0, 0, 0, 1, 0},
                                    new float[] {0, 0, 0, 0, 1}
                                });

                            var imageAttributes = new System.Drawing.Imaging.ImageAttributes();
                            imageAttributes.SetColorMatrix(colorMatrix);

                            // 绘制灰度图像
                            graphics.DrawImage(originalImage,
                                new System.Drawing.Rectangle(0, 0, originalImage.Width, originalImage.Height),
                                0, 0, originalImage.Width, originalImage.Height,
                                System.Drawing.GraphicsUnit.Pixel, imageAttributes);
                        }

                        // 保存为BMP格式
                        grayImage.Save(outputPath, System.Drawing.Imaging.ImageFormat.Bmp);
                        Debug.WriteLine($"图片预处理完成，保存为: {outputPath}");
                    }
                }

                return outputPath;
            }
            catch (Exception ex)
            {
                Debug.WriteLine($"图片预处理失败: {ex.Message}");
                throw new Exception($"图片预处理失败: {ex.Message}", ex);
            }
        }

        // <summary>
        // 使用Potrace将图片转换为SVG
        // </summary>
        private string ConvertImageToSvg(string imagePath, string potracePath, string tempDir)
        {
            try
            {
                Debug.WriteLine($"开始转换图片为SVG: {imagePath}");
                Debug.WriteLine($"使用Potrace路径: {potracePath}");

                // 检查输入文件是否存在
                if (!System.IO.File.Exists(imagePath))
                {
                    throw new Exception($"输入图片文件不存在: {imagePath}");
                }

                // 检查Potrace可执行文件是否存在
                if (!System.IO.File.Exists(potracePath))
                {
                    throw new Exception($"Potrace可执行文件不存在: {potracePath}");
                }

                // 生成输出SVG文件名
                string fileName = System.IO.Path.GetFileNameWithoutExtension(imagePath);
                string svgPath = System.IO.Path.Combine(tempDir, $"{fileName}_vector.svg");

                Debug.WriteLine($"输出SVG路径: {svgPath}");

                // 构建Potrace命令参数 - 添加平滑选项来减少锯齿
                string arguments = $"-s -t 0.1 -a 1.0 -O 0.2 -u 1 -n -o \"{svgPath}\" \"{imagePath}\"";
                Debug.WriteLine($"Potrace命令: {potracePath} {arguments}");

                // 创建进程启动信息
                var startInfo = new System.Diagnostics.ProcessStartInfo
                {
                    FileName = potracePath,
                    Arguments = arguments,
                    UseShellExecute = false,
                    RedirectStandardOutput = true,
                    RedirectStandardError = true,
                    CreateNoWindow = true,
                    WorkingDirectory = tempDir
                };

                // 启动进程
                using (var process = new System.Diagnostics.Process { StartInfo = startInfo })
                {
                    process.Start();

                    // 读取输出和错误信息
                    string output = process.StandardOutput.ReadToEnd();
                    string error = process.StandardError.ReadToEnd();

                    process.WaitForExit();

                    Debug.WriteLine($"Potrace输出: {output}");
                    if (!string.IsNullOrEmpty(error))
                    {
                        Debug.WriteLine($"Potrace错误: {error}");
                    }
                    Debug.WriteLine($"Potrace退出代码: {process.ExitCode}");

                    // 检查进程是否成功完成
                    if (process.ExitCode != 0)
                    {
                        throw new Exception($"Potrace转换失败，退出代码: {process.ExitCode}，错误信息: {error}");
                    }

                    // 检查输出文件是否存在
                    if (!System.IO.File.Exists(svgPath))
                    {
                        throw new Exception($"SVG输出文件未生成: {svgPath}");
                    }

                    Debug.WriteLine($"SVG转换成功: {svgPath}");
                    return svgPath;
                }
            }
            catch (Exception ex)
            {
                Debug.WriteLine($"图片转SVG失败: {ex.Message}");
                throw new Exception($"图片转SVG失败: {ex.Message}", ex);
            }
        }

        // <summary>
        // 将SVG插入到PowerPoint中
        // </summary>
        private void InsertSvgToPowerPoint(string svgPath, PowerPoint.Shape originalShape)
        {
            try
            {
                Debug.WriteLine($"开始插入SVG到PowerPoint: {svgPath}");

                // 获取原始形状的位置和大小
                float left = originalShape.Left;
                float top = originalShape.Top;
                float width = originalShape.Width;
                float height = originalShape.Height;

                Debug.WriteLine($"原始形状位置: Left={left}, Top={top}, Width={width}, Height={height}");

                // 删除原始形状
                originalShape.Delete();
                Debug.WriteLine("原始形状已删除");

                // 插入SVG文件
                PowerPoint.Shape svgShape = null;
                try
                {
                    svgShape = Globals.ThisAddIn.Application.ActiveWindow.View.Slide.Shapes.AddPicture(
                        svgPath,
                        Office.MsoTriState.msoFalse,
                        Office.MsoTriState.msoTrue,
                        left, top, width, height);

                    Debug.WriteLine("SVG文件插入成功");
                }
                catch (Exception ex)
                {
                    Debug.WriteLine($"插入SVG文件失败: {ex.Message}");
                    throw new Exception($"插入SVG文件失败: {ex.Message}", ex);
                }

                // 选中插入的SVG形状
                svgShape.Select();
                Debug.WriteLine("SVG形状已选中");

                // 执行SVG编辑命令（转换为形状）
                try
                {
                    Debug.WriteLine("执行SVG编辑命令...");
                    Globals.ThisAddIn.Application.CommandBars.ExecuteMso("SVGEdit");
                    Debug.WriteLine("SVG编辑命令执行成功");
                }
                catch (Exception ex)
                {
                    Debug.WriteLine($"执行SVG编辑命令失败: {ex.Message}");
                    // 不抛出异常，因为有些SVG可能无法转换
                }

                // 检查是否有多个选中的形状
                PowerPoint.Selection selection = Globals.ThisAddIn.Application.ActiveWindow.Selection;
                if (selection.ShapeRange.Count > 1)
                {
                    Debug.WriteLine($"检测到 {selection.ShapeRange.Count} 个形状，执行组合命令");
                    try
                    {
                        // 执行组合命令
                        Globals.ThisAddIn.Application.CommandBars.ExecuteMso("ObjectsGroup");
                        Debug.WriteLine("组合命令执行成功");
                    }
                    catch (Exception ex)
                    {
                        Debug.WriteLine($"执行组合命令失败: {ex.Message}");
                        // 不抛出异常，组合失败不影响主要功能
                    }
                }
                else
                {
                    Debug.WriteLine("只有一个形状，无需组合");
                }

                Debug.WriteLine("SVG插入和转换完成");
            }
            catch (Exception ex)
            {
                Debug.WriteLine($"插入SVG到PowerPoint失败: {ex.Message}");
                throw new Exception($"插入SVG到PowerPoint失败: {ex.Message}", ex);
            }
        }

        // <summary>
        // 清理临时文件
        // </summary>
        private void CleanupTempFiles(params string[] filePaths)
        {
            foreach (string path in filePaths)
            {
                try
                {
                    if (!string.IsNullOrEmpty(path) && System.IO.File.Exists(path))
                    {
                        System.IO.File.Delete(path);
                    }
                }
                catch (Exception ex)
                {
                    Debug.WriteLine($"清理临时文件失败: {ex.Message}");
                }
            }
        }

        // <summary>
        // 多色转矢量处理（图像分色 + 分区域轮廓提取 + 多次矢量化 + 叠加颜色）
        // </summary>
        private void ConvertImageToMultiColorVectorInternal(PowerPoint.Application app, PowerPoint.Shape shape)
        {
            try
            {
                Debug.WriteLine("开始多色图片转矢量处理，将保持原始颜色");

                // 查找Potrace工具
                string potracePath = FindPotraceExecutable();
                if (string.IsNullOrEmpty(potracePath))
                {
                    throw new FileNotFoundException("找不到potrace.exe，请确保已安装Potrace工具");
                }

                // 创建临时目录
                string tempDir = System.IO.Path.Combine(System.IO.Path.GetTempPath(), "PotraceMultiColorVectorizer");
                if (!System.IO.Directory.Exists(tempDir))
                {
                    System.IO.Directory.CreateDirectory(tempDir);
                }

                // 导出原始图片
                string originalImagePath = ExportShapeAsImage(shape, tempDir);
                if (string.IsNullOrEmpty(originalImagePath))
                {
                    throw new Exception("无法导出图片");
                }

                Debug.WriteLine($"原始图片导出成功: {originalImagePath}");

                // 获取原始形状的位置和大小
                float left = shape.Left;
                float top = shape.Top;
                float width = shape.Width;
                float height = shape.Height;

                // 执行图像分色
                var colorLayers = SeparateImageByColors(originalImagePath, tempDir);
                Debug.WriteLine($"图像分色完成，共分离出 {colorLayers.Count} 个颜色图层");

                if (colorLayers.Count == 0)
                {
                    throw new Exception("图像分色失败，未检测到有效颜色");
                }

                // 删除原始形状
                shape.Delete();
                Debug.WriteLine("原始形状已删除");

                // 对每个颜色图层进行矢量化
                var svgLayers = new List<ColorSvgLayer>();
                foreach (var layer in colorLayers)
                {
                    try
                    {
                        Debug.WriteLine($"开始处理颜色图层: {layer.ColorName} (RGB: {layer.R}, {layer.G}, {layer.B})");

                        // 对当前颜色图层进行矢量化
                        string svgPath = ConvertImageToSvg(layer.ImagePath, potracePath, tempDir);
                        if (!string.IsNullOrEmpty(svgPath))
                        {
                            svgLayers.Add(new ColorSvgLayer
                            {
                                SvgPath = svgPath,
                                Color = System.Drawing.Color.FromArgb(layer.R, layer.G, layer.B),
                                ColorName = layer.ColorName
                            });
                            Debug.WriteLine($"颜色图层 {layer.ColorName} 矢量化成功");
                        }
                        else
                        {
                            Debug.WriteLine($"颜色图层 {layer.ColorName} 矢量化失败");
                        }
                    }
                    catch (Exception ex)
                    {
                        Debug.WriteLine($"处理颜色图层 {layer.ColorName} 时发生错误: {ex.Message}");
                    }
                }

                if (svgLayers.Count == 0)
                {
                    throw new Exception("所有颜色图层矢量化都失败了");
                }

                Debug.WriteLine($"矢量化完成，共生成 {svgLayers.Count} 个SVG图层");

                // 将多个SVG图层叠加插入到PowerPoint
                InsertMultiColorSvgToPowerPoint(svgLayers, left, top, width, height);

                // 清理临时文件
                var allTempFiles = new List<string> { originalImagePath };
                allTempFiles.AddRange(colorLayers.Select(l => l.ImagePath));
                allTempFiles.AddRange(svgLayers.Select(s => s.SvgPath));
                CleanupTempFiles(allTempFiles.ToArray());

                Debug.WriteLine("多色图片转矢量处理完成！");
            }
            catch (Exception ex)
            {
                throw new Exception($"多色图片转矢量失败: {ex.Message}", ex);
            }
        }

        // <summary>
        // 颜色图层信息
        // </summary>
        private class ColorLayer
        {
            public string ImagePath { get; set; }
            public string ColorName { get; set; }
            public int R { get; set; }
            public int G { get; set; }
            public int B { get; set; }
        }

        // <summary>
        // 颜色SVG图层信息
        // </summary>
        private class ColorSvgLayer
        {
            public string SvgPath { get; set; }
            public System.Drawing.Color Color { get; set; }
            public string ColorName { get; set; }
        }

        private System.Drawing.Color QuantizeColorPrecise(System.Drawing.Color color)
        {
            // 使用更粗粒度的量化（每通道32个级别），大幅减少颜色数量
            int r = (color.R / 32) * 32;
            int g = (color.G / 32) * 32;
            int b = (color.B / 32) * 32;

            return System.Drawing.Color.FromArgb(color.A, r, g, b);
        }

        // <summary>
        // 获取颜色名称
        // </summary>
        private string GetColorName(System.Drawing.Color color)
        {
            // 简单的颜色命名逻辑
            if (color.R > 200 && color.G > 200 && color.B > 200) return "白色";
            if (color.R < 50 && color.G < 50 && color.B < 50) return "黑色";
            if (color.R > 200 && color.G < 100 && color.B < 100) return "红色";
            if (color.R < 100 && color.G > 200 && color.B < 100) return "绿色";
            if (color.R < 100 && color.G < 100 && color.B > 200) return "蓝色";
            if (color.R > 200 && color.G > 200 && color.B < 100) return "黄色";
            if (color.R > 200 && color.G < 100 && color.B > 200) return "紫色";
            if (color.R < 100 && color.G > 200 && color.B > 200) return "青色";

            return $"颜色_{color.R}_{color.G}_{color.B}";
        }
        // <summary>
        // 将多个SVG图层叠加插入到PowerPoint
        // </summary>
        private void InsertMultiColorSvgToPowerPoint(List<ColorSvgLayer> svgLayers, float left, float top, float width, float height)
        {
            try
            {
                Debug.WriteLine($"开始插入 {svgLayers.Count} 个SVG图层到PowerPoint");

                var slide = Globals.ThisAddIn.Application.ActiveWindow.View.Slide;
                var insertedShapes = new List<PowerPoint.Shape>();

                // 插入每个SVG图层
                foreach (var layer in svgLayers)
                {
                    try
                    {
                        Debug.WriteLine($"插入SVG图层: {layer.ColorName}");

                        // 插入SVG文件
                        var svgShape = slide.Shapes.AddPicture(
                            layer.SvgPath,
                            Office.MsoTriState.msoFalse,
                            Office.MsoTriState.msoTrue,
                            left, top, width, height);

                        // 执行SVG编辑命令（转换为形状）
                        svgShape.Select();
                        try
                        {
                            Globals.ThisAddIn.Application.CommandBars.ExecuteMso("SVGEdit");
                            Debug.WriteLine($"SVG图层 {layer.ColorName} 转换为形状成功");
                        }
                        catch (Exception ex)
                        {
                            Debug.WriteLine($"SVG图层 {layer.ColorName} 转换失败: {ex.Message}");
                        }

                        // 设置形状颜色
                        try
                        {
                            var selection = Globals.ThisAddIn.Application.ActiveWindow.Selection;
                            if (selection.ShapeRange.Count > 0)
                            {
                                var shape = selection.ShapeRange[1];

                                // 设置填充颜色
                                if (shape.Fill.Type == Office.MsoFillType.msoFillSolid)
                                {
                                    shape.Fill.ForeColor.RGB = (layer.Color.B << 16) | (layer.Color.G << 8) | layer.Color.R;
                                }

                                // 设置线条颜色
                                if (shape.Line.Visible == Office.MsoTriState.msoTrue)
                                {
                                    shape.Line.ForeColor.RGB = (layer.Color.B << 16) | (layer.Color.G << 8) | layer.Color.R;
                                }

                                Debug.WriteLine($"设置SVG图层 {layer.ColorName} 颜色成功");
                            }
                        }
                        catch (Exception ex)
                        {
                            Debug.WriteLine($"设置SVG图层 {layer.ColorName} 颜色失败: {ex.Message}");
                        }

                        insertedShapes.Add(svgShape);
                    }
                    catch (Exception ex)
                    {
                        Debug.WriteLine($"插入SVG图层 {layer.ColorName} 失败: {ex.Message}");
                    }
                }

                // 如果有多个形状，尝试组合它们
                if (insertedShapes.Count > 1)
                {
                    try
                    {
                        // 选中所有插入的形状
                        var shapeRange = slide.Shapes.Range(
                            insertedShapes.Select(s => s.Name).ToArray());
                        shapeRange.Select();

                        // 执行组合命令
                        Globals.ThisAddIn.Application.CommandBars.ExecuteMso("ObjectsGroup");
                        Debug.WriteLine("多个SVG图层组合成功");
                    }
                    catch (Exception ex)
                    {
                        Debug.WriteLine($"组合SVG图层失败: {ex.Message}");
                    }
                }

                Debug.WriteLine("多色SVG图层插入完成");
            }
            catch (Exception ex)
            {
                Debug.WriteLine($"插入多色SVG图层失败: {ex.Message}");
                throw new Exception($"插入多色SVG图层失败: {ex.Message}", ex);
            }
        }

        // 智能分色主方法
        private List<ColorLayer> SeparateImageByColors(string imagePath, string tempDir)
        {
            try
            {
                Debug.WriteLine("开始智能图像分色处理（基于K-means聚类）");
                var colorLayers = new List<ColorLayer>();

                using (var bitmap = new System.Drawing.Bitmap(imagePath))
                {
                    // 第一步：使用K-means聚类找出主要颜色
                    var mainColors = FindMainColorsWithKMeans(bitmap, 20); // 增加到12种主要颜色，确保覆盖所有重要区域
                    Debug.WriteLine($"K-means聚类识别出 {mainColors.Count} 种主要颜色");

                    // 第二步：为每种主要颜色提取对应区域，确保空间连续性
                    var processedMask = new bool[bitmap.Width, bitmap.Height];

                    foreach (var mainColor in mainColors)
                    {
                        Debug.WriteLine($"处理主要颜色: {GetColorName(mainColor)} (RGB: {mainColor.R}, {mainColor.G}, {mainColor.B})");

                        // 提取该颜色的连续区域
                        var layerPath = ExtractContinuousColorRegion(bitmap, mainColor, processedMask, tempDir);

                        if (!string.IsNullOrEmpty(layerPath))
                        {
                            colorLayers.Add(new ColorLayer
                            {
                                ImagePath = layerPath,
                                ColorName = GetColorName(mainColor),
                                R = mainColor.R,
                                G = mainColor.G,
                                B = mainColor.B
                            });
                        }
                    }
                }

                Debug.WriteLine($"智能分色完成，共创建 {colorLayers.Count} 个颜色图层");
                return colorLayers;
            }
            catch (Exception ex)
            {
                Debug.WriteLine($"智能分色失败: {ex.Message}");
                throw new Exception($"智能分色失败: {ex.Message}", ex);
            }
        }

        // K-means聚类找主色（基于空间占用率）
        private List<System.Drawing.Color> FindMainColorsWithKMeans(System.Drawing.Bitmap bitmap, int k)
        {
            var pixels = new List<System.Drawing.Color>();
            for (int y = 0; y < bitmap.Height; y++)
                for (int x = 0; x < bitmap.Width; x++)
                {
                    var pixelColor = bitmap.GetPixel(x, y);
                    if (pixelColor.A >= 128) pixels.Add(pixelColor);
                }
            if (pixels.Count == 0) return new List<System.Drawing.Color>();

            int totalPixels = bitmap.Width * bitmap.Height;
            Debug.WriteLine($"图像总像素数: {totalPixels}");

            // 使用较大的初始K值进行聚类
            int initialK = Math.Min(40, pixels.Count);
            var centroids = KMeansClustering(pixels, initialK);
            var colorCounts = new Dictionary<System.Drawing.Color, int>();
            foreach (var pixel in pixels)
            {
                var nearestCentroid = FindNearestCentroid(pixel, centroids);
                if (colorCounts.ContainsKey(nearestCentroid)) colorCounts[nearestCentroid]++;
                else colorCounts[nearestCentroid] = 1;
            }

            // 按像素数量排序
            var sortedColors = colorCounts.OrderByDescending(x => x.Value).ToList();

            // 直接选择前N个主要颜色，不再基于空间占用率
            var mainColors = new List<System.Drawing.Color>();
            int maxColors = 20; // 最多选择8种主要颜色

            for (int i = 0; i < Math.Min(maxColors, sortedColors.Count); i++)
            {
                var colorInfo = sortedColors[i];
                mainColors.Add(colorInfo.Key);
                double percentage = (double)colorInfo.Value / totalPixels * 100;
                Debug.WriteLine($"选择主要颜色 {GetColorName(colorInfo.Key)} (RGB: {colorInfo.Key.R},{colorInfo.Key.G},{colorInfo.Key.B}), 像素数: {colorInfo.Value}, 占比: {percentage:F1}%");
            }

            Debug.WriteLine($"直接选择出 {mainColors.Count} 种主要颜色");
            return mainColors;
        }
        // K-means核心
        private List<System.Drawing.Color> KMeansClustering(List<System.Drawing.Color> pixels, int k)
        {
            if (pixels.Count == 0 || k <= 0) return new List<System.Drawing.Color>();
            var random = new Random();
            var centroids = new List<System.Drawing.Color>();
            for (int i = 0; i < k; i++) centroids.Add(pixels[random.Next(pixels.Count)]);
            var clusters = new List<List<System.Drawing.Color>>();
            for (int i = 0; i < k; i++) clusters.Add(new List<System.Drawing.Color>());
            bool converged = false; int maxIterations = 100, iteration = 0;
            while (!converged && iteration < maxIterations)
            {
                foreach (var cluster in clusters) cluster.Clear();
                foreach (var pixel in pixels)
                {
                    int nearestIndex = 0; double minDistance = double.MaxValue;
                    for (int i = 0; i < centroids.Count; i++)
                    {
                        double distance = CalculateColorDistance(pixel, centroids[i]);
                        if (distance < minDistance) { minDistance = distance; nearestIndex = i; }
                    }
                    clusters[nearestIndex].Add(pixel);
                }
                var newCentroids = new List<System.Drawing.Color>();
                converged = true;
                for (int i = 0; i < clusters.Count; i++)
                {
                    if (clusters[i].Count > 0)
                    {
                        var newCentroid = CalculateAverageColor(clusters[i]);
                        newCentroids.Add(newCentroid);
                        if (CalculateColorDistance(centroids[i], newCentroid) > 5) converged = false;
                    }
                    else newCentroids.Add(centroids[i]);
                }
                centroids = newCentroids; iteration++;
            }
            Debug.WriteLine($"K-means聚类完成，迭代次数: {iteration}");
            return centroids;
        }

        // 颜色距离
        private double CalculateColorDistance(System.Drawing.Color color1, System.Drawing.Color color2)
        {
            int deltaR = color1.R - color2.R, deltaG = color1.G - color2.G, deltaB = color1.B - color2.B;
            return Math.Sqrt(deltaR * deltaR + deltaG * deltaG + deltaB * deltaB);
        }
        private System.Drawing.Color FindNearestCentroid(System.Drawing.Color pixel, List<System.Drawing.Color> centroids)
        {
            int nearestIndex = 0; double minDistance = double.MaxValue;
            for (int i = 0; i < centroids.Count; i++)
            {
                double distance = CalculateColorDistance(pixel, centroids[i]);
                if (distance < minDistance) { minDistance = distance; nearestIndex = i; }
            }
            return centroids[nearestIndex];
        }
        // 提取空间连续区域
        private string ExtractContinuousColorRegion(System.Drawing.Bitmap bitmap, System.Drawing.Color targetColor, bool[,] processedMask, string tempDir)
        {
            try
            {
                string layerPath = System.IO.Path.Combine(tempDir, $"layer_{GetColorName(targetColor)}_{Guid.NewGuid()}.bmp");
                using (var layerBitmap = new System.Drawing.Bitmap(bitmap.Width, bitmap.Height))
                {
                    for (int x = 0; x < bitmap.Width; x++)
                        for (int y = 0; y < bitmap.Height; y++)
                            layerBitmap.SetPixel(x, y, System.Drawing.Color.White);
                    int totalPixelCount = 0;
                    var visited = new bool[bitmap.Width, bitmap.Height];
                    for (int x = 0; x < bitmap.Width; x++)
                        for (int y = 0; y < bitmap.Height; y++)
                        {
                            if (!visited[x, y] && !processedMask[x, y])
                            {
                                var pixelColor = bitmap.GetPixel(x, y);
                                if (CalculateColorDistance(pixelColor, targetColor) <= 40) // 增加颜色距离阈值到80，更宽松的颜色匹配
                                {
                                    var regionPixels = FloodFill(bitmap, x, y, targetColor, visited, processedMask);
                                    if (regionPixels.Count >= 20) // 降低最小像素数要求到50，捕获更小的区域
                                    {
                                        foreach (var pixel in regionPixels)
                                        {
                                            layerBitmap.SetPixel(pixel.X, pixel.Y, System.Drawing.Color.Black);
                                            processedMask[pixel.X, pixel.Y] = true;
                                            totalPixelCount++;
                                        }
                                    }
                                }
                            }
                        }
                    if (totalPixelCount >= 50) // 降低总像素数要求到50
                    {
                        layerBitmap.Save(layerPath, System.Drawing.Imaging.ImageFormat.Bmp);
                        Debug.WriteLine($"连续颜色区域 {GetColorName(targetColor)} 提取成功，像素数: {totalPixelCount}");
                        return layerPath;
                    }
                    else
                    {
                        Debug.WriteLine($"连续颜色区域 {GetColorName(targetColor)} 像素数太少，跳过: {totalPixelCount}");
                        return null;
                    }
                }
            }
            catch (Exception ex)
            {
                Debug.WriteLine($"提取连续颜色区域 {GetColorName(targetColor)} 失败: {ex.Message}");
                return null;
            }
        }
        // 洪水填充算法
        private List<System.Drawing.Point> FloodFill(System.Drawing.Bitmap bitmap, int startX, int startY, System.Drawing.Color targetColor, bool[,] visited, bool[,] processedMask)
        {
            var regionPixels = new List<System.Drawing.Point>();
            var queue = new Queue<System.Drawing.Point>();
            queue.Enqueue(new System.Drawing.Point(startX, startY));
            visited[startX, startY] = true;
            while (queue.Count > 0)
            {
                var current = queue.Dequeue();
                regionPixels.Add(current);
                var directions = new[] { new System.Drawing.Point(-1, 0), new System.Drawing.Point(1, 0), new System.Drawing.Point(0, -1), new System.Drawing.Point(0, 1) };
                foreach (var dir in directions)
                {
                    int newX = current.X + dir.X, newY = current.Y + dir.Y;
                    if (newX >= 0 && newX < bitmap.Width && newY >= 0 && newY < bitmap.Height)
                    {
                        if (!visited[newX, newY] && !processedMask[newX, newY])
                        {
                            var pixelColor = bitmap.GetPixel(newX, newY);
                            if (CalculateColorDistance(pixelColor, targetColor) <= 50)
                            {
                                visited[newX, newY] = true;
                                queue.Enqueue(new System.Drawing.Point(newX, newY));
                            }
                        }
                    }
                }
            }
            return regionPixels;
        }

        // <summary>
        // 计算多个颜色的平均值
        // </summary>
        private System.Drawing.Color CalculateAverageColor(List<System.Drawing.Color> colors)
        {
            if (colors.Count == 0) return System.Drawing.Color.Black;

            int totalR = 0, totalG = 0, totalB = 0, totalA = 0;
            foreach (var color in colors)
            {
                totalR += color.R;
                totalG += color.G;
                totalB += color.B;
                totalA += color.A;
            }

            return System.Drawing.Color.FromArgb(
                totalA / colors.Count,
                totalR / colors.Count,
                totalG / colors.Count,
                totalB / colors.Count
            );
        }

        // 配色
        private void button35_Click(object sender, RibbonControlEventArgs e)
        {
            try
            {
                // 获取当前PowerPoint应用程序
                var app = Globals.ThisAddIn.Application;
                if (app == null || app.ActivePresentation == null)
                {
                    MessageBox.Show("请先打开一个PowerPoint演示文稿。", "提示", MessageBoxButtons.OK, MessageBoxIcon.Information);
                    return;
                }

                var presentation = app.ActivePresentation;

                // 切换配色管理任务窗格的显示/隐藏
                Globals.ThisAddIn.ToggleColorTaskPane();
            }
            catch (Exception ex)
            {
                Debug.WriteLine($"切换配色管理任务窗格失败: {ex.Message}");
                MessageBox.Show($"切换配色管理任务窗格失败: {ex.Message}", "错误", MessageBoxButtons.OK, MessageBoxIcon.Error);
            }
        }

        //AI应用
        private void button28_Click(object sender, RibbonControlEventArgs e)
        {
            try
            {
                // 创建并显示AI应用窗口
                var aiWindow = new AIApplicationWindow();
                aiWindow.Show();
            }
            catch (Exception ex)
            {
                Debug.WriteLine($"启动AI应用窗口失败: {ex.Message}");
                MessageBox.Show($"启动AI应用窗口失败: {ex.Message}", "错误", MessageBoxButtons.OK, MessageBoxIcon.Error);
            }
        }

        // 插件设置
        private void button29_Click(object sender, RibbonControlEventArgs e)
        {
            try
            {
                // 创建并显示插件设置窗口
                var settingsWindow = new PluginSettingsWindow();
                settingsWindow.ShowDialog();

                // 测试注册表功能（可选）
                // RegistryTestTool.TestRegistryOperations();
            }
            catch (Exception ex)
            {
                Debug.WriteLine($"启动插件设置窗口失败: {ex.Message}");
                MessageBox.Show($"启动插件设置窗口失败: {ex.Message}", "错误", MessageBoxButtons.OK, MessageBoxIcon.Error);
            }
        }

        //组件
        private void button24_Click(object sender, RibbonControlEventArgs e)
        {

        }

        //翻译
        private async void button3_Click(object sender, RibbonControlEventArgs e)
        {
            try
            {
                // 获取comboBox1中选中的目标语言
                string targetLanguage = "英语"; // 默认语言

                if (!string.IsNullOrEmpty(comboBox1.Text))
                {
                    targetLanguage = comboBox1.Text;
                }
                else
                {
                    // 如果comboBox1没有初始化，先初始化它
                    InitializeLanguageComboBox();
                    targetLanguage = "英语"; // 默认选择英语
                }

                Debug.WriteLine($"开始翻译，目标语言: {targetLanguage}");

                // 调用翻译功能
                await TranslationHelper.TranslatePowerPointContent(targetLanguage);
            }
            catch (Exception ex)
            {
                MessageBox.Show($"翻译功能出错: {ex.Message}", "翻译错误", MessageBoxButtons.OK, MessageBoxIcon.Error);
            }
        }

        //目标语言选择变化事件
        private void comboBox1_TextChanged(object sender, RibbonControlEventArgs e)
        {
            try
            {
                if (!string.IsNullOrEmpty(comboBox1.Text))
                {
                    string selectedLanguage = comboBox1.Text;
                    Debug.WriteLine($"语言选择已更改为: {selectedLanguage}");
                }
            }
            catch (Exception ex)
            {
                Debug.WriteLine($"语言选择变化事件处理失败: {ex.Message}");
            }
        }

        // <summary>
        // 处理解析XML到PowerPoint的请求
        // </summary>
        private void XmlEditorWindow_ParseXmlToPowerPointRequested(object sender, shibappt.mod_xml.XmlEditorWpfWindow.ParseXmlEventArgs e)
        {
            try
            {
                if (xmlEditorWindow != null)
                {
                    // 使用新的PowerPointXmlService
                    bool success = shibappt.mod_xml.Core.PowerPointXmlService.ParseXmlToPowerPoint(e.XmlContent, Globals.ThisAddIn.Application);

                    var resultMessage = System.Text.Json.JsonSerializer.Serialize(new
                    {
                        action = "parseResult",
                        success = success,
                        message = success ? "XML解析成功" : "XML解析失败"
                    });

                    xmlEditorWindow.SendMessageToWebView(resultMessage);
                }
            }
            catch (Exception ex)
            {
                System.Diagnostics.Debug.WriteLine($"解析XML到PowerPoint失败: {ex.Message}");
                if (xmlEditorWindow != null)
                {
                    var errorMessage = System.Text.Json.JsonSerializer.Serialize(new
                    {
                        action = "parseResult",
                        success = false,
                        message = $"解析失败: {ex.Message}"
                    });
                    xmlEditorWindow.SendMessageToWebView(errorMessage);
                }
            }
        }

        // <summary>
        // 处理获取PowerPoint选中元素XML的请求
        // </summary>
        private void XmlEditorWindow_GetSelectedPowerPointXmlRequested(object sender, EventArgs e)
        {
            try
            {
                if (xmlEditorWindow != null)
                {
                    // 使用新的PowerPointXmlService
                    var xmlContent = shibappt.mod_xml.Core.PowerPointXmlService.GetSelectedPowerPointXmlContent(Globals.ThisAddIn.Application);

                    // 转换为Base64编码
                    var xmlBytes = System.Text.Encoding.UTF8.GetBytes(xmlContent);
                    var base64Xml = Convert.ToBase64String(xmlBytes);

                    // 使用JsonSerializerOptions确保正确转义
                    var options = new System.Text.Json.JsonSerializerOptions
                    {
                        Encoder = System.Text.Encodings.Web.JavaScriptEncoder.UnsafeRelaxedJsonEscaping
                    };

                    var jsonMessage = System.Text.Json.JsonSerializer.Serialize(new
                    {
                        action = "powerPointXmlData",
                        xmlData = base64Xml,
                        encoding = "base64"
                    }, options);

                    System.Diagnostics.Debug.WriteLine($"发送到WebView的JSON消息: {jsonMessage}");
                    xmlEditorWindow.SendMessageToWebView(jsonMessage);
                }
            }
            catch (Exception ex)
            {
                System.Diagnostics.Debug.WriteLine($"获取PowerPoint选中元素XML失败: {ex.Message}");
                // 发送错误消息回WebView
                if (xmlEditorWindow != null)
                {
                    var errorMessage = System.Text.Json.JsonSerializer.Serialize(new
                    {
                        action = "powerPointXmlData",
                        xmlData = $"获取XML失败: {ex.Message}"
                    });
                    xmlEditorWindow.SendMessageToWebView(errorMessage);
                }
            }
        }
    }

    // 智能边框显示窗口类
    public class SmartOutlineForm : Form
    {
        private List<OutlineInfo> outlineInfos;
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

        public SmartOutlineForm()
        {
            // 设置窗口属性
            this.FormBorderStyle = FormBorderStyle.None;
            this.ShowInTaskbar = false;
            this.TopMost = true;
            this.BackColor = Color.Black;
            this.TransparencyKey = Color.Black;
            this.WindowState = FormWindowState.Maximized;
            this.Cursor = Cursors.Cross;

            // 设置窗口样式
            this.SetStyle(ControlStyles.AllPaintingInWmPaint | ControlStyles.UserPaint, true);

            // 添加键盘事件处理
            this.KeyPreview = true;
            this.KeyDown += SimpleOutlineForm_KeyDown;

            // 添加鼠标事件处理
            this.MouseClick += SimpleOutlineForm_MouseClick;

            // 添加窗口事件处理
            this.Deactivate += SmartOutlineForm_Deactivate;
            this.LostFocus += SmartOutlineForm_LostFocus;

            // 初始化定时器
            InitializeTimers();

            Debug.WriteLine("智能边框显示窗口已初始化");
        }

        private void InitializeTimers()
        {
            // 焦点检查定时器
            focusTimer = new System.Windows.Forms.Timer();
            focusTimer.Interval = 500; // 改为每500ms检查一次，减少敏感度
            focusTimer.Tick += FocusTimer_Tick;

            // 视图变化检查定时器
            viewChangeTimer = new System.Windows.Forms.Timer();
            viewChangeTimer.Interval = 300; // 改为每300ms检查一次
            viewChangeTimer.Tick += ViewChangeTimer_Tick;
        }

        private void FocusTimer_Tick(object sender, EventArgs e)
        {
            try
            {
                // 检查PowerPoint窗口是否仍然活动
                if (powerPointWindow != null)
                {
                    var app = powerPointWindow.Application;

                    // 检查PowerPoint应用程序是否仍然活动
                    var foregroundWindow = GetForegroundWindow();
                    var powerPointHwnd = GetPowerPointWindowHandle();

                    // 只有当PowerPoint窗口确实不是前台窗口时才关闭
                    if (foregroundWindow != powerPointHwnd && powerPointHwnd != IntPtr.Zero)
                    {
                        // 额外检查：确保不是PowerPoint的子窗口
                        var parentWindow = GetParent(foregroundWindow);
                        if (parentWindow != powerPointHwnd)
                        {
                            // 再次确认：检查窗口标题是否包含PowerPoint
                            var windowTitle = GetWindowTitle(foregroundWindow);
                            if (!string.IsNullOrEmpty(windowTitle) &&
                                !windowTitle.Contains("PowerPoint") &&
                                !windowTitle.Contains("Microsoft PowerPoint"))
                            {
                                Debug.WriteLine($"PowerPoint应用程序失去焦点，当前窗口: {windowTitle}，关闭轮廓显示");
                                CloseOutline();
                                return;
                            }
                        }
                    }
                }
            }
            catch (Exception ex)
            {
                Debug.WriteLine($"焦点检查失败: {ex.Message}");
                // 不要因为检查失败就关闭窗口
            }
        }

        // 获取窗口标题
        private string GetWindowTitle(IntPtr hWnd)
        {
            try
            {
                StringBuilder title = new StringBuilder(256);
                GetWindowText(hWnd, title, title.Capacity);
                return title.ToString();
            }
            catch
            {
                return string.Empty;
            }
        }

        // Windows API声明 - 添加GetWindowText
        [System.Runtime.InteropServices.DllImport("user32.dll")]
        private static extern int GetWindowText(IntPtr hWnd, StringBuilder lpString, int nMaxCount);

        private void ViewChangeTimer_Tick(object sender, EventArgs e)
        {
            try
            {
                // 检查幻灯片视图是否发生变化
                if (powerPointWindow != null)
                {
                    var currentSlide = powerPointWindow.View.Slide;
                    if (currentSlide != null)
                    {
                        // 检查选中形状是否仍然存在
                        if (powerPointWindow.Selection.Type != PowerPoint.PpSelectionType.ppSelectionShapes ||
                            powerPointWindow.Selection.ShapeRange.Count == 0)
                        {
                            Debug.WriteLine("选中形状发生变化，关闭轮廓显示");
                            CloseOutline();
                            return;
                        }

                        // 检查窗口位置和大小是否发生变化
                        var currentLeft = powerPointWindow.Left;
                        var currentTop = powerPointWindow.Top;
                        var currentWidth = powerPointWindow.Width;
                        var currentHeight = powerPointWindow.Height;

                        // 检查视图类型是否发生变化
                        var currentViewType = powerPointWindow.View.Type;

                        // 检查缩放级别是否发生变化
                        var currentZoom = powerPointWindow.View.Zoom;

                        // 检查幻灯片是否发生变化
                        var currentSlideIndex = currentSlide.SlideIndex;

                        // 这里可以添加更详细的视图变化检测逻辑
                        // 比如检查缩放级别、视图类型等

                        // 如果检测到显著变化，重新计算轮廓位置
                        bool needsUpdate = false;

                        // 检查窗口位置变化（超过5像素）
                        if (Math.Abs(currentLeft - lastWindowLeft) > 5 ||
                            Math.Abs(currentTop - lastWindowTop) > 5 ||
                            Math.Abs(currentWidth - lastWindowWidth) > 5 ||
                            Math.Abs(currentHeight - lastWindowHeight) > 5)
                        {
                            Debug.WriteLine("窗口位置或大小发生变化，需要更新轮廓");
                            needsUpdate = true;
                        }

                        // 检查缩放级别变化（超过1%）
                        if (Math.Abs(currentZoom - lastZoom) > 1)
                        {
                            Debug.WriteLine($"缩放级别发生变化: {lastZoom} -> {currentZoom}，需要更新轮廓");
                            needsUpdate = true;
                        }

                        // 检查视图类型变化
                        if (currentViewType != lastViewType)
                        {
                            Debug.WriteLine($"视图类型发生变化: {lastViewType} -> {currentViewType}，关闭轮廓显示");
                            CloseOutline();
                            return;
                        }

                        // 检查幻灯片变化
                        if (currentSlideIndex != lastSlideIndex)
                        {
                            Debug.WriteLine($"幻灯片发生变化: {lastSlideIndex} -> {currentSlideIndex}，关闭轮廓显示");
                            CloseOutline();
                            return;
                        }

                        // 如果需要更新，重新计算轮廓位置
                        if (needsUpdate)
                        {
                            UpdateOutlinePositions();
                        }

                        // 更新记录的值
                        lastWindowLeft = currentLeft;
                        lastWindowTop = currentTop;
                        lastWindowWidth = currentWidth;
                        lastWindowHeight = currentHeight;
                        lastZoom = currentZoom;
                        lastViewType = currentViewType;
                        lastSlideIndex = currentSlideIndex;
                    }
                }
            }
            catch (Exception ex)
            {
                Debug.WriteLine($"视图变化检查失败: {ex.Message}");
                CloseOutline();
            }
        }

        // 记录上一次的窗口状态
        private float lastWindowLeft = 0;
        private float lastWindowTop = 0;
        private float lastWindowWidth = 0;
        private float lastWindowHeight = 0;
        private int lastZoom = 100;
        private PowerPoint.PpViewType lastViewType = PowerPoint.PpViewType.ppViewNormal;
        private int lastSlideIndex = 0;

        // 更新轮廓位置
        private void UpdateOutlinePositions()
        {
            try
            {
                if (powerPointWindow == null || outlineInfos == null) return;

                Debug.WriteLine("重新计算轮廓位置...");

                // 获取当前选中的形状
                var shapeRange = powerPointWindow.Selection.ShapeRange;
                if (shapeRange.Count != outlineInfos.Count)
                {
                    Debug.WriteLine("选中形状数量发生变化，关闭轮廓显示");
                    CloseOutline();
                    return;
                }

                // 重新计算每个形状的位置
                for (int i = 0; i < shapeRange.Count; i++)
                {
                    var shape = shapeRange[i + 1]; // PowerPoint索引从1开始
                    var outlineInfo = outlineInfos[i];

                    // 重新计算屏幕坐标
                    var newLeft = powerPointWindow.PointsToScreenPixelsX(shape.Left);
                    var newTop = powerPointWindow.PointsToScreenPixelsY(shape.Top);
                    var newWidth = powerPointWindow.PointsToScreenPixelsX(shape.Left + shape.Width) - newLeft;
                    var newHeight = powerPointWindow.PointsToScreenPixelsY(shape.Top + shape.Height) - newTop;

                    // 更新轮廓信息
                    outlineInfo.Rectangle = new System.Drawing.Rectangle(
                        (int)newLeft,
                        (int)newTop,
                        (int)newWidth,
                        (int)newHeight
                    );
                    outlineInfo.Rotation = shape.Rotation;

                    Debug.WriteLine($"更新形状 {i + 1} 位置: ({newLeft}, {newTop}) 大小: ({newWidth} x {newHeight}) 旋转: {shape.Rotation}");
                }

                // 强制重绘
                this.Invalidate();
                Debug.WriteLine("轮廓位置更新完成");
            }
            catch (Exception ex)
            {
                Debug.WriteLine($"更新轮廓位置失败: {ex.Message}");
                CloseOutline();
            }
        }

        public void ShowOutlines(List<shibappt.Ribbon1.SlideEditPositionInfo> shapeInfos, PowerPoint.DocumentWindow window)
        {
            try
            {
                // 保存PowerPoint窗口引用
                powerPointWindow = window;

                // 初始化记录的值
                lastWindowLeft = window.Left;
                lastWindowTop = window.Top;
                lastWindowWidth = window.Width;
                lastWindowHeight = window.Height;
                lastZoom = window.View.Zoom;
                lastViewType = window.View.Type;
                lastSlideIndex = window.View.Slide?.SlideIndex ?? 0;

                // 设置轮廓信息
                outlineInfos = new List<OutlineInfo>();
                foreach (var shapeInfo in shapeInfos)
                {
                    var outlineInfo = new OutlineInfo
                    {
                        Rectangle = new System.Drawing.Rectangle(
                            (int)shapeInfo.Left,
                            (int)shapeInfo.Top,
                            (int)shapeInfo.Width,
                            (int)shapeInfo.Height
                        ),
                        Rotation = shapeInfo.Rotation
                    };
                    outlineInfos.Add(outlineInfo);
                }

                Debug.WriteLine($"设置了 {outlineInfos.Count} 个轮廓区域");

                // 强制重绘
                this.Invalidate();

                // 延迟启动定时器，让窗口先稳定显示
                var delayTimer = new System.Windows.Forms.Timer();
                delayTimer.Interval = 1000; // 1秒后启动检测
                delayTimer.Tick += (s, e) =>
                {
                    delayTimer.Stop();
                    delayTimer.Dispose();

                    // 启动检测定时器
                    focusTimer.Start();
                    viewChangeTimer.Start();

                    Debug.WriteLine("检测定时器已启动");
                };
                delayTimer.Start();
            }
            catch (Exception ex)
            {
                Debug.WriteLine($"设置轮廓失败: {ex.Message}");
            }
        }

        // 获取PowerPoint窗口句柄
        private IntPtr GetPowerPointWindowHandle()
        {
            try
            {
                if (powerPointWindow != null)
                {
                    // 通过窗口标题查找PowerPoint窗口
                    var app = powerPointWindow.Application;
                    var presentation = app.ActivePresentation;
                    if (presentation != null)
                    {
                        var windowTitle = presentation.Name;
                        return FindWindowByTitle(windowTitle);
                    }
                }
            }
            catch (Exception ex)
            {
                Debug.WriteLine($"获取PowerPoint窗口句柄失败: {ex.Message}");
            }
            return IntPtr.Zero;
        }

        // 通过标题查找窗口
        private IntPtr FindWindowByTitle(string title)
        {
            try
            {
                return FindWindow(null, title + " - PowerPoint");
            }
            catch
            {
                return IntPtr.Zero;
            }
        }

        // Windows API声明
        [System.Runtime.InteropServices.DllImport("user32.dll")]
        private static extern IntPtr GetForegroundWindow();

        [System.Runtime.InteropServices.DllImport("user32.dll")]
        private static extern IntPtr FindWindow(string lpClassName, string lpWindowName);

        private void SmartOutlineForm_Deactivate(object sender, EventArgs e)
        {
            Debug.WriteLine("轮廓窗口失去焦点");
            // 添加延迟，避免立即关闭
            System.Threading.Thread.Sleep(100);
            CloseOutline();
        }

        private void SmartOutlineForm_LostFocus(object sender, EventArgs e)
        {
            Debug.WriteLine("轮廓窗口失去焦点");
            // 添加延迟，避免立即关闭
            System.Threading.Thread.Sleep(100);
            CloseOutline();
        }

        protected override void OnPaint(PaintEventArgs e)
        {
            try
            {
                if (!isVisible || outlineInfos == null) return;

                using (var g = e.Graphics)
                {
                    // 设置高质量绘图
                    g.SmoothingMode = System.Drawing.Drawing2D.SmoothingMode.AntiAlias;
                    g.TextRenderingHint = System.Drawing.Text.TextRenderingHint.ClearTypeGridFit;

                    // 绘制所有红色轮廓
                    for (int i = 0; i < outlineInfos.Count; i++)
                    {
                        var outlineInfo = outlineInfos[i];
                        var rect = outlineInfo.Rectangle;

                        // 保存当前图形状态
                        var state = g.Save();

                        try
                        {
                            // 设置旋转中心点（形状中心）
                            var centerX = rect.X + rect.Width / 2f;
                            var centerY = rect.Y + rect.Height / 2f;

                            // 应用旋转变换
                            if (outlineInfo.Rotation != 0)
                            {
                                g.TranslateTransform(centerX, centerY);
                                g.RotateTransform(outlineInfo.Rotation);
                                g.TranslateTransform(-centerX, -centerY);
                            }

                            // 绘制红色轮廓
                            using (var pen = new Pen(Color.Red, 3))
                            {
                                g.DrawRectangle(pen, rect);
                            }

                            // 绘制中心点
                            using (var pen = new Pen(Color.Red, 2))
                            {
                                g.DrawLine(pen, centerX - 5, centerY, centerX + 5, centerY);
                                g.DrawLine(pen, centerX, centerY - 5, centerX, centerY + 5);
                            }

                            // 绘制坐标信息（右下角）
                            var coordText = $"{rect.X}, {rect.Y}";
                            if (outlineInfo.Rotation != 0)
                            {
                                coordText += $" ({outlineInfo.Rotation:F1}°)";
                            }

                            var coordSize = g.MeasureString(coordText, this.Font);
                            var coordRect = new System.Drawing.Rectangle(
                                rect.Right - (int)coordSize.Width - 10,
                                rect.Bottom - (int)coordSize.Height - 5,
                                (int)coordSize.Width + 10,
                                (int)coordSize.Height + 5
                            );

                            using (var brush = new SolidBrush(Color.FromArgb(200, 0, 0, 0)))
                            {
                                g.FillRectangle(brush, coordRect);
                            }

                            using (var brush = new SolidBrush(Color.White))
                            {
                                g.DrawString(coordText, this.Font, brush, coordRect.X + 5, coordRect.Y + 2);
                            }
                        }
                        finally
                        {
                            // 恢复图形状态
                            g.Restore(state);
                        }
                    }
                }
            }
            catch (Exception ex)
            {
                Debug.WriteLine($"绘制轮廓失败: {ex.Message}");
                // 如果绘制失败，直接关闭窗口
                this.Close();
            }
        }

        private void SimpleOutlineForm_KeyDown(object sender, KeyEventArgs e)
        {
            if (e.KeyCode == Keys.Escape)
            {
                Debug.WriteLine("用户按下了ESC键，关闭轮廓显示");
                CloseOutline();
            }
        }

        private void SimpleOutlineForm_MouseClick(object sender, MouseEventArgs e)
        {
            Debug.WriteLine($"用户点击了位置: ({e.X}, {e.Y})");
            CloseOutline();
        }

        private void CloseOutline()
        {
            try
            {
                isVisible = false;

                // 停止定时器
                if (focusTimer != null)
                {
                    focusTimer.Stop();
                }
                if (viewChangeTimer != null)
                {
                    viewChangeTimer.Stop();
                }

                this.Close();
                Debug.WriteLine("智能边框显示已关闭");
            }
            catch (Exception ex)
            {
                Debug.WriteLine($"关闭智能边框显示失败: {ex.Message}");
            }
        }

        protected override void OnFormClosing(FormClosingEventArgs e)
        {
            try
            {
                Debug.WriteLine("智能边框显示窗口正在关闭");
                base.OnFormClosing(e);
            }
            catch (Exception ex)
            {
                Debug.WriteLine($"关闭窗口时发生错误: {ex.Message}");
            }
        }

        // Windows API声明 - 添加GetParent
        [System.Runtime.InteropServices.DllImport("user32.dll")]
        private static extern IntPtr GetParent(IntPtr hWnd);
    }

    // 字体管理窗口类
}



