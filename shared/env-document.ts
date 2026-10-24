// Core environment-file data used by Symfony and file classification.
import type {ProjectFiles} from './language/plugins/api';
export type EnvEntry = { key: string; value: string; file: string; line: number };
export const isEnvPath = (path: string) => /(^|\/)\.env(?:\.[\w.-]+)?$/.test(path);
const envFile = /^\.env(\..+)?$/;
const secret = /(PASSWORD|PASSWD|SECRET|TOKEN|PRIVATE|_KEY)$|^KEY$/i;
export const maskEnv = (key: string, value: string) => secret.test(key) && value ? '*****' : value;

export function parseEnv(text: string, file: string): EnvEntry[] {
 const out: EnvEntry[] = [];
 text.split(/\r?\n/).forEach((line, index) => {
  const m = /^\s*(?:export\s+)?([A-Za-z_][A-Za-z0-9_.]*)\s*=\s*(.*)$/.exec(line);
  if (!m) return;
  let value = m[2].trim();
  const quoted = /^(['"])(.*)\1(?:\s+#.*)?$/.exec(value);
  value = quoted ? quoted[2] : value.replace(/\s+#.*$/, '');
  out.push({ key: m[1], value, file, line: index });
 });
 return out;
}

/** Variáveis de `.env` primeiro, depois `.env.*` em ordem; a primeira definição vence. */
export async function readEnv(files: ProjectFiles): Promise<Map<string, EnvEntry>> {
 const names = (await files.list('', name => envFile.test(name))).filter(p => !p.includes('/'));
 names.sort((a, b) => Number(b === '.env') - Number(a === '.env') || a.localeCompare(b));
 const entries = new Map<string, EnvEntry>();
 for (const name of names) {
  const text = await files.read(name); if (text === null) continue;
  for (const e of parseEnv(text, name)) if (!entries.has(e.key)) entries.set(e.key, e);
 }
 return entries;
}
