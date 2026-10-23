import { position } from '../php-source';
import { CompletionKind, type CodeCompletion, type CodeSite, type IdePlugin, type PluginCodeLens, type PluginCompletion, type PluginDiagnostic, type PluginLocation, type ProjectFiles } from './api';

// composer.json: completion de chaves do schema público (getcomposer.org/doc/04-schema.md),
// pacotes instalados, versões do composer.lock, navegação para vendor, diagnósticos de lock
// e CodeLens de scripts. As ações rodam no backend (`composerRun`) pelo comando `php-ide.composer`.

/** Nó JSON com offsets (início inclusivo, fim exclusivo); objetos preservam a ordem das chaves. */
export type JsonNode =
 | { type: 'object'; start: number; end: number; entries: { key: string; keyStart: number; keyEnd: number; value: JsonNode }[] }
 | { type: 'array'; start: number; end: number; items: JsonNode[] }
 | { type: 'string'; start: number; end: number; value: string }
 | { type: 'number'; start: number; end: number; raw: string }
 | { type: 'literal'; start: number; end: number; value: true | false | null };
export class JsonError extends Error { constructor(message: string, readonly offset: number) { super(message); } }

/** Parser JSON estrito (RFC 8259) que guarda posições para diagnósticos e navegação. */
export function parseJson(text: string): JsonNode {
 let i = 0;
 const ws = () => { while (i < text.length && ' \t\r\n'.includes(text[i])) i++; };
 const fail = (message: string): never => { throw new JsonError(message, Math.min(i, text.length)); };
 const string = (): { value: string; start: number; end: number } => {
  const start = i++; let value = '';
  while (true) {
   if (i >= text.length) fail('string sem aspas de fechamento');
   const c = text[i];
   if (c === '"') { i++; return { value, start, end: i }; }
   if (c < ' ') fail('caractere de controle dentro de string');
   if (c === '\\') {
    const e = text[i + 1]; const map: Record<string, string> = { '"': '"', '\\': '\\', '/': '/', b: '\b', f: '\f', n: '\n', r: '\r', t: '\t' };
    if (e in map) { value += map[e]; i += 2; continue; }
    if (e === 'u' && /^[0-9a-fA-F]{4}$/.test(text.slice(i + 2, i + 6))) { value += String.fromCharCode(parseInt(text.slice(i + 2, i + 6), 16)); i += 6; continue; }
    i++; fail('escape inválido');
   }
   value += c; i++;
  }
 };
 const value = (): JsonNode => {
  ws(); const start = i; const c = text[i];
  if (c === '{') {
   i++; const entries: Extract<JsonNode, { type: 'object' }>['entries'] = []; ws();
   if (text[i] === '}') { i++; return { type: 'object', start, end: i, entries }; }
   while (true) {
    ws(); if (text[i] !== '"') fail('esperada chave entre aspas');
    const key = string(); ws(); if (text[i] !== ':') fail('esperado ":"'); i++;
    entries.push({ key: key.value, keyStart: key.start, keyEnd: key.end, value: value() }); ws();
    if (text[i] === ',') { i++; continue; }
    if (text[i] === '}') { i++; return { type: 'object', start, end: i, entries }; }
    fail('esperado "," ou "}"');
   }
  }
  if (c === '[') {
   i++; const items: JsonNode[] = []; ws();
   if (text[i] === ']') { i++; return { type: 'array', start, end: i, items }; }
   while (true) {
    items.push(value()); ws();
    if (text[i] === ',') { i++; continue; }
    if (text[i] === ']') { i++; return { type: 'array', start, end: i, items }; }
    fail('esperado "," ou "]"');
   }
  }
  if (c === '"') { const s = string(); return { type: 'string', ...s }; }
  const number = /-?(?:0|[1-9]\d*)(?:\.\d+)?(?:[eE][+-]?\d+)?/y; number.lastIndex = i;
  const n = number.exec(text);
  if (n && n[0]) { i += n[0].length; return { type: 'number', start, end: i, raw: n[0] }; }
  for (const [word, v] of [['true', true], ['false', false], ['null', null]] as const) if (text.startsWith(word, i)) { i += word.length; return { type: 'literal', start, end: i, value: v }; }
  return fail(i >= text.length ? 'fim inesperado do arquivo' : `valor inesperado "${c}"`);
 };
 const root = value(); ws();
 if (i < text.length) fail('conteúdo após o fim do documento');
 return root;
}
export const member = (node: JsonNode | undefined, key: string) => node?.type === 'object' ? node.entries.find(e => e.key === key) : undefined;
export function toValue(node: JsonNode): unknown {
 if (node.type === 'object') return Object.fromEntries(node.entries.map(e => [e.key, toValue(e.value)]));
 if (node.type === 'array') return node.items.map(toValue);
 if (node.type === 'number') return Number(node.raw);
 return node.value;
}

