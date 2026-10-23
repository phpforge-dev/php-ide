import { bladeCode, literalAt, phpTokens, position, type PhpToken } from '../php-source';
import { CompletionKind, type CodeCompletion, type CodeSite, type IdePlugin, type PluginDiagnostic, type PluginLocation, type ProjectFiles, type StringSite } from './api';
import { callAround, closest, completeColumnString, completeMember, defineColumnString, diagnoseStrings, eloquentIndex, hoverAt, lookup, memberAt, placeOf, target as memberTarget, type EloquentIndex } from './eloquent';
import type { PluginFix, PluginHover } from './extensions';
import { attribute, components, viewName, viewVariables, type Component, type ViewVariable } from './blade';
import { translations, type Translation } from './translations';
import { readEnv, type EnvEntry } from './dotenv';

export type RouteEntry = { name: string; methods: string; uri: string; file: string; line: number; character: number };
export type ConfigEntry = { key: string; file: string; line: number; character: number; value?: string; leaf: boolean };

type Call = { method: string; args: PhpToken[][]; open: number; close: number };
const verbs = new Set(['get', 'post', 'put', 'patch', 'delete', 'options', 'any', 'match', 'view', 'redirect', 'permanentRedirect']);
const sensitive = /(key|secret|password|token)$/i;

function argumentsAt(tokens: PhpToken[], open: number) {
 const args: PhpToken[][] = [[]]; let depth = 0; let i = open + 1;
 for (; i < tokens.length; i++) {
  const v = tokens[i].type === 'punct' ? tokens[i].value : '';
  if (v === '(' || v === '[' || v === '{') depth++;
  else if (v === ')' || v === ']' || v === '}') { if (depth === 0) break; depth--; }
  else if (v === ',' && depth === 0) { args.push([]); continue; }
  args.at(-1)!.push(tokens[i]);
 }
 return { args: args.filter((a, n) => a.length || n === 0), close: i };
}

/** Cadeia `Route::a(...)->b(...)` a partir do token `Route`. */
function chain(tokens: PhpToken[], i: number): Call[] {
 const calls: Call[] = []; let j = i + 1;
 while ((tokens[j]?.value === '::' || tokens[j]?.value === '->') && tokens[j + 1]?.type === 'word' && tokens[j + 2]?.value === '(') {
  const { args, close } = argumentsAt(tokens, j + 2);
  calls.push({ method: tokens[j + 1].value, args, open: tokens[j + 2].offset, close: tokens[close]?.offset ?? Infinity });
  j = close + 1;
 }
 return calls;
}

const str = (arg: PhpToken[] | undefined) => arg?.length === 1 && arg[0].type === 'string' ? arg[0].value : undefined;
const strings = (arg: PhpToken[] | undefined) => (arg ?? []).filter(t => t.type === 'string').map(t => t.value);
function option(arg: PhpToken[] | undefined, key: string) {
 const t = arg ?? [];
 for (let i = 0; i + 2 < t.length; i++) if (t[i].type === 'string' && t[i].value === key && t[i + 1].value === '=>' && t[i + 2].type === 'string') return t[i + 2].value;
 return undefined;
}
const joinUri = (...parts: string[]) => parts.map(p => p.replace(/^\/+|\/+$/g, '')).filter(Boolean).join('/');

