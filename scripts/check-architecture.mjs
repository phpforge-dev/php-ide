import { readdir, readFile, access } from 'node:fs/promises';
import { builtinModules } from 'node:module';
import { join } from 'node:path';
import ts from 'typescript';

const builtins = new Set(builtinModules.map(name => name.replace(/^node:/, '')));
const failures = [];
async function scan(dir) {
  for (const entry of await readdir(dir, { withFileTypes: true })) {
    const path = join(dir, entry.name);
    if (entry.isDirectory()) { await scan(path); continue; }
    if (!/\.[cm]?[jt]sx?$/.test(entry.name)) continue;
    const source = await readFile(path, 'utf8');
    for (const imported of ts.preProcessFile(source, true, true).importedFiles) {
      const name = imported.fileName;
      if (name.startsWith('node:') || builtins.has(name) || name === 'electron' || /(?:^|\/)electron(?:\/|$)/.test(name)) {
        failures.push(`${path}: import privilegiado no frontend: ${name}`);
      }
    }
  }
}
await Promise.all(['src', 'shared'].map(scan));
if (await access('electron').then(() => true, () => false)) failures.push('Runtime Electron legado reintroduzido');
if (failures.length) throw new Error(failures.join('\n'));
console.log('Arquitetura OK: frontend/shared sem imports Node/Electron; backend Rust/Tauri.');