/** `json_encode($v, 0)` do PHP sobre o array associativo decodificado: barras e não-ASCII escapados, `{}` vira `[]`. */
export function phpJsonEncode(node: JsonNode): string {
 if (node.type === 'object') return node.entries.length ? `{${node.entries.map(e => `${phpString(e.key)}:${phpJsonEncode(e.value)}`).join(',')}}` : '[]';
 if (node.type === 'array') return `[${node.items.map(phpJsonEncode).join(',')}]`;
 if (node.type === 'string') return phpString(node.value);
 if (node.type === 'number') {
  if (/^-?\d+$/.test(node.raw)) return node.raw;
  const s = String(Number(node.raw)); return /[.e]/.test(s) ? s : `${s}.0`;
 }
 return String(node.value);
}
function phpString(value: string) {
 const map: Record<string, string> = { '"': '\\"', '\\': '\\\\', '/': '\\/', '\b': '\\b', '\f': '\\f', '\n': '\\n', '\r': '\\r', '\t': '\\t' };
 let out = '"';
 for (const c of value) {
  if (c in map) { out += map[c]; continue; }
  const code = c.codePointAt(0)!;
  if (code < 0x20 || code > 0x7e) { for (let k = 0; k < c.length; k++) out += '\\u' + c.charCodeAt(k).toString(16).padStart(4, '0'); continue; }
  out += c;
 }
 return out + '"';
}

/** MD5 (RFC 1321) de texto UTF-8, usado só para comparar o `content-hash` do composer.lock. */
export function md5(text: string): string {
 const bytes = [...new TextEncoder().encode(text)];
 const length = bytes.length * 8;
 bytes.push(0x80); while (bytes.length % 64 !== 56) bytes.push(0);
 for (let k = 0; k < 8; k++) bytes.push(k < 4 ? (length >>> (8 * k)) & 0xff : k === 4 ? Math.floor(length / 2 ** 32) & 0xff : 0);
 const s = [7, 12, 17, 22, 5, 9, 14, 20, 4, 11, 16, 23, 6, 10, 15, 21];
 const K = Array.from({ length: 64 }, (_, k) => Math.floor(Math.abs(Math.sin(k + 1)) * 2 ** 32) >>> 0);
 let [a0, b0, c0, d0] = [0x67452301, 0xefcdab89, 0x98badcfe, 0x10325476];
 for (let chunk = 0; chunk < bytes.length; chunk += 64) {
  const M = Array.from({ length: 16 }, (_, w) => bytes[chunk + w * 4] | bytes[chunk + w * 4 + 1] << 8 | bytes[chunk + w * 4 + 2] << 16 | bytes[chunk + w * 4 + 3] << 24);
  let [A, B, C, D] = [a0, b0, c0, d0];
  for (let k = 0; k < 64; k++) {
   const round = k >> 4;
   const F = round === 0 ? (B & C) | (~B & D) : round === 1 ? (D & B) | (~D & C) : round === 2 ? B ^ C ^ D : C ^ (B | ~D);
   const g = round === 0 ? k : round === 1 ? (5 * k + 1) % 16 : round === 2 ? (3 * k + 5) % 16 : (7 * k) % 16;
   const sum = (A + F + K[k] + M[g]) >>> 0; const shift = s[round * 4 + (k % 4)];
   [A, D, C] = [D, C, B]; B = (B + ((sum << shift) | (sum >>> (32 - shift)))) >>> 0;
  }
  a0 = (a0 + A) >>> 0; b0 = (b0 + B) >>> 0; c0 = (c0 + C) >>> 0; d0 = (d0 + D) >>> 0;
 }
 return [a0, b0, c0, d0].map(v => [0, 8, 16, 24].map(shift => ((v >>> shift) & 0xff).toString(16).padStart(2, '0')).join('')).join('');
}

