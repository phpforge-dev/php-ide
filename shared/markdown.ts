// Leitura e interpretação de Markdown (CommonMark + extensões GFM usuais) sem dependências.
// O HTML gerado nunca repassa HTML bruto do documento: tags aparecem como texto escapado e
// só esquemas http(s)/mailto e caminhos relativos viram links. Cada bloco leva `data-line`
// (linha 0-based no fonte) para sincronizar rolagem entre editor e prévia.

export type MarkdownHeading = { level: number; text: string; slug: string; line: number };
export type MarkdownLink = { target: string; start: number; end: number; image: boolean };
type Align = 'left' | 'center' | 'right' | null;
type Item = { blocks: Block[]; task: boolean | null };
type Block =
 | { type: 'heading'; level: number; text: string; line: number }
 | { type: 'paragraph'; text: string; line: number }
 | { type: 'code'; lang: string; text: string; line: number }
 | { type: 'quote'; blocks: Block[]; line: number }
 | { type: 'list'; ordered: boolean; start: number; tight: boolean; items: Item[]; line: number }
 | { type: 'table'; align: Align[]; head: string[]; rows: string[][]; line: number }
 | { type: 'html'; text: string; line: number }
 | { type: 'hr'; line: number };
type Definition = { href: string; title?: string };
export type RenderOptions = {
 /** Âncoras únicas como no GitHub: `Título` → `titulo`, repetições `-1`, `-2`… */
 slugs?: boolean;
};

const fence = /^ {0,3}(`{3,}|~{3,})[ \t]*([^\s`]*)[^`]*$/;
const atx = /^ {0,3}(#{1,6})(?=[ \t]|$)[ \t]*(.*?)(?:[ \t]+#+)?[ \t]*$/;
const hr = /^ {0,3}([-*_])(?:[ \t]*\1){2,}[ \t]*$/;
const quote = /^ {0,3}> ?/;
const bullet = /^( {0,3})([-*+]|\d{1,9}[.)])([ \t]+|$)/;
const setext = /^ {0,3}(=+|-+)[ \t]*$/;
const html = /^ {0,3}<(?:\/?[A-Za-z][\w-]*(?:[\s/>]|$)|!--)/;
const delimiterRow = /^ *\|? *:?-+:? *(?:\| *:?-+:? *)*\|? *$/;
const definition = /^ {0,3}\[([^\]]+)\]:[ \t]*<?([^\s>]+)>?(?:[ \t]+(?:"([^"]*)"|'([^']*)'|\(([^)]*)\)))?[ \t]*$/;
const blank = (line: string) => /^[ \t]*$/.test(line);
const label = (text: string) => text.trim().replace(/\s+/g, ' ').toLowerCase();

export const escapeHtml = (text: string) => text.replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]!);

function indent(line: string) { let width = 0; for (const c of line) { if (c === ' ') width++; else if (c === '\t') width += 4 - width % 4; else break; } return width; }
/** Remove até `width` colunas de recuo, expandindo tabulações. */
function dedent(line: string, width: number) {
 let col = 0; let i = 0;
 while (i < line.length && col < width) { if (line[i] === ' ') col++; else if (line[i] === '\t') { const next = col + 4 - col % 4; if (next > width) return ' '.repeat(next - width) + line.slice(i + 1); col = next; } else break; i++; }
 return line.slice(i);
}
const cells = (row: string) => {
 let text = row.trim(); if (text.startsWith('|')) text = text.slice(1); if (text.endsWith('|') && !text.endsWith('\\|')) text = text.slice(0, -1);
 const out: string[] = []; let current = ''; let code = false;
 for (let i = 0; i < text.length; i++) { const c = text[i];
  if (c === '\\' && text[i + 1] === '|') { current += '|'; i++; continue; }
  if (c === '`') code = !code;
  if (c === '|' && !code) { out.push(current.trim()); current = ''; } else current += c;
 }
 out.push(current.trim()); return out;
};
/** Linha que interrompe um parágrafo. */
function interrupts(line: string) {
 if (atx.test(line) || fence.test(line) || quote.test(line) || hr.test(line) || html.test(line)) return true;
 const m = bullet.exec(line);
 // Lista ordenada só interrompe parágrafo começando em 1, e item vazio nunca interrompe.
 return !!m && !blank(line.slice(m[0].length)) && (!/\d/.test(m[2]) || /^1[.)]$/.test(m[2]));
}

