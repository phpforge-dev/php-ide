import { CompletionKind, type IdePlugin, type ProjectFiles } from './api';

export type EnvEntry = { key: string; value: string; file: string; line: number };
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

export class DotenvPlugin implements IdePlugin {
 readonly id = 'dotenv';
 readonly name = '.env';
 private cache?: Promise<Map<string, EnvEntry>>;
 async detect(files: ProjectFiles) {
  return (await files.list('', name => envFile.test(name))).some(p => !p.includes('/')) ? {} : null;
 }
 invalidates(path: string) { return envFile.test(path); }
 invalidate() { this.cache = undefined; }
 private entries(files: ProjectFiles) { return this.cache ??= readEnv(files); }
 private handles(callee: string, argument: number) { return argument === 0 && (callee === 'env' || callee === 'getenv'); }
 async completeString(site: { callee: string; argument: number }, files: ProjectFiles) {
  if (!this.handles(site.callee, site.argument)) return null;
  return [...(await this.entries(files)).values()].sort((a, b) => a.key.localeCompare(b.key))
   .map(e => ({ label: e.key, kind: CompletionKind.Constant, labelDetails: { detail: ` = ${maskEnv(e.key, e.value)}` }, detail: e.file }));
 }
 async defineString(site: { callee: string; argument: number; literal: { value: string } }, files: ProjectFiles) {
  if (!this.handles(site.callee, site.argument)) return null;
  const e = (await this.entries(files)).get(site.literal.value);
  if (!e) return [];
  const start = { line: e.line, character: 0 };
  return [{ uri: files.uri(e.file), range: { start, end: { line: e.line, character: e.key.length } } }];
 }
}