/** `content-hash` do composer.lock: chaves relevantes do composer.json, em ordem alfabética, como o Composer documenta no lock. */
export function contentHash(root: JsonNode): string | null {
 if (root.type !== 'object') return null;
 const relevant = ['name', 'version', 'require', 'require-dev', 'conflict', 'replace', 'provide', 'minimum-stability', 'prefer-stable', 'repositories', 'extra'];
 const entries = root.entries.filter(e => relevant.includes(e.key) && !(e.value.type === 'literal' && e.value.value === null));
 const platform = member(member(root, 'config')?.value, 'platform');
 if (platform && !(platform.value.type === 'literal' && platform.value.value === null)) {
  const fake = { keyStart: 0, keyEnd: 0 };
  entries.push({ key: 'config', ...fake, value: { type: 'object', start: 0, end: 0, entries: [{ key: 'platform', ...fake, value: platform.value }] } });
 }
 // Último valor de chaves repetidas vence, como no json_decode do PHP.
 const unique = [...new Map(entries.map(e => [e.key, e])).values()].sort((a, b) => a.key < b.key ? -1 : a.key > b.key ? 1 : 0);
 return md5(phpJsonEncode({ type: 'object', start: 0, end: 0, entries: unique }));
}

/** Contexto do cursor num JSON possivelmente incompleto: caminho de chaves, papel e trecho digitado. */
export type JsonContext = { path: string[]; role: 'key' | 'value'; key?: string; inString: boolean; from: number; prefix: string; value: string; end: number };
export function jsonContext(text: string, offset: number): JsonContext | null {
 type Frame = { kind: 'object' | 'array'; parent?: string; state: 'key' | 'colon' | 'value' | 'comma'; key?: string };
 const stack: Frame[] = [];
 const path = () => stack.slice(1).map(f => f.parent ?? '#');
 const top = () => stack.at(-1);
 const after = () => { const f = top(); if (f) f.state = 'comma'; };
 let i = 0;
 while (i < offset) {
  const c = text[i];
  if (' \t\r\n'.includes(c)) { i++; continue; }
  if (c === '"') {
   const start = i; let j = i + 1; let value = '';
   while (j < text.length && text[j] !== '"' && text[j] !== '\n') { if (text[j] === '\\') { value += text[j + 1] ?? ''; j += 2; } else value += text[j++]; }
   const closed = text[j] === '"';
   const f = top();
   if (offset <= j || !closed) {
    if (!f) return null;
    const role = f.kind === 'object' && f.state === 'key' ? 'key' : 'value';
    return { path: path(), role, key: role === 'value' ? f.key : undefined, inString: true, from: start + 1, prefix: text.slice(start + 1, offset), value, end: j };
   }
   if (f?.kind === 'object' && f.state === 'key') { f.key = value; f.state = 'colon'; } else after();
   i = j + 1; continue;
  }
  if (c === ':') { const f = top(); if (f?.kind === 'object') f.state = 'value'; i++; continue; }
  if (c === ',') { const f = top(); if (f) { f.state = f.kind === 'object' ? 'key' : 'value'; if (f.kind === 'object') f.key = undefined; } i++; continue; }
  if (c === '{' || c === '[') { const f = top(); stack.push({ kind: c === '{' ? 'object' : 'array', parent: f ? (f.kind === 'object' ? f.key : '#') : undefined, state: c === '{' ? 'key' : 'value' }); i++; continue; }
  if (c === '}' || c === ']') { stack.pop(); after(); i++; continue; }
  const word = /[\w.+-]+/y; word.lastIndex = i; const w = word.exec(text);
  if (w && i + w[0].length >= offset) break;
  if (w) { after(); i += w[0].length; } else i++;
 }
 const f = top(); if (!f) return null;
 const word = /[\w.+-]*$/.exec(text.slice(0, offset))![0];
 const role = f.kind === 'object' && (f.state === 'key' || f.state === 'comma') ? 'key' : 'value';
 const rest = /^[\w.+-]*/.exec(text.slice(offset))![0];
 return { path: path(), role, key: role === 'value' ? f.key : undefined, inString: false, from: offset - word.length, prefix: word, value: word + rest, end: offset + rest.length };
}

