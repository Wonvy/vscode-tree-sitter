declare module 'web-tree-sitter' {
    export class Parser {
        constructor();
        setLanguage(language: Language): void;
        parse(input: string): Tree;
        static init(): Promise<void>;
    }

    export class Language {
        static load(wasmBytes: Uint8Array): Promise<Language>;
    }

    export interface Tree {
        rootNode: SyntaxNode;
    }

    export interface SyntaxNode {
        type: string;
        text: string;
        startPosition: Point;
        endPosition: Point;
        children: SyntaxNode[];
        previousSibling?: SyntaxNode;
        parent?: SyntaxNode;
    }

    export interface Point {
        row: number;
        column: number;
    }
} 