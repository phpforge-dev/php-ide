import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile, readdir, stat } from 'node:fs/promises';
import { join, relative, resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { findHeading, markdownHeadings, markdownLinkAt, renderMarkdown, resolveMarkdownTarget, safeHref, slugify } from '../shared/markdown';
import { MarkdownPlugin } from '../shared/language/plugins/markdown';
import { PluginHost } from '../shared/language/plugins/host';
import type { ProjectFiles } from '../shared/language/plugins/api';

const root = resolve('fixtures/markdown');
async function walk(dir: string): Promise<string[]> {
 const out: string[] = [];
 for (const name of await readdir(dir)) { const full = join(dir, name); if ((await stat(full)).isDirectory()) out.push(...await walk(full)); else out.push(relative(root, full)); }
 return out;
}
const files: ProjectFiles = {
 root,
 read: async path => readFile(join(root, path), 'utf8').catch(() => null),
 exists: async path => stat(join(root, path)).then(() => true, () => false),
 list: async (dir, accept) => (await walk(join(root, dir))).filter(p => accept(p.split('/').pop()!)),
 uri: path => pathToFileURL(join(root, path)).href,
};
const at = (text: string, needle: string, delta = 1) => { const i = text.indexOf(needle); assert.ok(i >= 0, needle); return i + delta; };

test('blocos: títulos, listas, citação, código, tabela e linhas de origem', () => {
 const html = renderMarkdown('# Título *um*\n\nTexto **forte** e `código`.\n\n- a\n- [x] feito\n  - aninhado\n\n3. três\n4. quatro\n\n> citação\n\n```php\n<?php echo 1;\n```\n\n| a | b |\n|:--|--:|\n| 1 | `x|y` |\n\nSetext\n---\n\n***\n');
 assert.match(html, /<h1 data-line="0" id="título-um">Título <em>um<\/em><\/h1>/);
 assert.match(html, /<p data-line="2">Texto <strong>forte<\/strong> e <code>código<\/code>.<\/p>/);
 assert.match(html, /<li data-line="5" class="task"><input type="checkbox" disabled checked> feito\n<ul data-line="6"><li data-line="6">aninhado<\/li><\/ul><\/li>/);
 assert.match(html, /<ol data-line="8" start="3">/);
 assert.match(html, /<blockquote data-line="11"><p data-line="11">citação<\/p><\/blockquote>/);
 assert.match(html, /<pre data-line="13" data-lang="php"><code class="language-php">&lt;\?php echo 1;\n<\/code><\/pre>/);
 assert.match(html, /<th style="text-align:left">a<\/th><th style="text-align:right">b<\/th>/);
 assert.match(html, /<td style="text-align:right"><code>x\|y<\/code><\/td>/);
 assert.match(html, /<h2 data-line="21" id="setext">Setext<\/h2>/);
 assert.match(html, /<hr data-line="24">/);
});

test('inline: ênfase aninhada, sublinhado intrapalavra, quebras, escapes e autolinks', () => {
 assert.equal(renderMarkdown('*a **b** c* snake_case_name \\*lit\\*'), '<p data-line="0"><em>a <strong>b</strong> c</em> snake_case_name *lit*</p>');
 assert.equal(renderMarkdown('um  \ndois\\\ntrês'), '<p data-line="0">um<br>\ndois<br>\ntrês</p>');
 assert.equal(renderMarkdown('~~não~~ ***ambos***'), '<p data-line="0"><del>não</del> <em><strong>ambos</strong></em></p>');
 assert.equal(renderMarkdown('Veja https://example.com/a_(b). e <me@example.com>'), '<p data-line="0">Veja <a href="https://example.com/a_(b)">https://example.com/a_(b)</a>. e <a href="mailto:me@example.com">me@example.com</a></p>');
 assert.equal(renderMarkdown('[![badge](b.svg)](https://ci.example)'), '<p data-line="0"><a href="https://ci.example"><img data-src="b.svg" alt="badge"></a></p>');
 assert.equal(renderMarkdown('[a][r] e [r]\n\n[r]: https://r.example "T"'), '<p data-line="0"><a href="https://r.example" title="T">a</a> e <a href="https://r.example" title="T">r</a></p>');
});

test('segurança: HTML bruto vira texto e esquemas perigosos não viram link', () => {
 const html = renderMarkdown('<script>alert(1)</script>\n\nTexto <img src=x onerror=alert(1)> [x](javascript:alert(1)) ![i](data:image/png;base64,AAAA) [ok](\"onmouseover=x)');
 assert.ok(!/<script|<img src|javascript:/.test(html), html);
 assert.match(html, /<a href="&quot;onmouseover=x">ok<\/a>/, 'atributos sempre escapados');
 assert.match(html, /<pre class="md-raw-html" data-line="0"[^>]*>&lt;script&gt;alert\(1\)&lt;\/script&gt;<\/pre>/);
 assert.match(html, /Texto &lt;img src=x onerror=alert\(1\)&gt; x i/);
 assert.equal(safeHref('JaVaScRiPt:alert(1)'), null);
 assert.equal(safeHref('vbscript:x'), null);
 assert.equal(safeHref('docs/a.md'), 'docs/a.md');
});

test('outline e âncoras no formato GitHub, com duplicadas numeradas', () => {
 const text = '# Visão geral\n\n## Instalação\n\n> ## Instalação\n\n## Instalação\n\nTítulo\n======\n';
 assert.deepEqual(markdownHeadings(text), [
  { level: 1, text: 'Visão geral', slug: 'visão-geral', line: 0 },
  { level: 2, text: 'Instalação', slug: 'instalação', line: 2 },
  { level: 2, text: 'Instalação', slug: 'instalação-2', line: 6 },
  { level: 1, text: 'Título', slug: 'título', line: 8 },
 ], 'o título citado reserva instalação-1');
 assert.equal(findHeading(markdownHeadings(text), 'instalacao')?.line, 2, 'âncora sem acento');
 assert.equal(findHeading(markdownHeadings(text), 'instala%C3%A7%C3%A3o-2')?.line, 6, 'âncora codificada');
 assert.equal(slugify('`API` & [Links](x) — 2.0'), 'api--links--20');
});

test('links: posição do destino, resolução relativa e confinamento', () => {
 const text = 'Ver [guia](docs/guide.md#x "t") e <https://e.example>.';
 assert.deepEqual(markdownLinkAt(text, at(text, 'guia')), { target: 'docs/guide.md#x', start: text.indexOf('docs'), end: text.indexOf('docs') + 15, image: false });
 assert.equal(markdownLinkAt(text, at(text, 'https'))?.target, 'https://e.example');
 assert.equal(markdownLinkAt(text, 0), null);
 assert.deepEqual(resolveMarkdownTarget('docs/guide.md', '../README.md#uso'), { path: 'README.md', fragment: 'uso' });
 assert.deepEqual(resolveMarkdownTarget('docs/guide.md', '#topo'), { path: 'docs/guide.md', fragment: 'topo' });
 assert.deepEqual(resolveMarkdownTarget('a.md', 'my%20file.md'), { path: 'my file.md', fragment: '' });
 assert.equal(resolveMarkdownTarget('a.md', '../../etc/passwd'), null);
 assert.equal(resolveMarkdownTarget('a.md', 'https://x.example'), null);
});

test('plugin: ⌘+clique em links Markdown abre arquivo, título ou linha', async () => {
 const host = new PluginHost(files, [new MarkdownPlugin()]);
 const readme = (await files.read('README.md'))!;
 const define = async (needle: string, path = 'README.md', text = readme) => (await host.defineCode(path, text, at(text, needle, 2)))?.map(l => ({ file: relative(root, new URL(l.uri).pathname), line: l.range.start.line, character: l.range.start.character, ...(l.preserveView ? { keep: true } : {}) }));
 assert.deepEqual(await define('(docs/guide.md)'), [{ file: 'docs/guide.md', line: 0, character: 0, keep: true }]);
 assert.deepEqual(await define('docs/guide.md#instalação'), [{ file: 'docs/guide.md', line: 2, character: 3 }]);
 assert.deepEqual(await define('src/app.php#L3'), [{ file: 'src/app.php', line: 2, character: 0 }]);
 assert.deepEqual(await define('#projeto-de-exemplo'), [{ file: 'README.md', line: 0, character: 2 }]);
 assert.deepEqual(await define('[guia][g]'), [{ file: 'docs/guide.md', line: 6, character: 3 }], 'link por referência');
 assert.deepEqual(await define('Leia'), [], 'fora de link: tratado, sem destino');
 const broken = 'Ver [x](nao-existe.md).';
 assert.deepEqual(await host.defineCode('a.md', broken, at(broken, 'nao')), []);
 assert.equal(await host.defineCode('src/app.php', readme, 10), null, 'PHP não é atendido pelo plugin Markdown');
 assert.deepEqual(await host.define('README.md', "x('docs/guide.md')", 4), [], 'string no estilo PHP em Markdown não é link');
});

test('plugin: completion de caminhos após ]( e de âncoras após #', async () => {
 const host = new PluginHost(files, [new MarkdownPlugin()]);
 const labels = async (text: string, path = 'README.md') => (await host.completeCode(path, text, text.length))?.items.map(i => i.textEdit.newText);
 const root = await labels('# Projeto de exemplo\n\nVer [x](');
 assert.ok(root!.includes('docs/guide.md') && root!.includes('img/logo.svg') && root!.includes('#projeto-de-exemplo'), String(root));
 assert.ok(!root!.includes('README.md'), 'o próprio arquivo não é sugerido');
 assert.ok(root!.indexOf('docs/guide.md') < root!.indexOf('img/logo.svg'), 'Markdown primeiro');
 assert.deepEqual(await labels('[x](docs/guide.md#'), ['docs/guide.md#guia', 'docs/guide.md#instalação', 'docs/guide.md#configuração']);
 assert.deepEqual(await labels('[x](../', 'docs/guide.md'), ['../diagrams.md', '../README.md', '../docs/guide.md', '../img/logo.svg', '../src/app.php']);
 const edit = (await host.completeCode('README.md', '[x](docs/g', 10))!.items[0].textEdit;
 assert.deepEqual(edit.range, { start: { line: 0, character: 4 }, end: { line: 0, character: 10 } });
 assert.deepEqual(await labels('texto comum'), []);
});

test('plugin: inspeções de arquivo, título e rótulo não resolvidos', async () => {
 const host = new PluginHost(files, [new MarkdownPlugin()]);
 const text = '# Topo\n\n[ok](docs/guide.md#instalação) [sem](docs/nada.md) [ancora](docs/guide.md#inexistente)\n[local](#topo) [perdida](#fim) [linha](src/app.php#L3) [web](https://x.example) [fora](../../x.md)\n[a][def] [b][falta] `[c](nao.md)`\n\n```\n[d](codigo.md)\n```\n\n[def]: docs/guide.md\n[quebrada]: sumiu.md\n';
 const found = (await host.diagnose('README.md', text)).map(d => [d.code, d.range.start.line, d.range.start.character, d.range.end.character, d.message]);
 const lines = text.split('\n'); const col = (line: number, needle: string) => lines[line].indexOf(needle);
 assert.deepEqual(found, [
  ['unresolved-file', 2, col(2, 'docs/nada.md'), col(2, 'docs/nada.md') + 12, 'Arquivo não encontrado: docs/nada.md'],
  ['unresolved-header', 2, col(2, '#inexistente'), col(2, '#inexistente') + 12, 'Título não encontrado: #inexistente em docs/guide.md'],
  ['unresolved-header', 3, col(3, '#fim'), col(3, '#fim') + 4, 'Título não encontrado: #fim'],
  ['unresolved-file', 3, col(3, '../../x.md'), col(3, '../../x.md') + 10, 'Link aponta para fora do projeto: ../../x.md'],
  ['unresolved-label', 4, col(4, 'falta'), col(4, 'falta') + 5, 'Rótulo de link não definido: [falta]'],
  ['unresolved-file', 11, col(11, 'sumiu.md'), col(11, 'sumiu.md') + 8, 'Arquivo não encontrado: sumiu.md'],
 ], 'código inline, bloco de código, URL externa, #L3 e títulos existentes não geram aviso');
 assert.deepEqual(await host.diagnose('src/app.php', text), [], 'PHP não recebe inspeções Markdown');
});
