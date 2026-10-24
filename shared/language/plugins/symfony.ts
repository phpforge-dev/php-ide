import { analyze, phpTokens, position, type PhpToken } from '../php-source';
import { CompletionKind, type CodeCompletion, type CodeSite, type IdePlugin, type PluginCompletion, type PluginLocation, type ProjectFiles, type StringSite } from './api';
import { maskEnv, readEnv, type EnvEntry } from '../../env-document';

// Symfony (symfony.com/doc): rotas por atributo `#[Route]` e YAML, templates Twig,
// serviços e parâmetros de config/*.yaml e `%env()%` ligado aos arquivos .env.
// Implementação própria a partir da documentação pública; não usa código de plugins existentes.

export type SymfonyRoute = { name: string; path: string; methods: string; file: string; line: number; character: number; length: number; generated?: boolean };
export type YamlKey = { key: string; file: string; line: number; character: number; value?: string; class?: string };

const argumentsAt = (tokens: PhpToken[], open: number) => {
 const args: PhpToken[][] = [[]]; let depth = 0; let i = open + 1;
 for (; i < tokens.length; i++) {
  const v = tokens[i].type === 'punct' ? tokens[i].value : '';
  if (v === '(' || v === '[' || v === '{') depth++;
  else if (v === ')' || v === ']' || v === '}') { if (depth === 0) break; depth--; }
  else if (v === ',' && depth === 0) { args.push([]); continue; }
  args.at(-1)!.push(tokens[i]);
 }
 return { args: args.filter((a, n) => a.length || n === 0), close: i };
};
const named = (arg: PhpToken[]) => arg[0]?.type === 'word' && arg[1]?.value === ':' && arg[2]?.value !== ':' ? { name: arg[0].value, value: arg.slice(2) } : { name: '', value: arg };
const join = (...parts: string[]) => '/' + parts.map(p => p.replace(/^\/+|\/+$/g, '')).filter(Boolean).join('/');

/** Nome automático documentado: classe e método em minúsculas, sem `controller_`, `bundle_` e sufixo `action`. */
export function defaultRouteName(fqn: string, method: string) {
 const name = `${fqn.replace(/\\/g, '_')}_${method}`.toLowerCase();
 return name.replace(/(bundle|controller)_/g, '_').replace(/action(_\d+)?$/, '$1').replace(/__/g, '_');
}

/** Rotas declaradas por `#[Route(...)]` (classe dá prefixo de caminho e nome). */
export function parseRouteAttributes(text: string, file: string): SymfonyRoute[] {
 const tokens = phpTokens(text); const classes = analyze(text).declarations.filter(d => d.kind === 'class');
 const out: SymfonyRoute[] = []; let prefix = { path: '', name: '' }; let pending: typeof prefix | undefined; let classIndex = -1;
 for (let i = 0; i < tokens.length; i++) {
  if (tokens[i].value === 'class' && tokens[i - 1]?.value !== '::' && tokens[i - 1]?.value !== 'new') { classIndex++; prefix = pending ?? { path: '', name: '' }; pending = undefined; continue; }
  if (tokens[i].value !== 'Route' || tokens[i + 1]?.value !== '(') continue;
  let back = i - 1; while (tokens[back]?.value === '\\' || (tokens[back]?.type === 'word' && tokens[back - 1]?.value === '\\')) back--;
  if (!(tokens[back]?.value === '[' && tokens[back - 1]?.value === '#') && tokens[back]?.value !== ',') continue;
  const { args, close } = argumentsAt(tokens, i + 1);
  let path = ''; let name = ''; let methods: string[] = [];
  args.forEach((arg, index) => {
   const { name: key, value } = named(arg);
   const str = value.length === 1 && value[0].type === 'string' ? value[0].value : undefined;
   if ((key === 'path' || (!key && index === 0)) && str !== undefined) path = str;
   else if (key === 'name' && str !== undefined) name = str;
   else if (key === 'methods') methods = value.filter(t => t.type === 'string').map(t => t.value.toUpperCase());
  });
  // Atributo de classe: depois do `]` só há outros atributos ou modificadores antes de `class`.
  let j = close + 1; let depth = 0;
  for (; j < tokens.length; j++) {
   const v = tokens[j].value;
   if (v === '[') depth++; else if (v === ']') depth--;
   else if (depth <= 0 && !['#', 'final', 'abstract', 'readonly'].includes(v)) break;
  }
  if (tokens[j]?.value === 'class') { pending = { path, name }; continue; }
  const fn = tokens.slice(close).findIndex(t => t.value === 'function');
  const method = fn >= 0 ? tokens[close + fn + 1]?.value : undefined;
  const owner = classes[classIndex];
  const generated = !name && !!owner && !!method;
  const full = prefix.name + (name || (generated ? defaultRouteName(owner!.fqn, method!) : ''));
  if (!full) continue;
  out.push({ name: full, path: join(prefix.path, path), methods: methods.join('|') || 'ANY', file, ...position(text, tokens[i].offset), length: 'Route'.length, ...(generated ? { generated } : {}) });
 }
 return out;
}

