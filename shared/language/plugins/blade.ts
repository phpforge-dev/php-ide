import { phpTokens, position, type PhpToken } from '../php-source';
import type { ProjectFiles } from './api';

export type Prop = { name: string; type?: string; file: string; line: number; character: number };
export type Component = { tag: string; view?: string; viewFile?: string; classFile?: string; className?: string; classLine?: number; classCharacter?: number; props: Prop[] };
export type ViewVariable = { name: string; view: string; type?: string; file: string; line: number; character: number };

const kebab = (name: string) => name.replace(/([a-z0-9])([A-Z])/g, '$1-$2').replace(/([A-Z])([A-Z][a-z])/g, '$1-$2').toLowerCase();
export const attribute = kebab;

/** Parâmetros de `__construct` (promovidos ou não) com tipo e posição do `$`. */
export function constructorProps(text: string, file: string): Prop[] {
 const t = phpTokens(text);
 const at = t.findIndex((x, i) => x.value === 'function' && t[i + 1]?.value === '__construct' && t[i + 2]?.value === '(');
 if (at < 0) return [];
 const out: Prop[] = []; let depth = 0; let type: string[] = [];
 for (let i = at + 3; i < t.length; i++) {
  const v = t[i].value;
  if (v === '(' || v === '[') depth++;
  else if (v === ')' || v === ']') { if (depth === 0) break; depth--; }
  if (depth > 0) continue;
  if (v === ',') { type = []; continue; }
  if (v === '$' && t[i + 1]?.type === 'word') {
   out.push({ name: t[i + 1].value, ...(type.length ? { type: type.join('') } : {}), file, ...position(text, t[i].offset) });
   type = []; i++; continue;
  }
  if (v === '=') { type = []; while (t[i + 1] && t[i + 1].value !== ',' && t[i + 1].value !== ')') i++; continue; }
  if (!/^(public|protected|private|readonly)$/i.test(v)) type.push(v);
 }
 return out;
}

