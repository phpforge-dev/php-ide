import { position } from '../php-source';
import type { ProjectFiles } from './api';
import { parseConfig } from './laravel';

export type Translation = { key: string; locale: string; file: string; line: number; character: number; value?: string };

/** Pastas `lang/` (Laravel 9+) e `resources/lang/`: `{locale}/{arquivo}.php` e `{locale}.json`. */
export async function translations(files: ProjectFiles): Promise<Translation[]> {
 const out: Translation[] = [];
 for (const root of ['lang', 'resources/lang']) {
  for (const path of await files.list(root, n => n.endsWith('.php') || n.endsWith('.json'))) {
   const rel = path.slice(root.length + 1); const text = await files.read(path); if (text === null) continue;
   if (rel.endsWith('.json')) {
    if (rel.includes('/')) continue;
    let json: Record<string, unknown>; try { json = JSON.parse(text); } catch { continue; }
    let from = 0;
    for (const [key, value] of Object.entries(json)) {
     const quoted = JSON.stringify(key); const at = text.indexOf(quoted, from); if (at >= 0) from = at + quoted.length;
     out.push({ key, locale: rel.slice(0, -'.json'.length), file: path, ...position(text, Math.max(at, 0)), ...(typeof value === 'string' ? { value } : {}) });
    }
    continue;
   }
   const [locale, ...rest] = rel.split('/'); if (!rest.length || locale === 'vendor') continue;
   const base = rest.join('/').slice(0, -'.php'.length);
   for (const e of parseConfig(text, path, base, new Map(), false)) if (e.leaf) out.push({ key: e.key, locale, file: path, line: e.line, character: e.character, ...(e.value !== undefined ? { value: e.value } : {}) });
  }
 }
 return out;
}
