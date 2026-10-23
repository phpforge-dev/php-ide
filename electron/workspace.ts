import { realpath, readdir, readFile, stat, writeFile, rename, unlink, mkdir } from 'node:fs/promises';
import { resolve, relative, isAbsolute, basename, join, dirname } from 'node:path';
import { pathToFileURL } from 'node:url';
import { createHash, randomUUID } from 'node:crypto';
import type { Entry, FileBuffer } from '../shared/contracts';
const excluded = new Set(['.git', '.idea', 'node_modules', '.tools', '.cache', '.php-ide', 'dist', 'dist-electron']);
export const hash = (text: string) => createHash('sha256').update(text).digest('hex');
export class Workspace {
  private saves = new Map<string, Promise<string>>();
  constructor(readonly root: string) {}
  info() { return { root: this.root, name: basename(this.root) }; }
  async path(input: string): Promise<string> {
    if (typeof input !== 'string') throw new Error('Caminho inválido');
    const path = await realpath(resolve(this.root, input));
    const rel = relative(this.root, path);
    if (rel === '..' || rel.startsWith('..' + (process.platform === 'win32' ? '\\' : '/')) || isAbsolute(rel))
      throw new Error('Arquivo fora do projeto');
    return path;
  }
  async tree(input: string): Promise<Entry[]> {
    const path = await this.path(input);
    const entries = await readdir(path, { withFileTypes: true });
    return entries.filter(e => !excluded.has(e.name) && !e.isSymbolicLink())
      .sort((a,b) => Number(b.isDirectory()) - Number(a.isDirectory()) || a.name.localeCompare(b.name))
      .slice(0, 2000).map(e => ({ name: e.name, path: relative(this.root, join(path, e.name)), directory: e.isDirectory() }));
  }
  async read(input: string): Promise<FileBuffer> {
    const path = await this.path(input); const info = await stat(path);
    if (!info.isFile() || info.size > 2 * 1024 * 1024) throw new Error('Abra um arquivo de texto de até 2 MB');
    const bytes = await readFile(path); if (bytes.includes(0)) throw new Error('Arquivo binário não suportado');
    const text = new TextDecoder('utf-8', { fatal: true }).decode(bytes);
    return { path: relative(this.root, path), uri: pathToFileURL(path).href, text, etag: hash(text) };
  }
  save(input: string, text: string, etag: string) {
    const previous = this.saves.get(input) ?? Promise.resolve('');
    const job = previous.catch(() => '').then(() => this.write(input, text, etag));
    this.saves.set(input, job);
    void job.finally(() => { if (this.saves.get(input) === job) this.saves.delete(input); }).catch(() => {});
    return job;
  }
  /** Cria arquivo novo (falha se existir); pastas intermediárias ficam dentro do projeto. */
  async create(input: string, text: string) {
    if (typeof input !== 'string' || typeof text !== 'string' || Buffer.byteLength(text) > 2 * 1024 * 1024) throw new Error('Texto inválido ou muito grande');
    const target = resolve(this.root, input);
    const rel = relative(this.root, target);
    if (!rel || rel === '..' || rel.startsWith('..' + (process.platform === 'win32' ? '\\' : '/')) || isAbsolute(rel)) throw new Error('Arquivo fora do projeto');
    let dir = dirname(target); const missing: string[] = [];
    while (true) { try { await this.path(relative(this.root, dir) || '.'); break; } catch (error) { if (!String(error).includes('ENOENT')) throw error; missing.push(dir); dir = dirname(dir); } }
    for (const d of missing.reverse()) await mkdir(d);
    await writeFile(target, text, { flag: 'wx' });
    return hash(text);
  }
  private async write(input: string, text: string, etag: string) {
    if (typeof text !== 'string' || Buffer.byteLength(text) > 2 * 1024 * 1024) throw new Error('Texto inválido ou muito grande');
    const before = await this.read(input);
    if (before.etag !== etag) throw new Error('O arquivo mudou no disco. Reabra e compare antes de salvar.');
    const path = await this.path(input); const mode = (await stat(path)).mode;
    const temporary = `${path}.php-ide-${randomUUID()}`;
    try {
      await writeFile(temporary, text, { mode, flag: 'wx' });
      if ((await this.read(input)).etag !== etag) throw new Error('Alteração externa durante salvamento');
      await rename(temporary, path);
      return hash(text);
    } finally { await unlink(temporary).catch(() => {}); }
  }
}
