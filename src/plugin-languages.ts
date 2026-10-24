import { isBashDocument } from '../shared/bash-document';
import { isDockerDocument } from '../shared/docker-document';
import { isEnvPath } from '../shared/env-document';
import * as monaco from 'monaco-editor';
import { msg } from './i18n';
import type { IdeApi, LanguageMethod } from '../shared/contracts';
import { isPluginDocument } from '../shared/language/plugins/symfony';

// Providers for the bundled document plugins (Composer, Symfony, DotEnv and Docker).
type Host = { path(model: monaco.editor.ITextModel): string | undefined; status(text: string): void };
const lspKinds = ['Text', 'Method', 'Function', 'Constructor', 'Field', 'Variable', 'Class', 'Interface', 'Module', 'Property', 'Unit', 'Value', 'Enum', 'Keyword', 'Snippet', 'Color', 'File', 'Reference', 'Folder', 'EnumMember', 'Constant'] as const;
const kind = (n: number) => monaco.languages.CompletionItemKind[lspKinds[n - 1] ?? 'Text'] ?? monaco.languages.CompletionItemKind.Text;
const range = (r: { start: { line: number; character: number }; end: { line: number; character: number } }) => ({ startLineNumber: r.start.line + 1, startColumn: r.start.character + 1, endLineNumber: r.end.line + 1, endColumn: r.end.character + 1 });
const languages = ['json', 'yaml', 'twig', 'dotenv', 'dockerfile', 'shell'];

export function mountPluginLanguages(api: IdeApi, host: Host) {
 const served = (model: monaco.editor.ITextModel) => { const path = host.path(model); return path && (isPluginDocument(path) || isEnvPath(path) || isDockerDocument(path,model.getValue()) || isBashDocument(path,model.getValue())) ? path : undefined; };
 const ask = (method: LanguageMethod, model: monaco.editor.ITextModel, path: string, p: { lineNumber: number; column: number }) =>
  api.language({ method, path, text: model.getValue(), version: model.getVersionId(), position: { line: p.lineNumber - 1, character: p.column - 1 } }) as Promise<any>;
 monaco.languages.registerCompletionItemProvider(languages, { triggerCharacters: ['"', "'", '@', '%', '(', '/', '{', ':', '-', '$'], provideCompletionItems: async (model, position) => {
  const path = served(model); if (!path) return { suggestions: [] };
  let v: any; try { v = await ask('textDocument/completion', model, path, position); } catch (error) { host.status(msg`Sugestões indisponíveis: ${String(error)}`); return { suggestions: [] }; }
  return { suggestions: (v?.items ?? []).map((i: any) => ({ label: { label: i.label, detail: i.labelDetails?.detail, description: i.labelDetails?.description }, kind: kind(i.kind), detail: i.detail, filterText: i.filterText, sortText: i.sortText, insertText: i.textEdit?.newText ?? i.label, range: range(i.textEdit.range) })) };
 } });
 monaco.languages.registerDefinitionProvider(languages, { provideDefinition: async (model, position) => {
  const path = served(model); if (!path) return [];
  const list: any[] = await ask('textDocument/definition', model, path, position).catch(() => []) ?? [];
  // O modelo do destino precisa existir para a prévia de várias declarações; o opener de main.ts
  // reaproveita esse modelo ao abrir a aba.
  const out: monaco.languages.Location[] = [];
  for (const l of list) {
   const uri = monaco.Uri.parse(l.uri);
   if (!monaco.editor.getModel(uri)) { try { monaco.editor.createModel((await api.read(uri.fsPath)).text, undefined, uri); } catch { continue; } }
   out.push({ uri, range: range(l.range) });
  }
  host.status(out.length ? msg`${out.length} resultado(s) de declarações` : msg`Nenhum resultado de declarações neste ponto`);
  return out;
 } });
 monaco.languages.registerHoverProvider(['dockerfile','yaml','shell'], { provideHover: async (model, position) => { const path=served(model);if(!path||!(isDockerDocument(path,model.getValue())||isBashDocument(path,model.getValue())))return null;const v=await ask('textDocument/hover',model,path,position).catch(()=>null);return v?{contents:[{value:v.contents.value}],range:v.range?range(v.range):undefined}:null; } });
 const lensChanged = new monaco.Emitter<monaco.languages.CodeLensProvider>();
 const lenses: monaco.languages.CodeLensProvider = { onDidChange: lensChanged.event, provideCodeLenses: async model => {
  const path = served(model); if (path !== 'composer.json') return { lenses: [], dispose() {} };
  const list: any[] = await ask('textDocument/codeLens', model, path, { lineNumber: 1, column: 1 }).catch(() => []) ?? [];
  return { lenses: list.map(l => ({ range: { startLineNumber: l.line + 1, startColumn: 1, endLineNumber: l.line + 1, endColumn: 1 }, command: { id: l.command, title: l.title, tooltip: l.tooltip, arguments: l.arguments } })), dispose() {} };
 } };
 monaco.languages.registerCodeLensProvider('json', lenses);
 const timers = new Map<monaco.editor.ITextModel, ReturnType<typeof setTimeout>>();
 async function diagnose(model: monaco.editor.ITextModel) {
  const path = served(model); if(model.isDisposed())return;if(!path){monaco.editor.setModelMarkers(model,'php-ide-plugins',[]);return;}
  const version = model.getVersionId();
  let list: any[]; try { list = await ask('textDocument/diagnostic', model, path, { lineNumber: 1, column: 1 }) ?? []; } catch { return; }
  if (model.isDisposed() || model.getVersionId() !== version) return;
  monaco.editor.setModelMarkers(model, 'php-ide-plugins', list.map(d => ({ severity: d.severity === 'error' ? monaco.MarkerSeverity.Error : monaco.MarkerSeverity.Warning, message: d.message, code: d.code, source: isBashDocument(path,model.getValue()) ? 'Bash' : isDockerDocument(path,model.getValue()) ? 'Docker' : path === 'composer.json' ? 'Composer' : 'Symfony', ...range(d.range) })));
 }
 const schedule = (model: monaco.editor.ITextModel, delay = 400) => { clearTimeout(timers.get(model)); timers.set(model, setTimeout(() => { timers.delete(model); void diagnose(model); }, delay)); };
 const watch = (model: monaco.editor.ITextModel) => { if (!languages.includes(model.getLanguageId())) return; model.onDidChangeContent(() => schedule(model)); model.onWillDispose(() => clearTimeout(timers.get(model))); schedule(model, 50); };
 monaco.editor.getModels().forEach(watch); monaco.editor.onDidCreateModel(watch);
 /** Reavalia diagnósticos e CodeLens (ex.: depois de composer install/update alterar o lock). */
 const refresh = () => { for (const model of monaco.editor.getModels()) if (languages.includes(model.getLanguageId())) schedule(model, 50); lensChanged.fire(lenses); };
 window.addEventListener('ide-plugins-changed',refresh);
 window.addEventListener('ide-workspace-file-changed', event => { const path = String((event as CustomEvent).detail?.path ?? ''); if (/(^|\/)composer\.(json|lock)$|\/vendor\/composer\/installed\.json$|\/(config|templates|src)\/|\/\.env/.test(path)) refresh(); });
 return { refresh };
}