function parseBlocks(lines: string[], base: number, defs: Map<string, Definition>): Block[] {
 const out: Block[] = []; let i = 0;
 while (i < lines.length) {
  const line = lines[i]; const at = base + i;
  if (blank(line)) { i++; continue; }
  let m: RegExpExecArray | null;
  if ((m = fence.exec(line))) {
   const marker = m[1]; const pad = indent(line); const body: string[] = []; i++;
   const close = new RegExp(`^ {0,3}${marker[0] === '`' ? '`' : '~'}{${marker.length},}[ \\t]*$`);
   while (i < lines.length && !close.test(lines[i])) body.push(dedent(lines[i++], pad));
   i++; out.push({ type: 'code', lang: m[2], text: body.join('\n'), line: at }); continue;
  }
  if ((m = atx.exec(line))) { out.push({ type: 'heading', level: m[1].length, text: m[2], line: at }); i++; continue; }
  if (hr.test(line)) { out.push({ type: 'hr', line: at }); i++; continue; }
  if (indent(line) >= 4) {
   const body: string[] = [];
   while (i < lines.length && (blank(lines[i]) || indent(lines[i]) >= 4)) body.push(dedent(lines[i++], 4));
   while (body.length && blank(body.at(-1)!)) body.pop();
   out.push({ type: 'code', lang: '', text: body.join('\n'), line: at }); continue;
  }
  if (quote.test(line)) {
   const body: string[] = [];
   while (i < lines.length && !blank(lines[i]) && (quote.test(lines[i]) || !interrupts(lines[i]))) { body.push(lines[i].replace(quote, '')); i++; }
   out.push({ type: 'quote', blocks: parseBlocks(body, at, defs), line: at }); continue;
  }
  if ((m = bullet.exec(line))) {
   const ordered = /\d/.test(m[2]); const kind = m[2].at(-1)!; const items: Item[] = []; let tight = true; let gap = false;
   while (i < lines.length) {
    const head = bullet.exec(lines[i]);
    if (!head || /\d/.test(head[2]) !== ordered || head[2].at(-1) !== kind) break;
    if (gap) tight = false;
    const first = i; const spaces = head[3].replace(/\t/g, '    ').length;
    const width = head[1].length + head[2].length + (spaces > 4 || !spaces ? 1 : spaces);
    const body = [lines[i].slice(head[0].length - (spaces > 4 ? spaces - 1 : 0))]; i++; gap = false;
    while (i < lines.length) {
     const next = lines[i];
     if (blank(next)) { body.push(''); i++; continue; }
     if (indent(next) >= width) { if (body.at(-1) === '' && body.length > 1) tight = false; body.push(dedent(next, width)); i++; continue; }
     // Continuação preguiçosa: texto sem recuo logo após um parágrafo do item.
     if (body.at(-1) !== '' && !interrupts(next) && !bullet.test(next)) { body.push(next); i++; continue; }
     break;
    }
    while (body.length && body.at(-1) === '') { body.pop(); gap = true; }
    let task: boolean | null = null; const checkbox = /^\[([ xX])\][ \t]+/.exec(body[0] ?? '');
    if (checkbox) { task = checkbox[1] !== ' '; body[0] = body[0].slice(checkbox[0].length); }
    // `body` tem uma entrada por linha consumida: linhas internas mantêm o número real.
    items.push({ blocks: parseBlocks(body, base + first, defs), task });
   }
   out.push({ type: 'list', ordered, start: ordered ? parseInt(m[2], 10) : 1, tight, items, line: at }); continue;
  }
  if (html.test(line)) {
   const body: string[] = [];
   while (i < lines.length && !blank(lines[i])) body.push(lines[i++]);
   out.push({ type: 'html', text: body.join('\n'), line: at }); continue;
  }
  if (line.includes('|') && i + 1 < lines.length && delimiterRow.test(lines[i + 1]) && lines[i + 1].includes('-')) {
   const head = cells(line); const align = cells(lines[i + 1]).map(c => (c.startsWith(':') && c.endsWith(':') ? 'center' : c.endsWith(':') ? 'right' : c.startsWith(':') ? 'left' : null) as Align);
   if (align.length === head.length) {
    i += 2; const rows: string[][] = [];
    while (i < lines.length && !blank(lines[i]) && !interrupts(lines[i])) { const row = cells(lines[i++]); rows.push(head.map((_, k) => row[k] ?? '')); }
    out.push({ type: 'table', align, head, rows, line: at }); continue;
   }
  }
  // Parágrafo, possivelmente título setext ou definições de referência.
  const body: string[] = [line]; i++;
  while (i < lines.length && !blank(lines[i]) && !setext.test(lines[i]) && !interrupts(lines[i])) body.push(lines[i++]);
  while (body.length && definition.test(body[0])) {
   const d = definition.exec(body.shift()!)!; const key = label(d[1]);
   if (!defs.has(key)) defs.set(key, { href: d[2], title: d[3] ?? d[4] ?? d[5] });
  }
  if (!body.length) continue;
  if (i < lines.length && setext.test(lines[i])) { out.push({ type: 'heading', level: lines[i].trim()[0] === '=' ? 1 : 2, text: body.join('\n').trim(), line: at }); i++; continue; }
  out.push({ type: 'paragraph', text: body.map(l => l.replace(/^[ \t]+/, '')).join('\n'), line: at });
 }
 return out;
}