type YamlLine = { indent: number; key: string; value: string; line: number; character: number };
/** Linhas `chave: valor` de YAML de bloco (sem âncoras, fluxos `{}` ou multilinha). */
function yamlLines(text: string): YamlLine[] {
 const out: YamlLine[] = [];
 text.split(/\r?\n/).forEach((raw, line) => {
  const m = /^(\s*)(?:'([^']*)'|"([^"]*)"|([^\s#'"][^:#]*?))\s*:(?:\s+(.*?))?\s*$/.exec(raw.replace(/\s+#.*$/, ''));
  if (!m || raw.trimStart().startsWith('#') || raw.trimStart().startsWith('- ')) return;
  const key = m[2] ?? m[3] ?? m[4];
  out.push({ indent: m[1].length, key, value: (m[5] ?? '').replace(/^(['"])(.*)\1$/, '$2'), line, character: m[1].length + (m[4] === undefined ? 1 : 0) });
 });
 return out;
}
/** Filhos diretos de uma chave de primeiro nível (`services:`, `parameters:`). */
function children(lines: YamlLine[], section: string) {
 const out: { entry: YamlLine; body: YamlLine[] }[] = [];
 const start = lines.findIndex(l => l.indent === 0 && l.key === section); if (start < 0) return out;
 let level = -1;
 for (let i = start + 1; i < lines.length && lines[i].indent > 0; i++) {
  const l = lines[i]; if (level < 0) level = l.indent;
  if (l.indent === level) out.push({ entry: l, body: [] }); else if (l.indent > level) out.at(-1)?.body.push(l);
 }
 return out;
}
export function parseYamlRoutes(text: string, file: string): SymfonyRoute[] {
 const lines = yamlLines(text); const out: SymfonyRoute[] = [];
 const scan = (from: YamlLine[], indent: number) => {
  for (let i = 0; i < from.length; i++) {
   const l = from[i]; if (l.indent !== indent) continue;
   const body: YamlLine[] = []; for (let k = i + 1; k < from.length && from[k].indent > indent; k++) body.push(from[k]);
   if (l.key.startsWith('when@')) { if (body.length) scan(body, body[0].indent); continue; }
   const level = body[0]?.indent; const direct = body.filter(b => b.indent === level);
   const path = direct.find(b => b.key === 'path')?.value;
   if (path === undefined || direct.some(b => b.key === 'resource')) continue;
   const methods = direct.find(b => b.key === 'methods')?.value.replace(/[[\]\s]/g, '').split(/[,|]/).filter(Boolean).map(m => m.toUpperCase()).join('|');
   out.push({ name: l.key, path, methods: methods || 'ANY', file, line: l.line, character: l.character, length: l.key.length });
  }
 };
 scan(lines, 0);
 return out;
}
export function parseServices(text: string, file: string): { services: YamlKey[]; parameters: YamlKey[] } {
 const lines = yamlLines(text);
 const item = (l: YamlLine, extra: Partial<YamlKey> = {}): YamlKey => ({ key: l.key, file, line: l.line, character: l.character, ...extra });
 const services = children(lines, 'services').filter(({ entry }) => !entry.key.startsWith('_') && !entry.key.endsWith('\\'))
  .map(({ entry, body }) => {
   const cls = body.find(b => b.key === 'class')?.value ?? (/^[A-Z][\w]*(\\[A-Za-z_]\w*)+$/.test(entry.key) ? entry.key : undefined);
   const alias = body.find(b => b.key === 'alias')?.value ?? (entry.value.startsWith('@') ? entry.value.slice(1) : undefined);
   return item(entry, { ...(cls ? { class: cls } : {}), ...(alias ? { value: `@${alias}` } : {}) });
  });
 const parameters = children(lines, 'parameters').map(({ entry }) => item(entry, entry.value ? { value: entry.value } : {}));
 return { services, parameters };
}
const kernelParameters = ['kernel.project_dir', 'kernel.environment', 'kernel.runtime_environment', 'kernel.debug', 'kernel.cache_dir', 'kernel.build_dir', 'kernel.logs_dir', 'kernel.charset', 'kernel.secret', 'kernel.default_locale', 'kernel.container_class', 'kernel.bundles', 'kernel.bundles_metadata', 'kernel.share_dir'];

/** Documentos não-PHP atendidos só pelos plugins Composer/Symfony (sem Phpactor). */
export const isPluginDocument = (path: string) => path === 'composer.json' || (path.startsWith('templates/') && path.endsWith('.twig')) || (path.startsWith('config/') && /\.ya?ml$/.test(path));

type Kind = 'route' | 'template' | 'service' | 'parameter' | 'env';
/** Variável de `%env(proc:NOME)%` e o tipo de referência no texto digitado até o cursor. */
export function referenceAt(before: string): { kind: 'service' | 'parameter' | 'env'; word: string } | null {
 const env = /%env\((?:[\w-]+:)*([A-Za-z_]\w*)?$/.exec(before);
 if (env) return { kind: 'env', word: env[1] ?? '' };
 const param = /%([\w.\\-]*)$/.exec(before);
 if (param && (before.slice(0, param.index).split('%').length - 1) % 2 === 0) return { kind: 'parameter', word: param[1] };
 const service = /(?:^|[\s'"[,(])@\??([\w.\\-]*)$/.exec(before);
 if (service) return { kind: 'service', word: service[1] };
 return null;
}

export class SymfonyPlugin implements IdePlugin {
 readonly id = 'symfony';
 readonly name = 'Symfony';
 private routes?: Promise<SymfonyRoute[]>;
 private templates?: Promise<string[]>;
 private container?: Promise<{ services: YamlKey[]; parameters: YamlKey[] }>;
 private env?: Promise<Map<string, EnvEntry>>;
 async detect(files: ProjectFiles) {
  const composer = await files.read('composer.json'); if (!composer) return null;
  let json: any; try { json = JSON.parse(composer); } catch { return null; }
  const constraint = json.require?.['symfony/framework-bundle'] ?? json['require-dev']?.['symfony/framework-bundle'];
  if (typeof constraint !== 'string') return null;
  const lock = await files.read('composer.lock').then(t => t ? JSON.parse(t) : null).catch(() => null);
  const installed = (lock?.packages ?? []).find((p: { name?: string }) => p.name === 'symfony/framework-bundle')?.version;
  const version = /(\d+)\.(\d+)/.exec(installed ?? constraint);
  return { version: version ? `${version[1]}.${version[2]}` : undefined };
 }
 documents(path: string) { return path.endsWith('.php') || (path.startsWith('templates/') && path.endsWith('.twig')) || (path.startsWith('config/') && /\.ya?ml$/.test(path)); }
 invalidates(path: string) { return /^(src|config|templates)\//.test(path) || /^\.env(\.|$)/.test(path); }
 invalidate() { this.routes = this.templates = this.container = this.env = undefined; }
 private allRoutes(files: ProjectFiles) {
  return this.routes ??= (async () => {
   const out: SymfonyRoute[] = [];
   for (const p of await files.list('src', n => n.endsWith('.php'))) { const text = await files.read(p); if (text?.includes('Route')) out.push(...parseRouteAttributes(text, p)); }
   for (const p of await files.list('config', n => /\.ya?ml$/.test(n))) if (/^config\/routes(\.ya?ml$|\/)/.test(p)) out.push(...parseYamlRoutes((await files.read(p)) ?? '', p));
   return out;
  })();
 }
 private allTemplates(files: ProjectFiles) { return this.templates ??= files.list('templates', n => n.endsWith('.twig')).then(list => list.map(p => p.slice('templates/'.length)).sort()); }
 private allContainer(files: ProjectFiles) {
  return this.container ??= (async () => {
   const services: YamlKey[] = []; const parameters: YamlKey[] = [];
   for (const p of await files.list('config', n => /\.ya?ml$/.test(n))) {
    if (/^config\/routes/.test(p)) continue;
    const parsed = parseServices((await files.read(p)) ?? '', p); services.push(...parsed.services); parameters.push(...parsed.parameters);
   }
   return { services, parameters };
  })();
 }
 private allEnv(files: ProjectFiles) { return this.env ??= readEnv(files); }

 private kind(site: StringSite): Kind | 'reference' | null {
  const { callee, argument, text, literal } = site;
  if (argument === 0 && ['->generateUrl', '->redirectToRoute', '->generate'].includes(callee)) return 'route';
  if (argument === 0 && ['->render', '->renderView', '->renderBlock', '->renderBlockView', '->stream', 'Template'].includes(callee)) return 'template';
  if (argument === 0 && ['->getParameter', 'param'].includes(callee)) return 'parameter';
  if (argument === 0 && ['service'].includes(callee) && !/\bfunction\s*$/.test(text.slice(0, literal.start))) return 'service';
  if (callee === 'Autowire' || callee === 'Target') {
   const label = /\b(service|param|env|value|expression)\s*:\s*$/.exec(text.slice(Math.max(0, literal.start - 40), literal.start))?.[1];
   return label === 'service' ? 'service' : label === 'param' ? 'parameter' : label === 'env' ? 'env' : label === 'expression' ? null : 'reference';
  }
  return null;
 }
 private async candidates(kind: Kind, files: ProjectFiles): Promise<PluginCompletion[]> {
  if (kind === 'route') return (await this.allRoutes(files)).slice().sort((a, b) => a.name.localeCompare(b.name))
   .map(r => ({ label: r.name, kind: CompletionKind.Reference, labelDetails: { detail: ` ${r.methods}`, description: r.path }, detail: `${r.file}:${r.line + 1}${r.generated ? ' · nome automático' : ''}` }));
  if (kind === 'template') return (await this.allTemplates(files)).map(t => ({ label: t, kind: CompletionKind.File }));
  if (kind === 'env') return [...(await this.allEnv(files)).values()].sort((a, b) => a.key.localeCompare(b.key))
   .map(e => ({ label: e.key, kind: CompletionKind.Constant, labelDetails: { detail: ` = ${maskEnv(e.key, e.value)}` }, detail: e.file }));
  const { services, parameters } = await this.allContainer(files);
  if (kind === 'service') return services.slice().sort((a, b) => a.key.localeCompare(b.key))
   .map(s => ({ label: s.key, kind: CompletionKind.Module, ...(s.class || s.value ? { labelDetails: { description: s.value ?? s.class } } : {}), detail: `${s.file}:${s.line + 1}` }));
  const seen = new Set<string>(); const out: PluginCompletion[] = [];
  for (const p of parameters) if (!seen.has(p.key)) { seen.add(p.key); out.push({ label: p.key, kind: CompletionKind.Property, ...(p.value ? { labelDetails: { description: maskEnv(p.key, p.value) } } : {}), detail: `${p.file}:${p.line + 1}` }); }
  for (const k of kernelParameters) if (!seen.has(k)) out.push({ label: k, kind: CompletionKind.Constant, detail: 'Parâmetro do kernel' });
  return out.sort((a, b) => a.label.localeCompare(b.label));
 }
 private async locate(kind: Kind, value: string, files: ProjectFiles): Promise<PluginLocation[]> {
  const at = (file: string, line: number, character: number, length = 0, preserveView = false) => ({ uri: files.uri(file), range: { start: { line, character }, end: { line, character: character + length } }, ...(preserveView ? { preserveView } : {}) });
  if (kind === 'route') return (await this.allRoutes(files)).filter(r => r.name === value).map(r => at(r.file, r.line, r.character, r.length));
  if (kind === 'template') return (await this.allTemplates(files)).includes(value) ? [at(`templates/${value}`, 0, 0, 0, true)] : [];
  if (kind === 'env') { const e = (await this.allEnv(files)).get(value); return e ? [at(e.file, e.line, 0, e.key.length)] : []; }
  const { services, parameters } = await this.allContainer(files);
  return (kind === 'service' ? services : parameters).filter(s => s.key === value).map(s => at(s.file, s.line, s.character, s.key.length));
 }

 async completeString(site: StringSite, files: ProjectFiles) {
  const kind = this.kind(site); if (!kind) return null;
  if (kind !== 'reference') return this.candidates(kind, files);
  const ref = referenceAt(site.prefix); if (!ref) return null;
  // O item substitui a string inteira; o prefixo (`%env(`, `%`, `@`) é recomposto.
  const head = site.prefix.slice(0, site.prefix.length - ref.word.length);
  const tail = ref.kind === 'env' ? ')%' : ref.kind === 'parameter' ? '%' : '';
  return (await this.candidates(ref.kind, files)).map(i => ({ ...i, label: head + i.label + tail }));
 }
 async defineString(site: StringSite, files: ProjectFiles) {
  const kind = this.kind(site); if (!kind) return null;
  if (kind !== 'reference') return this.locate(kind, site.literal.value, files);
  const found = this.referenceUnder(site.literal.value, site.prefix.length);
  return found ? this.locate(found.kind, found.word, files) : [];
 }
 /** Referência `%env(X)%`, `%param%` ou `@serviço` que contém a coluna `col` do texto. */
 private referenceUnder(text: string, col: number) {
  for (const m of text.matchAll(/%env\((?:[\w-]+:)*([A-Za-z_]\w*)\)%|%([\w.\\-]+)%|@\??([\w.\\-]+)/g)) {
   if (col < m.index! || col > m.index! + m[0].length) continue;
   if (m[1]) return { kind: 'env' as const, word: m[1] };
   if (m[2]) return { kind: 'parameter' as const, word: m[2] };
   return { kind: 'service' as const, word: m[3] };
  }
  return null;
 }
 /** Twig: `path()`/`url()` recebem rotas; `extends`, `include`, `embed`, `use`, `import`, `from` e `include()`/`source()` recebem templates. */
 private twigContext(before: string): { kind: Kind; word: string } | null {
  const route = /\b(?:path|url)\(\s*['"]([\w.\-]*)$/.exec(before);
  if (route) return { kind: 'route', word: route[1] };
  const template = /(?:\{%-?\s*(?:extends|include|embed|use|import|from)\s+|\b(?:include|source)\(\s*)['"]([^'"]*)$/.exec(before);
  if (template) return { kind: 'template', word: template[1] };
  return null;
 }
 private lineAround(site: CodeSite) {
  const start = site.text.lastIndexOf('\n', site.offset - 1) + 1;
  const end = site.text.indexOf('\n', site.offset) < 0 ? site.text.length : site.text.indexOf('\n', site.offset);
  return { start, line: site.text.slice(start, end), col: site.offset - start };
 }
 async completeCode(site: CodeSite, files: ProjectFiles): Promise<CodeCompletion | null> {
  const before = site.text.slice(Math.max(0, site.offset - 300), site.offset).split('\n').pop()!;
  if (site.path.endsWith('.twig')) {
   const context = this.twigContext(before); if (!context) return null;
   return { from: site.offset - context.word.length, items: await this.candidates(context.kind, files) };
  }
  if (!/\.ya?ml$/.test(site.path)) return null;
  const ref = referenceAt(before); if (!ref) return null;
  const items = await this.candidates(ref.kind, files);
  const close = ref.kind === 'env' ? ')%' : ref.kind === 'parameter' ? '%' : '';
  // Não repete o fechamento quando ele já vem depois do nome (edição no meio da referência).
  const closed = close && site.text.slice(site.offset, site.offset + 200).replace(/^[\w.\\-]*/, '').startsWith(close);
  return { from: site.offset - ref.word.length, items: items.map(i => ({ ...i, insertText: i.label + (closed ? '' : close) })) };
 }
 async defineCode(site: CodeSite, files: ProjectFiles): Promise<PluginLocation[] | null> {
  const { line, col } = this.lineAround(site);
  if (site.path.endsWith('.twig')) {
   for (const m of line.matchAll(/(['"])([^'"]*)\1/g)) {
    if (col <= m.index! || col >= m.index! + m[0].length) continue;
    const context = this.twigContext(line.slice(0, m.index! + 1)); if (!context) return null;
    return this.locate(context.kind, m[2], files);
   }
   return null;
  }
  if (!/\.ya?ml$/.test(site.path)) return null;
  const found = this.referenceUnder(line, col);
  return found ? this.locate(found.kind, found.word, files) : null;
 }
}
