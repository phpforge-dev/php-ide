import { bladeCode, codeOnly, literalAt, position } from '../php-source';
import type { FormatRequest, FormatResult, IdePlugin, PluginCodeLens, PluginDiagnostic, PluginLocation, PluginStatus, ProjectFiles, StringSite } from './api';
import type { HoverPlugin, PluginHover } from './extensions';
const servesPath = (plugin: IdePlugin, path: string) => plugin.documents ? plugin.documents(path) : path.endsWith('.php');
/** Chamada que contém a string: nome normalizado e índice do argumento. */
export function callSite(code: string, start: number): { callee: string; argument: number } | null {
 let depth = 0; let argument = 0; let i = start - 1;
 for (; i >= 0; i--) {
  const c = code[i];
  if (c === ')' || c === ']' || c === '}') depth++;
  else if (c === '(' || c === '[' || c === '{') { if (depth === 0) break; depth--; }
  else if (c === ',' && depth === 0) argument++;
  else if (c === ';' && depth === 0) return null;
 }
 if (i < 0 || code[i] !== '(') return null;
 const m = /(->\s*[A-Za-z_]\w*|@?\\?[A-Za-z_][\w\\]*(?:\s*::\s*[A-Za-z_]\w*)?)\s*$/.exec(code.slice(Math.max(0, i - 200), i));
 if (!m) return null;
 const callee = m[1].replace(/\s+/g, '').replace(/^\\?(?:[A-Za-z_]\w*\\)+(?=\w+::)/, '').replace(/^\\/, '');
 return { callee, argument };
}

// Plugins de terceiros (sandbox.ts) registrados pelo gerenciador da interface; somam-se aos internos.
let external: () => readonly IdePlugin[] = () => [];
let externalVersion = 0;
export function setExternalPlugins(source: (() => readonly IdePlugin[]) | null) { external = source ?? (() => []); externalVersion++; }
/** Falha de um plugin não interrompe os demais nem a resposta do editor. */
const safe = <T>(run: () => Promise<T> | undefined): Promise<T | null> => { try { return Promise.resolve(run()).then(v => v ?? null, () => null); } catch { return Promise.resolve(null); } };