const linkKeys = ['require', 'require-dev', 'conflict', 'replace', 'provide', 'suggest'];
const platform = /^(php(-64bit|-ipv6|-zts|-debug)?|hhvm|composer|composer-(plugin|runtime)-api|ext-.+|lib-.+)$/i;
export const isPlatformPackage = (name: string) => platform.test(name);
const schema: Record<string, Record<string, string>> = {
 '': { name: 'Nome do pacote (vendor/projeto)', description: 'Descrição curta', version: 'Versão (evite em pacotes publicados)', type: 'library, project, metapackage, composer-plugin…', keywords: 'Palavras-chave', homepage: 'URL do projeto', readme: 'Caminho do README', time: 'Data de lançamento', license: 'Licença (SPDX)', authors: 'Autores', support: 'Canais de suporte', funding: 'Financiamento', require: 'Dependências obrigatórias', 'require-dev': 'Dependências de desenvolvimento', conflict: 'Pacotes conflitantes', replace: 'Pacotes substituídos', provide: 'Pacotes fornecidos', suggest: 'Pacotes sugeridos', autoload: 'Autoload PSR-4, PSR-0, classmap e files', 'autoload-dev': 'Autoload de desenvolvimento', 'include-path': 'include_path legado', 'target-dir': 'Diretório de instalação (obsoleto)', 'minimum-stability': 'Estabilidade mínima', 'prefer-stable': 'Preferir versões estáveis', repositories: 'Repositórios de pacotes', config: 'Configuração do Composer', scripts: 'Scripts e eventos', 'scripts-descriptions': 'Descrição dos scripts', 'scripts-aliases': 'Apelidos de scripts', extra: 'Dados extras para scripts e plugins', bin: 'Binários expostos em vendor/bin', archive: 'Opções de composer archive', abandoned: 'Pacote abandonado', 'non-feature-branches': 'Branches que não são de feature' },
 autoload: { 'psr-4': 'Namespace → diretório (PSR-4)', 'psr-0': 'Namespace → diretório (PSR-0)', classmap: 'Diretórios/arquivos varridos', files: 'Arquivos sempre incluídos', 'exclude-from-classmap': 'Padrões excluídos do classmap' },
 config: { 'allow-plugins': 'Plugins permitidos', 'optimize-autoloader': 'Otimizar autoload', 'sort-packages': 'Ordenar pacotes ao adicionar', 'preferred-install': 'source, dist ou auto', platform: 'Versões de plataforma simuladas', 'platform-check': 'Verificação de plataforma', 'process-timeout': 'Tempo limite de processos (s)', 'vendor-dir': 'Pasta de dependências', 'bin-dir': 'Pasta de binários', 'bin-compat': 'auto, full ou proxy', 'classmap-authoritative': 'Classmap autoritativo', 'apcu-autoloader': 'Cache APCu do autoload', 'audit': 'Opções de composer audit', 'discard-changes': 'Alterações locais em updates', 'lock': 'Gerar composer.lock', 'notify-on-install': 'Notificar instalações', 'secure-http': 'Exigir HTTPS', 'cache-dir': 'Pasta de cache', 'github-protocols': 'Protocolos do GitHub', 'use-parent-dir': 'Usar composer.json de pasta pai' },
 scripts: { 'pre-install-cmd': 'Antes de install', 'post-install-cmd': 'Depois de install', 'pre-update-cmd': 'Antes de update', 'post-update-cmd': 'Depois de update', 'pre-status-cmd': 'Antes de status', 'post-status-cmd': 'Depois de status', 'pre-archive-cmd': 'Antes de archive', 'post-archive-cmd': 'Depois de archive', 'pre-autoload-dump': 'Antes de gerar o autoload', 'post-autoload-dump': 'Depois de gerar o autoload', 'post-root-package-install': 'create-project: pacote raiz instalado', 'post-create-project-cmd': 'Depois de create-project', 'pre-operations-exec': 'Antes de operações de instalação' },
 support: { email: '', issues: '', forum: '', wiki: '', irc: '', source: '', docs: '', rss: '', chat: '', security: '' },
};
const nested: Record<string, Record<string, string>> = { 'authors/#': { name: '', email: '', homepage: '', role: '' }, 'autoload-dev': schema.autoload };
const values: Record<string, string[]> = {
 'minimum-stability': ['stable', 'RC', 'beta', 'alpha', 'dev'],
 type: ['library', 'project', 'metapackage', 'composer-plugin'],
 license: ['MIT', 'Apache-2.0', 'BSD-2-Clause', 'BSD-3-Clause', 'GPL-2.0-or-later', 'GPL-3.0-or-later', 'LGPL-2.1-or-later', 'LGPL-3.0-or-later', 'MPL-2.0', 'proprietary'],
 'config/preferred-install': ['auto', 'dist', 'source'],
};
const extensions = ['ext-json', 'ext-mbstring', 'ext-ctype', 'ext-iconv', 'ext-intl', 'ext-pdo', 'ext-curl', 'ext-dom', 'ext-xml', 'ext-zip', 'ext-openssl', 'ext-sodium', 'ext-gd', 'ext-bcmath', 'ext-redis'];