type Inline = { defs: Map<string, Definition> };
/** Esquemas aceitos em links; relativo (sem esquema) também. */
export function safeHref(href: string): string | null {
 const value = href.trim();
 const scheme = /^([A-Za-z][A-Za-z0-9+.-]*):/.exec(value);
 if (!scheme) return value;
 return ['http', 'https', 'mailto'].includes(scheme[1].toLowerCase()) ? value : null;
}
const unescape = (text: string) => text.replace(/\\([!-/:-@[-`{-~])/g, '$1').replace(/&(amp|lt|gt|quot|#39);/g, (_, e) => ({ amp: '&', lt: '<', gt: '>', quot: '"', '#39': "'" })[e as 'amp']);

/** Fecha `[` em `start`, respeitando colchetes aninhados, escapes e code spans. */
function closeBracket(s: string, start: number) {
 let depth = 0;
 for (let i = start; i < s.length; i++) {
  const c = s[i];
  if (c === '\\') { i++; continue; }
  if (c === '`') { const run = /^`+/.exec(s.slice(i))![0]; const end = s.indexOf(run, i + run.length); if (end > 0) { i = end + run.length - 1; continue; } }
  if (c === '[') depth++;
  else if (c === ']' && --depth === 0) return i;
 }
 return -1;
}
/** `(destino "título")` a partir de `(`; devolve destino, título e fim exclusivo. */
function destination(s: string, open: number): { href: string; title?: string; end: number } | null {
 let i = open + 1; while (s[i] === ' ' || s[i] === '\t' || s[i] === '\n') i++;
 let href = '';
 if (s[i] === '<') { const close = s.indexOf('>', i); if (close < 0 || s.slice(i, close).includes('\n')) return null; href = s.slice(i + 1, close); i = close + 1; }
 else { let depth = 0; const begin = i; for (; i < s.length; i++) { const c = s[i]; if (c === '\\') { i++; continue; } if (/\s/.test(c)) break; if (c === '(') depth++; if (c === ')') { if (!depth) break; depth--; } } href = s.slice(begin, i); }
 while (s[i] === ' ' || s[i] === '\t' || s[i] === '\n') i++;
 let title: string | undefined;
 if (s[i] === '"' || s[i] === "'" || s[i] === '(') { const closer = s[i] === '(' ? ')' : s[i]; const end = s.indexOf(closer, i + 1); if (end < 0) return null; title = s.slice(i + 1, end); i = end + 1; while (s[i] === ' ' || s[i] === '\t') i++; }
 return s[i] === ')' ? { href: unescape(href), title, end: i + 1 } : null;
}

function inline(s: string, ctx: Inline, links = true): string {
 let out = ''; let i = 0;
 const text = (t: string) => { out += escapeHtml(t); };
 while (i < s.length) {
  const c = s[i];
  if (c === '\\') {
   if (s[i + 1] === '\n') { out += '<br>\n'; i += 2; continue; }
   if (/[!-/:-@[-`{-~]/.test(s[i + 1] ?? '')) { text(s[i + 1]); i += 2; continue; }
  }
  if (c === '`') {
   const run = /^`+/.exec(s.slice(i))![0]; let end = i + run.length;
   for (;;) { end = s.indexOf(run, end); if (end < 0 || s[end + run.length] !== '`') break; end += run.length; while (s[end] === '`') end++; }
   if (end > 0) { let code = s.slice(i + run.length, end).replace(/\n/g, ' '); if (/^ .*[^ ].* $/.test(code)) code = code.slice(1, -1); out += `<code>${escapeHtml(code)}</code>`; i = end + run.length; continue; }
   text(run); i += run.length; continue;
  }
  if (c === '!' && s[i + 1] === '[' || (c === '[' && links)) {
   const image = c === '!'; const open = image ? i + 1 : i; const close = closeBracket(s, open);
   if (close > 0) {
    const inner = s.slice(open + 1, close); let target: { href: string; title?: string } | undefined; let end = close + 1;
    const dest = s[close + 1] === '(' ? destination(s, close + 1) : null;
    if (dest) { target = dest; end = dest.end; }
    else {
     const ref = /^\[([^\]]*)\]/.exec(s.slice(close + 1));
     const key = label(ref && ref[1] ? ref[1] : inner); const def = ctx.defs.get(key);
     if (def) { target = def; end = close + 1 + (ref ? ref[0].length : 0); }
    }
    if (target) {
     const href = safeHref(target.href); const title = target.title ? ` title="${escapeHtml(target.title)}"` : '';
     if (image) {
      const alt = inner.replace(/[*_`[\]!]/g, '');
      // A prévia resolve `data-src` (caminho relativo ou URL) conforme a política de conteúdo.
      out += href ? `<img data-src="${escapeHtml(href)}" alt="${escapeHtml(alt)}"${title}>` : escapeHtml(alt);
     } else if (href) out += `<a href="${escapeHtml(href)}"${title}>${inline(inner, ctx, false)}</a>`;
     else out += inline(inner, ctx, false);
     i = end; continue;
    }
   }
  }
  if (c === '<') {
   const auto = /^<([A-Za-z][A-Za-z0-9+.-]{1,31}:[^\s<>]*)>/.exec(s.slice(i)) ?? /^<([^\s<>@]+@[^\s<>@]+\.[^\s<>@]+)>/.exec(s.slice(i));
   if (auto) { const raw = auto[1].includes(':') ? auto[1] : 'mailto:' + auto[1]; const href = safeHref(raw); out += href && links ? `<a href="${escapeHtml(href)}">${escapeHtml(auto[1])}</a>` : escapeHtml(auto[0]); i += auto[0].length; continue; }
  }
  if (links && (c === 'h' || c === 'w') && (i === 0 || /[\s(*_~]/.test(s[i - 1]))) {
   const bare = /^(?:https?:\/\/|www\.)[^\s<]+/.exec(s.slice(i));
   if (bare) {
    let url = bare[0]; while (/[?!.,:*_~'")]$/.test(url) && !(url.endsWith(')') && (url.match(/\(/g)?.length ?? 0) >= (url.match(/\)/g)?.length ?? 0))) url = url.slice(0, -1);
    out += `<a href="${escapeHtml(url.startsWith('www.') ? 'http://' + url : url)}">${escapeHtml(url)}</a>`; i += url.length; continue;
   }
  }
  if (c === '*' || c === '_' || c === '~') {
   const run = new RegExp(`^\\${c}+`).exec(s.slice(i))![0];
   const size = c === '~' ? (run.length >= 2 ? 2 : 0) : Math.min(run.length, 3);
   const leftFlanking = !/\s/.test(s[i + run.length] ?? ' ');
   const intraword = c === '_' && /\w/.test(s[i - 1] ?? '');
   if (size && leftFlanking && !intraword) {
    const delim = c.repeat(size); let matched = false;
    for (let end = s.indexOf(delim, i + size + 1); end > 0 && !matched; end = s.indexOf(delim, end + 1)) {
     // O fechamento não pode vir após espaço nem fazer parte de uma sequência maior.
     if (/\s/.test(s[end - 1]) || s[end - 1] === '\\' || s[end - 1] === c || s[end + size] === c) continue;
     if (c === '_' && /\w/.test(s[end + size] ?? '')) continue;
     const inner = inline(s.slice(i + size, end), ctx, links);
     out += c === '~' ? `<del>${inner}</del>` : size === 3 ? `<em><strong>${inner}</strong></em>` : size === 2 ? `<strong>${inner}</strong>` : `<em>${inner}</em>`;
     i = end + size; matched = true;
    }
    if (matched) continue;
   }
   text(run); i += run.length; continue;
  }
  if (c === '\n') { if (/ {2,}$/.test(out)) out = out.replace(/ +$/, '') + '<br>'; out += '\n'; i++; continue; }
  text(c); i++;
 }
 return out;
}

/** Texto visível de um título (para outline e âncoras). */
export function plainText(text: string) {
 return text.replace(/!?\[([^\]]*)\]\([^)]*\)/g, '$1').replace(/!?\[([^\]]*)\]\[[^\]]*\]/g, '$1').replace(/`([^`]*)`/g, '$1').replace(/(\*{1,3}|_{1,3}|~~)(\S(?:.*?\S)?)\1/g, '$2').replace(/\\([!-/:-@[-`{-~])/g, '$1').trim();
}
/** Âncora no estilo GitHub (mantém letras acentuadas); `seen` evita duplicadas. */
export function slugify(text: string, seen = new Map<string, number>()) {
 const base = plainText(text).toLowerCase().replace(/[^\p{L}\p{M}\p{N}\s_-]/gu, '').trim().replace(/\s/g, '-');
 const count = seen.get(base) ?? 0; seen.set(base, count + 1);
 return count ? `${base}-${count}` : base;
}

