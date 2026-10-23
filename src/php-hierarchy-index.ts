// Índice de hierarquia PHP do projeto (inclui vendor) para marcadores de gutter e
// adaptações de trait. Lê pelo mesmo IPC restrito do editor; nada é gravado.
import { parseHierarchy, PhpHierarchy, type PhpClass } from '../shared/language/php-hierarchy';

export type HierarchyFiles = {
 workspace(): Promise<{ root: string }>;
 listFiles(dir: string, vendor: boolean): Promise<string[]>;
 read(path: string): Promise<{ path: string; text: string; uri: string }>;
};
type Entry = { uri: string; lines: number[] };

const MAX_FILES = 20000, MAX_BYTES = 1024 * 1024;
const lineStarts = (text: string) => { const out = [0]; for (let i = text.indexOf('\n'); i >= 0; i = text.indexOf('\n', i + 1)) out.push(i + 1); return out; };

export class ProjectHierarchy {
 readonly index = new PhpHierarchy();
 private files = new Map<string, Entry>();
 private root = ''; private building?: Promise<void>; private stale = true;
 constructor(private source: HierarchyFiles) {}
 /** Marca para reconstruir no próximo uso (troca de projeto ou muitas mudanças). */
 invalidate() { this.stale = true; }
 async ready(): Promise<string> {
  const { root } = await this.source.workspace();
  if (root !== this.root) { this.root = root; this.stale = true; }
  if (this.stale) { this.stale = false; this.building = this.build(); }
  await this.building; return this.root;
 }
 private async build() {
  for (const c of this.index.all()) this.index.removePath(c.path!);
  this.files.clear();
  const paths = (await this.source.listFiles('', true)).filter(p => p.endsWith('.php') && !p.endsWith('.blade.php')).slice(0, MAX_FILES);
  let next = 0;
  await Promise.all(Array.from({ length: 8 }, async () => { while (next < paths.length) { const path = paths[next++]; try { const file = await this.source.read(path); this.put(path, file.text, file.uri); } catch { /* Arquivo ilegível fica fora do índice. */ } } }));
 }
 /** Atualiza um arquivo: conteúdo salvo (watcher) ou buffer aberto ainda não salvo. */
 put(path: string, text: string, uri?: string): PhpClass[] {
  this.index.removePath(path);
  const classes = text.length > MAX_BYTES ? [] : parseHierarchy(text, path);
  for (const c of classes) this.index.add(c);
  this.files.set(path, { uri: uri ?? this.files.get(path)?.uri ?? '', lines: lineStarts(text) });
  return classes;
 }
 /** `path` absoluto (watcher) ou relativo à raiz. */
 async refreshPath(changed: string) {
  const path = changed.startsWith('/') ? this.relative(changed) : changed;
  if (!path?.endsWith('.php') || this.stale) return;
  try { const file = await this.source.read(path); this.put(path, file.text, file.uri); } catch { this.index.removePath(path); this.files.delete(path); }
 }
 relative(fsPath: string) { const root = this.root.replace(/\/$/, ''); return fsPath.startsWith(root + '/') ? fsPath.slice(root.length + 1) : null; }
 /** Localização LSP (0-based) de um offset num arquivo indexado. */
 location(path: string, offset: number, length: number) {
  const entry = this.files.get(path); if (!entry?.uri) return null;
  let line = 0; for (let lo = 0, hi = entry.lines.length - 1; lo <= hi;) { const mid = (lo + hi) >> 1; if (entry.lines[mid] <= offset) { line = mid; lo = mid + 1; } else hi = mid - 1; }
  const character = offset - entry.lines[line];
  return { uri: entry.uri, range: { start: { line, character }, end: { line, character: character + length } } };
 }
}