export type LockedPackage = { name: string; version: string; dev: boolean; description?: string };
/** Pacotes do composer.lock (ou de vendor/composer/installed.json quando não há lock). */
export async function lockedPackages(files: ProjectFiles): Promise<{ lock: any | null; packages: LockedPackage[]; installed: Set<string> | null }> {
 const read = async (path: string) => { const t = await files.read(path); if (t === null) return null; try { return JSON.parse(t); } catch { return null; } };
 const lock = await read('composer.lock'); const installedJson = await read('vendor/composer/installed.json');
 const installedList: any[] | null = installedJson ? (Array.isArray(installedJson) ? installedJson : installedJson.packages ?? []) : null;
 const devNames = new Set<string>(installedJson?.['dev-package-names'] ?? []);
 const packages: LockedPackage[] = lock
  ? [...(lock.packages ?? []).map((p: any) => ({ ...p, dev: false })), ...(lock['packages-dev'] ?? []).map((p: any) => ({ ...p, dev: true }))]
  : (installedList ?? []).map(p => ({ ...p, dev: devNames.has(p.name) }));
 return {
  lock,
  packages: packages.filter(p => typeof p.name === 'string').map(p => ({ name: p.name, version: String(p.version ?? ''), dev: p.dev, ...(p.description ? { description: p.description } : {}) })),
  installed: installedList ? new Set(installedList.map(p => String(p.name).toLowerCase())) : null,
 };
}
/** Restrições sugeridas para uma versão instalada (`v6.4.3` → `^6.4`, `~6.4.3`, `6.4.3`). */
export function constraints(version: string): string[] {
 const m = /^v?(\d+)\.(\d+)(?:\.(\d+))?/.exec(version);
 if (!m) return version ? [version, '*'] : ['*'];
 const [major, minor, patch = '0'] = [m[1], m[2], m[3]];
 return [`^${major}.${minor}`, `^${major}.${minor}.${patch}`, `~${major}.${minor}.${patch}`, `${major}.${minor}.${patch}`, '*'];
}

export class ComposerPlugin implements IdePlugin {
 readonly id = 'composer';
 readonly name = 'Composer';
 private locked?: ReturnType<typeof lockedPackages>;
 documents(path: string) { return path === 'composer.json'; }
 async detect(files: ProjectFiles) { return await files.exists('composer.json') ? {} : null; }
 invalidates(path: string) { return path === 'composer.lock' || path === 'vendor/composer/installed.json'; }
 invalidate() { this.locked = undefined; }
 private lock(files: ProjectFiles) { return this.locked ??= lockedPackages(files); }

