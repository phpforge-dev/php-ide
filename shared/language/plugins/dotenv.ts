import { CompletionKind, type CodeSite, type IdePlugin, type ProjectFiles } from './api';

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

export class DotenvPlugin implements IdePlugin {
 readonly id = 'dotenv';
 readonly name = '.env';
 documents(path: string) { return path.endsWith('.php') || isEnvPath(path); }
 async completeCode(site: CodeSite, files: ProjectFiles) {
  if (!isEnvPath(site.path)) return null;
  const reference = envReferences(site.text, true).find(r => site.offset >= r.from && site.offset <= r.to);
  if (!reference) return null;
  // Local unsaved declarations take precedence; suggestions never include values.
  const entries = new Map(await this.entries(files));
  for (const entry of parseEnv(site.text, site.path)) entries.set(entry.key, entry);
  return { from: reference.from, items: [...entries.values()].map(e => ({ label: e.key, kind: CompletionKind.Constant, detail: e.file })) };
 }
 async defineCode(site: CodeSite, files: ProjectFiles) {
  if (!isEnvPath(site.path)) return null;
  const reference = envReferences(site.text).find(r => site.offset >= r.from && site.offset <= r.to);
  if (!reference) return [];
  const entry = parseEnv(site.text, site.path).find(e => e.key === reference.key) ?? (await this.entries(files)).get(reference.key);
  if (!entry) return [];
  const text = entry.file === site.path ? site.text : await files.read(entry.file) ?? '';
  const line = text.split(/\r?\n/)[entry.line] ?? '';
  const column = line.indexOf(entry.key);
  return [{ uri: files.uri(entry.file), range: { start: { line: entry.line, character: Math.max(0, column) }, end: { line: entry.line, character: Math.max(0, column) + entry.key.length } } }];
 }
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

/** References in values, excluding comments, single quotes and escaped dollars. No evaluation. */
export function envReferences(text: string, partial = false) {
 const out: { key: string; from: number; to: number }[] = [];
 let quote = ''; let value = false;
 for (let i = 0; i < text.length; i++) {
  const c = text[i];
  if (c === '\n' && !quote) { value = false; continue; }
  if (!value) { if (c === '#') { const end = text.indexOf('\n', i); i = end < 0 ? text.length : end - 1; } else if (c === '=') value = true; continue; }
  if (c === "'") { if (!quote) quote = "'"; else if (quote === "'") quote = ''; continue; }
  if (quote === "'") continue;
  if (c === '\\') { i++; continue; }
  if (c === '"') { quote = quote ? '' : '"'; continue; }
  if (!quote && c === '#' && /\s/.test(text[i - 1] ?? ' ')) { const end = text.indexOf('\n', i); i = end < 0 ? text.length : end - 1; continue; }
  if (c !== '$' || text[i + 1] !== '{') continue;
  const from = i + 2; const key = /^[A-Za-z_][A-Za-z0-9_]*/.exec(text.slice(from))?.[0] ?? '';
  const to = from + key.length;
  if ((key && text[to] === '}') || (partial && (text[to] !== undefined))) out.push({ key, from, to });
  else if (partial && to === text.length) out.push({ key, from, to });
  i = to - 1;
 }
 return out;
}
