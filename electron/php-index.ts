import { readdir, readFile, stat } from 'node:fs/promises';
import { join, relative } from 'node:path';
import { analyze, position, type Declaration } from './php-source';

export type IndexedClass = Declaration & { path: string; line: number; character: number };
const skipped = new Set(['.git', '.idea', 'node_modules', '.tools', '.cache', '.php-ide', 'dist', 'dist-electron']);
const maxFiles = 50000;
const maxBytes = 2 * 1024 * 1024;

/** Índice próprio de classes, interfaces, traits e enums do projeto (inclui vendor). */
export class PhpClassIndex {
 private files = new Map<string, IndexedClass[]>();
 private ready?: Promise<void>;
 private generation = 0;
 truncated = false;
 constructor(readonly root: string) {}
 build() {
  this.ready ??= this.scan();
  return this.ready;
 }
 private async scan() {
  const generation = this.generation;
  const pending = [this.root];
  let count = 0;
  while (pending.length && generation === this.generation) {
   const dir = pending.pop()!;
   let entries;
   try { entries = await readdir(dir, { withFileTypes: true }); } catch { continue; }
   for (const entry of entries) {
    if (entry.isSymbolicLink() || skipped.has(entry.name)) continue;
    const path = join(dir, entry.name);
    if (entry.isDirectory()) pending.push(path);
    else if (entry.isFile() && entry.name.endsWith('.php')) {
     if (++count > maxFiles) { this.truncated = true; return; }
     await this.update(path);
    }
   }
  }
 }
 async update(path: string) {
  try {
   const info = await stat(path);
   if (!info.isFile() || info.size > maxBytes) { this.files.delete(path); return; }
   const text = await readFile(path, 'utf8');
   const rel = relative(this.root, path);
   this.files.set(path, analyze(text).declarations.map(d => ({ ...d, path: rel, ...position(text, d.offset) })));
  } catch { this.files.delete(path); }
 }
 remove(path: string) {
  const prefix = path.endsWith('/') ? path : path + '/';
  for (const key of [...this.files.keys()]) if (key === path || key.startsWith(prefix)) this.files.delete(key);
 }
 dispose() { this.generation++; this.files.clear(); }
 /** Nomes curtos que começam com o prefixo (sem diferenciar maiúsculas). */
 search(prefix: string, limit = 200): IndexedClass[] {
  const p = prefix.toLowerCase(); const out: IndexedClass[] = [];
  for (const list of this.files.values()) for (const c of list) if (c.name.toLowerCase().startsWith(p)) out.push(c);
  return out.sort((a, b) => a.name.localeCompare(b.name) || a.fqn.localeCompare(b.fqn)).slice(0, limit);
 }
 find(fqn: string): IndexedClass | undefined {
  const target = fqn.replace(/^\\/, '').toLowerCase();
  for (const list of this.files.values()) for (const c of list) if (c.fqn.toLowerCase() === target) return c;
  return undefined;
 }
 get size() { let n = 0; for (const list of this.files.values()) n += list.length; return n; }
}
