import { readdir, readFile, realpath, stat } from 'node:fs/promises';
import { isAbsolute, join, relative, resolve, sep } from 'node:path';
import { pathToFileURL } from 'node:url';
import { bladeCode, codeOnly, literalAt, position } from '../php-source';
import type { IdePlugin, PluginLocation, PluginStatus, ProjectFiles, StringSite } from './api';
import { LaravelPlugin } from './laravel';
import { DotenvPlugin } from './dotenv';

const skipped = new Set(['.git', '.idea', 'node_modules', 'vendor', '.tools', '.cache', '.php-ide', 'dist', 'dist-electron']);

/** Leitura somente dentro da raiz real do projeto, sem seguir links simbólicos para fora. */
export class ConfinedFiles implements ProjectFiles {
 constructor(readonly root: string) {}
 private async inside(path: string) {
  const full = await realpath(resolve(this.root, path));
  const rel = relative(this.root, full);
  if (rel === '..' || rel.startsWith('..' + sep) || isAbsolute(rel)) throw new Error('Arquivo fora do projeto');
  return full;
 }
 async read(path: string) {
  try { const full = await this.inside(path); const info = await stat(full); if (!info.isFile() || info.size > 2 * 1024 * 1024) return null; return await readFile(full, 'utf8'); }
  catch { return null; }
 }
 async exists(path: string) { try { await this.inside(path); return true; } catch { return false; } }
 async list(dir: string, accept: (name: string) => boolean) {
  const out: string[] = []; const pending = [dir];
  while (pending.length && out.length < 20000) {
   const current = pending.pop()!; let entries;
   try { entries = await readdir(await this.inside(current), { withFileTypes: true }); } catch { continue; }
   for (const e of entries) {
    if (e.isSymbolicLink() || skipped.has(e.name)) continue;
    const path = current ? join(current, e.name) : e.name;
    if (e.isDirectory()) pending.push(path); else if (e.isFile() && accept(e.name)) out.push(path);
   }
  }
  return out.sort();
 }
 uri(path: string) { return pathToFileURL(join(this.root, path)).href; }
}

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

export class PluginHost {
 private files: ConfinedFiles;
 private active?: Promise<{ plugin: IdePlugin; version?: string }[]>;
 constructor(root: string, private plugins: IdePlugin[] = [new LaravelPlugin(), new DotenvPlugin()]) { this.files = new ConfinedFiles(root); }
 private enabled() {
  this.active ??= Promise.all(this.plugins.map(async plugin => ({ plugin, detected: await plugin.detect(this.files).catch(() => null) })))
   .then(list => list.filter(p => p.detected).map(p => ({ plugin: p.plugin, version: p.detected!.version })));
  return this.active;
 }
 async status(): Promise<PluginStatus[]> { return (await this.enabled()).filter(p => !p.plugin.hidden).map(p => ({ id: p.plugin.id, name: p.plugin.name, ...(p.version ? { version: p.version } : {}) })); }
 /** Recebe caminho absoluto alterado pelo watcher ou por salvamento. */
 changed(path: string) {
  const rel = relative(this.files.root, path);
  if (rel.startsWith('..')) return;
  for (const p of this.plugins) if (p.invalidates?.(rel)) p.invalidate?.();
  if (rel === 'composer.json' || rel === 'composer.lock' || /^\.env(\.|$)/.test(rel)) this.active = undefined;
 }
 site(path: string, text: string, offset: number): StringSite | null {
  const blade = path.endsWith('.blade.php');
  const source = blade ? bladeCode(text) : text;
  const literal = literalAt(source, offset, blade);
  if (!literal || literal.quote === '<<<') return null;
  const prefix = source.slice(literal.start + 1, offset);
  if (prefix.includes('\n')) return null;
  const call = callSite(codeOnly(source.slice(0, literal.start), blade), literal.start);
  return call ? { path, text, literal, prefix, ...call } : null;
 }
 async complete(path: string, text: string, offset: number) {
  const site = this.site(path, text, offset);
  // Strings sem dono pela chamada (ex.: SQL em ->query()) seguem para os ganchos de código.
  if (site) for (const { plugin } of await this.enabled()) {
   const items = await plugin.completeString?.(site, this.files);
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
  for (const { plugin } of await this.enabled()) {
   const result = await plugin.completeCode?.(site, this.files);
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
  for (const { plugin } of await this.enabled()) {
   const found = await plugin.defineCode?.(site, this.files);
   if (found) return found;
  }
  return null;
 }
 async define(path: string, text: string, offset: number): Promise<PluginLocation[] | null> {
  const site = this.site(path, text, offset);
  if (site) for (const { plugin } of await this.enabled()) {
   const found = await plugin.defineString?.(site, this.files);
   if (found) return found;
  }
  return this.defineCode(path, text, offset);
 }
}