export function parseMarkdown(text: string) {
 const lines = text.replace(/\r\n?/g, '\n').split('\n'); const defs = new Map<string, Definition>();
 const blocks = parseBlocks(lines, 0, defs);
 return { blocks, defs };
}

/** Títulos em ordem de documento; `nested` indica título dentro de citação ou lista. */
function walkHeadings(blocks: Block[], visit: (b: Extract<Block, { type: 'heading' }>, nested: boolean) => void, nested = false) {
 for (const b of blocks) {
  if (b.type === 'heading') visit(b, nested);
  else if (b.type === 'quote') walkHeadings(b.blocks, visit, true);
  else if (b.type === 'list') for (const item of b.items) walkHeadings(item.blocks, visit, true);
 }
}

/** Outline do documento. Títulos aninhados não entram, mas consomem âncora como na prévia. */
export function markdownHeadings(text: string): MarkdownHeading[] {
 const out: MarkdownHeading[] = []; const seen = new Map<string, number>();
 walkHeadings(parseMarkdown(text).blocks, (b, nested) => { const slug = slugify(b.text, seen); if (!nested) out.push({ level: b.level, text: plainText(b.text), slug, line: b.line }); });
 return out;
}

const fold = (text: string) => text.toLowerCase().normalize('NFD').replace(/\p{M}/gu, '');
/** Título de uma âncora `#fragmento`; aceita também a forma sem acentos (`#instalacao`). */
export function findHeading(headings: MarkdownHeading[], fragment: string) {
 let wanted = fragment; try { wanted = decodeURIComponent(fragment); } catch { /* fragmento literal */ }
 return headings.find(h => h.slug === wanted.toLowerCase()) ?? headings.find(h => fold(h.slug) === fold(wanted));
}

