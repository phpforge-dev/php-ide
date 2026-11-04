// Code structure for breadcrumbs (UI-BREADCRUMBS-001): namespaces, classes, functions and methods of a PHP file,
// headings of a Markdown file. A small scanner of our own (comments, strings, heredocs and `?>` skipped, braces
// matched); it does not resolve types and tolerates incomplete code while typing. No DOM: tested in Node.

export type SymbolKind = 'namespace' | 'class' | 'interface' | 'trait' | 'enum' | 'function' | 'method' | 'heading';
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

/** Structure for a Monaco language id, or undefined when breadcrumbs are not supported for it. */
export function structureOf(language: string, text: string): CodeSymbol[] | undefined {
 if (language === 'php') return phpStructure(text);
 if (language === 'markdown') return markdownStructure(text);
 return undefined;
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