 async completeCode(site: CodeSite, files: ProjectFiles): Promise<CodeCompletion | null> {
  const context = jsonContext(site.text, site.offset); if (!context) return null;
  const quote = (label: string) => context.inString ? label : JSON.stringify(label);
  const items = (list: PluginCompletion[]) => ({ from: context.from, items: list.map(i => ({ ...i, insertText: quote(i.label) })) });
  const where = context.path.join('/');
  if (context.role === 'key') {
   if (context.path.length === 1 && linkKeys.includes(where)) {
    const { packages } = await this.lock(files);
    const names = packages.slice().sort((a, b) => Number(a.dev) - Number(b.dev) || a.name.localeCompare(b.name))
     .map(p => ({ label: p.name, kind: CompletionKind.Module, labelDetails: { detail: ` ${p.version}`, ...(p.dev ? { description: 'dev' } : {}) }, ...(p.description ? { detail: p.description } : {}) }));
    return items([...names, { label: 'php', kind: CompletionKind.Constant, detail: 'Versão do PHP' }, ...extensions.map(label => ({ label, kind: CompletionKind.Constant, detail: 'Extensão PHP' }))]);
   }
   const keys = schema[where] ?? nested[where] ?? (context.path.length === 2 && context.path[0] === 'authors' ? nested['authors/#'] : undefined);
   if (!keys) return null;
   return items(Object.entries(keys).map(([label, detail]) => ({ label, kind: CompletionKind.Property, ...(detail ? { detail } : {}) })));
  }
  const key = context.key ?? '';
  if (context.path.length === 1 && ['require', 'require-dev'].includes(where)) {
   const installed = (await this.lock(files)).packages.find(p => p.name.toLowerCase() === key.toLowerCase());
   const list = key === 'php' ? ['^8.2', '^8.3', '^8.4', '>=8.1'] : constraints(installed?.version ?? '');
   return items(list.map((label, index) => ({ label, kind: CompletionKind.Value, ...(installed && index === 0 ? { detail: `Instalado: ${installed.version}` } : {}) })));
  }
  if (where === 'scripts' || (context.path[0] === 'scripts' && context.path.length === 2)) {
   if (!context.prefix.startsWith('@')) return null;
   const names = scriptNames(site.text).filter(n => n !== key);
   return items([...names.map(n => ({ label: `@${n}`, kind: CompletionKind.Reference, detail: 'Outro script' })), ...['@php', '@composer', '@putenv'].map(label => ({ label, kind: CompletionKind.Keyword }))]);
  }
  const list = values[context.path.length ? `${where}/${key}` : key];
  if (list) return items(list.map(label => ({ label, kind: CompletionKind.Value })));
  if (!context.path.length && key === 'prefer-stable' && !context.inString) return { from: context.from, items: ['true', 'false'].map(label => ({ label, kind: CompletionKind.Keyword })) };
  return null;
 }

 async defineCode(site: CodeSite, files: ProjectFiles): Promise<PluginLocation[] | null> {
  const context = jsonContext(site.text, site.offset); if (!context?.inString) return null;
  const where = context.path.join('/');
  if (context.role === 'key' && context.path.length === 1 && linkKeys.includes(where)) {
   const name = context.value.toLowerCase();
   if (isPlatformPackage(name) || !/^[a-z0-9][\w.-]*\/[\w.-]+$/.test(name)) return [];
   const target = `vendor/${name}/composer.json`;
   return await files.exists(target) ? [{ uri: files.uri(target), range: { start: { line: 0, character: 0 }, end: { line: 0, character: 0 } } }] : [];
  }
  if (context.path[0] === 'scripts' && context.role === 'value' && context.value.startsWith('@')) {
   const name = context.value.slice(1).split(/\s/)[0];
   const scripts = scriptEntries(site.text).filter(s => s.name === name);
   return scripts.map(s => ({ uri: files.uri(site.path), range: { start: position(site.text, s.keyStart + 1), end: position(site.text, s.keyEnd - 1) } }));
  }
  return null;
 }