export function renderMarkdown(text: string, options: RenderOptions = {}) {
 const { blocks, defs } = parseMarkdown(text); const ctx: Inline = { defs }; const seen = new Map<string, number>();
 const render = (list: Block[], tight = false): string => list.map(b => {
  const line = ` data-line="${b.line}"`;
  switch (b.type) {
   case 'heading': { const id = options.slugs === false ? '' : ` id="${escapeHtml(slugify(b.text, seen))}"`; return `<h${b.level}${line}${id}>${inline(b.text, ctx)}</h${b.level}>`; }
   case 'paragraph': return tight ? inline(b.text, ctx) : `<p${line}>${inline(b.text, ctx)}</p>`;
   case 'code': return `<pre${line}${b.lang ? ` data-lang="${escapeHtml(b.lang)}"` : ''}><code${b.lang ? ` class="language-${escapeHtml(b.lang)}"` : ''}>${escapeHtml(b.text)}${b.text ? '\n' : ''}</code></pre>`;
   case 'quote': return `<blockquote${line}>${render(b.blocks)}</blockquote>`;
   case 'hr': return `<hr${line}>`;
   case 'html': return `<pre class="md-raw-html"${line} title="HTML bruto exibido como texto">${escapeHtml(b.text)}</pre>`;
   case 'table': {
    const style = (k: number) => b.align[k] ? ` style="text-align:${b.align[k]}"` : '';
    return `<table${line}><thead><tr>${b.head.map((c, k) => `<th${style(k)}>${inline(c, ctx)}</th>`).join('')}</tr></thead>${b.rows.length ? `<tbody>${b.rows.map(r => `<tr>${r.map((c, k) => `<td${style(k)}>${inline(c, ctx)}</td>`).join('')}</tr>`).join('')}</tbody>` : ''}</table>`;
   }
   case 'list': {
    const tag = b.ordered ? 'ol' : 'ul'; const start = b.ordered && b.start !== 1 ? ` start="${b.start}"` : '';
    const tasks = b.items.some(i => i.task !== null) ? ' class="task-list"' : '';
    return `<${tag}${line}${start}${tasks}>${b.items.map(item => {
     const box = item.task === null ? '' : `<input type="checkbox" disabled${item.task ? ' checked' : ''}> `;
     const at = item.blocks[0] ? ` data-line="${item.blocks[0].line}"` : '';
     return `<li${at}${item.task === null ? '' : ' class="task"'}>${box}${render(item.blocks, b.tight)}</li>`;
    }).join('')}</${tag}>`;
   }
  }
 }).join(tight ? '\n' : '');
 return render(blocks);
}

