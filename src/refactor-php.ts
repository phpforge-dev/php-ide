// Motor próprio de refatorações PHP (requisito próprio, sem código de terceiros): nomes de classe
// resolvidos por namespace e `use`, renomear/mover classe, Extract Method/Variable, Inline Variable,
// inspeções de tipo incompatível e supressão por `@noinspection`. Não é um parser completo: casos
// fora do recorte são recusados com mensagem em vez de gerar código possivelmente errado.
import { phpTokens, segments, codeOnly, analyze, type PhpToken } from '../shared/language/php-source';

export type Edit = { start: number; end: number; text: string };
export type FileText = { path: string; text: string };
export type FileChange = { path: string; before: string; after: string; edits: Edit[] };
export type Plan = { title: string; changes: FileChange[]; warnings: string[]; conflicts: string[] };

const builtin = new Set(['self', 'static', 'parent', 'int', 'integer', 'float', 'double', 'string', 'bool', 'boolean', 'array', 'callable', 'iterable', 'object', 'mixed', 'void', 'null', 'never', 'false', 'true', 'class', 'resource', 'numeric']);
const modifiers = new Set(['public', 'protected', 'private', 'var', 'static', 'readonly', 'final', 'abstract']);
export const isIdentifier = (name: string) => /^[A-Za-z_\x80-￿][A-Za-z0-9_\x80-￿]*$/.test(name);
const reserved = new Set(['abstract', 'and', 'array', 'as', 'break', 'callable', 'case', 'catch', 'class', 'clone', 'const', 'continue', 'declare', 'default', 'do', 'echo', 'else', 'elseif', 'empty', 'enddeclare', 'endfor', 'endforeach', 'endif', 'endswitch', 'endwhile', 'enum', 'eval', 'exit', 'extends', 'final', 'finally', 'fn', 'for', 'foreach', 'function', 'global', 'goto', 'if', 'implements', 'include', 'instanceof', 'insteadof', 'interface', 'isset', 'list', 'match', 'namespace', 'new', 'or', 'print', 'private', 'protected', 'public', 'readonly', 'require', 'return', 'static', 'switch', 'throw', 'trait', 'try', 'unset', 'use', 'var', 'while', 'xor', 'yield', 'self', 'parent', 'int', 'float', 'bool', 'string', 'true', 'false', 'null', 'void', 'iterable', 'object', 'mixed', 'never']);
export const isClassName = (name: string) => isIdentifier(name) && !reserved.has(name.toLowerCase());

/** Aplica edições (offsets do texto original); sobreposição é erro, nunca resultado silencioso. */
export function applyEdits(text: string, edits: Edit[]): string {
 const sorted = [...edits].sort((a, b) => a.start - b.start || a.end - b.end);
 for (let i = 1; i < sorted.length; i++) if (sorted[i].start < sorted[i - 1].end) throw Error('Edições sobrepostas na refatoração');
 let out = ''; let at = 0;
 for (const e of sorted) { out += text.slice(at, e.start) + e.text; at = e.end; }
 return out + text.slice(at);
}
export const change = (path: string, before: string, edits: Edit[]): FileChange => ({ path, before, after: applyEdits(before, edits), edits });

// ── Itens: nomes qualificados, variáveis e pontuação ──────────────────────────────────────────
export type Item = { type: 'name' | 'var' | 'punct' | 'string' | 'number'; value: string; start: number; end: number; segs?: { text: string; start: number; end: number }[] };
export function items(text: string): Item[] {
 const t: PhpToken[] = phpTokens(text); const out: Item[] = [];
 const adjacent = (a: PhpToken | undefined, b: PhpToken | undefined) => !!a && !!b && a.offset + a.value.length === b.offset;
 for (let i = 0; i < t.length; i++) {
  const k = t[i];
  if (k.type === 'punct' && k.value === '$' && t[i + 1]?.type === 'word' && adjacent(k, t[i + 1])) { out.push({ type: 'var', value: t[i + 1].value, start: k.offset, end: t[i + 1].offset + t[i + 1].value.length }); i++; continue; }
  const qualified = k.type === 'word' || (k.value === '\\' && t[i + 1]?.type === 'word' && adjacent(k, t[i + 1]));
  if (qualified) {
   const segs: Item['segs'] = []; let j = i; let raw = '';
   if (t[j].value === '\\') { raw = '\\'; j++; }
   while (j < t.length && t[j].type === 'word') {
    segs.push({ text: t[j].value, start: t[j].offset, end: t[j].offset + t[j].value.length }); raw += t[j].value;
    if (t[j + 1]?.value === '\\' && adjacent(t[j], t[j + 1]) && t[j + 2]?.type === 'word' && adjacent(t[j + 1], t[j + 2])) { raw += '\\'; j += 2; } else break;
   }
   out.push({ type: 'name', value: raw, start: k.offset, end: segs.at(-1)!.end, segs }); i = j; continue;
  }
  out.push({ type: k.type === 'word' ? 'name' : k.type, value: k.value, start: k.offset, end: k.offset + (k.type === 'string' ? 0 : k.value.length) });
 }
 // Strings guardam o valor decodificado; o fim real vem dos segmentos.
 const strings = segments(text).filter(s => s.kind === 'string'); let s = 0;
 for (const item of out) if (item.type === 'string') { while (s < strings.length && strings[s].start < item.start) s++; if (strings[s]?.start === item.start) item.end = strings[s].end; }
 return out;
}

// ── Referências de classe ─────────────────────────────────────────────────────────────────────
export type Import = { fqn: string; alias: string; explicit: boolean; name: Item; start: number; end: number; namespace: string };
export type Ref = { name: Item; fqn: string; via: 'fq' | 'qualified' | 'explicit' | 'implicit' | 'namespace' | 'import'; namespace: string; import?: Import };
export type Decl = { name: string; fqn: string; kind: string; item: Item; namespace: string };
export type Namespace = { name: string; item?: Item; start: number; end: number; statementEnd: number };
export type FunctionInfo = { name: string; start: number; paramsStart: number; paramsEnd: number; bodyStart: number; bodyEnd: number; returnType?: { start: number; end: number; text: string }; isStatic: boolean; isMethod: boolean; isClosure: boolean; className?: string; classStart?: number; classEnd?: number; params: { name: string; type?: string; start: number; end: number }[] };
export type FileModel = { items: Item[]; refs: Ref[]; imports: Import[]; decls: Decl[]; namespaces: Namespace[]; functions: FunctionInfo[] };

function matching(list: Item[], open: number): number {
 const pair: Record<string, string> = { '(': ')', '[': ']', '{': '}' }; const o = list[open].value; const c = pair[o]; let depth = 0;
 for (let i = open; i < list.length; i++) { if (list[i].value === o && list[i].type === 'punct') depth++; else if (list[i].value === c && list[i].type === 'punct' && --depth === 0) return i; }
 return list.length - 1;
}

