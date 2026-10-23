import type { Literal } from '../php-source';

// Contrato de extensões de linguagem: internos no host TypeScript; terceiros em
// Web Worker com ponte de permissões (sandbox.ts). Strings usadas como argumento
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
/** Problema em um documento (posições 0-based); `code` identifica a inspeção. */
export type PluginDiagnostic = { range: { start: Position; end: Position }; message: string; code: string; severity: 'warning' | 'error' };
/** Ação sobre uma linha do editor (CodeLens); `command` é tratado pelo renderer. */
export type PluginCodeLens = { line: number; title: string; tooltip?: string; command: string; arguments: unknown[] };
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
 /** Arquivos (relativos) cuja alteração reavalia `detect`. */
 readonly markers?: readonly string[];
 /** Reavalia a detecção quando um arquivo relevante é criado/alterado/removido. */
 activationChanged?(path: string): boolean;
 /** null quando o plugin não se aplica ao projeto. */
 detect(files: ProjectFiles): Promise<{ version?: string } | null>;
 /** Documentos atendidos (caminho relativo); padrão: arquivos `.php`, incluindo Blade. */
 documents?(path: string): boolean;
 /** Caminho relativo alterado que invalida dados em cache. */
 invalidates?(path: string): boolean;
 invalidate?(): void;
 /** null: o plugin não trata este ponto; []: trata, mas não há candidatos. */
 completeString?(site: StringSite, files: ProjectFiles): Promise<PluginCompletion[] | null>;
 defineString?(site: StringSite, files: ProjectFiles): Promise<PluginLocation[] | null>;
 completeCode?(site: CodeSite, files: ProjectFiles): Promise<CodeCompletion | null>;
 defineCode?(site: CodeSite, files: ProjectFiles): Promise<PluginLocation[] | null>;
 diagnose?(path: string, text: string, files: ProjectFiles): Promise<PluginDiagnostic[]>;
 codeLenses?(path: string, text: string, files: ProjectFiles): Promise<PluginCodeLens[]>;
}
export const CompletionKind = { Text: 1, Method: 2, Function: 3, Field: 5, Variable: 6, Module: 9, Property: 10, Value: 12, Keyword: 14, File: 17, Reference: 18, Folder: 19, Constant: 21 } as const;

// Plugins de terceiros: manifesto `plugin.json`, código num Web Worker e acesso ao
// projeto, processos e rede só pela ponte que confere as permissões concedidas.
export type PluginPermission = 'project.read' | 'project.write' | 'process' | 'network';
export const PLUGIN_PERMISSIONS: readonly PluginPermission[] = ['project.read', 'project.write', 'process', 'network'];
export type PluginManifest = {
 /** `editor.nome` em minúsculas; não colide com plugins internos. */
 id: string; name: string; version: string; minIdeVersion: string;
 /** Arquivo .js relativo à pasta do plugin. */
 main: string; description?: string;
 activation: {
  /** Documentos atendidos por linguagem (`php`, `blade`, `markdown`…). */
  languages?: string[];
  /** Documentos atendidos por padrão de caminho (`*`, `**`, `?`). */
  documents?: string[];
  /** O plugin só se aplica ao projeto se algum destes arquivos existir. */
  files?: string[];
 };
 permissions: PluginPermission[];
};
/** Plugin descoberto pelo backend (pasta do usuário ou `.php-ide/plugins` do projeto). */
export type InstalledPlugin = {
 key: string; scope: 'user' | 'project'; dir: string;
 manifest?: PluginManifest; error?: string;
 enabled: boolean; consented: boolean; needsConsent: boolean; granted: PluginPermission[];
};
/** Extensões de cada linguagem de ativação (mesma lista validada pelo backend). */
export const PLUGIN_LANGUAGES: Record<string, (path: string) => boolean> = {
 php: p => p.endsWith('.php') && !p.endsWith('.blade.php'), blade: p => p.endsWith('.blade.php'),
 markdown: p => /\.(md|markdown)$/i.test(p), json: p => p.endsWith('.json'), yaml: p => /\.ya?ml$/.test(p),
 javascript: p => /\.(m|c)?jsx?$/.test(p), typescript: p => /\.(m|c)?tsx?$/.test(p), vue: p => p.endsWith('.vue'),
 css: p => p.endsWith('.css'), scss: p => /\.s[ac]ss$/.test(p), html: p => /\.html?$/.test(p), twig: p => p.endsWith('.twig'),
 xml: p => /\.(xml|xml\.dist)$/.test(p), dotenv: p => /(^|\/)\.env(\.[\w.-]+)?$/.test(p), sql: p => p.endsWith('.sql'),
 ignore: p => /(^|\/)\.\w*ignore$/.test(p), text: p => p.endsWith('.txt'),
};
