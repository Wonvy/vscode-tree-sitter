export interface FunctionInfo {
  id: string;
  name: string;
  comment: string;
  startLine: number;
  endLine: number;
  parameters: string[];
  returnType: string;
  visibility: 'public' | 'private' | 'protected' | 'internal';
  isStatic: boolean;
  language: string;
  type: 'function' | 'method' | 'constructor' | 'class' | 'namespace' | 'property' | 'field' | 'event';
  className?: string;
  namespaceName?: string;
}

export interface TreeNode {
  id: string;
  type: string;
  text: string;
  startPosition: { row: number; column: number };
  endPosition: { row: number; column: number };
  children: TreeNode[];
}

export type Language = 'python' | 'javascript' | 'typescript' | 'csharp';

export const SupportedLanguages = [
  { value: 'python', label: 'Python' },
  { value: 'javascript', label: 'JavaScript' },
  { value: 'typescript', label: 'TypeScript' },
  { value: 'csharp', label: 'C#' }
]; 