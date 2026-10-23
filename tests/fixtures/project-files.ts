import { readFile, readdir, stat } from 'node:fs/promises';
import { join, relative, resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import type { ProjectFiles } from '../../shared/language/plugins/api';

/** Adapter for synthetic test fixtures; production filesystem access stays in Rust. */
export function projectFiles(root: string): ProjectFiles {
  const path = (name: string) => {
    const full = resolve(root, name);
    const rel = relative(root, full);
    if (rel === '..' || rel.startsWith('../') || rel.startsWith('..\\')) throw new Error('Outside fixture');
    return full;
  };
  async function walk(dir: string, accept: (name: string) => boolean): Promise<string[]> {
    const entries = await readdir(dir, { withFileTypes: true }).catch(() => []);
    const found = await Promise.all(entries.map(entry => entry.isDirectory()
      ? walk(join(dir, entry.name), accept)
      : entry.isFile() && accept(entry.name) ? [relative(root, join(dir, entry.name)).replaceAll('\\', '/')] : []));
    return found.flat().sort();
  }
  return {
    root,
    read: name => readFile(path(name), 'utf8').catch(() => null),
    exists: name => stat(path(name)).then(() => true, () => false),
    list: (dir, accept) => walk(path(dir), accept),
    uri: name => pathToFileURL(path(name)).href,
  };
}