/** Chaves de `@props([...])`: itens soltos e chaves com default. */
export function anonymousProps(text: string, file: string): Prop[] {
 const m = /@props\s*\(/.exec(text); if (!m) return [];
 const t = phpTokens(text.slice(0, m.index).replace(/[^\n]/g, ' ') + ' '.repeat(m[0].length) + text.slice(m.index + m[0].length), true);
 const out: Prop[] = []; let depth = 0;
 for (let i = 0; i < t.length; i++) {
  const v = t[i].value;
  if (v === '[' || v === '(') { depth++; continue; }
  if (v === ']' || v === ')') { if (--depth <= 0) break; continue; }
  if (depth === 1 && t[i].type === 'string' && (t[i + 1]?.value === ',' || t[i + 1]?.value === ']' || t[i + 1]?.value === '=>'))
   out.push({ name: t[i].value, file, ...position(text, t[i].offset) });
  if (depth === 1 && t[i + 1]?.value === '=>' && t[i].type === 'string') { while (t[i + 1] && !(depth === 1 && t[i + 1].value === ',') && t[i + 1].value !== ']') { i++; if (t[i].value === '[') depth++; else if (t[i].value === ']') depth--; } }
 }
 return out;
}

export async function components(files: ProjectFiles): Promise<Component[]> {
 const byTag = new Map<string, Component>();
 for (const path of await files.list('resources/views/components', n => n.endsWith('.blade.php'))) {
  let name = path.slice('resources/views/components/'.length, -'.blade.php'.length).replace(/\//g, '.');
  if (name.endsWith('.index')) name = name.slice(0, -'.index'.length);
  const text = (await files.read(path)) ?? '';
  byTag.set(`x-${name}`, { tag: `x-${name}`, view: `components.${name}`, viewFile: path, props: anonymousProps(text, path) });
 }
 for (const path of await files.list('app/View/Components', n => n.endsWith('.php'))) {
  const parts = path.slice('app/View/Components/'.length, -'.php'.length).split('/');
  const tag = `x-${parts.map(kebab).join('.')}`;
  const text = (await files.read(path)) ?? '';
  const view = /\bview\s*\(\s*(['"])([^'"]+)\1/.exec(text)?.[2];
  const declared = /\bclass\s+([A-Za-z_]\w*)/.exec(text);
  const existing = byTag.get(tag) ?? (view ? [...byTag.values()].find(c => c.view === view) : undefined);
  const props = constructorProps(text, path).map(p => ({ ...p }));
  const entry: Component = { ...(existing ?? { tag }), tag, classFile: path, className: declared?.[1], props: props.length ? props : existing?.props ?? [],
   ...(declared ? { classLine: position(text, declared.index + declared[0].length - declared[1].length).line, classCharacter: position(text, declared.index + declared[0].length - declared[1].length).character } : {}) };
  if (view && !entry.viewFile) { const viewFile = `resources/views/${view.replace(/\./g, '/')}.blade.php`; if (await files.exists(viewFile)) Object.assign(entry, { view, viewFile }); }
  if (existing && existing.tag !== tag) byTag.delete(existing.tag);
  byTag.set(tag, entry);
 }
 return [...byTag.values()].sort((a, b) => a.tag.localeCompare(b.tag));
}

function inferAt(tokens: PhpToken[], from: number, to: number, before: number, depth = 0): string | undefined {
 const v = tokens.slice(from, to);
 if (!v.length) return undefined;
 if (v.length === 1) return v[0].type === 'string' ? 'string' : v[0].type === 'number' ? (v[0].value.includes('.') ? 'float' : 'int') : /^(true|false)$/i.test(v[0].value) ? 'bool' : undefined;
 if (v[0].value === '[' || v[0].value.toLowerCase() === 'array') return 'array';
 if (v[0].value === '(' && v[2]?.value === ')' && v[1]?.type === 'word') return v[1].value.toLowerCase();
 if (v[0].value.toLowerCase() === 'new' && v[1]?.type === 'word') return v[1].value;
 if (v[0].value === '$' && v.length === 2 && depth < 2) return variableType(tokens, v[1].value, before, depth + 1);
 return undefined;
}

/** Tipo de `$name` visto antes de `before`: parâmetro tipado da função ou última atribuição simples. */
function variableType(tokens: PhpToken[], name: string, before: number, depth = 0): string | undefined {
 for (let i = before - 1; i > 0; i--) {
  if (tokens[i].value !== name || tokens[i - 1]?.value !== '$') continue;
  if (tokens[i + 1]?.value === '=' && tokens[i + 2]?.value !== '=') {
   let end = i + 2; let d = 0;
   while (end < tokens.length && !(d === 0 && tokens[end].value === ';')) { if (/^[([{]$/.test(tokens[end].value)) d++; else if (/^[)\]}]$/.test(tokens[end].value)) d--; end++; }
   return inferAt(tokens, i + 2, end, i, depth);
  }
  const prev = tokens[i - 2];
  if (prev?.type === 'word' && (tokens[i + 1]?.value === ',' || tokens[i + 1]?.value === ')' || tokens[i + 1]?.value === '=')) return prev.value === 'function' ? undefined : prev.value;
 }
 return undefined;
}

function split(tokens: PhpToken[], open: number) {
 const args: [number, number][] = []; let depth = 0; let start = open + 1; let i = open + 1;
 for (; i < tokens.length; i++) {
  const v = tokens[i].value;
  if (v === '(' || v === '[' || v === '{') depth++;
  else if (v === ')' || v === ']' || v === '}') { if (depth === 0) break; depth--; }
  else if (v === ',' && depth === 0) { args.push([start, i]); start = i + 1; }
 }
 if (i > start) args.push([start, i]);
 return { args, close: i };
}

/** Variáveis passadas a views por `view()`, `View::make()`, `Route::view()`, `@include`, `->with()` e `compact()`.
 * Para Blade, passar o texto de `bladeCode` com `inCode`. */
export function viewVariables(text: string, file: string, inCode = false): ViewVariable[] {
 const t = phpTokens(text, inCode); const out: ViewVariable[] = [];
 const add = (view: string, name: string, at: number, type?: string) => out.push({ name, view, file, ...position(text, t[at].offset), ...(type ? { type } : {}) });
 const fromArray = (view: string, [from]: [number, number], call: number) => {
  if (t[from]?.value === '[') {
   const { args } = split(t, from);
   for (const [a, b] of args) if (t[a]?.type === 'string' && t[a + 1]?.value === '=>') add(view, t[a].value, a, inferAt(t, a + 2, b, call));
  } else if (t[from]?.value === 'compact' && t[from + 1]?.value === '(') {
   const { args } = split(t, from + 1);
   for (const [a] of args) if (t[a]?.type === 'string') add(view, t[a].value, a, variableType(t, t[a].value, call));
  }
 };
 for (let i = 0; i < t.length; i++) {
  let open = -1; let nameArg = 0;
  if (t[i].value === 'view' && t[i + 1]?.value === '(' && t[i - 1]?.value !== '->' && t[i - 1]?.value !== '::' && t[i - 1]?.value !== 'function') open = i + 1;
  else if (t[i].value === 'View' && t[i + 1]?.value === '::' && t[i + 2]?.value === 'make' && t[i + 3]?.value === '(') open = i + 3;
  else if (t[i].value === 'Route' && t[i + 1]?.value === '::' && t[i + 2]?.value === 'view' && t[i + 3]?.value === '(') { open = i + 3; nameArg = 1; }
  else if (t[i].value === 'include' && t[i - 1]?.value === '@' && t[i + 1]?.value === '(') open = i + 1;
  if (open < 0) continue;
  const { args, close } = split(t, open);
  const nameRange = args[nameArg];
  if (!nameRange || nameRange[1] - nameRange[0] !== 1 || t[nameRange[0]].type !== 'string') continue;
  const view = t[nameRange[0]].value;
  if (args[nameArg + 1]) fromArray(view, args[nameArg + 1], i);
  let j = close + 1;
  while (t[j]?.value === '->' && t[j + 1]?.value === 'with' && t[j + 2]?.value === '(') {
   const w = split(t, j + 2);
   if (t[w.args[0]?.[0]]?.type === 'string' && w.args[0][1] - w.args[0][0] === 1) add(view, t[w.args[0][0]].value, w.args[0][0], w.args[1] ? inferAt(t, w.args[1][0], w.args[1][1], i) : undefined);
   else if (w.args[0]) fromArray(view, w.args[0], i);
   j = w.close + 1;
  }
 }
 return out;
}

/** Nome da view a partir do caminho do template. */
export const viewName = (path: string) => path.startsWith('resources/views/') ? path.slice('resources/views/'.length).replace(/(\.blade)?\.php$/, '').replace(/\//g, '.') : null;
