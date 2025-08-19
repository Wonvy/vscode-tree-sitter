import * as vscode from 'vscode';
import { CSharpParser } from './csharpParser';
import { JavaScriptParser } from './javascriptParser';
import { PythonParser } from './pythonParser';

export interface IParser {
    extractCSharpHierarchy?(rootNode: any, functions: any[], language: string): void;
    extractJavaScriptHierarchy?(rootNode: any, functions: any[], language: string): void;
    extractPythonHierarchy?(rootNode: any, functions: any[], language: string): void;
}

export class ParserFactory {
    private outputChannel: vscode.OutputChannel;

    constructor(outputChannel: vscode.OutputChannel) {
        this.outputChannel = outputChannel;
    }

    /**
     * 根据语言类型创建相应的解析器
     */
    public createParser(language: string): IParser | null {
        switch (language.toLowerCase()) {
            case 'csharp':
                return new CSharpParser(this.outputChannel);
            case 'javascript':
            case 'typescript':
                return new JavaScriptParser(this.outputChannel);
            case 'python':
                return new PythonParser(this.outputChannel);
            default:
                this.outputChannel.appendLine(`⚠️ 不支持的语言: ${language}`);
                return null;
        }
    }

    /**
     * 检查语言是否支持
     */
    public isLanguageSupported(language: string): boolean {
        const supportedLanguages = ['csharp', 'javascript', 'typescript', 'python'];
        return supportedLanguages.includes(language.toLowerCase());
    }
} 