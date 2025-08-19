import * as vscode from 'vscode';
import { FunctionInfo } from '../types';

export class PythonParser {
    private outputChannel: vscode.OutputChannel;

    constructor(outputChannel: vscode.OutputChannel) {
        this.outputChannel = outputChannel;
    }

    /**
     * 解析Python文档的层级结构
     */
    public extractPythonHierarchy(rootNode: any, functions: FunctionInfo[], language: string): void {
        if (!rootNode.children) return;

        this.outputChannel.appendLine('🔍 开始解析Python层级结构...');
        this.outputChannel.appendLine(`🔍 根节点类型: ${rootNode.type}`);
        this.outputChannel.appendLine(`🔍 根节点子节点数量: ${rootNode.children.length}`);
        
        // 遍历所有节点，找到模块、类声明等
        this.traverseTree(rootNode, (node) => {
            this.outputChannel.appendLine(`🔍 检查Python节点: ${node.type}, 文本: "${node.text?.substring(0, 100)}..."`);
            
            if (node.type === 'class_definition') {
                this.outputChannel.appendLine(`✅ 发现类定义节点`);
                this.processPythonClass(node, functions, language);
            } else if (node.type === 'function_definition') {
                // 处理顶级函数（不在类内的）
                this.outputChannel.appendLine(`✅ 发现顶级Python函数`);
                this.processTopLevelPythonFunction(node, functions, language);
            }
        });
    }

    /**
     * 处理Python类
     */
    private processPythonClass(classNode: any, functions: FunctionInfo[], language: string): void {
        const className = this.findPythonClassName(classNode);
        if (!className) {
            this.outputChannel.appendLine(`❌ 无法找到Python类名，跳过此类定义`);
            return;
        }

        this.outputChannel.appendLine(`🔍 处理Python类: ${className}`);

        // 创建类节点
        const classInfo: FunctionInfo = {
            id: `${language}-${className}-${classNode.startPosition.row}`,
            name: className,
            comment: this.extractComment(classNode, language),
            startLine: classNode.startPosition.row + 1,
            endLine: classNode.endPosition.row + 1,
            parameters: [],
            returnType: 'class',
            visibility: 'public',
            isStatic: false,
            language,
            type: 'class',
            className: undefined,
            namespaceName: undefined
        };

        functions.push(classInfo);
        this.outputChannel.appendLine(`✅ 添加Python类到函数列表: ${className}`);

        // 查找类中的方法
        let methodCount = 0;
        this.traversePythonClassMembers(classNode, (memberNode) => {
            if (memberNode.type === 'function_definition') {
                this.outputChannel.appendLine(`  ✅ 识别为Python类方法: ${memberNode.type}`);
                const methodInfo = this.extractFunctionInfo(memberNode, language);
                if (methodInfo) {
                    this.outputChannel.appendLine(`✅ 提取Python类方法: ${methodInfo.name}`);
                    // 设置className，这样在convertFunctionsToOutlineItems中就能正确建立父子关系
                    methodInfo.className = className;
                    functions.push(methodInfo);
                    methodCount++;
                } else {
                    this.outputChannel.appendLine(`❌ 提取Python类方法失败: ${memberNode.type}`);
                }
            } else {
                this.outputChannel.appendLine(`  ❌ 不是Python类方法: ${memberNode.type}`);
            }
        });
        
        this.outputChannel.appendLine(`📊 Python类 ${className} 处理完成，找到 ${methodCount} 个方法`);
    }

    /**
     * 处理顶级Python函数
     */
    private processTopLevelPythonFunction(functionNode: any, functions: FunctionInfo[], language: string): void {
        const functionName = this.findPythonFunctionName(functionNode);
        if (!functionName) return;

        this.outputChannel.appendLine(`🔍 处理顶级Python函数: ${functionName}`);

        const functionInfo: FunctionInfo = {
            id: `${language}-${functionName}-${functionNode.startPosition.row}`,
            name: functionName,
            comment: this.extractComment(functionNode, language),
            startLine: functionNode.startPosition.row + 1,
            endLine: functionNode.endPosition.row + 1,
            parameters: this.extractPythonParameters(functionNode.parameters),
            returnType: 'any',
            visibility: 'public',
            isStatic: false,
            language,
            type: 'function',
            className: undefined,
            namespaceName: undefined
        };

        functions.push(functionInfo);
    }

    /**
     * 递归遍历Python类中的所有成员
     */
    private traversePythonClassMembers(classNode: any, callback: (memberNode: any) => void): void {
        if (!classNode.children) return;
        
        classNode.children.forEach((child: any) => {
            // 如果是类体，继续遍历其子节点
            if (child.type === 'class_body') {
                this.traversePythonClassMembers(child, callback);
            }
            // 如果是方法定义，直接调用回调
            else if (child.type === 'function_definition') {
                callback(child);
            }
            // 其他情况，递归遍历
            else if (child.children) {
                this.traversePythonClassMembers(child, callback);
            }
        });
    }