export class PluginHost {
 private files: ProjectFiles;
 private active?: Promise<{ plugin: IdePlugin; version?: string }[]>;
 private seen = externalVersion;
 constructor(files: ProjectFiles, private plugins: IdePlugin[] = []) { this.files = files; }
 private all() { const internal = new Set(this.plugins.map(p => p.id)); return [...this.plugins, ...external().filter(p => !internal.has(p.id))]; }
 private enabled() {
  if (this.seen !== externalVersion) { this.seen = externalVersion; this.active = undefined; }
  this.active ??= Promise.all(this.all().map(async plugin => ({ plugin, detected: await safe(() => plugin.detect(this.files)) })))
   .then(list => list.filter(p => p.detected).map(p => ({ plugin: p.plugin, version: p.detected!.version })));
  return this.active;
 }
 private async serving(path: string) { return (await this.enabled()).filter(p => servesPath(p.plugin, path)); }
 async status(): Promise<PluginStatus[]> { return (await this.enabled()).filter(p => !p.plugin.hidden).map(p => ({ id: p.plugin.id, name: p.plugin.name, ...(p.version ? { version: p.version } : {}) })); }
 /** Recebe caminho absoluto alterado pelo watcher ou por salvamento. */
 changed(path: string) {
  const rel = path.startsWith(this.files.root + '/') ? path.slice(this.files.root.length + 1) : path;
  if (rel.startsWith('..')) return;
  const all = this.all();
  for (const p of all) if (p.invalidates?.(rel)) p.invalidate?.();
  if (rel === 'composer.json' || rel === 'composer.lock' || /^\.env(\.|$)/.test(rel) || all.some(p => p.markers?.includes(rel) || p.activationChanged?.(rel))) this.active = undefined;
 }
 site(path: string, text: string, offset: number): StringSite | null {
  if (!path.endsWith('.php')) return null;
  const blade = path.endsWith('.blade.php');
  const source = blade ? bladeCode(text) : text;
  const literal = literalAt(source, offset, blade);
  if (!literal || literal.quote === '<<<') return null;
  const prefix = source.slice(literal.start + 1, offset);
  if (prefix.includes('\n')) return null;
  const call = callSite(codeOnly(source.slice(0, literal.start), blade), literal.start);
  return call ? { path, text, literal, prefix, ...call } : null;
 }
 /** Formatting is explicit: propagate failures, never silently fall through to another style. */
 async format(request: FormatRequest): Promise<FormatResult | null> {
  for(const {plugin} of await this.serving(request.path)){
   const result=await plugin.format?.(request,this.files);
   if(result!==undefined&&result!==null)return result;
  }
  return null;
 }
 async complete(path: string, text: string, offset: number) {
  const site = this.site(path, text, offset);
  // Strings sem dono pela chamada (ex.: SQL em ->query()) seguem para os ganchos de código.
  if (site) for (const { plugin } of await this.serving(path)) {
   const items = await safe(() => plugin.completeString?.(site, this.files));
   if (!items) continue;
   const from = position(text, site.literal.start + 1);
   const to = position(text, site.literal.closed ? site.literal.end - 1 : offset);
   const at = position(text, offset);
   // Enter insere no cursor; Tab substitui o conteúdo inteiro da string.
   return { isIncomplete: false, items: items.map((item, index) => ({ ...item, filterText: item.label, sortText: String(index).padStart(5, '0'),
    textEdit: { newText: item.label, insert: { start: from, end: at }, replace: { start: from, end: to } } })) };
  }
  return this.completeCode(path, text, offset);
 }
 private code(path: string, text: string, offset: number) { return { path, text, offset, blade: path.endsWith('.blade.php') }; }
 async completeCode(path: string, text: string, offset: number) {
  const site = this.code(path, text, offset);
  for (const { plugin } of await this.serving(path)) {
   const result = await safe(() => plugin.completeCode?.(site, this.files));
   if (!result) continue;
   const range = { start: position(text, result.from), end: position(text, offset) };
   return { isIncomplete: false, items: result.items.map((item, index) => {
    const { insertText, ...rest } = item;
    return { ...rest, filterText: rest.label, sortText: String(index).padStart(5, '0'), textEdit: { newText: insertText ?? rest.label, range } };
   }) };
  }
  return null;
 }
 async defineCode(path: string, text: string, offset: number): Promise<PluginLocation[] | null> {
  const site = this.code(path, text, offset);
  for (const { plugin } of await this.serving(path)) {
   const found = await safe(() => plugin.defineCode?.(site, this.files));
   if (found) return found;
  }
  return null;
 }
 /** Problemas de todos os plugins que atendem o documento; falha de um plugin não esconde os demais. */
 async diagnose(path: string, text: string): Promise<PluginDiagnostic[]> {
  const lists = await Promise.all((await this.serving(path)).map(({ plugin }) => safe(() => plugin.diagnose?.(path, text, this.files)).then(v => v ?? [])));
  return lists.flat();
 }
 /** Ações de linha de todos os plugins que atendem o documento. */
 async codeLenses(path: string, text: string): Promise<PluginCodeLens[]> {
  const lists = await Promise.all((await this.serving(path)).map(({ plugin }) => safe(() => plugin.codeLenses?.(path, text, this.files)).then(v => v ?? [])));
  return lists.flat();
 }
 /** Hover (Markdown) do primeiro plugin que reconhece o ponto; a string sob o cursor vai junto quando há. */
 async hover(path: string, text: string, offset: number): Promise<PluginHover | null> {
  const site = this.code(path, text, offset); const string = this.site(path, text, offset);
  for (const { plugin } of await this.serving(path)) {
   const found = await (plugin as IdePlugin & HoverPlugin).hover?.(site, this.files, string);
   if (found) return found;
  }
  return null;
 }
 async define(path: string, text: string, offset: number): Promise<PluginLocation[] | null> {
  const site = this.site(path, text, offset);
  if (site) for (const { plugin } of await this.serving(path)) {
   const found = await safe(() => plugin.defineString?.(site, this.files));
   if (found) return found;
  }
  return this.defineCode(path, text, offset);
 }
}