 async diagnose(_path: string, text: string, files: ProjectFiles): Promise<PluginDiagnostic[]> {
  let root: JsonNode;
  try { root = parseJson(text); }
  catch (error) {
   const offset = error instanceof JsonError ? error.offset : 0; const at = position(text, offset);
   return [{ range: { start: at, end: { line: at.line, character: at.character + 1 } }, message: `composer.json inválido: ${(error as Error).message}.`, code: 'composer.invalid-json', severity: 'error' }];
  }
  if (root.type !== 'object') return [{ range: { start: position(text, root.start), end: position(text, root.end) }, message: 'composer.json deve conter um objeto JSON.', code: 'composer.invalid-json', severity: 'error' }];
  const { lock, packages, installed } = await this.lock(files);
  const out: PluginDiagnostic[] = [];
  const range = (start: number, end: number) => ({ start: position(text, start), end: position(text, end) });
  if (lock) {
   const known = new Set<string>();
   for (const list of [lock.packages ?? [], lock['packages-dev'] ?? []]) for (const p of list) {
    known.add(String(p.name).toLowerCase());
    for (const k of [...Object.keys(p.replace ?? {}), ...Object.keys(p.provide ?? {})]) known.add(k.toLowerCase());
   }
   for (const section of ['require', 'require-dev']) {
    const node = member(root, section)?.value;
    if (node?.type !== 'object') continue;
    for (const e of node.entries) {
     if (isPlatformPackage(e.key) || known.has(e.key.toLowerCase())) continue;
     out.push({ range: range(e.keyStart, e.keyEnd), message: `${e.key} não está no composer.lock. Rode composer update ${e.key}.`, code: 'composer.package-not-locked', severity: 'warning' });
    }
   }
   const hash = contentHash(root);
   if (typeof lock['content-hash'] === 'string' && hash && hash !== lock['content-hash']) {
    const anchor = member(root, 'require') ?? root.entries[0];
    out.push({ range: anchor ? range(anchor.keyStart, anchor.keyEnd) : range(root.start, root.start + 1), message: 'composer.lock desatualizado: o composer.json mudou desde o último update (content-hash diferente). Rode composer update (ou composer update --lock).', code: 'composer.lock-outdated', severity: 'warning' });
   }
   if (installed) for (const p of packages) {
    const section = member(root, p.dev ? 'require-dev' : 'require')?.value;
    const entry = section?.type === 'object' ? section.entries.find(e => e.key.toLowerCase() === p.name.toLowerCase()) : undefined;
    if (entry && !installed.has(p.name.toLowerCase())) out.push({ range: range(entry.keyStart, entry.keyEnd), message: `${p.name} está no composer.lock, mas não foi instalado em vendor. Rode composer install.`, code: 'composer.not-installed', severity: 'warning' });
   }
  }
  return out;
 }

 async codeLenses(_path: string, text: string): Promise<PluginCodeLens[]> {
  let root: JsonNode; try { root = parseJson(text); } catch { return []; }
  if (root.type !== 'object') return [];
  const out: PluginCodeLens[] = [];
  const line = (offset: number) => position(text, offset).line;
  const require = member(root, 'require') ?? root.entries[0];
  if (require) {
   out.push({ line: line(require.keyStart), title: '▶ composer install', tooltip: 'Instala as versões do composer.lock', command: 'php-ide.composer', arguments: [{ action: 'install' } satisfies ComposerRequest] });
   out.push({ line: line(require.keyStart), title: '↻ composer update', tooltip: 'Atualiza todas as dependências e o composer.lock', command: 'php-ide.composer', arguments: [{ action: 'update' } satisfies ComposerRequest] });
  }
  for (const s of scriptEntries(text)) out.push({ line: line(s.keyStart), title: `▶ Executar ${s.name}`, tooltip: `composer run-script ${s.name}`, command: 'php-ide.composer', arguments: [{ action: 'run-script', script: s.name } satisfies ComposerRequest] });
  return out;
 }
}

/** Pedido do CodeLens/painel para o backend (`composerRun`). */
export type ComposerRequest = { action: 'install' | 'update' | 'require' | 'remove' | 'dump-autoload' | 'run-script' | 'validate'; packages?: string[]; dev?: boolean; script?: string; optimize?: boolean };
function scriptEntries(text: string) {
 try { const node = member(parseJson(text), 'scripts')?.value; return node?.type === 'object' ? node.entries.map(e => ({ name: e.key, keyStart: e.keyStart, keyEnd: e.keyEnd })) : []; } catch { return []; }
}
export function scriptNames(text: string): string[] {
 const parsed = scriptEntries(text);
 if (parsed.length) return parsed.map(s => s.name);
 // JSON incompleto durante a digitação: chaves de primeiro nível dentro de "scripts".
 const block = /"scripts"\s*:\s*\{([\s\S]*?)(?:\n\s{0,4}\}|$)/.exec(text)?.[1] ?? '';
 return [...block.matchAll(/^\s*"([^"]+)"\s*:/gm)].map(m => m[1]);
}