export function parseRoutes(text: string, file: string): RouteEntry[] {
 const tokens = phpTokens(text);
 const scopes: { open: number; close: number; name: string; prefix: string }[] = [];
 const pending: { offset: number; name: string; methods: string; uri: string }[] = [];
 for (let i = 0; i < tokens.length; i++) {
  if (tokens[i].value !== 'Route' || tokens[i + 1]?.value !== '::') continue;
  const calls = chain(tokens, i);
  const named = calls.filter(c => c.method === 'name' || c.method === 'as').map(c => str(c.args[0]) ?? '').join('');
  const group = calls.find(c => c.method === 'group');
  if (group) {
   const prefix = calls.filter(c => c.method === 'prefix').map(c => str(c.args[0]) ?? '').join('/');
   const array = calls[0]?.method === 'group' ? calls[0].args[0] : undefined;
   scopes.push({ open: group.open, close: group.close, name: named + (option(array, 'as') ?? ''), prefix: joinUri(prefix, option(array, 'prefix') ?? '') });
   continue;
  }
  const verb = calls.find(c => verbs.has(c.method));
  if (verb) {
   const methods = verb.method === 'match' ? strings(verb.args[0]).map(m => m.toUpperCase()).join('|') : verb.method === 'any' ? 'ANY' : ['view', 'redirect', 'permanentRedirect'].includes(verb.method) ? 'GET' : verb.method.toUpperCase();
   const uri = str(verb.args[verb.method === 'match' ? 1 : 0]) ?? '';
   if (named) pending.push({ offset: tokens[i].offset, name: named, methods, uri });
   continue;
  }
  const resource = calls.find(c => c.method === 'resource' || c.method === 'apiResource');
  const base = str(resource?.args[0]);
  if (resource && base) {
   const only = calls.find(c => c.method === 'only'); const except = calls.find(c => c.method === 'except');
   const param = `{${base.split('.').pop()!.replace(/s$/, '')}}`; const path = base.replace(/\./g, '/');
   const actions: [string, string, string][] = [['index', 'GET', path], ['create', 'GET', `${path}/create`], ['store', 'POST', path], ['show', 'GET', `${path}/${param}`], ['edit', 'GET', `${path}/${param}/edit`], ['update', 'PUT|PATCH', `${path}/${param}`], ['destroy', 'DELETE', `${path}/${param}`]];
   for (const [action, methods, uri] of actions) {
    if (resource.method === 'apiResource' && (action === 'create' || action === 'edit')) continue;
    if (only && !strings(only.args[0]).includes(action)) continue;
    if (except && strings(except.args[0]).includes(action)) continue;
    pending.push({ offset: tokens[i].offset, name: `${base}.${action}`, methods, uri });
   }
  }
 }
 return pending.map(r => {
  const around = scopes.filter(s => s.open < r.offset && r.offset < s.close).sort((a, b) => a.open - b.open);
  return { name: around.map(s => s.name).join('') + r.name, methods: r.methods, uri: joinUri(...around.map(s => s.prefix), r.uri), file, ...position(text, r.offset) };
 });
}

/** Árvore de chaves de um arquivo de configuração `return [...]`. */
export function parseConfig(text: string, file: string, base: string, env: Map<string, EnvEntry>, mask = true): ConfigEntry[] {
 const tokens = phpTokens(text);
 const out: ConfigEntry[] = [];
 const start = tokens.findIndex((t, i) => t.value === 'return' && (tokens[i + 1]?.value === '[' || (tokens[i + 1]?.value.toLowerCase() === 'array' && tokens[i + 2]?.value === '(')));
 if (start < 0) return out;
 const display = (value: PhpToken[]) => {
  if (value.length === 1 && value[0].type !== 'punct') return value[0].value;
  if (value[0]?.value === 'env' && value[1]?.value === '(' && value[2]?.type === 'string') {
   const fromEnv = env.get(value[2].value)?.value;
   if (fromEnv !== undefined) return fromEnv;
   const fallback = value[4]?.value === ',' ? value[5] : undefined;
   return fallback && fallback.type !== 'punct' && value[6]?.value === ')' ? fallback.value : undefined;
  }
  return undefined;
 };
 const walk = (open: number, prefix: string) => {
  const { args } = argumentsAt(tokens, open);
  for (const entry of args) {
   if (entry[0]?.type !== 'string' || entry[1]?.value !== '=>') continue;
   const key = prefix ? `${prefix}.${entry[0].value}` : entry[0].value;
   const value = entry.slice(2);
   const nested = value[0]?.value === '[' ? 0 : value[0]?.value.toLowerCase() === 'array' && value[1]?.value === '(' ? 1 : -1;
   const at = position(text, entry[0].offset);
   if (nested >= 0 && argumentsAt(tokens, tokens.indexOf(value[nested])).close === tokens.indexOf(value.at(-1)!)) {
    out.push({ key, file, ...at, leaf: false });
    walk(tokens.indexOf(value[nested]), key);
   } else {
    const shown = display(value);
    out.push({ key, file, ...at, leaf: true, ...(shown !== undefined ? { value: mask && sensitive.test(entry[0].value) ? '*****' : shown } : {}) });
   }
  }
 };
 walk(tokens[start + 1].value === '[' ? start + 1 : start + 2, base);
 return out;
}