export function model(text: string): FileModel {
 const list = items(text); const refs: Ref[] = []; const imports: Import[] = []; const decls: Decl[] = []; const namespaces: Namespace[] = []; const functions: FunctionInfo[] = [];
 let namespace = ''; let scopeImports: Import[] = [];
 const resolve = (name: Item, ns: string): Omit<Ref, 'name'> | undefined => {
  const raw = name.value; const low = raw.toLowerCase();
  if (raw.startsWith('\\')) return { fqn: raw.slice(1), via: 'fq', namespace: ns };
  if (low.startsWith('namespace\\')) return { fqn: (ns ? ns + '\\' : '') + raw.slice(10), via: 'fq', namespace: ns };
  if (!raw.includes('\\') && builtin.has(low)) return undefined;
  const first = name.segs![0].text.toLowerCase(); const imp = scopeImports.find(i => i.alias.toLowerCase() === first);
  if (imp) return name.segs!.length > 1 ? { fqn: imp.fqn + raw.slice(name.segs![0].text.length), via: 'qualified', namespace: ns, import: imp } : { fqn: imp.fqn, via: imp.explicit ? 'explicit' : 'implicit', namespace: ns, import: imp };
  return { fqn: ns ? `${ns}\\${raw}` : raw, via: 'namespace', namespace: ns };
 };
 const ref = (i: number) => { const name = list[i]; if (name?.type !== 'name') return; const r = resolve(name, namespace); if (r) refs.push({ name, ...r }); };
 /** Expressão de tipo: nomes, `?`, `|`, `&`, `(`, `)`; devolve o índice após o tipo. */
 const typeAt = (i: number) => { let j = i; while (j < list.length && (list[j].type === 'name' || ['?', '|', '&', '(', ')'].includes(list[j].value))) { if (list[j].type === 'name') ref(j); if (list[j].value === ')' && list[j + 1]?.type !== 'name' && !['|', '&', '?'].includes(list[j + 1]?.value)) break; j++; } return j; };
 type Block = { kind: 'class' | 'function' | 'block' | 'namespace'; name?: string; open: number; fn?: FunctionInfo };
 const stack: Block[] = []; let pending: Block['kind'] | undefined; let pendingName: string | undefined; let pendingFn: FunctionInfo | undefined; let list_mode = false; let attr = -1; let attrParen = 0; let bracket = 0; let paren = 0;
 const inClass = () => stack.at(-1)?.kind === 'class';
 for (let i = 0; i < list.length; i++) {
  const it = list[i]; const v = it.value; const low = v.toLowerCase(); const prev = list[i - 1]; const next = list[i + 1];
  const member = prev && (prev.value === '->' || prev.value === '::');
  if (it.type === 'punct') {
   if (v === '{') { stack.push({ kind: pending ?? 'block', name: pendingName, open: it.start, fn: pendingFn }); pending = undefined; pendingName = undefined; pendingFn = undefined; list_mode = false; }
   else if (v === '}') { const b = stack.pop(); if (b?.fn) b.fn.bodyEnd = it.start; if (b?.kind === 'namespace') { namespace = ''; scopeImports = []; } }
   else if (v === ';') { if (pending === 'function') { pendingFn = undefined; } pending = undefined; pendingName = undefined; list_mode = false; }
   else if (v === '(') paren++;
   else if (v === ')') paren--;
   else if (v === '[') { bracket++; if (prev?.value === '#' && prev.end === it.start) { attr = bracket; attrParen = paren; const n = list[i + 1]; if (n?.type === 'name') ref(i + 1); } }
   else if (v === ']') { if (bracket === attr) attr = -1; bracket--; }
   else if (v === ',' && attr === bracket && attr > 0 && paren === attrParen && next?.type === 'name') ref(i + 1);
   else if (v === '::' && prev?.type === 'name' && !(list[i - 2]?.value === '->' || list[i - 2]?.value === '::')) ref(i - 1);
   continue;
  }
  if (it.type !== 'name' || member) continue;
  if (list_mode && (prev.value === ',' || /^(extends|implements)$/i.test(prev.value))) { ref(i); continue; }
  if (low === 'namespace' && !it.segs?.[1] && (next?.type === 'name' || next?.value === '{') && stack.every(b => b.kind === 'namespace') && !(next?.value?.startsWith('\\'))) {
   const name = next.type === 'name' ? next : undefined; const end = name ? list[i + 2] : next;
   namespace = name?.value ?? ''; scopeImports = [];
   namespaces.push({ name: namespace, item: name, start: it.start, end: name?.end ?? it.end, statementEnd: end?.value === ';' ? end.end : end?.start ?? it.end });
   if (end?.value === '{') pending = 'namespace';
   i += name ? 1 : 0; continue;
  }
  if (low === 'use' && prev?.value !== ')' && !inClass() && stack.every(b => b.kind === 'namespace')) {
   let j = i + 1; if (/^(function|const)$/i.test(list[j]?.value ?? '')) { while (j < list.length && list[j].value !== ';') j++; i = j; continue; }
   const start = it.start; const added: Import[] = [];
   const add = (name: Item, prefix: string, alias?: Item) => { const fqn = (prefix + name.value).replace(/^\\/, ''); const imp: Import = { fqn, alias: alias?.value ?? fqn.split('\\').pop()!, explicit: !!alias && alias.value.toLowerCase() !== fqn.split('\\').pop()!.toLowerCase(), name, start, end: 0, namespace }; added.push(imp); };
   while (j < list.length && list[j].value !== ';') {
    const name = list[j]; if (name.type !== 'name') break;
    if (list[j + 1]?.value === '\\' || list[j + 1]?.value === '{') {
     const prefix = name.value.replace(/^\\/, '') + '\\'; j += list[j + 1].value === '\\' ? 2 : 1; if (list[j]?.value !== '{') break; j++;
     while (j < list.length && list[j].value !== '}') { const n = list[j]; if (n.type !== 'name') { j++; continue; } let alias: Item | undefined; if (list[j + 1]?.value.toLowerCase() === 'as') { alias = list[j + 2]; j += 2; } add(n, prefix, alias); j++; if (list[j]?.value === ',') j++; }
     j++;
    } else { let alias: Item | undefined; if (list[j + 1]?.value.toLowerCase() === 'as') { alias = list[j + 2]; j += 2; } add(name, '', alias); j++; }
    if (list[j]?.value === ',') j++;
   }
   const end = list[j]?.value === ';' ? list[j].end : list[j]?.start ?? text.length;
   for (const imp of added) { imp.end = end; imports.push(imp); scopeImports.push(imp); refs.push({ name: imp.name, fqn: imp.fqn, via: 'import', namespace, import: imp }); }
   i = j; continue;
  }
  if (low === 'use' && inClass()) { let j = i + 1; while (j < list.length && list[j].type === 'name') { ref(j); j++; if (list[j]?.value === ',') j++; } i = j - 1; continue; }
  if (/^(class|interface|trait|enum)$/.test(low) && prev?.value.toLowerCase() !== 'new' && !(prev?.value === '::')) {
   const id = next; if (id?.type === 'name' && isIdentifier(id.value) && !/^(extends|implements)$/i.test(id.value)) {
    if (low === 'enum' && !/^[{:]$|^implements$/i.test(list[i + 2]?.value ?? '')) continue;
    decls.push({ name: id.value, fqn: namespace ? `${namespace}\\${id.value}` : id.value, kind: low, item: id, namespace }); pending = 'class'; pendingName = id.value; i++;
    if (low === 'enum' && list[i + 1]?.value === ':') { i++; }
   }
   continue;
  }
  if (low === 'new') { if (next?.type === 'name' && next.value.toLowerCase() !== 'class') ref(i + 1); if (next?.value.toLowerCase() === 'class') { pending = 'class'; i++; } continue; }
  if (/^(extends|implements)$/.test(low)) { list_mode = true; if (next?.type === 'name') ref(i + 1); i++; continue; }
  if (/^(instanceof|insteadof)$/.test(low)) { if (next?.type === 'name') ref(i + 1); continue; }
  if (low === 'catch' && next?.value === '(') { let j = i + 2; while (list[j]?.type === 'name' || list[j]?.value === '|') { if (list[j].type === 'name') ref(j); j++; } i = j - 1; continue; }
  if (low === 'function' || low === 'fn') {
   let j = i + 1; if (list[j]?.value === '&') j++;
   let name = ''; if (list[j]?.type === 'name') { name = list[j].value; j++; }
   if (list[j]?.value !== '(') continue;
   const close = matching(list, j);
   // Início da declaração: modificadores e atributos imediatamente anteriores.
   let s = i; while (s > 0 && list[s - 1].type === 'name' && modifiers.has(list[s - 1].value.toLowerCase())) s--;
   const fn: FunctionInfo = { name, start: list[s].start, paramsStart: list[j].start, paramsEnd: list[close].end, bodyStart: -1, bodyEnd: -1, isStatic: list.slice(s, i).some(x => x.value.toLowerCase() === 'static'), isMethod: inClass() && !!name, isClosure: !name, params: [] };
   if (inClass()) { const cls = stack.at(-1)!; fn.className = cls.name; fn.classStart = cls.open; }
   // Parâmetros: tipos (antes da variável), nomes e valores padrão.
   let k = j + 1; let depth = 0; let paramStart = true;
   for (; k < close; k++) {
    const p = list[k];
    if (p.value === '(' || p.value === '[') depth++; else if (p.value === ')' || p.value === ']') depth--;
    if (depth === 0 && p.value === ',') { paramStart = true; continue; }
    if (depth === 0 && paramStart) {
     let m = k; while (list[m]?.type === 'name' && modifiers.has(list[m].value.toLowerCase())) m++;
     if (list[m]?.value === '#') { paramStart = false; continue; }
     const typeStart = list[m]; const after = typeAt(m); const typeEnd = list[after - 1];
     let v = after; while (list[v]?.value === '&' || list[v]?.value === '.') v++;
     if (list[v]?.type === 'var') fn.params.push({ name: list[v].value, type: after > m ? text.slice(typeStart.start, typeEnd.end) : undefined, start: list[v].start, end: list[v].end });
     paramStart = false; k = Math.max(k, v);
    }
    if (p.value === 'new' && list[k + 1]?.type === 'name') ref(k + 1);
   }
   let n = close + 1;
   if (list[n]?.value.toLowerCase() === 'use' && list[n + 1]?.value === '(') n = matching(list, n + 1) + 1;
   if (list[n]?.value === ':') { const after = typeAt(n + 1); if (after > n + 1) fn.returnType = { start: list[n + 1].start, end: list[after - 1].end, text: text.slice(list[n + 1].start, list[after - 1].end) }; n = after; }
   if (list[n]?.value === '{') { fn.bodyStart = list[n].start; functions.push(fn); pending = 'function'; pendingFn = fn; }
   else if (list[n]?.value === '=>' ) { fn.bodyStart = list[n].start; fn.bodyEnd = list[n].end; functions.push(fn); }
   i = n - 1; continue;
  }
  // Propriedades tipadas e constantes tipadas no corpo da classe.
  if (inClass() && modifiers.has(low) && !modifiers.has(prev?.value.toLowerCase() ?? '')) {
   let j = i; while (list[j]?.type === 'name' && modifiers.has(list[j].value.toLowerCase())) j++;
   if ((list[j]?.type === 'name' && !/^(function|const|fn|case)$/i.test(list[j].value)) || list[j]?.value === '?' || list[j]?.value === '(') { const after = typeAt(j); i = after - 1; }
   continue;
  }
  if (low === 'const' && inClass() && list[i + 1]?.type === 'name' && list[i + 2]?.type === 'name') { ref(i + 1); continue; }
 }
 const result: FileModel = { items: list, refs, imports, decls, namespaces, functions };
 docblockRefs(text, result);
 return result;
}
/** Tipos em PHPDoc (`@param`, `@return`, `@var`, `@throws`…) resolvidos como nomes de código. */
function docblockRefs(text: string, m: FileModel) {
 for (const s of segments(text)) {
  if (s.kind !== 'comment' || !text.startsWith('/**', s.start)) continue;
  const body = text.slice(s.start, s.end);
  for (const tag of body.matchAll(/@(?:param|return|var|throws|property(?:-read|-write)?|mixin|extends|implements|template-extends|template-implements|use|see|method)\s+([^\s$*]+)/g)) {
   const typeStart = s.start + tag.index! + tag[0].length - tag[1].length;
   for (const n of tag[1].matchAll(/\\?[A-Za-z_\x80-\uffff][\w\x80-\uffff]*(?:\\[A-Za-z_\x80-\uffff][\w\x80-\uffff]*)*/g)) {
    const start = typeStart + n.index!; const raw = n[0]; const after = text[start + raw.length];
    if (after === '(' || after === ':') continue;
    const segs: NonNullable<Item['segs']> = []; let at = start + (raw.startsWith('\\') ? 1 : 0);
    for (const part of raw.replace(/^\\/, '').split('\\')) { segs.push({ text: part, start: at, end: at + part.length }); at += part.length + 1; }
    const name: Item = { type: 'name', value: raw, start, end: start + raw.length, segs };
    const r = resolveAt(m, name, start); if (r) m.refs.push({ name, ...r });
   }
  }
 }
}
function resolveAt(m: FileModel, name: Item, offset: number): Omit<Ref, 'name'> | undefined {
 const ns = [...m.namespaces].reverse().find(n => n.start <= offset)?.name ?? '';
 const raw = name.value; const low = raw.toLowerCase();
 if (raw.startsWith('\\')) return { fqn: raw.slice(1), via: 'fq', namespace: ns };
 if (!raw.includes('\\') && builtin.has(low)) return undefined;
 const first = name.segs![0].text.toLowerCase(); const imp = m.imports.find(i => i.namespace === ns && i.alias.toLowerCase() === first);
 if (imp) return name.segs!.length > 1 ? { fqn: imp.fqn + raw.slice(name.segs![0].text.length), via: 'qualified', namespace: ns, import: imp } : { fqn: imp.fqn, via: imp.explicit ? 'explicit' : 'implicit', namespace: ns, import: imp };
 return { fqn: ns ? `${ns}\\${raw}` : raw, via: 'namespace', namespace: ns };
}

// ── Índice de classes do projeto ──────────────────────────────────────────────────────────────
export type ClassIndex = Map<string, { fqn: string; path: string }>;
export function classIndex(files: FileText[]): ClassIndex {
 const index: ClassIndex = new Map();
 for (const f of files) for (const d of analyze(f.text).declarations) index.set(d.fqn.toLowerCase(), { fqn: d.fqn, path: f.path });
 return index;
}
const nsOf = (fqn: string) => fqn.includes('\\') ? fqn.slice(0, fqn.lastIndexOf('\\')) : '';
const shortOf = (fqn: string) => fqn.split('\\').pop()!;

/** Onde inserir um novo `use` no namespace que contém `offset`. */
export function importEdit(text: string, m: FileModel, offset: number, statement: string): Edit {
 const ns = [...m.namespaces].reverse().find(n => n.start <= offset);
 const imports = m.imports.filter(i => i.start >= (ns?.start ?? 0) && i.start < offset);
 const last = imports.at(-1);
 if (last) return { start: last.end, end: last.end, text: `\n${statement}` };
 if (ns) return { start: ns.statementEnd, end: ns.statementEnd, text: `\n\n${statement}` };
 const tag = text.indexOf('<?php'); const at = tag < 0 ? 0 : tag + 5;
 const strict = /^\s*declare\s*\(\s*strict_types\s*=\s*1\s*\)\s*;/.exec(text.slice(at));
 const point = strict ? at + strict[0].length : at;
 return { start: point, end: point, text: `\n\n${statement}` };
}

export type MoveOptions = { strings?: boolean };
/**
 * Renomeia ou move a classe `from` para `to` (FQN) em todos os arquivos. Homônimos de outros
 * namespaces são preservados porque cada nome é resolvido pelo namespace e pelos `use` do arquivo.
 */
export function moveClass(files: FileText[], index: ClassIndex, from: string, to: string, options: MoveOptions = {}): Plan {
 const fromLow = from.toLowerCase(); const toShort = shortOf(to); const toNs = nsOf(to); const fromNs = nsOf(from); const fromShort = shortOf(from);
 const warnings: string[] = []; const conflicts: string[] = []; const changes: FileChange[] = [];
 if (!isClassName(toShort)) conflicts.push(`"${toShort}" não é um nome de classe PHP válido.`);
 if (to.toLowerCase() !== fromLow && index.has(to.toLowerCase())) conflicts.push(`Já existe ${index.get(to.toLowerCase())!.fqn} em ${index.get(to.toLowerCase())!.path}.`);
 if (!index.has(fromLow)) conflicts.push(`Classe ${from} não encontrada no projeto.`);
 const renamed = toShort !== fromShort; const moved = toNs.toLowerCase() !== fromNs.toLowerCase();
 for (const file of files) {
  const low = file.text.toLowerCase();
  if (!low.includes(fromShort.toLowerCase())) continue;
  const m = model(file.text); const edits: Edit[] = []; const needs = new Map<string, number>();
  const declared = m.decls.find(d => d.fqn.toLowerCase() === fromLow);
  if (declared) {
   if (renamed) edits.push({ start: declared.item.start, end: declared.item.end, text: toShort });
   if (moved) {
    const ns = m.namespaces.find(n => n.name.toLowerCase() === fromNs.toLowerCase());
    if (m.decls.length > 1) conflicts.push(`${file.path} declara mais de uma classe; mova ${fromShort} para um arquivo próprio antes de mudar o namespace.`);
    if (ns?.item) edits.push(toNs ? { start: ns.item.start, end: ns.item.end, text: toNs } : { start: ns.start, end: ns.statementEnd, text: '' });
    else if (toNs) { const tag = file.text.indexOf('<?php'); edits.push({ start: tag + 5, end: tag + 5, text: `\n\nnamespace ${toNs};` }); }
    // No arquivo movido, nomes curtos do namespace antigo passam a exigir `use`.
    for (const r of m.refs) if (r.via === 'namespace' && r.fqn.toLowerCase() !== fromLow && index.has(r.fqn.toLowerCase()) && nsOf(r.fqn).toLowerCase() === fromNs.toLowerCase() && r.name.segs!.length === 1) needs.set(index.get(r.fqn.toLowerCase())!.fqn, r.name.start);
   }
  }
  const nsFinal = (r: Ref) => declared && moved ? toNs : r.namespace;
  for (const r of m.refs) {
   if (r.fqn.toLowerCase() !== fromLow) continue;
   const name = r.name; const last = name.segs!.at(-1)!;
   if (r.via === 'import') {
    const imp = r.import!;
    const sameAlias = !imp.explicit;
    const clash = sameAlias && renamed && m.imports.some(o => o !== imp && o.namespace === imp.namespace && o.alias.toLowerCase() === toShort.toLowerCase());
    if (clash) { edits.push({ start: name.start, end: name.end, text: (name.value.startsWith('\\') ? '\\' : '') + to + ` as ${imp.alias}` }); warnings.push(`${file.path}: já existe um import chamado ${toShort}; o novo import usa o alias ${imp.alias}.`); imp.explicit = true; }
    else edits.push({ start: name.start, end: name.end, text: (name.value.startsWith('\\') ? '\\' : '') + to });
    continue;
   }
   if (r.via === 'explicit') continue;
   if (r.via === 'implicit') { if (renamed && !r.import!.explicit) edits.push({ start: name.start, end: name.end, text: toShort }); continue; }
   if (r.via === 'fq' || r.via === 'qualified') { if (moved || r.via === 'qualified') edits.push({ start: name.start, end: name.end, text: '\\' + to }); else if (renamed) edits.push({ start: last.start, end: last.end, text: toShort }); continue; }
   // Nome curto resolvido pelo namespace do arquivo.
   const ns = nsFinal(r);
   if (ns.toLowerCase() === toNs.toLowerCase()) { if (renamed) edits.push({ start: name.start, end: name.end, text: toShort }); continue; }
   const scope = m.imports.filter(i => i.namespace === r.namespace);
   if (scope.some(i => i.alias.toLowerCase() === toShort.toLowerCase()) || m.decls.some(d => d.name.toLowerCase() === toShort.toLowerCase() && d.fqn.toLowerCase() !== fromLow)) { edits.push({ start: name.start, end: name.end, text: '\\' + to }); continue; }
   edits.push({ start: name.start, end: name.end, text: toShort }); needs.set(to, name.start);
  }
  for (const [fqn, at] of needs) {
   const scope = m.imports.filter(i => i.start < at);
   if (scope.some(i => i.fqn.toLowerCase() === fqn.toLowerCase())) continue;
   edits.push(importEdit(file.text, m, at, `use ${fqn};`));
  }
  if (options.strings) {
   const forms = [[from, to], [from.replaceAll('\\', '\\\\'), to.replaceAll('\\', '\\\\')]];
   for (const s of segments(file.text)) {
    if (s.kind !== 'string' && s.kind !== 'comment') continue;
    const piece = file.text.slice(s.start, s.end);
    for (const [a, b] of forms) {
     const re = new RegExp(`(?<![\\w\\\\])\\\\?${a.replace(/[\\^$.*+?()[\]{}|]/g, '\\$&')}(?![\\w])`, 'gi');
     for (const hit of piece.matchAll(re)) { const start = s.start + hit.index! + (hit[0].startsWith('\\') && !a.startsWith('\\') ? 1 : 0); const end = s.start + hit.index! + hit[0].length; if (!edits.some(e => e.start < end && start < e.end)) edits.push({ start, end, text: b }); }
     if (a === b) break;
    }
   }
  }
  if (edits.length) changes.push(change(file.path, file.text, edits));
 }
 return { title: moved ? `Mover ${from} para ${to}` : `Renomear ${from} para ${toShort}`, changes, warnings, conflicts };
}

/** Declaração de classe (nome) na posição `offset`, ou referência resolvida para uma classe do índice. */
export function classAt(text: string, offset: number, index?: ClassIndex): { fqn: string; name: string } | undefined {
 const m = model(text);
 const d = m.decls.find(d => d.item.start <= offset && offset <= d.item.end); if (d) return { fqn: d.fqn, name: d.name };
 const r = m.refs.find(r => r.name.start <= offset && offset <= r.name.end);
 if (r && (!index || index.has(r.fqn.toLowerCase()))) return { fqn: index?.get(r.fqn.toLowerCase())?.fqn ?? r.fqn, name: shortOf(r.fqn) };
 return undefined;
}

// ── Importar classe (autoimport / quick fix) ──────────────────────────────────────────────────
export type ImportFix = { title: string; edits: Edit[]; fqn: string; alias?: string };
/** Correções para um nome curto não resolvido em `offset`: importar, ou importar com alias quando houver conflito. */
export function importFixes(text: string, offset: number, index: ClassIndex): ImportFix[] {
 const m = model(text); const r = m.refs.find(r => r.name.start <= offset && offset <= r.name.end && r.via !== 'import');
 if (!r || r.name.segs!.length !== 1 || r.via === 'fq') return [];
 const short = r.name.value.toLowerCase();
 const candidates = [...index.values()].filter(c => shortOf(c.fqn).toLowerCase() === short && c.fqn.toLowerCase() !== r.fqn.toLowerCase()).sort((a, b) => a.fqn.localeCompare(b.fqn));
 const out: ImportFix[] = [];
 for (const c of candidates) {
  const scope = m.imports.filter(i => i.namespace === r.namespace);
  if (scope.some(i => i.fqn.toLowerCase() === c.fqn.toLowerCase())) continue;
  const clash = scope.some(i => i.alias.toLowerCase() === short) || m.decls.some(d => d.name.toLowerCase() === short);
  if (!clash) out.push({ title: `Importar classe ${c.fqn}`, fqn: c.fqn, edits: [importEdit(text, m, r.name.start, `use ${c.fqn};`)] });
  const alias = aliasFor(c.fqn, new Set([...scope.map(i => i.alias.toLowerCase()), ...m.decls.map(d => d.name.toLowerCase())]));
  out.push({ title: `Importar ${c.fqn} como ${alias}`, fqn: c.fqn, alias, edits: [importEdit(text, m, r.name.start, `use ${c.fqn} as ${alias};`), { start: r.name.start, end: r.name.end, text: alias }] });
  out.push({ title: `Qualificar como \\${c.fqn}`, fqn: c.fqn, edits: [{ start: r.name.start, end: r.name.end, text: '\\' + c.fqn }] });
 }
 return out;
}
/** Alias sugerido: segmento anterior + nome (`App\Support\Collection` → `SupportCollection`). */
export function aliasFor(fqn: string, taken: Set<string>): string {
 const parts = fqn.split('\\'); let alias = parts.length > 1 ? parts.at(-2)! + parts.at(-1)! : parts[0] + 'Alias';
 for (let i = 2; taken.has(alias.toLowerCase()); i++) alias = (parts.length > 1 ? parts.at(-2)! + parts.at(-1)! : parts[0]) + i;
 return alias;
}
/**
 * Inserção de classe no completion: nome curto se já importado/mesmo namespace; novo `use` sem
 * duplicar; quando outro import ou declaração usa o mesmo nome curto, alias (e a alternativa FQN).
 */
export function completionImport(text: string, offset: number, fqn: string): { insert: string; edits: Edit[]; alias?: string; qualified: string } {
 const m = model(text); const ns = [...m.namespaces].reverse().find(n => n.start <= offset)?.name ?? '';
 const scope = m.imports.filter(i => i.namespace === ns && i.start < offset); const short = shortOf(fqn); const low = fqn.toLowerCase();
 const qualified = '\\' + fqn;
 const existing = scope.find(i => i.fqn.toLowerCase() === low); if (existing) return { insert: existing.alias, edits: [], qualified };
 const clash = scope.some(i => i.alias.toLowerCase() === short.toLowerCase()) || m.decls.some(d => d.name.toLowerCase() === short.toLowerCase() && d.fqn.toLowerCase() !== low);
 if (!clash && nsOf(fqn).toLowerCase() === ns.toLowerCase()) return { insert: short, edits: [], qualified };
 if (!clash && !nsOf(fqn) && !ns) return { insert: short, edits: [], qualified };
 if (!clash) return { insert: short, edits: [importEdit(text, m, offset, `use ${fqn};`)], qualified };
 const alias = aliasFor(fqn, new Set([...scope.map(i => i.alias.toLowerCase()), ...m.decls.map(d => d.name.toLowerCase())]));
 return { insert: alias, alias, edits: [importEdit(text, m, offset, `use ${fqn} as ${alias};`)], qualified };
}

// ── Estrutura de funções e variáveis ─────────────────────────────────────────────────────────
const lineStart = (text: string, at: number) => text.lastIndexOf('\n', at - 1) + 1;
const indentAt = (text: string, at: number) => /^[ \t]*/.exec(text.slice(lineStart(text, at)))![0];
const trimRange = (text: string, start: number, end: number) => { while (start < end && /\s/.test(text[start])) start++; while (end > start && /\s/.test(text[end - 1])) end--; return [start, end] as const; };
function enclosing(m: FileModel, start: number, end: number) { return m.functions.filter(f => f.bodyStart >= 0 && f.bodyStart < start && end <= f.bodyEnd).sort((a, b) => b.bodyStart - a.bodyStart)[0]; }
function balanced(code: string) { let depth = 0; for (const c of code) { if ('([{'.includes(c)) depth++; else if (')]}'.includes(c) && --depth < 0) return false; } return depth === 0; }
const vars = (list: Item[], from: number, to: number) => list.filter(i => i.type === 'var' && i.start >= from && i.end <= to && i.value !== 'this');
/** Escrita: `$x =`, `$x .=`, `$x++`, `++$x`, `foreach (… as $x)`, `list($x)`/`[$x] =`, `&$x`, `catch (E $x)`. */
function writes(list: Item[], code: string, item: Item): boolean {
 const k = list.indexOf(item); const next = list[k + 1]; const after = list[k + 2]; const prev = list[k - 1];
 const glued = (a?: Item, b?: Item) => !!a && !!b && a.end === b.start;
 if (next?.value === '=' && !(glued(next, after) && (after!.value === '=' || after!.value === '>'))) return true;
 if (next && /^[-+*/.%&|^]$/.test(next.value) && after?.value === '=' && glued(next, after) && !(list[k + 3]?.value === '=' && glued(after, list[k + 3]))) return true;
 if (next?.value === '?' && after?.value === '?' && list[k + 3]?.value === '=' && glued(after, list[k + 3])) return true;
 if ((next?.value === '+' && after?.value === '+') || (next?.value === '-' && after?.value === '-')) return true;
 if ((prev?.value === '+' && list[k - 2]?.value === '+') || (prev?.value === '-' && list[k - 2]?.value === '-')) return true;
 if (prev?.value === '&' && !(list[k - 2]?.type === 'var' || list[k - 2]?.type === 'name' || list[k - 2]?.value === ')')) return true;
 for (let j = k - 1; j >= 0 && j > k - 6; j--) { if (list[j].value.toLowerCase() === 'as') return true; if (list[j].type !== 'var' && !['=>', '&', ','].includes(list[j].value)) break; }
 if (/\bcatch\s*\([^()]*$/i.test(code.slice(Math.max(0, item.start - 200), item.start))) return true;
 return destructured(list, k);
}
/** `$x` dentro de `[...] =` ou `list(...) =` (desestruturação de um nível). */
function destructured(list: Item[], k: number): boolean {
 let depth = 0;
 for (let j = k + 1; j < list.length; j++) {
  const it = list[j]; const v = it.value; if (it.type !== 'punct') continue;
  if (v === '[' || v === '(') depth++;
  else if (v === ']' || v === ')') {
   if (depth > 0) { depth--; continue; }
   let open = 0; let q = j; for (; q >= 0; q--) { const w = list[q]; if (w.type !== 'punct') continue; if (w.value === ']' || w.value === ')') open++; else if ((w.value === '[' || w.value === '(') && --open === 0) break; }
   const eq = list[j + 1]; const nx = list[j + 2];
   if (eq?.value !== '=' || (nx && nx.start === eq.end && (nx.value === '=' || nx.value === '>'))) return false;
   const owner = list[q - 1];
   return v === ']' ? !(owner && (owner.type === 'var' || owner.type === 'name' || owner.type === 'string' || owner.value === ']' || owner.value === ')')) : owner?.value.toLowerCase() === 'list';
  } else if (depth === 0 && (v === ';' || v === '{' || v === '}' || v === '=')) return false;
 }
 return false;
}
const loops = /^(for|foreach|while|do)$/i;

export type ExtractResult = { plan?: Plan; error?: string; params?: string[]; returns?: string[] };
/** Extract Method: instruções completas ou uma expressão dentro de um método/função. */
export function extractMethod(path: string, text: string, selStart: number, selEnd: number, name: string): ExtractResult {
 if (!isIdentifier(name) || reserved.has(name.toLowerCase())) return { error: `"${name}" não é um nome de método válido.` };
 [selStart, selEnd] = trimRange(text, selStart, selEnd);
 if (selStart >= selEnd) return { error: 'Selecione as instruções ou a expressão a extrair.' };
 const m = model(text); const fn = enclosing(m, selStart, selEnd);
 if (!fn) return { error: 'A seleção precisa estar dentro do corpo de um método ou função.' };
 if (fn.isClosure) return { error: 'Extrair de dentro de closures ou arrow functions ainda não é suportado.' };
 if (m.functions.some(f => f !== fn && f.start < selStart && selEnd < f.bodyEnd && f.bodyStart > fn.bodyStart && f.bodyStart < selStart)) return { error: 'A seleção está dentro de uma closure; extração não suportada.' };
 const code = codeOnly(text); const selected = code.slice(selStart, selEnd);
 if (!balanced(selected)) return { error: 'A seleção não forma um bloco completo: parênteses ou chaves desbalanceados.' };
 const segs = segments(text); if (segs.some(s => (s.kind === 'string' || s.kind === 'comment') && ((s.start < selStart && selStart < s.end) || (s.start < selEnd && selEnd < s.end)))) return { error: 'A seleção começa ou termina no meio de uma string ou comentário.' };
 const before = code.slice(fn.bodyStart + 1, selStart).trimEnd(); const statement = /;$/.test(selected.trimEnd()) || /\}$/.test(selected.trimEnd());
 const statementStart = before === '' || /[;{}]$/.test(before) || /^\s*$/.test(before);
 const expression = !statement && !selected.includes(';');
 if (statement && !statementStart) return { error: 'Selecione instruções completas (do início da instrução até o ";").' };
 if (expression && (/^[=,)\]}.*/%&|^<>?:]/.test(selected.trim()) || /[=,(\[{.+\-*/%&|^<>!?:]$/.test(selected.trim()) || /(^|[^=!<>])=($|[^=>])/.test(selected.replace(/=>/g, '')) && /^\$\w+\s*$/.test(selected.split('=')[0]))) return { error: 'Selecione instruções completas ou uma única expressão.' };
 if (!statement && !expression) return { error: 'Selecione instruções completas ou uma única expressão.' };
 const inside = m.items.filter(i => i.start >= selStart && i.end <= selEnd);
 const words = inside.filter(i => i.type === 'name').map(i => i.value.toLowerCase());
 for (const bad of ['yield', 'global', 'goto', 'compact', 'extract', 'get_defined_vars', 'func_get_args', 'func_get_arg']) if (words.includes(bad)) return { error: `A seleção usa "${bad}"; a extração mudaria o comportamento.` };
 if (inside.some((i, k) => i.value === '$' && inside[k + 1]?.type === 'var') || /\$\$/.test(selected)) return { error: 'Variáveis variáveis ($$x) impedem a extração segura.' };
 if (words.some(w => w === 'break' || w === 'continue') && !words.some(w => loops.test(w) || w === 'switch')) return { error: 'break/continue saem da seleção; não é possível extrair.' };
 const returnsAt = inside.filter(i => i.type === 'name' && i.value.toLowerCase() === 'return' && !m.functions.some(f => f !== fn && f.bodyStart < i.start && i.start < f.bodyEnd));
 let returnMode = false;
 if (returnsAt.length) {
  const last = returnsAt.at(-1)!; const tail = code.slice(last.start, selEnd);
  if (returnsAt.length > 1 || !/^return\b[^;]*;\s*$/.test(tail) || !statement) return { error: 'A seleção contém return no meio do fluxo; extraia apenas instruções sem retorno antecipado.' };
  returnMode = true;
 }
 const usesThis = inside.some(i => i.type === 'var' && i.value === 'this');
 if (usesThis && fn.isStatic) return { error: '$this em método estático.' };
 // Fluxo de dados: entradas (definidas antes e lidas na seleção) e saídas (escritas na seleção e usadas depois).
 const loop = m.items.filter(i => i.type === 'name' && loops.test(i.value) && i.start > fn.bodyStart && i.start < selStart).map(i => { const k = m.items.indexOf(i); let j = k + 1; if (m.items[j]?.value === '(') j = matching(m.items, j) + 1; const body = m.items[j]?.value === '{' ? matching(m.items, j) : -1; return body >= 0 ? { start: i.start, end: m.items[body].end } : undefined; }).filter((r): r is { start: number; end: number } => !!r && r.end >= selEnd).sort((a, b) => b.start - a.start)[0];
 const all = vars(m.items, fn.bodyStart, fn.bodyEnd); const params = fn.params.map(p => p.name);
 const inSel = vars(m.items, selStart, selEnd); const names = [...new Set(inSel.map(v => v.value))];
 const definedBefore = (n: string) => params.includes(n) || all.some(v => v.value === n && v.end <= selStart);
 const usedAfter = (n: string) => all.some(v => v.value === n && (v.start >= selEnd || (loop && v.start >= loop.start && v.start < selStart)));
 const writtenIn = (n: string) => inSel.some(v => v.value === n && writes(m.items, code, v));
 const readFirst = (n: string) => { const first = inSel.find(v => v.value === n)!; return !writes(m.items, code, first) || m.items[m.items.indexOf(first) + 1]?.value !== '='; };
 const inputs = names.filter(n => definedBefore(n) && (readFirst(n) || usedAfter(n)));
 const outputs = expression || returnMode ? [] : names.filter(n => writtenIn(n) && usedAfter(n));
 if (returnMode && names.some(n => writtenIn(n) && usedAfter(n))) return { error: 'A seleção retorna e também altera variáveis usadas depois.' };
 // Conflito de nome no escopo da classe/arquivo.
 const siblings = m.functions.filter(f => f.isMethod === fn.isMethod && (!fn.isMethod || f.classStart === fn.classStart));
 if (siblings.some(f => f.name.toLowerCase() === name.toLowerCase())) return { error: `Já existe ${fn.isMethod ? 'um método' : 'uma função'} ${name} neste escopo.` };
 const typed = (n: string) => { const p = fn.params.find(p => p.name === n); return p?.type ? `${p.type} $${n}` : `$${n}`; };
 const methodIndent = indentAt(text, fn.start);
 const firstLine = lineStart(text, selStart); const lines = text.slice(firstLine, selEnd).split('\n');
 const baseIndent = statement ? Math.min(...lines.filter(l => l.trim()).map(l => /^[ \t]*/.exec(l)![0].length)) : 0;
 const firstBody = /\n([ \t]*)\S/.exec(text.slice(fn.bodyStart, fn.bodyEnd)); const unit = firstBody && firstBody[1].length > methodIndent.length && firstBody[1].startsWith(methodIndent) ? firstBody[1].slice(methodIndent.length) : '    ';
 const bodyIndent = methodIndent + unit;
 const body = statement ? lines.map((l, k) => k === 0 ? bodyIndent + text.slice(selStart, firstLine + l.length).trimStart() : l.trim() ? bodyIndent + l.slice(baseIndent) : '').join('\n') : `${bodyIndent}return ${text.slice(selStart, selEnd)};`;
 const result = outputs.length === 1 ? `\n${bodyIndent}return $${outputs[0]};` : outputs.length > 1 ? `\n${bodyIndent}return [${outputs.map(o => '$' + o).join(', ')}];` : '';
 const signature = `${fn.isMethod ? `private ${fn.isStatic ? 'static ' : ''}` : ''}function ${name}(${inputs.map(typed).join(', ')})`;
 const declaration = `\n\n${methodIndent}${signature}\n${methodIndent}{\n${body}${result}\n${methodIndent}}`;
 const callee = fn.isMethod ? (fn.isStatic ? `self::${name}` : `$this->${name}`) : name;
 const call = `${callee}(${inputs.map(n => '$' + n).join(', ')})`;
 const replacement = expression ? call : returnMode ? `return ${call};` : outputs.length === 1 ? `$${outputs[0]} = ${call};` : outputs.length > 1 ? `[${outputs.map(o => '$' + o).join(', ')}] = ${call};` : `${call};`;
 const edits: Edit[] = [{ start: selStart, end: selEnd, text: replacement }, { start: fn.bodyEnd + 1, end: fn.bodyEnd + 1, text: declaration }];
 const warnings: string[] = [];
 if (!fn.isMethod && !fn.name) warnings.push('Função gerada no escopo do arquivo.');
 return { plan: { title: `Extrair método ${name}`, changes: [change(path, text, edits)], warnings, conflicts: [] }, params: inputs, returns: outputs };
}

/** Extract Variable: expressão selecionada vira `$nome = …;` antes da instrução. */
export function extractVariable(path: string, text: string, selStart: number, selEnd: number, name: string, all = false): ExtractResult & { occurrences?: number } {
 name = name.replace(/^\$/, '');
 if (!isIdentifier(name) || name === 'this') return { error: `"$${name}" não é um nome de variável válido.` };
 [selStart, selEnd] = trimRange(text, selStart, selEnd);
 const code = codeOnly(text); const expr = code.slice(selStart, selEnd);
 if (!expr.trim() || expr.includes(';') || !balanced(expr) || /^[=,)\]}]|[=,([{]$/.test(expr.trim())) return { error: 'Selecione uma expressão completa.' };
 const m = model(text); const fn = enclosing(m, selStart, selEnd);
 if (!fn) return { error: 'A expressão precisa estar dentro de um método ou função.' };
 if (fn.bodyEnd - fn.bodyStart <= 2 && code[fn.bodyStart] !== '{') return { error: 'Arrow functions ainda não são suportadas.' };
 if (m.items.some(i => i.start < selStart && selStart < i.end || i.start < selEnd && selEnd < i.end)) return { error: 'A seleção corta um nome, variável ou string.' };
 // Início da instrução: último ; { } em profundidade zero antes da seleção.
 let depth = 0; let at = selStart - 1;
 for (; at > fn.bodyStart; at--) { const c = code[at]; if (c === ')' || c === ']') depth++; else if (c === '(' || c === '[') { if (depth === 0) continue; depth--; } else if (depth === 0 && (c === ';' || c === '{' || c === '}')) break; }
 let start = at + 1; while (/\s/.test(text[start])) start++;
 const head = code.slice(start, selStart);
 if (/^(elseif|else|catch|finally|case|default)\b/i.test(head)) return { error: 'A expressão está numa condição encadeada (elseif/catch/case); extraia de outra posição.' };
 const warnings: string[] = [];
 if (/^(while|for|do)\b/i.test(head)) return { error: 'Extrair a condição de um laço mudaria quantas vezes ela é avaliada.' };
 if (/(&&|\|\||\?\?|\?|:)\s*$/.test(head) || /\b(and|or)\s*$/i.test(head)) warnings.push('A expressão passa a ser avaliada antes do operador condicional/curto-circuito.');
 if (vars(m.items, fn.bodyStart, fn.bodyEnd).some(v => v.value === name) || fn.params.some(p => p.name === name)) warnings.push(`$${name} já é usada neste método; o valor anterior será sobrescrito.`);
 const source = text.slice(selStart, selEnd); const indent = indentAt(text, start);
 const edits: Edit[] = [{ start, end: start, text: `$${name} = ${source};\n${indent}` }];
 let occurrences = 1;
 if (all) {
  const normalized = source.replace(/\s+/g, ' '); const comments = segments(text).filter(c => c.kind === 'comment');
  for (let i = start; i < fn.bodyEnd; i++) {
   if (i === selStart) { edits.push({ start: selStart, end: selEnd, text: `$${name}` }); i = selEnd - 1; continue; }
   if (text[i] !== source[0]) continue;
   let end = i + source.length; if (text.slice(i, end).replace(/\s+/g, ' ') !== normalized) continue;
   if (/[\w$\\]/.test(text[i - 1] ?? '') || /\w/.test(text[end] ?? '') || comments.some(c => c.start <= i && i < c.end) || m.items.some(t => (t.start < i && i < t.end) || (t.start < end && end < t.end))) continue;
   edits.push({ start: i, end, text: `$${name}` }); occurrences++; i = end - 1;
  }
 } else edits.push({ start: selStart, end: selEnd, text: `$${name}` });
 return { plan: { title: `Extrair variável $${name}`, changes: [change(path, text, edits)], warnings, conflicts: [] }, occurrences };
}

const simpleExpr = (e: string) => /^(\$\w+|\d[\d_.]*|'(?:[^'\\]|\\.)*'|"(?:[^"\\]|\\.)*"|true|false|null|[\w\\]+::\w+|\$\w+(->\w+|\[[^\]]*\])+)$/i.test(e.trim()) || /^[\w\\$>:-]*\([^;]*\)$/.test(e.trim()) && balanced(e) && !/^\(/.test(e.trim()) && (() => { let depth = 0; for (const c of e.trim()) { if (c === '(') depth++; else if (c === ')') depth--; else if (depth === 0 && /[+\-*/.%<>=!&|?:]/.test(c) && c !== '-' && c !== '>' && c !== ':') return false; } return true; })();
/** Inline Variable: `$x = expr;` com uma única atribuição; leituras recebem a expressão. */
export function inlineVariable(path: string, text: string, offset: number): ExtractResult & { name?: string; uses?: number } {
 const m = model(text); const code = codeOnly(text); const at = m.items.find(i => i.type === 'var' && i.start <= offset && offset <= i.end);
 if (!at || at.value === 'this') return { error: 'Posicione o cursor numa variável local.' };
 if (m.functions.some(f => f.paramsStart < at.start && at.end <= f.paramsEnd)) return { error: `$${at.value} é parâmetro; não pode ser incorporada.` };
 const fn = enclosing(m, at.start, at.end); if (!fn) return { error: 'A variável precisa estar dentro de um método ou função.' };
 if (fn.params.some(p => p.name === at.value)) return { error: `$${at.value} é parâmetro; não pode ser incorporada.` };
 const occ = vars(m.items, fn.bodyStart, fn.bodyEnd).filter(v => v.value === at.value);
 const assigns = occ.filter(v => writes(m.items, code, v));
 if (assigns.length !== 1) return { error: assigns.length ? `$${at.value} recebe ${assigns.length} atribuições; Inline exige exatamente uma.` : `$${at.value} não tem atribuição neste método.` };
 const def = assigns[0]; const k = m.items.indexOf(def);
 if (m.items[k + 1]?.value !== '=' || !/[;{}]\s*$|^\s*$/.test(code.slice(fn.bodyStart + 1, def.start))) return { error: 'Só atribuições simples em instrução própria ($x = …;) podem ser incorporadas.' };
 let j = k + 2; let depth = 0; for (; j < m.items.length; j++) { const v = m.items[j].value; if ('([{'.includes(v) && m.items[j].type === 'punct') depth++; else if (')]}'.includes(v) && m.items[j].type === 'punct') depth--; else if (v === ';' && depth === 0) break; }
 const semi = m.items[j]; if (!semi) return { error: 'Atribuição sem ";".' };
 const expr = text.slice(m.items[k + 2].start, semi.start).trim(); const reads = occ.filter(v => v !== def);
 if (reads.some(r => r.start < def.start)) return { error: `$${at.value} é lida antes da atribuição.` };
 if (m.functions.some(f => f !== fn && f.bodyStart > def.start && reads.some(r => r.start > f.bodyStart && r.start < f.bodyEnd))) return { error: 'A variável é usada dentro de uma closure; Inline não suportado.' };
 const exprVars = new Set(vars(m.items, m.items[k + 2].start, semi.start).map(v => v.value));
 const lastRead = reads.at(-1)?.start ?? semi.end;
 if (vars(m.items, semi.end, lastRead).some(v => exprVars.has(v.value) && writes(m.items, code, v))) return { error: 'Variáveis usadas na expressão mudam antes do uso; Inline alteraria o resultado.' };
 const warnings: string[] = [];
 if (/\(|\bnew\b|\+\+|--/.test(codeOnly(expr)) && reads.length > 1) warnings.push(`A expressão tem chamadas e passa a ser avaliada ${reads.length} vezes.`);
 if (!reads.length) warnings.push(`$${at.value} não é lida; a atribuição será removida.`);
 const value = simpleExpr(expr) ? expr : `(${expr})`;
 const ls = lineStart(text, def.start); const nl = text.indexOf('\n', semi.end); const lineEnd = nl < 0 ? text.length : nl + 1;
 const whole = text.slice(ls, def.start).trim() === '' && text.slice(semi.end, lineEnd).trim() === '';
 const edits: Edit[] = [whole ? { start: ls, end: lineEnd, text: '' } : { start: def.start, end: semi.end, text: '' }, ...reads.map(r => ({ start: r.start, end: r.end, text: value }))];
 return { plan: { title: `Incorporar $${at.value}`, changes: [change(path, text, edits)], warnings, conflicts: [] }, name: at.value, uses: reads.length };
}

// ── Inspeções próprias e supressão ───────────────────────────────────────────────────────────
export type Problem = { id: string; message: string; start: number; end: number; severity: 'error' | 'warning' | 'weak'; fixes: { title: string; edits: Edit[] }[]; source: 'php-ide' | 'phpactor'; code?: string };
/** Tipo de um literal simples, ou undefined quando a expressão não é literal. */
export function literalType(expr: string): string | undefined {
 const e = expr.trim();
 if (/^-?\d[\d_]*$/.test(e) || /^0[xXbBoO][\da-fA-F_]+$/.test(e)) return 'int';
 if (/^-?(\d[\d_]*)?\.\d[\d_]*([eE][-+]?\d+)?$|^-?\d[\d_]*[eE][-+]?\d+$|^-?\d+\.$/.test(e)) return 'float';
 if (/^'(?:[^'\\]|\\.)*'$|^"(?:[^"\\$]|\\.)*"$/s.test(e)) return 'string';
 if (/^(true|false)$/i.test(e)) return 'bool';
 if (/^null$/i.test(e)) return 'null';
 if (/^\[[\s\S]*\]$/.test(e) && balanced(codeOnly('<?php ' + e).slice(6)) && (() => { let d = 0; for (let i = 0; i < e.length; i++) { if (e[i] === '[') d++; else if (e[i] === ']') { d--; if (d === 0 && i < e.length - 1) return false; } } return true; })()) return 'array';
 return undefined;
}
/** Aceita o literal `found` no tipo declarado (modo coercivo do PHP não é considerado: inspeção estrita). */
export function accepts(declared: string, found: string): boolean {
 const parts = declared.replace(/^\?/, 'null|').split('|').map(p => p.trim().replace(/^\\/, '').toLowerCase()).filter(Boolean);
 if (parts.some(p => p === 'mixed')) return true;
 for (const p of parts) {
  if (p === found) return true;
  if (p === 'float' && found === 'int') return true;
  if (p === 'bool' && found === 'bool') return true;
  if ((p === 'false' || p === 'true') && found === 'bool') return true;
  if (p === 'iterable' && found === 'array') return true;
  if (p.includes('&') || p.includes('(')) return true;
 }
 // Tipos de classe não aceitam escalares; nada a inferir sobre outros valores.
 return false;
}
export function inspect(text: string): Problem[] {
 const m = model(text); const out: Problem[] = []; const code = codeOnly(text);
 for (const fn of m.functions) {
  if (!fn.returnType || fn.bodyStart < 0 || code[fn.bodyStart] !== '{') continue;
  const declared = fn.returnType.text.trim();
  const nested = m.functions.filter(f => f !== fn && f.bodyStart > fn.bodyStart && f.bodyEnd < fn.bodyEnd);
  for (const r of m.items.filter(i => i.type === 'name' && i.value.toLowerCase() === 'return' && i.start > fn.bodyStart && i.start < fn.bodyEnd && !nested.some(f => f.start < i.start && i.start < (f.bodyEnd < 0 ? f.paramsEnd : f.bodyEnd + 1)))) {
   const semi = code.indexOf(';', r.end); if (semi < 0) continue;
   const expr = text.slice(r.end, semi).trim(); const exprStart = semi - text.slice(r.end, semi).trimStart().length;
   if (declared.toLowerCase() === 'void') { if (expr) out.push({ id: 'PhpVoidFunctionResultUsedInspection', message: `Função void não pode retornar valor.`, start: exprStart, end: semi, severity: 'error', source: 'php-ide', fixes: [{ title: 'Remover tipo de retorno void', edits: removeReturnType(text, fn) }] }); continue; }
   if (!expr) { if (declared.toLowerCase() !== 'never') out.push({ id: 'PhpMissingReturnValueInspection', message: `Retorno sem valor em função que declara ${declared}.`, start: r.start, end: r.end, severity: 'error', source: 'php-ide', fixes: [] }); continue; }
   const found = literalType(expr); if (!found || accepts(declared, found)) continue;
   const next = found === 'null' ? (declared.startsWith('?') || declared.includes('|') ? `${declared}|null` : `?${declared}`) : found;
   out.push({ id: 'PhpIncompatibleReturnTypeInspection', message: `Tipo de retorno incompatível: esperado ${declared}, encontrado ${found}.`, start: exprStart, end: semi, severity: 'warning', source: 'php-ide', fixes: [{ title: `Alterar tipo de retorno para ${next}`, edits: [{ start: fn.returnType.start, end: fn.returnType.end, text: next }] }] });
  }
 }
 // Argumentos literais para funções/métodos declarados neste arquivo com parâmetros escalares tipados.
 const byName = new Map<string, FunctionInfo>(); for (const fn of m.functions) if (fn.name && !byName.has(fn.name.toLowerCase())) byName.set(fn.name.toLowerCase(), fn);
 for (let k = 0; k < m.items.length; k++) {
  const it = m.items[k]; if (it.type !== 'name' || m.items[k + 1]?.value !== '(') continue;
  const prev = m.items[k - 1]; const low = it.value.toLowerCase();
  if (prev?.value.toLowerCase() === 'function' || prev?.value.toLowerCase() === 'new') continue;
  const fn = byName.get(low); if (!fn || fn.isClosure) continue;
  const viaThis = prev?.value === '->' && m.items[k - 2]?.type === 'var' && m.items[k - 2].value === 'this'; const viaSelf = prev?.value === '::' && /^(self|static)$/i.test(m.items[k - 2]?.value ?? ''); const plain = !prev || (prev.value !== '->' && prev.value !== '::');
  if (fn.isMethod ? !(viaThis || viaSelf) || !m.functions.some(f => f.classStart === fn.classStart && f.bodyStart < it.start && it.start < f.bodyEnd) : !plain) continue;
  const close = matching(m.items, k + 1); let argStart = k + 2; let depth = 0; let index = 0;
  for (let j = k + 2; j <= close; j++) {
   const v = m.items[j].value; if (m.items[j].type === 'punct' && '([{'.includes(v)) depth++; else if (m.items[j].type === 'punct' && ')]}'.includes(v) && j !== close) depth--;
   if ((j === close || (v === ',' && depth === 0)) && j > argStart) {
    const named = m.items[argStart].type === 'name' && m.items[argStart + 1]?.value === ':' && m.items[argStart + 2]?.value !== ':';
    if (m.items[argStart].value === '.' ) break;
    const s = m.items[named ? argStart + 2 : argStart].start; const e = m.items[j - 1].end; const expr = text.slice(s, e); const p = named ? fn.params.find(p => p.name === m.items[argStart].value) : fn.params[index];
    if (p?.type) {
     const found = literalType(expr); if (found && !accepts(p.type, found)) out.push({ id: 'PhpParamsInspection', message: `Argumento incompatível para $${p.name}: esperado ${p.type}, encontrado ${found}.`, start: s, end: e, severity: 'warning', source: 'php-ide', fixes: [] });
    }
    index++; argStart = j + 1;
   }
  }
 }
 return out;
}
function removeReturnType(text: string, fn: FunctionInfo): Edit[] { if (!fn.returnType) return []; const colon = text.lastIndexOf(':', fn.returnType.start); return [{ start: colon, end: fn.returnType.end, text: '' }]; }