    /**
     * 查找Python函数名
     */
    private findPythonFunctionName(functionNode: any): string | undefined {
        if (!functionNode || !functionNode.children) return undefined;
        
        for (const child of functionNode.children) {
            if (child.type === 'identifier') {
                return child.text;
            }
        }
        
        return undefined;
    }

    /**
     * 查找Python类名
     */
    private findPythonClassName(classNode: any): string | undefined {
        if (!classNode || !classNode.children) return undefined;
        
        for (const child of classNode.children) {
            if (child.type === 'identifier') {
                return child.text;
            }
        }
        
        return undefined;
    }

    /**
     * 提取Python参数
     */
    private extractPythonParameters(parametersNode: any): string[] {
        if (!parametersNode || !parametersNode.children) return [];

        const parameters: string[] = [];
        
        parametersNode.children.forEach((param: any) => {
            if (param.type === 'typed_parameter' || param.type === 'identifier') {
                const identifier = param.children?.find((child: any) => 
                    child.type === 'identifier'
                ) || param;
                if (identifier && identifier.text) {
                    parameters.push(identifier.text);
                }
            }
        });

        return parameters;
    }

    /**
     * 提取函数信息
     */
    private extractFunctionInfo(node: any, language: string): FunctionInfo | null {
        try {
            let name = '';
            let parameters: string[] = [];
            let returnType = '';
            let visibility: 'public' | 'private' | 'protected' | 'internal' = 'public';
            let isStatic = false;
            let startLine = node.startPosition.row;
            let endLine = node.endPosition.row;
            let type: 'function' | 'method' | 'constructor' | 'class' | 'namespace' | 'property' | 'field' | 'event' = 'function';
            let className: string | undefined;
            let namespaceName: string | undefined;

            if (node.type === 'function_definition') {
                name = this.findPythonFunctionName(node) || 'anonymous';
                parameters = this.extractPythonParameters(node.parameters);
                returnType = 'any';
                type = 'function';
            } else if (node.type === 'class_definition') {
                name = this.findPythonClassName(node) || 'anonymous';
                returnType = 'class';
                type = 'class';
            }

            if (!name) return null;

            return {
                id: `${language}-${name}-${startLine}`,
                name,
                comment: this.extractComment(node, language),
                startLine: startLine + 1,
                endLine: endLine + 1,
                parameters,
                returnType: returnType || 'void',
                visibility,
                isStatic,
                language,
                type,
                className,
                namespaceName
            };
        } catch (err) {
            console.warn('提取函数信息失败:', err);
            return null;
        }
    }

    /**
     * 提取注释
     */
    private extractComment(node: any, language: string): string {
        let allComments: string[] = [];
        
        // 查找节点前的注释
        let currentSibling = node.previousSibling;
        while (currentSibling) {
            if (currentSibling.type === 'comment' || currentSibling.type === 'comment_block') {
                const commentText = currentSibling.text.trim();
                allComments.unshift(commentText);
                currentSibling = currentSibling.previousSibling;
            } else {
                break;
            }
        }
        
        // 查找节点内的注释
        if (node.children) {
            for (const child of node.children) {
                if (child.type === 'comment' || child.type === 'comment_block') {
                    const commentText = child.text.trim();
                    allComments.push(commentText);
                }
            }
        }
        
        // 如果找到了注释，合并并解析
        if (allComments.length > 0) {
            const combinedComment = allComments.join('\n');
            const cleanedComment = this.cleanComment(combinedComment, language);
            return cleanedComment;
        }
        
        return '';
    }

    /**
     * 清理注释
     */
    private cleanComment(commentText: string, language: string): string {
        if (!commentText) return '';
        
        let cleanText = commentText
            .replace(/^\/\/\s*/, '')
            .replace(/^\/\*\s*/, '')
            .replace(/\s*\*\/$/, '')
            .replace(/^#\s*/, '')
            .replace(/^\/\/\/\s*/, '')
            .replace(/^\*\s*/, '')
            .trim();
        
        // 对于Python，查找docstring
        if (language === 'python') {
            // 移除三引号
            cleanText = cleanText.replace(/^["']{3}\s*/, '').replace(/\s*["']{3}$/, '');
            const lines = cleanText.split('\n');
            for (const line of lines) {
                const trimmedLine = line.trim();
                if (trimmedLine && !trimmedLine.startsWith('"""') && !trimmedLine.startsWith("'''")) {
                    return trimmedLine;
                }
            }
        }
        
        // 如果都没有找到，返回清理后的第一行非空文本
        const lines = cleanText.split('\n');
        for (const line of lines) {
            const trimmedLine = line.trim();
            if (trimmedLine) {
                return trimmedLine;
            }
        }
        
        return '';
    }

    /**
     * 遍历树
     */
    private traverseTree(node: any, callback: (node: any) => void): void {
        callback(node);
        
        if (node.children) {
            node.children.forEach((child: any) => {
                this.traverseTree(child, callback);
            });
        }
    }
} 