/** Chamada que contém o token de string `i`, no formato de `callSite` do host (`route`, `->route`, `View::make`, `@include`). */
function callOf(t: PhpToken[], i: number) {
 let depth = 0; let argument = 0; let j = i - 1;
 for (; j >= 0; j--) {
  const v = t[j].type === 'punct' ? t[j].value : '';
  if (v === ')' || v === ']' || v === '}') depth++;
  else if (v === '(' || v === '[' || v === '{') { if (depth === 0) break; depth--; }
  else if (v === ',' && depth === 0) argument++;
  else if (v === ';' && depth === 0) return null;
 }
 if (j < 1 || t[j].value !== '(' || t[j - 1].type !== 'word') return null;
 const name = t[j - 1].value; const before = t[j - 2]?.value;
 if (before === 'function' || before === 'new' || before === 'fn') return null;
 const callee = before === '->' ? `->${name}` : before === '::' ? `${t[j - 3]?.value}::${name}` : before === '@' ? `@${name}` : name;
 return { callee, argument };
}

export class LaravelPlugin implements IdePlugin {
 readonly id = 'laravel';
 readonly name = 'Laravel';
 private routes?: Promise<RouteEntry[]>;
 private views?: Promise<string[]>;
 private config?: Promise<{ files: Map<string, string>; entries: ConfigEntry[] }>;
 private components?: Promise<Component[]>;
 private variables?: Promise<ViewVariable[]>;
 private translations?: Promise<{ locale: string; entries: Translation[] }>;
 private eloquent?: Promise<EloquentIndex>;
 async detect(files: ProjectFiles) {
  const composer = await files.read('composer.json'); if (!composer) return null;
  let json: any; try { json = JSON.parse(composer); } catch { return null; }
  const constraint = json.require?.['laravel/framework'] ?? json['require-dev']?.['laravel/framework'];
  if (typeof constraint !== 'string') return null;
  const version = /(\d+)(?:\.(\d+|\*))?/.exec(constraint);
  return { version: version ? `${version[1]}.${version[2] && version[2] !== '*' ? version[2] : '0'}` : undefined };
 }
 invalidates(path: string) { return /^(routes|config|resources\/views|resources\/lang|lang|app|database)\//.test(path) || /^\.env(\.|$)/.test(path); }
 invalidate() { this.routes = this.views = this.config = this.components = this.variables = this.translations = this.eloquent = undefined; }
 private models(files: ProjectFiles) { return this.eloquent ??= eloquentIndex(files); }
 /** Contexto Eloquent do documento; em Blade, variáveis da view entram com o tipo inferido. */
 private async lookup(path: string, text: string, offset: number, blade: boolean, files: ProjectFiles) {
  const index = await this.models(files);
  if (!index.models.length) return null;
  const vars = blade ? await this.variablesFor(viewName(path), files) : [];
  return lookup(blade ? bladeCode(text) : text, offset, blade, index, name => vars.find(v => v.name === name && v.type)?.type);
 }
 private allComponents(files: ProjectFiles) { return this.components ??= components(files); }
 private allVariables(files: ProjectFiles) {
  return this.variables ??= (async () => {
   const out: ViewVariable[] = [];
   for (const p of [...await files.list('app', n => n.endsWith('.php')), ...await files.list('routes', n => n.endsWith('.php'))]) out.push(...viewVariables((await files.read(p)) ?? '', p));
   for (const p of await files.list('resources/views', n => n.endsWith('.blade.php'))) out.push(...viewVariables(bladeCode((await files.read(p)) ?? ''), p, true));
   return out;
  })();
 }
 private allTranslations(files: ProjectFiles) {
  return this.translations ??= (async () => {
   const locale = (await this.allConfig(files)).entries.find(e => e.key === 'app.locale')?.value ?? 'en';
   return { locale, entries: await translations(files) };
  })();
 }
 private allRoutes(files: ProjectFiles) {
  return this.routes ??= files.list('routes', n => n.endsWith('.php')).then(async paths => (await Promise.all(paths.map(async p => parseRoutes((await files.read(p)) ?? '', p)))).flat());
 }
 private allViews(files: ProjectFiles) {
  return this.views ??= files.list('resources/views', n => n.endsWith('.php')).then(paths => paths.map(p => p.slice('resources/views/'.length)));
 }
 private allConfig(files: ProjectFiles) {
  return this.config ??= (async () => {
   const env = await readEnv(files); const paths = await files.list('config', n => n.endsWith('.php'));
   const map = new Map<string, string>(); const entries: ConfigEntry[] = [];
   for (const p of paths) {
    const base = p.slice('config/'.length, -'.php'.length).replace(/\//g, '.'); map.set(base, p);
    entries.push({ key: base, file: p, line: 0, character: 0, leaf: false }, ...parseConfig((await files.read(p)) ?? '', p, base, env));
   }
   return { files: map, entries };
  })();
 }
 private kind(site: StringSite): 'route' | 'view' | 'config' | 'translation' | null {
  const { callee, argument } = site;
  if (argument === 0 && ['route', 'to_route', '->route', 'URL::route', 'Redirect::route'].includes(callee)) return 'route';
  if (argument === 0 && ['view', 'View::make', '->view', '@include', '@extends', '@includeIf', '@each'].includes(callee)) return 'view';
  if (argument === 1 && ['Route::view', '@includeWhen'].includes(callee)) return 'view';
  if (argument === 0 && ['config', 'Config::get'].includes(callee)) return 'config';
  if (argument === 0 && ['__', 'trans', 'trans_choice', 'Lang::get', 'Lang::choice', '@lang', '@choice'].includes(callee)) return 'translation';
  return null;
 }
 async completeString(site: StringSite, files: ProjectFiles) {
  const kind = this.kind(site); if (!kind) return this.completeColumn(site, files);
  if (kind === 'route') return (await this.allRoutes(files)).slice().sort((a, b) => a.name.localeCompare(b.name))
   .map(r => ({ label: r.name, kind: CompletionKind.Reference, labelDetails: { detail: ` ${r.methods}`, description: r.uri || undefined }, detail: `${r.file}:${r.line + 1}` }));
  if (kind === 'view') return (await this.allViews(files)).map(v => v.replace(/(\.blade)?\.php$/, '').replace(/\//g, '.')).sort()
   .map(v => ({ label: v, kind: CompletionKind.File }));
  if (kind === 'translation') {
   const { locale, entries } = await this.allTranslations(files); const seen = new Map<string, Translation>();
   for (const e of entries) if (!seen.has(e.key) || (e.locale === locale && seen.get(e.key)!.locale !== locale)) seen.set(e.key, e);
   return [...seen.values()].sort((a, b) => a.key.localeCompare(b.key))
    .map(e => ({ label: e.key, kind: CompletionKind.Text, ...(e.value !== undefined ? { labelDetails: { description: e.value } } : {}), detail: e.file }));
  }
  return (await this.allConfig(files)).entries.slice().sort((a, b) => a.key.localeCompare(b.key))
   .map(c => ({ label: c.key, kind: c.leaf ? CompletionKind.Property : CompletionKind.Module, ...(c.value !== undefined ? { labelDetails: { description: c.value } } : {}), detail: c.file }));
 }
 private async completeColumn(site: StringSite, files: ProjectFiles) {
  const l = await this.lookup(site.path, site.text, site.literal.start, site.path.endsWith('.blade.php'), files); if (!l) return null;
  const call = callAround(l, site.literal.start); if (!call) return null;
  const items = completeColumnString(l.index, call, site.prefix);
  return items?.length ? items : null;
 }
 async defineString(site: StringSite, files: ProjectFiles): Promise<PluginLocation[] | null> {
  const kind = this.kind(site);
  if (!kind) {
   const l = await this.lookup(site.path, site.text, site.literal.start, site.path.endsWith('.blade.php'), files); if (!l) return null;
   const call = callAround(l, site.literal.start); if (!call) return null;
   return defineColumnString(l.index, call, site.literal.value)?.map(p => placeOf(files, p)) ?? null;
  }
  const value = site.literal.value;
  const at = (file: string, line: number, character: number, length = 0, preserveView = false) => ({ uri: files.uri(file), range: { start: { line, character }, end: { line, character: character + length } }, ...(preserveView ? { preserveView } : {}) });
  if (kind === 'route') return (await this.allRoutes(files)).filter(r => r.name === value).map(r => at(r.file, r.line, r.character, 'Route'.length));
  if (kind === 'view') {
   const views = await this.allViews(files); const path = value.replace(/\./g, '/');
   const found = views.find(v => v === `${path}.blade.php`) ?? views.find(v => v === `${path}.php`);
   return found ? [at(`resources/views/${found}`, 0, 0, 0, true)] : [];
  }
  if (kind === 'translation') {
   // Uma entrada por idioma que define a chave; o idioma configurado vem primeiro.
   const { locale, entries } = await this.allTranslations(files);
   return entries.filter(e => e.key === value).sort((a, b) => Number(b.locale === locale) - Number(a.locale === locale) || a.locale.localeCompare(b.locale))
    .map(e => at(e.file, e.line, e.character, JSON.stringify(e.key.split('.').pop()).length));
  }
  const config = await this.allConfig(files);
  const entry = config.entries.find(c => c.key === value);
  if (!entry) return [];
  // `config('app')` abre o arquivo na última posição conhecida, como uma referência a arquivo.
  if (config.files.has(value)) return [at(entry.file, 0, 0, 0, true)];
  return [at(entry.file, entry.line, entry.character, value.split('.').pop()!.length + 2)];
 }

 /** Contexto de Blade no cursor: tag de componente, atributo de componente ou variável. */
 private context(site: CodeSite) {
  const { text, offset } = site;
  const back = text.slice(Math.max(0, offset - 2000), offset);
  const tag = /<(x-[\w.\-:]*)$/.exec(back);
  if (tag) return { kind: 'tag' as const, word: tag[1], from: offset - tag[1].length };
  const open = /<(x-[\w.\-:]+)((?:\s[^<>]*?)?)\s([:\w-]*)$/.exec(back);
  if (open && (open[2].split('"').length - 1) % 2 === 0 && (open[2].split("'").length - 1) % 2 === 0)
   return { kind: 'attribute' as const, tag: open[1], word: open[3], from: offset - open[3].length };
  const code = bladeCode(text);
  const variable = /\$([A-Za-z_]\w*)?$/.exec(code.slice(Math.max(0, offset - 200), offset));
  if (variable && !literalAt(code, offset, true)) return { kind: 'variable' as const, word: variable[1] ?? '', from: offset - (variable[1] ?? '').length };
  return null;
 }
 /** Palavra sob o cursor para navegação (tag, atributo ou variável inteira). */
 private target(site: CodeSite) {
  const { text, offset } = site;
  const lineStart = text.lastIndexOf('\n', offset - 1) + 1; const lineEnd = text.indexOf('\n', offset) < 0 ? text.length : text.indexOf('\n', offset);
  const line = text.slice(lineStart, lineEnd); const col = offset - lineStart;
  for (const m of line.matchAll(/<(x-[\w.\-:]+)/g)) if (col >= m.index! + 1 && col <= m.index! + m[0].length) return { kind: 'tag' as const, word: m[1] };
  const around = (pattern: RegExp) => { for (const m of line.matchAll(pattern)) if (col >= m.index! && col <= m.index! + m[0].length) return m; return null; };
  const code = bladeCode(text).slice(lineStart, lineEnd);
  for (const m of code.matchAll(/\$([A-Za-z_]\w*)/g)) if (col >= m.index! && col <= m.index! + m[0].length) return { kind: 'variable' as const, word: m[1] };
  const attr = around(/:?[A-Za-z_][\w-]*(?==)/g);
  if (attr) {
   const before = text.slice(Math.max(0, offset - 2000), lineStart + attr.index!);
   const open = /<(x-[\w.\-:]+)(?:\s[^<>]*?)?\s$/.exec(before);
   if (open) return { kind: 'attribute' as const, tag: open[1], word: attr[0].replace(/^:/, '') };
  }
  return null;
 }
 private async variablesFor(view: string | null, files: ProjectFiles) {
  if (!view) return [];
  const found: { name: string; type?: string; file: string; line: number; character: number }[] = (await this.allVariables(files)).filter(v => v.view === view);
  const component = (await this.allComponents(files)).find(c => c.view === view);
  if (component) found.push(...component.props);
  return found;
 }
 private async completeMember(site: CodeSite, files: ProjectFiles) {
  const l = await this.lookup(site.path, site.text, site.offset, site.blade, files);
  return l ? completeMember(l, site.offset) : null;
 }
 async completeCode(site: CodeSite, files: ProjectFiles): Promise<CodeCompletion | null> {
  if (!site.blade) return this.completeMember(site, files);
  const context = this.context(site); if (!context) return this.completeMember(site, files);
  if (context.kind === 'tag') {
   const tags = (await this.allComponents(files)).map(c => c.tag);
   return { from: context.from, items: [...tags, 'x-dynamic-component'].sort().map(tag => ({ label: tag, kind: CompletionKind.Reference })) };
  }
  if (context.kind === 'attribute') {
   const component = (await this.allComponents(files)).find(c => c.tag === context.tag);
   if (!component) return null;
   return { from: context.from, items: component.props.flatMap(p => [attribute(p.name), `:${attribute(p.name)}`].map(label => ({ label, kind: CompletionKind.Property, ...(p.type ? { labelDetails: { description: p.type } } : {}) }))) };
  }
  const seen = new Map<string, string | undefined>();
  for (const v of await this.variablesFor(viewName(site.path), files)) if (!seen.has(v.name) || (!seen.get(v.name) && v.type)) seen.set(v.name, v.type);
  return { from: context.from, items: [...seen].sort(([a], [b]) => a.localeCompare(b)).map(([label, type]) => ({ label, kind: CompletionKind.Variable, ...(type ? { labelDetails: { description: type } } : {}) })) };
 }
 private async defineMember(site: CodeSite, files: ProjectFiles) {
  const l = await this.lookup(site.path, site.text, site.offset, site.blade, files); if (!l) return null;
  const found = memberAt(l, site.offset);
  return found ? [placeOf(files, memberTarget(found.member))] : null;
 }
 async defineCode(site: CodeSite, files: ProjectFiles): Promise<PluginLocation[] | null> {
  if (!site.blade) return this.defineMember(site, files);
  const target = this.target(site); if (!target) return this.defineMember(site, files);
  const at = (file: string, line: number, character: number, length = 0) => ({ uri: files.uri(file), range: { start: { line, character }, end: { line, character: character + length } } });
  if (target.kind === 'tag') {
   const c = (await this.allComponents(files)).find(c => c.tag === target.word);
   if (!c) return [];
   // Como no "Choose Declaration" observado: view primeiro, classe depois.
   return [...(c.viewFile ? [at(c.viewFile, 0, 0)] : []), ...(c.classFile && c.classLine !== undefined ? [at(c.classFile, c.classLine, c.classCharacter!, c.className!.length)] : [])];
  }
  if (target.kind === 'attribute') {
   const c = (await this.allComponents(files)).find(c => c.tag === target.tag);
   const prop = c?.props.find(p => attribute(p.name) === target.word);
   return prop ? [at(prop.file, prop.line, prop.character, prop.name.length + 1)] : [];
  }
  // REQ: a referência não navegou em variáveis; aqui vai para onde a view recebe o valor.
  return (await this.variablesFor(viewName(site.path), files)).filter(v => v.name === target.word).map(v => at(v.file, v.line, v.character, v.name.length));
 }

 /** Hover de membros Eloquent, strings de coluna/relação e referências Laravel em strings. */
 async hover(site: CodeSite, files: ProjectFiles, string: StringSite | null): Promise<PluginHover | null> {
  const kind = string ? this.kind(string) : null;
  if (string && kind) {
   const value = string.literal.value; const range = { start: position(site.text, string.literal.start), end: position(site.text, string.literal.end) };
   let contents: string | undefined;
   if (kind === 'route') { const r = (await this.allRoutes(files)).find(r => r.name === value); if (r) contents = `Rota \`${r.name}\` · ${r.methods} \`/${r.uri}\`\n\n\`${r.file}:${r.line + 1}\``; }
   else if (kind === 'config') { const c = (await this.allConfig(files)).entries.find(c => c.key === value); if (c) contents = `Config \`${c.key}\`${c.value !== undefined ? ` = \`${c.value}\`` : ''}\n\n\`${c.file}:${c.line + 1}\``; }
   else if (kind === 'translation') { const { locale, entries } = await this.allTranslations(files); const list = entries.filter(e => e.key === value).sort((a, b) => Number(b.locale === locale) - Number(a.locale === locale)); if (list.length) contents = list.map(e => `**${e.locale}**: ${e.value ?? '…'}`).join('\n\n'); }
   else { const found = await this.viewFile(value, files); if (found) contents = `View \`${value}\`\n\n\`${found}\``; }
   return contents ? { contents, range } : null;
  }
  const l = await this.lookup(site.path, site.text, site.offset, site.blade, files); if (!l) return null;
  return hoverAt(l, site.offset, string);
 }
 private async viewFile(value: string, files: ProjectFiles) {
  const views = await this.allViews(files); const path = value.replace(/\./g, '/');
  const found = views.find(v => v === `${path}.blade.php`) ?? views.find(v => v === `${path}.php`);
  return found ? `resources/views/${found}` : undefined;
 }
 /** Inspeções: rota, view, config, tradução, coluna e relação inexistentes, com correções quando cabível. */
 async diagnose(path: string, text: string, files: ProjectFiles): Promise<(PluginDiagnostic & { fixes?: PluginFix[] })[]> {
  const blade = path.endsWith('.blade.php'); const code = blade ? bladeCode(text) : text;
  const t = phpTokens(code, blade); const out: (PluginDiagnostic & { fixes?: PluginFix[] })[] = []; const uri = files.uri(path);
  for (let i = 0; i < t.length; i++) {
   const s = t[i]; if (s.type !== 'string' || !s.value || (code[s.offset] === '"' && s.value.includes('$'))) continue;
   const call = callOf(t, i); if (!call) continue;
   // Só argumento literal inteiro: `route('a' . $x)` não é inspecionado.
   if (t[i + 1] && !([',', ')'].includes(t[i + 1].value))) continue;
   const kind = this.kind({ ...call } as StringSite); if (!kind) continue;
   const range = { start: position(text, s.offset + 1), end: position(text, s.offset + 1 + s.value.length) };
   const replace = (value: string): PluginFix => ({ title: `Trocar por '${value}'`, edits: [{ uri, range, newText: value }] });
   const problem = (code: string, message: string, fixes: PluginFix[]) => out.push({ range, code, severity: 'warning', message, ...(fixes.length ? { fixes } : {}) });
   const value = s.value;
   if (kind === 'route') {
    const routes = await this.allRoutes(files);
    if (!routes.length || routes.some(r => r.name === value)) continue;
    const near = closest(value, routes.map(r => r.name));
    problem('laravel.route.missing', `Rota '${value}' não definida em routes/.`, near ? [replace(near)] : []);
   } else if (kind === 'view') {
    if (value.includes('::') || await this.viewFile(value, files)) continue;
    const file = `resources/views/${value.replace(/\./g, '/')}.blade.php`;
    const near = closest(value, (await this.allViews(files)).map(v => v.replace(/(\.blade)?\.php$/, '').replace(/\//g, '.')));
    problem('laravel.view.missing', `View '${value}' não encontrada em resources/views.`, [{ title: `Criar ${file}`, create: { uri: files.uri(file), path: file, content: '' } }, ...(near ? [replace(near)] : [])]);
   } else if (kind === 'config') {
    const config = await this.allConfig(files);
    if (config.entries.some(c => c.key === value)) continue;
    // Só quando o arquivo existe e o prefixo mais longo é um array literal: configs de pacotes e valores dinâmicos ficam fora.
    const parts = value.split('.'); let parent: ConfigEntry | undefined;
    for (let n = parts.length - 1; n > 0 && !parent; n--) parent = config.entries.find(c => c.key === parts.slice(0, n).join('.'));
    if (!parent || parent.leaf) continue;
    const near = closest(value, config.entries.filter(c => c.file === parent!.file).map(c => c.key));
    problem('laravel.config.missing', `Chave de configuração '${value}' não existe em ${parent.file}.`, near ? [replace(near)] : []);
   } else if (kind === 'translation') {
    const fix = await this.translationFix(value, files);
    if (fix === null) continue;
    problem('laravel.translation.missing', `Tradução '${value}' não definida em ${fix.group}.`, fix.fixes);
   }
  }
  const l = await this.lookup(path, text, 0, blade, files);
  if (l) out.push(...diagnoseStrings(l, uri));
  return out;
 }
 /** null quando a chave existe ou não é de arquivo de grupo (`grupo.chave`); senão, correção para o idioma configurado. */
 private async translationFix(value: string, files: ProjectFiles): Promise<{ group: string; fixes: PluginFix[] } | null> {
  if (!/^[\w-]+(\.[\w-]+)+$/.test(value)) return null;
  const { locale, entries } = await this.allTranslations(files);
  if (entries.some(e => e.key === value)) return null;
  const group = value.split('.')[0];
  const groups = [...new Set(entries.filter(e => e.key.startsWith(group + '.') && e.file.endsWith(`/${group}.php`)).map(e => e.file))];
  if (!groups.length) return null;
  const file = groups.find(f => f.includes(`/${locale}/`)) ?? groups[0];
  const rest = value.slice(group.length + 1); const fixes: PluginFix[] = [];
  const source = rest.includes('.') ? null : await files.read(file);
  const tokens = source ? phpTokens(source) : [];
  const ret = tokens.findIndex((x, n) => x.value === 'return' && tokens[n + 1]?.value === '[');
  if (source && ret >= 0) {
   let depth = 0; let close = -1;
   for (let n = ret + 1; n < tokens.length; n++) { const v = tokens[n].value; if (v === '[' || v === '(') depth++; else if ((v === ']' || v === ')') && --depth === 0) { close = n; break; } }
   if (close > 0) {
    const before = source.slice(0, tokens[close].offset).replace(/\s+$/, '');
    const comma = before.endsWith(',') || before.endsWith('[') ? '' : ',';
    const at = position(source, before.length);
    fixes.push({ title: `Adicionar '${rest}' em ${file}`, edits: [{ uri: files.uri(file), range: { start: at, end: at }, newText: `${comma}\n    ${JSON.stringify(rest).replace(/^"|"$/g, "'")} => '',` }] });
   }
  }
  return { group: file, fixes };
 }
}
