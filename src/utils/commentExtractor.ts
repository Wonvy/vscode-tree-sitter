/**
 * 通用注释提取工具类
 */
export class CommentExtractor {
    
    /**
     * 提取注释
     */
    public static extractComment(node: any, language: string): string {
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
    public static cleanComment(commentText: string, language: string): string {
        if (!commentText) return '';
        
        let cleanText = commentText
            .replace(/^\/\/\s*/, '')
            .replace(/^\/\*\s*/, '')
            .replace(/\s*\*\/$/, '')
            .replace(/^#\s*/, '')
            .replace(/^\/\/\/\s*/, '')
            .replace(/^\*\s*/, '')
            .trim();
        
        // 提取C# XML文档注释中的summary内容
        if (language === 'csharp') {
            const summaryMatch = cleanText.match(/<summary>\s*([\s\S]*?)\s*<\/summary>/s);
            if (summaryMatch && summaryMatch[1]) {
                const summaryContent = summaryMatch[1].trim();
                const lines = summaryContent.split('\n');
                const nonEmptyLines = lines
                    .map(line => line.trim())
                    .filter(line => line && !line.startsWith('///') && !line.startsWith('//'));
                
                if (nonEmptyLines.length > 0) {
                    return nonEmptyLines[0];
                }
            }
            
            const lines = cleanText.split('\n');
            let inSummary = false;
            let summaryLines: string[] = [];
            
            for (let i = 0; i < lines.length; i++) {
                const line = lines[i];
                const trimmedLine = line.trim();
                
                if (trimmedLine.includes('<summary>')) {
                    inSummary = true;
                    continue;
                }
                
                if (trimmedLine.includes('</summary>')) {
                    inSummary = false;
                    break;
                }
                
                if (inSummary) {
                    const contentLine = trimmedLine
                        .replace(/^\/\/\s*/, '')
                        .replace(/^\/\/\/\s*/, '')
                        .trim();
                    if (contentLine) {
                        summaryLines.push(contentLine);
                    }
                }
            }
            
            if (summaryLines.length > 0) {
                return summaryLines[0];
            }
            
            for (const line of lines) {
                const trimmedLine = line.trim();
                if (trimmedLine && 
                    !trimmedLine.startsWith('<') && 
                    !trimmedLine.startsWith('///') && 
                    !trimmedLine.startsWith('//') &&
                    !trimmedLine.includes('</summary>') &&
                    !trimmedLine.includes('<param') &&
                    !trimmedLine.includes('<returns>') &&
                    !trimmedLine.includes('<exception') &&
                    !trimmedLine.includes('<remarks>')) {
                    return trimmedLine;
                }
            }
        }
        
        // 对于JavaScript/TypeScript，查找JSDoc注释
        if (language === 'javascript' || language === 'typescript') {
            // 查找@description或@desc标签
            const descMatch = cleanText.match(/@(?:description|desc)\s+(.+)/);
            if (descMatch && descMatch[1]) {
                return descMatch[1].trim();
            }
            
            // 查找第一行非标签的文本
            const lines = cleanText.split('\n');
            for (const line of lines) {
                const trimmedLine = line.trim();
                if (trimmedLine && 
                    !trimmedLine.startsWith('@') && 
                    !trimmedLine.startsWith('*') &&
                    !trimmedLine.startsWith('/**') &&
                    !trimmedLine.startsWith('*/')) {
                    return trimmedLine;
                }
            }
            
            // 如果没有找到JSDoc内容，尝试提取简单的行注释
            const simpleComment = cleanText.replace(/^\/\/\s*/, '').trim();
            if (simpleComment) {
                return simpleComment;
            }
        }
        
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
} 