/** `@noinspection Id` (ou ALL) no comentário imediatamente anterior à instrução, ou logo após `<?php` (arquivo). */
export function suppressed(text: string, offset: number, id: string): boolean {
 const comments = segments(text).filter(c => c.kind === 'comment');
 const has = (c: { start: number; end: number }) => new RegExp(`@noinspection\\b[^\\n]*?\\b(?:${id}|ALL)\\b`).test(text.slice(c.start, c.end));
 const tag = /^\s*<\?php\s*/.exec(text);
 if (tag && comments.some(c => c.start === tag[0].length && has(c))) return true;
 const s = statementStart(text, offset);
 return comments.some(c => c.end <= s && has(c) && !text.slice(c.end, s).trim());
}
function statementStart(text: string, offset: number) { const code = codeOnly(text); let at = offset - 1; let depth = 0; for (; at >= 0; at--) { const c = code[at]; if (c === ')' || c === ']') depth++; else if (c === '(' || c === '[') { if (depth) depth--; } else if (depth === 0 && (c === ';' || c === '{' || c === '}')) break; } let s = at + 1; while (s < offset && /\s/.test(code[s])) s++; return s; }
/** Insere `/** @noinspection Id *\/` na linha anterior à instrução. */
export function suppressEdit(text: string, offset: number, id: string, scope: 'statement' | 'file'): Edit {
 if (scope === 'file') { const tag = text.indexOf('<?php'); const at = tag < 0 ? 0 : tag + 5; return { start: at, end: at, text: `\n/** @noinspection ${id} */` }; }
 const s = statementStart(text, offset); const ls = lineStart(text, s); const indent = indentAt(text, s);
 return { start: ls, end: ls, text: `${indent}/** @noinspection ${id} */\n` };
}
/** Identificador de inspeção para diagnósticos do Phpactor (nomes públicos de inspeção usados em `@noinspection`). */
export function inspectionId(code: string | undefined): string {
 const map: Record<string, string> = { 'worse.unresolved_name': 'PhpUndefinedClassInspection', 'worse.undefined_variable': 'PhpUndefinedVariableInspection', 'worse.missing_method': 'PhpUndefinedMethodInspection', 'worse.missing_member': 'PhpUndefinedFieldInspection', 'worse.unused_import': 'PhpUnused', 'worse.deprecated_member': 'PhpDeprecationInspection' };
 return map[code ?? ''] ?? `Phpactor.${code ?? 'diagnostic'}`;
}