/** Link ou imagem cujo destino contém `offset` (inclusive o texto entre colchetes). */
export function markdownLinkAt(text: string, offset: number): MarkdownLink | null {
 const lineStart = text.lastIndexOf('\n', offset - 1) + 1; const lineEnd = text.indexOf('\n', offset); const line = text.slice(lineStart, lineEnd < 0 ? text.length : lineEnd);
 const pattern = /(!?)\[((?:[^\]\\]|\\.)*)\]\((\s*<?)([^)\s>]*)>?(?:\s+(?:"[^"]*"|'[^']*'))?\s*\)/g;
 for (let m; (m = pattern.exec(line));) {
  const start = lineStart + m.index;
  if (offset < start || offset > start + m[0].length) continue;
  const hrefStart = start + m[1].length + m[2].length + 3 + m[3].length;
  return { target: m[4], start: hrefStart, end: hrefStart + m[4].length, image: m[1] === '!' };
 }
 // Referência `[texto][rótulo]` ou `[rótulo]`: resolve pela definição.
 const refs = /\[((?:[^\]\\]|\\.)+)\](?:\[([^\]]*)\])?/g;
 for (let m; (m = refs.exec(line));) {
  const start = lineStart + m.index; if (offset < start || offset > start + m[0].length) continue;
  const key = label(m[2] || m[1]);
  const def = text.split('\n').map((l, k) => ({ m: definition.exec(l), k })).find(d => d.m && label(d.m[1]) === key);
  if (!def?.m) continue;
  const lineOffset = text.split('\n').slice(0, def.k).reduce((n, l) => n + l.length + 1, 0); const at = lineOffset + text.split('\n')[def.k].indexOf(def.m[2]);
  return { target: def.m[2], start: at, end: at + def.m[2].length, image: false };
 }
 const auto = /<(https?:[^\s<>]+)>|https?:\/\/[^\s<>)\]]+/g;
 for (let m; (m = auto.exec(line));) { const start = lineStart + m.index; if (offset >= start && offset <= start + m[0].length) { const target = m[1] ?? m[0]; const at = m[1] ? start + 1 : start; return { target, start: at, end: at + target.length, image: false }; } }
 return null;
}

