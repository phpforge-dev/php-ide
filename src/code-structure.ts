// Code structure for breadcrumbs (UI-BREADCRUMBS-001): namespaces, classes, functions and methods of a PHP file,
// headings of a Markdown file, classes/functions/methods of JavaScript and TypeScript, key paths of JSON and YAML
// and the element path of HTML. Small scanners of our own (comments, strings, heredocs and `?>` skipped, braces
// matched); they do not resolve types and tolerate incomplete code while typing. No DOM: tested in Node.

export type SymbolKind = 'namespace' | 'module' | 'class' | 'interface' | 'trait' | 'enum' | 'function' | 'method' | 'heading' | 'key' | 'tag';
export type CodeSymbol = {
 name: string; kind: SymbolKind;
 /** Declaration start (first modifier on the line), name offset and end of the body (inclusive), in UTF-16 offsets. */
 start: number; nameStart: number; end: number;
 children: CodeSymbol[];
};

const classLike = new Set(['class', 'interface', 'trait', 'enum']);
const isIdentStart = (c: string) => /[A-Za-z_\x80-￿]/.test(c);
const isIdent = (c: string) => /[\w\x80-￿]/.test(c);

export function phpStructure(text: string): CodeSymbol[] {
 const roots: CodeSymbol[] = [];
 // One entry per open brace: the symbol whose body it opened, 'anonymous' for `new class {`, null otherwise.
 const stack: (CodeSymbol | 'anonymous' | null)[] = [];
 let anonymous = false;
 let namespace: CodeSymbol | undefined; let namespaceBraced = false;
 let pending: CodeSymbol | undefined; // declaration waiting for its body `{` (or `;` for abstract methods)
 let previous = ''; // previous significant token, to skip `::class`, `->function`, `new class`
 const owner = () => { for (let i = stack.length - 1; i >= 0; i--) { const entry = stack[i]; if (entry && entry !== 'anonymous') return entry; } return namespace; };
 const inClass = () => { for (let i = stack.length - 1; i >= 0; i--) { const entry = stack[i]; if (entry === 'anonymous') return true; if (entry) return classLike.has(entry.kind); } return false; };
 const add = (symbol: CodeSymbol) => { const parent = owner(); (parent ? parent.children : roots).push(symbol); };
 // Declaration start: back over the modifiers on the same line (`final public static function`).
 const lineStart = (at: number) => { let start = at; for (;;) { const from = Math.max(0, start - 40); const before = /\b(?:public|protected|private|static|abstract|final|readonly)[ \t]+$/.exec(text.slice(from, start)); if (!before) return start; start = from + before.index; } };
 let i = text.indexOf('<?'); if (i < 0) return roots;
 i += text.startsWith('<?php', i) ? 5 : text.startsWith('<?=', i) ? 3 : 2;
 const n = text.length;
 while (i < n) {
  const c = text[i];
  if (c === '?' && text[i + 1] === '>') { const next = text.indexOf('<?', i + 2); if (next < 0) break; i = next + (text.startsWith('<?php', next) ? 5 : text.startsWith('<?=', next) ? 3 : 2); continue; }
  if ((c === '/' && text[i + 1] === '/') || (c === '#' && text[i + 1] !== '[')) { while (i < n && text[i] !== '\n' && !(text[i] === '?' && text[i + 1] === '>')) i++; continue; }
  if (c === '/' && text[i + 1] === '*') { const end = text.indexOf('*/', i + 2); i = end < 0 ? n : end + 2; continue; }
  if (c === "'" || c === '"' || c === '`') { i++; while (i < n && text[i] !== c) i += text[i] === '\\' ? 2 : 1; i++; previous = 'string'; continue; }
  if (c === '<' && text.startsWith('<<<', i)) {
   const match = /^<<<[ \t]*(["']?)([A-Za-z_]\w*)\1\r?\n/.exec(text.slice(i, i + 200));
   if (match) { const close = new RegExp(`\\n[ \\t]*${match[2]}\\b`, 'g'); close.lastIndex = i + match[0].length - 1; const found = close.exec(text); i = found ? found.index + found[0].length : n; previous = 'string'; continue; }
  }
  if (isIdentStart(c)) {
   let j = i + 1; while (j < n && isIdent(text[j])) j++;
   const word = text.slice(i, j); const lower = word.toLowerCase();
   const member = previous === '->' || previous === '::' || previous === '?->';
   if (!member && lower === 'namespace' && previous !== '\\') {
    let k = j; while (k < n && /\s/.test(text[k])) k++;
    let e = k; while (e < n && /[\w\\\x80-￿]/.test(text[e])) e++;
    const name = text.slice(k, e);
    if (name && !name.startsWith('\\')) { // `namespace\foo()` is a relative name, not a declaration
     if (namespace && !namespaceBraced) namespace.end = lineStart(i) - 1;
     namespace = { name, kind: 'namespace', start: i, nameStart: k, end: n, children: [] }; roots.push(namespace);
     let s = e; while (s < n && /\s/.test(text[s])) s++;
     namespaceBraced = text[s] === '{';
     if (namespaceBraced) { stack.push(namespace); i = s + 1; previous = '{'; continue; }
     i = e; previous = 'namespace'; continue;
    }
   }
   if (!member && previous !== 'new' && classLike.has(lower)) {
    let k = j; while (k < n && /\s/.test(text[k])) k++;
    let e = k; while (e < n && isIdent(text[e])) e++;
    const name = text.slice(k, e);
    if (name && isIdentStart(name[0]) && !(lower === 'enum' && /^(?:extends|implements)$/i.test(name))) {
     pending = { name, kind: lower as SymbolKind, start: lineStart(i), nameStart: k, end: n, children: [] }; add(pending);
     i = e; previous = 'name'; continue;
    }
   }
   if (!member && lower === 'function') {
    let k = j; while (k < n && /\s/.test(text[k])) k++;
    if (text[k] === '&') { k++; while (k < n && /\s/.test(text[k])) k++; }
    let e = k; while (e < n && isIdent(text[e])) e++;
    const name = text.slice(k, e);
    if (name && isIdentStart(name[0])) {
     pending = { name, kind: inClass() ? 'method' : 'function', start: lineStart(i), nameStart: k, end: n, children: [] }; add(pending);
     i = e; previous = 'name'; continue;
    }
   }
   if (previous === 'new' && lower === 'class') anonymous = true;
   previous = lower; i = j; continue;
  }
  if (c === '{') { stack.push(pending ?? (anonymous ? 'anonymous' : null)); pending = undefined; anonymous = false; previous = '{'; i++; continue; }
  if (c === '}') { const closed = stack.pop(); if (closed && closed !== 'anonymous') { closed.end = i; if (closed === namespace) { namespace = undefined; namespaceBraced = false; } } previous = '}'; i++; continue; }
  if (c === ';') { if (pending && (pending.kind === 'method' || pending.kind === 'function')) { pending.end = i; pending = undefined; } previous = ';'; i++; continue; }
  if (/\s/.test(c)) { i++; continue; }
  const two = text.slice(i, i + 3);
  previous = two === '?->' ? '?->' : two.startsWith('->') ? '->' : two.startsWith('::') ? '::' : c;
  i += previous.length;
 }
 // Unclosed bodies (code being typed) extend to the end of the file; a file-scoped namespace too.
 return roots;
}

export function markdownStructure(text: string): CodeSymbol[] {
 const roots: CodeSymbol[] = []; const open: { level: number; symbol: CodeSymbol }[] = [];
 let offset = 0; let fence = '';
 for (const line of text.split('\n')) {
  const marker = /^\s{0,3}(`{3,}|~{3,})/.exec(line)?.[1];
  if (marker && (!fence || marker[0] === fence[0] && marker.length >= fence.length)) fence = fence ? '' : marker;
  const heading = fence || marker ? null : /^(#{1,6})[ \t]+(.+?)[ \t#]*$/.exec(line);
  if (heading) {
   const level = heading[1].length;
   while (open.length && open.at(-1)!.level >= level) open.pop()!.symbol.end = offset - 1;
   const symbol: CodeSymbol = { name: heading[2], kind: 'heading', start: offset, nameStart: offset + line.indexOf(heading[2]), end: text.length, children: [] };
   (open.length ? open.at(-1)!.symbol.children : roots).push(symbol); open.push({ level, symbol });
  }
  offset += line.length + 1;
 }
 return roots;
}

const JS_KEYWORDS = new Set(['if', 'for', 'while', 'switch', 'catch', 'function', 'return', 'with', 'super', 'typeof', 'new', 'await', 'yield', 'import', 'export', 'else', 'do', 'try', 'finally']);
/** JavaScript/TypeScript: classes, interfaces, enums, namespaces, functions, methods and functions assigned to
 *  variables or class fields (`const f = () => {`, `handler = async () => {`). Callbacks are not declarations. */
export function jsStructure(text: string): CodeSymbol[] {
 const roots: CodeSymbol[] = []; const n = text.length;
 // One entry per open brace: the symbol whose body it opened (null for blocks, object literals, types).
 const stack: { symbol: CodeSymbol | null; classBody: boolean }[] = [];
 let pending: { symbol: CodeSymbol; paren: number; classBody: boolean } | undefined; let paren = 0;
 let previous = ''; // previous significant token: regex literal detection, `.name(` calls, `new class`
 const owner = () => { for (let i = stack.length - 1; i >= 0; i--) if (stack[i].symbol) return stack[i].symbol!; return undefined; };
 const inClassBody = () => !!stack.at(-1)?.classBody && paren === 0;
 const declare = (kind: SymbolKind, name: string, start: number, nameStart: number, classBody = false) => {
  const symbol: CodeSymbol = { name, kind, start, nameStart, end: n, children: [] };
  pending = { symbol, paren, classBody };
 };
 const lineStart = (at: number) => { const before = /(?:\b(?:export|default|declare|abstract|public|private|protected|static|async|readonly|override|get|set)\s+)+$/.exec(text.slice(Math.max(0, at - 80), at)); return before ? at - before[0].length : at; };
 const skipSpace = (k: number) => { while (k < n && /\s/.test(text[k])) k++; return k; };
 let i = 0;
 while (i < n) {
  const c = text[i];
  if (c === '/' && text[i + 1] === '/') { while (i < n && text[i] !== '\n') i++; continue; }
  if (c === '/' && text[i + 1] === '*') { const end = text.indexOf('*/', i + 2); i = end < 0 ? n : end + 2; continue; }
  if (c === "'" || c === '"') { i++; while (i < n && text[i] !== c && text[i] !== '\n') i += text[i] === '\\' ? 2 : 1; i++; previous = 'value'; continue; }
  if (c === '`') { i++; let depth = 0; while (i < n) { if (text[i] === '\\') { i += 2; continue; } if (!depth && text[i] === '`') break; if (text[i] === '$' && text[i + 1] === '{') { depth++; i += 2; continue; } if (depth && text[i] === '}') depth--; i++; } i++; previous = 'value'; continue; }
  if (c === '/' && (!previous || /^[(,=:[!&|?{};+\-*%<>~^]$|^(?:return|typeof|case|in|of|delete|void|throw|new)$/.test(previous))) {
   let k = i + 1, cls = false; while (k < n && text[k] !== '\n') { if (text[k] === '\\') { k += 2; continue; } if (text[k] === '[') cls = true; else if (text[k] === ']') cls = false; else if (text[k] === '/' && !cls) break; k++; }
   if (text[k] === '/') { i = k + 1; while (i < n && /[a-z]/i.test(text[i])) i++; previous = 'value'; continue; }
  }
  if (/[A-Za-z_$\x80-\uffff]/.test(c)) {
   let j = i + 1; while (j < n && /[\w$\x80-\uffff]/.test(text[j])) j++;
   const word = text.slice(i, j); const member = previous === '.' || previous === '?.';
   if (!member && ['class', 'interface', 'enum', 'namespace', 'module'].includes(word) && previous !== 'new') {
    const k = skipSpace(j); let e = k; while (e < n && /[\w$.\x80-\uffff]/.test(text[e])) e++;
    const name = text.slice(k, e);
    if (name && !/^\d/.test(name) && !(word === 'module' && previous === '.')) {
     const kind: SymbolKind = word === 'namespace' || word === 'module' ? 'module' : word as SymbolKind;
     declare(kind, name, lineStart(i), k, kind === 'class'); i = e; previous = 'name'; continue;
    }
   }
   if (!member && word === 'function') {
    let k = skipSpace(j); if (text[k] === '*') k = skipSpace(k + 1);
    let e = k; while (e < n && /[\w$\x80-\uffff]/.test(text[e])) e++;
    if (e > k) { declare('function', text.slice(k, e), lineStart(i), k); i = e; previous = 'name'; continue; }
   }
   if (!member && ['const', 'let', 'var'].includes(word)) {
    const k = skipSpace(j); let e = k; while (e < n && /[\w$\x80-\uffff]/.test(text[e])) e++;
    const after = /^\s*(?::[^=;]+)?=\s*(?:async\b\s*)?(?:function\b|\([^()]*\)\s*(?::[^=;{]+)?=>|[\w$]+\s*=>)/.exec(text.slice(e, e + 200));
    if (e > k && after) { declare('function', text.slice(k, e), lineStart(i), k); i = e; previous = 'name'; continue; }
   }
   if (!member && inClassBody() && !JS_KEYWORDS.has(word) && !['get', 'set', 'static', 'async', 'public', 'private', 'protected', 'readonly', 'abstract', 'override', 'declare'].includes(word)) {
    const k = skipSpace(j);
    const field = /^\s*[?!]?\s*(?::[^=;]+)?=\s*(?:async\b\s*)?(?:function\b|\([^()]*\)\s*(?::[^=;{]+)?=>|[\w$]+\s*=>)/.test(text.slice(j, j + 200));
    if (text[k] === '(' || (text[k] === '<' && /^<[^()]*>\s*\(/.test(text.slice(k, k + 100))) || field) { declare('method', word, lineStart(i), i); i = j; previous = 'name'; continue; }
   }
   previous = word; i = j; continue;
  }
  if (c === '(') { paren++; previous = '('; i++; continue; }
  if (c === ')') { paren = Math.max(0, paren - 1); previous = ')'; i++; continue; }
  if (c === '{') {
   if (pending && pending.paren === paren) { const symbol = pending.symbol; (owner()?.children ?? roots).push(symbol); stack.push({ symbol, classBody: symbol.kind === 'class' }); pending = undefined; }
   else stack.push({ symbol: null, classBody: false });
   previous = '{'; i++; continue;
  }
  if (c === '}') { const closed = stack.pop(); if (closed?.symbol) closed.symbol.end = i; if (pending && pending.paren === paren) pending = undefined; previous = '}'; i++; continue; }
  if (c === ';' && pending && pending.paren === paren) { pending = undefined; }
  if (/\s/.test(c)) { i++; continue; }
  const two = text.slice(i, i + 2); previous = two === '?.' ? '?.' : c; i += previous.length;
 }
 return roots;
}

/** JSON (and JSON with comments): one `key` node per property, nested as in the document; array items are
 *  transparent (their properties belong to the array's key). */
export function jsonStructure(text: string): CodeSymbol[] {
 const roots: CodeSymbol[] = []; const n = text.length;
 const stack: { symbol: CodeSymbol | null; array: boolean }[] = [];
 let key: CodeSymbol | undefined; // property whose value comes next
 const parent = () => { for (let i = stack.length - 1; i >= 0; i--) if (stack[i].symbol) return stack[i].symbol!; return undefined; };
 let lastValueEnd = 0; let leaf: CodeSymbol | undefined;
 let i = 0;
 while (i < n) {
  const c = text[i];
  if (c === '/' && text[i + 1] === '/') { while (i < n && text[i] !== '\n') i++; continue; }
  if (c === '/' && text[i + 1] === '*') { const end = text.indexOf('*/', i + 2); i = end < 0 ? n : end + 2; continue; }
  if (c === '"') {
   const start = i; i++; while (i < n && text[i] !== '"' && text[i] !== '\n') i += text[i] === '\\' ? 2 : 1; i++;
   let k = i; while (k < n && /\s/.test(text[k])) k++;
   if (text[k] === ':' && !stack.at(-1)?.array) {
    let name = text.slice(start + 1, i - 1); try { name = JSON.parse(text.slice(start, i)); } catch { /* raw text */ }
    key = { name, kind: 'key', start, nameStart: start + 1, end: n, children: [] }; (parent()?.children ?? roots).push(key); leaf = undefined; i = k + 1; continue;
   }
   if (key) { key.end = i - 1; leaf = key; key = undefined; } lastValueEnd = i; continue;
  }
  if (c === '{' || c === '[') { stack.push({ symbol: key ?? null, array: c === '[' }); key = undefined; leaf = undefined; i++; continue; }
  if (c === '}' || c === ']') { if (leaf) leaf = undefined; const closed = stack.pop(); if (closed?.symbol) closed.symbol.end = i; i++; continue; }
  if (c === ',') { if (key) { key.end = Math.max(key.nameStart, lastValueEnd - 1); key = undefined; } leaf = undefined; i++; continue; }
  if (/\s/.test(c)) { i++; continue; }
  // Bare values (numbers, true/false/null): extend the pending key to the end of the value.
  let j = i; while (j < n && !/[\s,}\]]/.test(text[j])) j++;
  if (key) { key.end = j - 1; key = undefined; } lastValueEnd = j; i = j;
 }
 return roots;
}

/** YAML: key path by indentation (`services › App\Mailer › arguments`); sequence items are transparent and block
 *  scalars (`|`, `>`) are skipped. Flow collections (`{a: 1}`) are not split. */
export function yamlStructure(text: string): CodeSymbol[] {
 const roots: CodeSymbol[] = []; const open: { indent: number; symbol: CodeSymbol }[] = [];
 let offset = 0; let block = -1; // indentation of a key whose block scalar is being skipped
 const close = (indent: number, at: number) => { while (open.length && open.at(-1)!.indent >= indent) open.pop()!.symbol.end = Math.max(open.at(-1)?.symbol.nameStart ?? 0, at - 1); };
 for (const line of text.split('\n')) {
  const content = line.replace(/\r$/, '');
  const trimmed = content.trimStart(); const indent = content.length - trimmed.length;
  if (block >= 0) { if (!trimmed || indent > block) { offset += line.length + 1; continue; } block = -1; }
  if (/^(?:---|\.\.\.)(?:\s|$)/.test(content)) { close(-1, offset); offset += line.length + 1; continue; }
  if (!trimmed || trimmed.startsWith('#')) { offset += line.length + 1; continue; }
  const item = /^(?:-[ \t]+)+/.exec(trimmed); const at = indent + (item ? item[0].length : 0); const rest = content.slice(at);
  close(at, offset);
  const key = /^(?:"((?:[^"\\]|\\.)*)"|'((?:[^']|'')*)'|([^\s#'"{[\-?:][^#]*?|[-?:][^\s#][^#]*?))[ \t]*:(?=[ \t]|$)/.exec(rest);
  if (key && !(item && !key)) {
   const name = key[1] ?? key[2]?.replace(/''/g, "'") ?? key[3];
   const symbol: CodeSymbol = { name, kind: 'key', start: offset + at, nameStart: offset + at + (key[3] === undefined ? 1 : 0), end: text.length, children: [] };
   (open.at(-1)?.symbol.children ?? roots).push(symbol); open.push({ indent: at, symbol });
   if (/^[ \t]*[|>][-+0-9]*[ \t]*(?:#.*)?$/.test(rest.slice(key[0].length))) block = at;
  }
  offset += line.length + 1;
 }
 close(-1, text.length + 1);
 return roots;
}

const VOID_ELEMENTS = new Set(['area', 'base', 'br', 'col', 'embed', 'hr', 'img', 'input', 'link', 'meta', 'param', 'source', 'track', 'wbr']);
const OPTIONAL_END: Record<string, string> = { li: 'li', p: 'p', dt: 'dd', dd: 'dd', tr: 'tr', td: 'td', th: 'td', option: 'option' };
const RAW_ELEMENTS = new Set(['script', 'style', 'textarea', 'title']);
/** HTML: element path (`html › body › main#app.page › ul.items › li`), with the id and classes of each element.
 *  Unclosed elements end at their parent's closing tag (or the end of the file). */
export function htmlStructure(text: string): CodeSymbol[] {
 const roots: CodeSymbol[] = []; const open: { tag: string; symbol: CodeSymbol }[] = []; const n = text.length;
 let i = 0;
 while (i < n) {
  const lt = text.indexOf('<', i); if (lt < 0) break; i = lt;
  if (text.startsWith('<!--', i)) { const end = text.indexOf('-->', i + 4); i = end < 0 ? n : end + 3; continue; }
  if (text[i + 1] === '!' || text[i + 1] === '?') { const end = text.indexOf('>', i); i = end < 0 ? n : end + 1; continue; }
  const close = /^<\/([A-Za-z][\w:-]*)\s*>?/.exec(text.slice(i, i + 100));
  if (close) {
   const tag = close[1].toLowerCase(); const at = open.map(e => e.tag).lastIndexOf(tag);
   if (at >= 0) { while (open.length > at + 1) open.pop()!.symbol.end = i - 1; open.pop()!.symbol.end = i + close[0].length - 1; }
   i += close[0].length; continue;
  }
  const tagMatch = /^<([A-Za-z][\w:-]*)/.exec(text.slice(i, i + 100));
  if (!tagMatch) { i++; continue; }
  // End of the start tag: the first `>` outside quoted attribute values.
  let k = i + tagMatch[0].length; let quote = '';
  while (k < n) { const ch = text[k]; if (quote) { if (ch === quote) quote = ''; } else if (ch === '"' || ch === "'") quote = ch; else if (ch === '>') break; k++; }
  const tagText = text.slice(i, k + 1); const tag = tagMatch[1].toLowerCase();
  const attr = (name: string) => new RegExp(`\\s${name}\\s*=\\s*(?:"([^"]*)"|'([^']*)'|([^\\s>]+))`, 'i').exec(tagText);
  const id = attr('id'); const classes = attr('class');
  const label = tag + (id ? '#' + (id[1] ?? id[2] ?? id[3]).trim() : '') + (classes ? (classes[1] ?? classes[2] ?? classes[3]).trim().split(/\s+/).filter(Boolean).map(c => '.' + c).join('') : '');
  // Optional end tags: a new <li>, <p>, <tr>, <td>… closes the open sibling of the same family.
  const family = (t: string) => OPTIONAL_END[t] ?? t;
  const top = open.at(-1); if (top && OPTIONAL_END[tag] && family(top.tag) === family(tag)) open.pop()!.symbol.end = i - 1;
  const symbol: CodeSymbol = { name: label, kind: 'tag', start: i, nameStart: i + 1, end: Math.min(k, n - 1), children: [] };
  (open.at(-1)?.symbol.children ?? roots).push(symbol);
  i = k + 1;
  if (VOID_ELEMENTS.has(tag) || tagText.endsWith('/>')) continue;
  if (RAW_ELEMENTS.has(tag)) { const end = text.toLowerCase().indexOf('</' + tag, i); const stop = end < 0 ? n : end; const gt = text.indexOf('>', stop); symbol.end = gt < 0 ? n - 1 : gt; i = gt < 0 ? n : gt + 1; continue; }
  symbol.end = n; open.push({ tag, symbol });
 }
 return roots;
}

/** Languages with breadcrumbs, as listed in Settings › Editor › General › Breadcrumbs. */
export const BREADCRUMB_LANGUAGES: { id: string; label: string; languages: string[] }[] = [
 { id: 'html', label: 'HTML', languages: ['html'] },
 { id: 'javascript', label: 'JavaScript', languages: ['javascript'] },
 { id: 'json', label: 'JSON', languages: ['json', 'jsonc'] },
 { id: 'markdown', label: 'Markdown', languages: ['markdown'] },
 { id: 'php', label: 'PHP', languages: ['php'] },
 { id: 'typescript', label: 'TypeScript', languages: ['typescript'] },
 { id: 'yaml', label: 'YAML', languages: ['yaml'] },
];
/** Breadcrumbs group of a Monaco language id (`jsonc` → `json`), or undefined. */
export const breadcrumbLanguage = (language: string) => BREADCRUMB_LANGUAGES.find(entry => entry.languages.includes(language))?.id;

/** Structure for a Monaco language id, or undefined when breadcrumbs are not supported for it. */
export function structureOf(language: string, text: string): CodeSymbol[] | undefined {
 switch (breadcrumbLanguage(language)) {
  case 'php': return phpStructure(text);
  case 'markdown': return markdownStructure(text);
  case 'javascript': case 'typescript': return jsStructure(text);
  case 'json': return jsonStructure(text);
  case 'yaml': return yamlStructure(text);
  case 'html': return htmlStructure(text);
  default: return undefined;
 }
}

/** Innermost chain of symbols that contain the offset (outermost first). */
export function symbolPath(symbols: CodeSymbol[], offset: number): CodeSymbol[] {
 const path: CodeSymbol[] = []; let level = symbols;
 for (;;) { const hit = level.find(s => offset >= s.start && offset <= s.end); if (!hit) return path; path.push(hit); level = hit.children; }
}

/** Editor breadcrumb text (`\App`, `User`, `label()`) or navigation-bar text (`User`, `label`). */
export function crumbLabel(symbol: CodeSymbol, style: 'editor' | 'nav' = 'editor'): string {
 if (symbol.kind === 'namespace') return '\\' + symbol.name;
 if ((symbol.kind === 'method' || symbol.kind === 'function') && style === 'editor') return symbol.name + '()';
 return symbol.name;
}

/** Qualified reference of the innermost symbol, as Copy Reference gives it: `App\User::label`, `App\helper`. */
export function referenceOf(path: CodeSymbol[]): string | undefined {
 const namespace = path.find(s => s.kind === 'namespace')?.name;
 const type = path.find(s => classLike.has(s.kind)); const member = path.find(s => s.kind === 'method' || s.kind === 'function');
 const qualify = (name: string) => namespace ? namespace + '\\' + name : name;
 if (type && member?.kind === 'method') return qualify(type.name) + '::' + member.name;
 if (type) return qualify(type.name);
 if (member) return qualify(member.name);
 return namespace;
}
