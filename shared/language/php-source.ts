// Análise léxica mínima de PHP: separa código, strings, comentários e HTML.
// Não é um parser completo; serve para localizar literais e declarações sem
// depender do servidor de linguagem.
export type Segment = { kind: 'code' | 'string' | 'comment' | 'html'; start: number; end: number; quote?: string };
export type Declaration = { name: string; namespace: string; fqn: string; kind: 'class' | 'interface' | 'trait' | 'enum'; offset: number };
export type Literal = { value: string; start: number; end: number; quote: string; closed?: boolean };

const word = /[A-Za-z_\x80-\uffff][A-Za-z0-9_\x80-\uffff]*/y;
const isWord = (value: string | undefined) => !!value && /^[A-Za-z_\x80-\uffff][A-Za-z0-9_\x80-\uffff]*$/.test(value);

/** `inCode` trata o início do texto como PHP (regiões de Blade já isoladas). */
export function segments(text: string, inCode = false): Segment[] {
 const out: Segment[] = [];
 let i = 0; let start = inCode;
 const push = (kind: Segment['kind'], start: number, end: number, quote?: string) => { if (end > start) out.push({ kind, start, end, ...(quote ? { quote } : {}) }); };
 while (i < text.length) {
  let code = i;
  if (!start) {
   const open = text.indexOf('<?', i);
   if (open < 0) { push('html', i, text.length); break; }
   push('html', i, open);
   i = text.startsWith('<?php', open) ? open + 5 : text.startsWith('<?=', open) ? open + 3 : open + 2;
   code = open;
  }
  start = false;
  while (i < text.length) {
   const c = text[i];
   if (c === '?' && text[i + 1] === '>') { i += 2; break; }
   if ((c === '/' && text[i + 1] === '/') || (c === '#' && text[i + 1] !== '[')) {
    push('code', code, i); const start = i;
    while (i < text.length && text[i] !== '\n' && !(text[i] === '?' && text[i + 1] === '>')) i++;
    push('comment', start, i); code = i; continue;
   }
   if (c === '/' && text[i + 1] === '*') {
    push('code', code, i); const end = text.indexOf('*/', i + 2); const stop = end < 0 ? text.length : end + 2;
    push('comment', i, stop); i = code = stop; continue;
   }
   if (c === "'" || c === '"' || c === '`') {
    push('code', code, i); const start = i; i++;
    while (i < text.length && text[i] !== c) i += text[i] === '\\' ? 2 : 1;
    i = Math.min(i + 1, text.length); push('string', start, i, c); code = i; continue;
   }
   if (c === '<' && text.startsWith('<<<', i)) {
    const m = /^<<<[ \t]*(['"]?)([A-Za-z_][A-Za-z0-9_]*)\1\r?\n/.exec(text.slice(i, i + 200));
    if (m) {
     push('code', code, i); const start = i;
     const close = new RegExp(`\\n[ \\t]*${m[2]}\\b`, 'g'); close.lastIndex = i + m[0].length - 1;
     const found = close.exec(text); i = found ? found.index + found[0].length : text.length;
     push('string', start, i, '<<<'); code = i; continue;
    }
   }
   i++;
  }
  push('code', code, i);
 }
 return out;
}

/** Literal simples ('…' ou "…") que contém o offset, com valor sem aspas. */
/** Offset exatamente após a abertura conta como dentro: permite completion em `''`. */
export function literalAt(text: string, offset: number, inCode = false): Literal | null {
 for (const s of segments(text, inCode)) {
  if (s.kind !== 'string' || offset <= s.start || offset > s.end) continue;
  if (s.quote !== "'" && s.quote !== '"') return null;
  const closed = s.end - s.start >= 2 && text[s.end - 1] === s.quote;
  if (offset === s.end && closed) continue;
  const raw = text.slice(s.start + 1, closed ? s.end - 1 : s.end);
  if (s.quote === '"' && /\$[A-Za-z_{]|\{\$/.test(raw)) return null; // interpolação não é referência estática
  return { value: decode(raw, s.quote), start: s.start, end: s.end, quote: s.quote, closed };
 }
 return null;
}

export const decode = (raw: string, quote: string) => quote === "'" ? raw.replace(/\\(['\\])/g, '$1') : raw.replace(/\\\\/g, '\\');

/** Mantém só as regiões PHP de um template Blade ({{ }}, {!! !!}, @diretiva(...), @php…@endphp); o resto vira espaço. */
export function bladeCode(text: string) {
 const chars: string[] = text.split('').map(c => c === '\n' ? c : ' ');
 const keep = (from: number, to: number) => { for (let i = from; i < to; i++) chars[i] = text[i]; };
 for (const m of text.matchAll(/\{\{--[\s\S]*?--\}\}|\{!!([\s\S]*?)!!\}|\{\{([\s\S]*?)\}\}|@php\b([\s\S]*?)@endphp/g)) {
  if (m[0].startsWith('{{--')) continue;
  const inner = m[1] ?? m[2] ?? m[3] ?? ''; const at = m.index! + m[0].indexOf(inner, m[0].startsWith('@php') ? 4 : 2); keep(at, at + inner.length);
 }
 for (const m of text.matchAll(/@[A-Za-z_]\w*\s*\(/g)) {
  let depth = 0; let i = m.index! + m[0].length - 1;
  for (; i < text.length; i++) { if (text[i] === '(') depth++; else if (text[i] === ')' && --depth === 0) break; }
  keep(m.index!, Math.min(i + 1, text.length)); // inclui `@diretiva(` para identificar a chamada
 }
 return chars.join('');
}

/** Texto de código com strings e comentários substituídos por espaços (offsets preservados). */
export function codeOnly(text: string, inCode = false) {
 const chars = text.split('');
 for (const s of segments(text, inCode)) if (s.kind !== 'code') for (let i = s.start; i < s.end; i++) if (chars[i] !== '\n') chars[i] = ' ';
 return chars.join('');
}

type Token = { value: string; offset: number };
function tokens(code: string): Token[] {
 const out: Token[] = [];
 for (let i = 0; i < code.length;) {
  const c = code[i];
  if (/\s/.test(c)) { i++; continue; }
  word.lastIndex = i; const w = word.exec(code);
  if (w) { out.push({ value: w[0], offset: i }); i += w[0].length; continue; }
  const two = code.slice(i, i + 2);
  if (two === '::' || two === '->' || two === '=>') { out.push({ value: two, offset: i }); i += 2; continue; }
  out.push({ value: c, offset: i }); i++;
 }
 return out;
}

export type PhpToken = { type: 'word' | 'string' | 'number' | 'punct'; value: string; offset: number };
/** Tokens de código e strings simples (valores decodificados), sem comentários nem HTML. */
export function phpTokens(text: string, inCode = false): PhpToken[] {
 const out: PhpToken[] = [];
 for (const s of segments(text, inCode)) {
  if (s.kind === 'string') { if (s.quote === "'" || s.quote === '"') out.push({ type: 'string', value: decode(text.slice(s.start + 1, s.end - 1), s.quote), offset: s.start }); continue; }
  if (s.kind !== 'code') continue;
  const piece = text.slice(s.start, s.end);
  for (const t of tokens(piece)) {
   const offset = s.start + t.offset;
   if (/^\d/.test(t.value)) { const n = /^\d[\d_.]*/.exec(piece.slice(t.offset))![0]; out.push({ type: 'number', value: n, offset }); continue; }
   if (out.at(-1)?.type === 'number' && out.at(-1)!.offset + out.at(-1)!.value.length > offset) continue;
   out.push({ type: isWord(t.value) ? 'word' : 'punct', value: t.value, offset });
  }
 }
 return out;
}

export type FileContext = { declarations: Declaration[]; namespaces: { name: string; offset: number }[]; imports: { alias: string; fqn: string; offset: number; end: number }[] };

/** Declarações, namespaces e imports de classe do arquivo. */
export function analyze(text: string): FileContext {
 const t = tokens(codeOnly(text));
 const declarations: Declaration[] = []; const namespaces: FileContext['namespaces'] = []; const imports: FileContext['imports'] = [];
 let namespace = ''; let depth = 0; let namespaceDepth = 0;
 const name = (from: number) => { let s = ''; let j = from; while (j < t.length && (t[j].value === '\\' || (isWord(t[j].value) && (s === '' || s.endsWith('\\'))))) { s += t[j].value; j++; } return { s, j }; };
 for (let k = 0; k < t.length; k++) {
  const v = t[k].value; const prev = t[k - 1]?.value; const low = v.toLowerCase();
  if (v === '{') depth++;
  else if (v === '}') depth = Math.max(0, depth - 1);
  else if (low === 'namespace' && prev !== '\\' && prev !== '::' && prev !== '->' && depth === 0) {
   const { s, j } = name(k + 1);
   if (t[j]?.value === ';' || t[j]?.value === '{') { namespace = s.replace(/^\\/, ''); namespaceDepth = t[j].value === '{' ? 1 : 0; namespaces.push({ name: namespace, offset: t[k].offset }); }
  } else if (low === 'use' && depth === namespaceDepth && prev !== '->' && prev !== '::') {
   let j = k + 1; if (/^(function|const)$/i.test(t[j]?.value ?? '')) continue;
   const start = t[k].offset; const { s: base, j: after } = name(j); j = after;
   const add = (fqn: string, alias?: string) => { fqn = fqn.replace(/^\\/, ''); imports.push({ alias: alias ?? fqn.split('\\').pop()!, fqn, offset: start, end: 0 }); };
   if (t[j]?.value === '{') {
    j++;
    while (j < t.length && t[j].value !== '}') {
     const { s, j: n } = name(j); j = n; let alias;
     if (t[j]?.value.toLowerCase() === 'as') { alias = t[j + 1]?.value; j += 2; }
     if (s) add(base.replace(/\\$/, '') + '\\' + s, alias);
     if (t[j]?.value === ',') j++; else if (t[j]?.value !== '}') break;
    }
    j++;
   } else {
    let current = base; let alias: string | undefined;
    while (j < t.length) {
     if (t[j].value.toLowerCase() === 'as') { alias = t[j + 1]?.value; j += 2; continue; }
     if (t[j].value === ',') { add(current, alias); alias = undefined; const n = name(j + 1); current = n.s; j = n.j; continue; }
     break;
    }
    if (current) add(current, alias);
   }
   const end = t[j]?.value === ';' ? t[j].offset + 1 : t[j]?.offset ?? text.length;
   for (const i of imports) if (i.offset === start) i.end = end;
  } else if (/^(class|interface|trait|enum)$/.test(low) && prev !== '::' && prev !== '->' && prev?.toLowerCase() !== 'new') {
   const id = t[k + 1];
   if (!isWord(id?.value) || /^(extends|implements)$/i.test(id.value)) continue;
   if (low === 'enum' && !/^[{:]$|^implements$/i.test(t[k + 2]?.value ?? '')) continue;
   declarations.push({ name: id.value, namespace, fqn: namespace ? `${namespace}\\${id.value}` : id.value, kind: low as Declaration['kind'], offset: id.offset });
  }
 }
 return { declarations, namespaces, imports };
}

export function namespaceAt(context: FileContext, offset: number) {
 let current = ''; for (const n of context.namespaces) if (n.offset <= offset) current = n.name; return current;
}

export function position(text: string, offset: number) {
 const before = text.slice(0, offset); const line = before.split('\n').length - 1;
 return { line, character: offset - (before.lastIndexOf('\n') + 1) };
}

export function offsetOf(text: string, p: { line: number; character: number }) {
 let offset = 0;
 for (let l = 0; l < p.line; l++) { const n = text.indexOf('\n', offset); if (n < 0) return text.length; offset = n + 1; }
 return Math.min(offset + p.character, text.length);
}

/** Alias explícito de import (`use A\B as C`) com o offset do nome `C`. */
export type ImportAlias = { alias: string; fqn: string; offset: number; importStart: number; importEnd: number };
export function importAliases(text: string, context = analyze(text)): ImportAlias[] {
 const code = codeOnly(text); const out: ImportAlias[] = [];
 for (const i of context.imports) {
  if (i.alias.toLowerCase() === i.fqn.split('\\').pop()!.toLowerCase()) continue;
  const re = new RegExp(`\\bas\\s+(${i.alias})\\b`, 'gi'); re.lastIndex = i.offset;
  for (let m = re.exec(code); m && m.index < i.end; m = re.exec(code)) { const offset = m.index + m[0].length - m[1].length; if (!out.some(a => a.offset === offset)) { out.push({ alias: i.alias, fqn: i.fqn, offset, importStart: i.offset, importEnd: i.end }); break; } }
 }
 return out;
}
/** Usos de um alias como nome de classe no arquivo (fora dos imports): `new C`, `C::x`, tipos. */
export function aliasUsages(text: string, alias: ImportAlias, context = analyze(text)): number[] {
 const t = tokens(codeOnly(text)); const low = alias.alias.toLowerCase();
 return t.filter((tok, k) => tok.value.toLowerCase() === low && !['->', '::', '\\', '$', 'function', 'const'].includes(t[k - 1]?.value ?? '') && !context.imports.some(i => tok.offset >= i.offset && tok.offset < i.end)).map(tok => tok.offset);
}
/** Alias no cursor: na própria declaração do import (`declaration`) ou num uso como nome de classe. */
export function aliasAt(text: string, offset: number): { alias: ImportAlias; declaration: boolean } | undefined {
 const context = analyze(text);
 for (const alias of importAliases(text, context)) {
  if (offset >= alias.offset && offset <= alias.offset + alias.alias.length) return { alias, declaration: true };
  if (aliasUsages(text, alias, context).some(o => offset >= o && offset <= o + alias.alias.length)) return { alias, declaration: false };
 }
 return undefined;
}
