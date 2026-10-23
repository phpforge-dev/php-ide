import type { CodeSite, Position, ProjectFiles, StringSite } from './api';

// Extensões do contrato de plugins introduzidas no recorte 25 e ainda fora de `api.ts`:
// hover e correções rápidas anexadas a diagnósticos. Candidatas a migrar para `api.ts`.

/** Texto Markdown mostrado no hover. */
export type PluginHover = { contents: string; range?: { start: Position; end: Position } };
/** Edição de texto em um documento (`uri` absoluta). */
export type PluginTextEdit = { uri: string; range: { start: Position; end: Position }; newText: string };
/** Correção rápida: cria arquivo (`create`) e/ou aplica edições. */
export type PluginFix = { title: string; create?: { uri: string; path: string; content: string }; edits?: PluginTextEdit[] };
export interface HoverPlugin { hover?(site: CodeSite, files: ProjectFiles, string: StringSite | null): Promise<PluginHover | null> }
