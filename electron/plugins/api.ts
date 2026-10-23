import type { Literal } from '../php-source';

// Contrato de extensões de linguagem. Plugins rodam no processo principal, recebem
// apenas leitura confinada ao projeto e respondem a strings usadas como argumento
// de chamada: `route('x')` chega como callee `route`, argumento 0.
export type Position = { line: number; character: number };
/** `content`/`title`: documento virtual somente leitura (ex.: DDL gerado), aberto pelo renderer. */
export type PluginLocation = { uri: string; range: { start: Position; end: Position }; preserveView?: boolean; content?: string; title?: string };
export type PluginCompletion = { label: string; kind: number; labelDetails?: { detail?: string; description?: string }; detail?: string };
export type StringSite = {
 /** Caminho relativo à raiz do projeto. */
 path: string;
 text: string;
 literal: Literal;
 /** `route`, `Route::view`, `->route`, `@include`… */
 callee: string;
 argument: number;
 /** Conteúdo da string antes do cursor. */
 prefix: string;
};
/** Ponto fora de string (tag `<x-…>`, atributo, `$variável` em Blade). */
export type CodeSite = { path: string; text: string; offset: number; blade: boolean };
/** Itens substituem o texto de `from` (offset) até o cursor. */
export type CodeCompletion = { from: number; items: (PluginCompletion & { insertText?: string })[] };
export type PluginStatus = { id: string; name: string; version?: string };
export interface ProjectFiles {
 readonly root: string;
 read(path: string): Promise<string | null>;
 list(dir: string, accept: (name: string) => boolean): Promise<string[]>;
 exists(path: string): Promise<boolean>;
 uri(path: string): string;
}
export interface IdePlugin {
 readonly id: string;
 readonly name: string;
 /** Plugin interno que não aparece na barra de status. */
 readonly hidden?: boolean;
 /** null quando o plugin não se aplica ao projeto. */
 detect(files: ProjectFiles): Promise<{ version?: string } | null>;
 /** Caminho relativo alterado que invalida dados em cache. */
 invalidates?(path: string): boolean;
 invalidate?(): void;
 /** null: o plugin não trata este ponto; []: trata, mas não há candidatos. */
 completeString?(site: StringSite, files: ProjectFiles): Promise<PluginCompletion[] | null>;
 defineString?(site: StringSite, files: ProjectFiles): Promise<PluginLocation[] | null>;
 completeCode?(site: CodeSite, files: ProjectFiles): Promise<CodeCompletion | null>;
 defineCode?(site: CodeSite, files: ProjectFiles): Promise<PluginLocation[] | null>;
}
export const CompletionKind = { Text: 1, Method: 2, Field: 5, Variable: 6, Module: 9, Property: 10, Value: 12, Keyword: 14, File: 17, Reference: 18, Folder: 19, Constant: 21 } as const;