/** Destino relativo resolvido contra o arquivo atual; null para URL externa ou caminho fora do projeto. */
export function resolveMarkdownTarget(from: string, target: string): { path: string; fragment: string } | null {
 if (/^[A-Za-z][A-Za-z0-9+.-]*:/.test(target) || target.startsWith('//')) return null;
 const hash = target.indexOf('#'); const raw = hash < 0 ? target : target.slice(0, hash); const fragment = hash < 0 ? '' : decodeURIComponent(target.slice(hash + 1));
 const clean = raw.split('?')[0];
 let decoded: string; try { decoded = decodeURIComponent(clean); } catch { decoded = clean; }
 if (!decoded) return { path: from, fragment };
 const parts = decoded.startsWith('/') ? [] : from.split('/').slice(0, -1);
 for (const part of decoded.split('/')) { if (!part || part === '.') continue; if (part === '..') { if (!parts.length) return null; parts.pop(); } else parts.push(part); }
 return { path: parts.join('/'), fragment };
}

export const isMarkdownPath = (path: string) => /\.(md|markdown|mdown|mkd)$/i.test(path);

export type MarkdownReference =
 | { kind: 'link'; target: string; line: number; start: number; end: number; image: boolean }
 | { kind: 'label'; label: string; line: number; start: number; end: number };

/**
 * Destinos e rótulos usados no documento, com coluna do destino/rótulo. Ignora blocos de código
 * cercados ou recuados e code spans. Base das inspeções de referências não resolvidas.
 */
export function markdownReferences(text: string): { references: MarkdownReference[]; labels: Set<string> } {
 const lines = text.replace(/\r\n?/g, '\n').split('\n'); const references: MarkdownReference[] = []; const labels = new Set<string>();
 let open: RegExp | null = null; let previousBlank = true;
 lines.forEach((raw, line) => {
  if (open) { if (open.test(raw)) open = null; previousBlank = false; return; }
  const f = fence.exec(raw);
  if (f) { open = new RegExp(`^ {0,3}${f[1][0] === '`' ? '`' : '~'}{${f[1].length},}[ \\t]*$`); return; }
  if (previousBlank && indent(raw) >= 4 && !bullet.test(raw.trimStart())) { return; }
  previousBlank = blank(raw);
  const def = definition.exec(raw);
  if (def) { labels.add(label(def[1])); const at = raw.indexOf(def[2], raw.indexOf(']:')); references.push({ kind: 'link', target: def[2], line, start: at, end: at + def[2].length, image: false }); return; }
  // Code spans viram espaços para manter as colunas.
  const source = raw.replace(/(`+)[^`]*?\1/g, m => ' '.repeat(m.length));
  const inlineLink = /(!?)\[((?:[^\]\\]|\\.)*)\]\((\s*<?)([^)\s>]*)/g;
  for (let m; (m = inlineLink.exec(source));) {
   const start = m.index + m[1].length + m[2].length + 3 + m[3].length;
   if (m[4]) references.push({ kind: 'link', target: m[4], line, start, end: start + m[4].length, image: m[1] === '!' });
  }
  const full = /\[((?:[^\]\\]|\\.)+)\]\[([^\]]*)\]/g;
  for (let m; (m = full.exec(source));) {
   const name = m[2] || m[1]; const start = m.index + (m[2] ? m[1].length + 3 : 1);
   references.push({ kind: 'label', label: label(name), line, start, end: start + name.length });
  }
 });
 return { references, labels };
}
