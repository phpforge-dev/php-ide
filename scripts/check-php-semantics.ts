// Recorte 20: ensaia tipos, PHPDoc, generics, traits, herança, vendor e stubs nativos
// contra o motor atual (Phpactor fixado em .tools, mesma configuração do language.rs)
// e contra a camada própria (shared/language/php-hierarchy.ts). Não compara com o
// PhpStorm: um "ok" aqui é evidência da nossa IDE, não de compatibilidade.
// Uso: npx tsx scripts/check-php-semantics.ts  (npm run test:php-semantics)
import { mkdtemp, cp, readFile, readdir, rm, realpath, mkdir, writeFile } from 'node:fs/promises';
import { join, relative, resolve } from 'node:path';
import { tmpdir } from 'node:os';
import { fileURLToPath } from 'node:url';
import { startPhpactor } from './php-lsp-client.mjs';
import { parseHierarchy, PhpHierarchy, hierarchyMarkers, hoverClassName, adaptedMethod } from '../.tools/plugin-packages/php-intelligence/src/shared/language/php-hierarchy';
import { analyze } from '../shared/language/php-source';

type Expect = { def?: string[]; comp?: string; compAbsent?: string; hover?: string; impl?: string[] };
// status: 'pass' = critério deve passar; 'gap' = lacuna conhecida do motor, registrada sem falhar.
type Case = { id: string; family: string; name: string; engine: Expect; status: 'pass' | 'gap'; layer?: { def?: string[]; comp?: string } };
const U = 'src/Model/User.php', A = 'src/Model/Admin.php';
const cases: Case[] = [
 { id: 'TYPE-ALIAS', family: 'PHP-TYPE-001', name: 'email', engine: { def: [`${U}:32`], comp: 'email', hover: 'User # email' }, status: 'pass' },
 { id: 'TYPE-NULLSAFE', family: 'PHP-TYPE-001', name: 'label', engine: { def: [`${U}:27`], comp: 'label' }, status: 'pass' },
 { id: 'TYPE-INSTANCEOF', family: 'PHP-TYPE-001', name: 'promote', engine: { def: [`${A}:12`], comp: 'promote' }, status: 'pass' },
 { id: 'TYPE-STATIC-RETURN', family: 'PHP-TYPE-001', name: 'table', engine: { def: [`${U}:22`], comp: 'table' }, status: 'pass' },
 { id: 'TYPE-UNKNOWN', family: 'PHP-TYPE-001', name: 'whatever', engine: { def: [], compAbsent: 'whatever' }, status: 'pass' },
 { id: 'TYPE-MATCH', family: 'PHP-TYPE-001', name: 'city', engine: { def: ['src/Model/Address.php:7'], comp: 'city' }, status: 'gap' },
 { id: 'DOC-PARAM-ARRAY', family: 'PHP-DOC-001', name: 'email', engine: { def: [`${U}:32`], comp: 'email' }, status: 'pass' },
 { id: 'DOC-VAR-FQN', family: 'PHP-DOC-001', name: 'promote', engine: { def: [`${A}:12`], comp: 'promote' }, status: 'pass' },
 { id: 'DOC-RETURN-ARRAY', family: 'PHP-DOC-001', name: 'label', engine: { def: [`${U}:27`], comp: 'label' }, status: 'pass' },
 { id: 'DOC-PROPERTY', family: 'PHP-DOC-001', name: 'email', engine: { def: [`${U}:10`], comp: 'email', hover: 'string $email' }, status: 'gap' },
 { id: 'DOC-PROPERTY-READ', family: 'PHP-DOC-001', name: 'age', engine: { comp: 'age' }, status: 'pass' },
 { id: 'DOC-METHOD', family: 'PHP-DOC-001', name: 'city', engine: { def: ['src/Model/Address.php:7'], comp: 'city' }, status: 'pass' },
 { id: 'DOC-STATIC-METHOD', family: 'PHP-DOC-001', name: 'label', engine: { def: [`${U}:27`], comp: 'label' }, status: 'pass' },
 { id: 'DOC-INVALID', family: 'PHP-DOC-001', name: 'invalidDoc', engine: { def: ['probes/doc.php:34'] }, status: 'pass' },
 { id: 'GEN-IDENTITY', family: 'PHP-GEN-001', name: 'email', engine: { def: [`${U}:32`], comp: 'email' }, status: 'gap' },
 { id: 'GEN-COLLECTION-FIRST', family: 'PHP-GEN-001', name: 'email', engine: { def: [`${U}:32`], comp: 'email' }, status: 'pass' },
 { id: 'GEN-FOREACH', family: 'PHP-GEN-001', name: 'email', engine: { def: [`${U}:32`], comp: 'email' }, status: 'pass' },
 { id: 'GEN-EXTENDS', family: 'PHP-GEN-001', name: 'email', engine: { def: [`${U}:32`], comp: 'email' }, status: 'pass' },
 { id: 'GEN-CLASS-STRING', family: 'PHP-GEN-001', name: 'promote', engine: { def: [`${A}:12`], comp: 'promote' }, status: 'pass' },
 { id: 'TRAIT-INSTEADOF', family: 'PHP-TRAIT-001', name: 'id', engine: { def: ['src/Concerns/HasId.php:7'], comp: 'id' }, status: 'gap', layer: { def: ['src/Concerns/HasId.php:7'] } },
 { id: 'TRAIT-ALIAS', family: 'PHP-TRAIT-001', name: 'legacyId', engine: { def: ['src/Concerns/LegacyId.php:7'], comp: 'legacyId' }, status: 'gap', layer: { def: ['src/Concerns/LegacyId.php:7'], comp: 'legacyId' } },
 { id: 'TRAIT-METHOD', family: 'PHP-TRAIT-001', name: 'describeId', engine: { def: ['src/Concerns/HasId.php:12'], comp: 'describeId' }, status: 'pass', layer: { def: ['src/Concerns/HasId.php:12'] } },
 { id: 'TRAIT-SECOND', family: 'PHP-TRAIT-001', name: 'legacyOnly', engine: { def: ['src/Concerns/LegacyId.php:12'], comp: 'legacyOnly' }, status: 'pass', layer: { def: ['src/Concerns/LegacyId.php:12'] } },
 { id: 'INHERIT-OVERRIDE', family: 'PHP-INHERIT-001', name: 'label', engine: { def: [`${A}:7`], comp: 'label' }, status: 'pass' },
 { id: 'INHERIT-STATIC', family: 'PHP-INHERIT-001', name: 'promote', engine: { def: [`${A}:12`], comp: 'promote' }, status: 'pass' },
 { id: 'INHERIT-PARENT', family: 'PHP-INHERIT-001', name: 'table', engine: { def: [`${U}:22`], comp: 'table' }, status: 'pass' },
 { id: 'INHERIT-TRAIT', family: 'PHP-INHERIT-001', name: 'id', engine: { def: ['src/Concerns/HasId.php:7'], comp: 'id' }, status: 'pass', layer: { def: ['src/Concerns/HasId.php:7'] } },
 { id: 'INHERIT-INTERFACE', family: 'PHP-INHERIT-001', name: 'label', engine: { def: ['src/Contracts/Named.php:7'], impl: [`${A}:7`, `${U}:27`] }, status: 'pass' },
 { id: 'VENDOR-CLASS', family: 'PHP-VENDOR-001', name: 'Collection', engine: { def: ['vendor/acme/collections/src/Collection.php:12'] }, status: 'pass' },
 { id: 'VENDOR-METHOD', family: 'PHP-VENDOR-001', name: 'all', engine: { def: ['vendor/acme/collections/src/Collection.php:29'], comp: 'all' }, status: 'pass' },
 { id: 'VENDOR-MISSING', family: 'PHP-VENDOR-001', name: 'Thing', engine: { def: [] }, status: 'pass' },
 { id: 'NATIVE-FUNCTION', family: 'PHP-NATIVE-001', name: 'strlen', engine: { def: ['stub:Core/Core.php'], comp: 'strlen', hover: 'Get string length' }, status: 'pass' },
 { id: 'NATIVE-METHOD', family: 'PHP-NATIVE-001', name: 'format', engine: { def: ['stub:date/date_c.php'], comp: 'format' }, status: 'pass' },
 { id: 'NATIVE-ARRAY', family: 'PHP-NATIVE-001', name: 'array_map', engine: { def: ['stub:standard/standard_9.php'], comp: 'array_map' }, status: 'pass' },
 { id: 'NATIVE-EXT-JSON', family: 'PHP-NATIVE-001', name: 'json_encode', engine: { def: ['stub:json/json.php'], comp: 'json_encode' }, status: 'pass' },
 { id: 'NATIVE-LEVEL', family: 'PHP-NATIVE-001', name: 'array_find', engine: { compAbsent: 'array_find' }, status: 'gap' },
];
const files = { 'TYPE': 'types', 'DOC': 'doc', 'GEN': 'generics', 'TRAIT': 'traits', 'INHERIT': 'inherit', 'VENDOR': 'vendor', 'NATIVE': 'native' } as Record<string, string>;
const STUB = 'vendor/jetbrains/phpstorm-stubs/';

const temp = await realpath(await mkdtemp(join(tmpdir(), 'php-ide-semantics-')));
const root = join(temp, 'project'); const phar = resolve('.tools/phpactor.phar');
await cp(resolve('docs/research/fixtures/php-semantics'), root, { recursive: true });
const walk = async (dir: string): Promise<string[]> => (await Promise.all((await readdir(dir, { withFileTypes: true })).map(e => e.isDirectory() ? walk(join(dir, e.name)) : e.name.endsWith('.php') ? [join(dir, e.name)] : []))).flat();
const index = new PhpHierarchy();
for (const path of await walk(root)) for (const c of parseHierarchy(await readFile(path, 'utf8'), relative(root, path))) index.add(c);
const lsp = await startPhpactor(root, { phar, cache: join(temp, 'cache') });
const pos = (text: string, offset: number) => { const lines = text.slice(0, offset).split('\n'); return { line: lines.length - 1, character: lines.at(-1)!.length }; };
const where = (item: any) => {
 const uri: string = item.uri ?? item.targetUri; const line = (item.range ?? item.targetSelectionRange).start.line + 1;
 if (uri.startsWith('phar://')) { const at = uri.indexOf(STUB); return at >= 0 && decodeURIComponent(uri.slice('phar://'.length, at)) === phar + '/' ? `stub:${uri.slice(at + STUB.length)}` : `phar:${uri}`; }
 return `${relative(root, fileURLToPath(uri))}:${line}`;
};
const list = (v: any) => (Array.isArray(v) ? v : v ? [v] : []).map(where).sort();
const results: any[] = []; let failed = 0;
try {
 for (const c of cases) {
  const path = join(root, 'probes', files[c.id.split('-')[0]] + '.php'); const text = await readFile(path, 'utf8');
  const marker = text.indexOf(`// ${c.id}`); const lineStart = text.lastIndexOf('\n', marker) + 1;
  const offset = text.lastIndexOf(c.name, marker); if (offset < lineStart) throw Error(`${c.id}: ${c.name} não está na linha do marcador`);
  const uri = lsp.open(path, text); const at = pos(text, offset + 1);
  const got: Record<string, unknown> = {}; const problems: string[] = [];
  if (c.engine.def) { got.def = list(await lsp.request('textDocument/definition', { textDocument: { uri }, position: at }).catch((e: Error) => `erro: ${e.message}`)); if (JSON.stringify(got.def) !== JSON.stringify([...c.engine.def].sort())) problems.push(`definição ${JSON.stringify(got.def)}`); }
  if (c.engine.impl) { got.impl = list(await lsp.request('textDocument/implementation', { textDocument: { uri }, position: at })); if (JSON.stringify(got.impl) !== JSON.stringify([...c.engine.impl].sort())) problems.push(`implementações ${JSON.stringify(got.impl)}`); }
  if (c.engine.hover) { const h = await lsp.request('textDocument/hover', { textDocument: { uri }, position: at }); got.hover = JSON.stringify(h?.contents ?? null).slice(0, 200); if (!String(got.hover).includes(c.engine.hover)) problems.push(`hover sem "${c.engine.hover}"`); }
  let labels: string[] = [];
  if (c.engine.comp || c.engine.compAbsent || c.layer?.comp) {
   const prefix = c.name.slice(0, c.engine.compAbsent ? c.name.length - 1 : 1); const edited = text.slice(0, offset) + prefix + text.slice(offset + c.name.length);
   lsp.open(path, edited); const comp = await lsp.request('textDocument/completion', { textDocument: { uri }, position: pos(edited, offset + prefix.length) });
   labels = (Array.isArray(comp) ? comp : comp?.items ?? []).map((i: any) => i.label); lsp.open(path, text);
   got.comp = labels.slice(0, 12);
   if (c.engine.comp && !labels.includes(c.engine.comp)) problems.push(`completion sem ${c.engine.comp}`);
   if (c.engine.compAbsent && labels.includes(c.engine.compAbsent)) problems.push(`completion inventa/oferece ${c.engine.compAbsent}`);
  }
  const engineOk = !problems.length;
  let layerOk: boolean | undefined; const layer: Record<string, unknown> = {};
  if (c.layer) {
   // Mesmo caminho do editor: tipo do receptor pelo hover do servidor e resolução pela hierarquia própria.
   const access = /(\$[A-Za-z_]\w*)\s*(?:\?->|->)\s*$/.exec(text.slice(0, offset));
   const hover = access ? await lsp.request('textDocument/hover', { textDocument: { uri }, position: pos(text, access.index + 1) }) : null;
   const short = hoverClassName([hover?.contents].flat().map((x: any) => typeof x === 'string' ? x : x?.value ?? '').join('\n'));
   const cls = short ? index.resolveShort(short, analyze(text), offset) : undefined;
   const resolved = cls ? adaptedMethod(index, cls.fqn, c.name) : undefined;
   const engineDef = got.def as string[] | undefined;
   layer.def = resolved && (resolved.adapted || !engineDef?.length) ? [`${resolved.found.owner.path}:${pos(await readFile(join(root, resolved.found.owner.path!), 'utf8'), resolved.found.method.offset).line + 1}`] : engineDef;
   if (c.layer.comp) layer.comp = cls ? index.aliases(cls.fqn).map(a => a.alias) : [];
   layerOk = (!c.layer.def || JSON.stringify(layer.def) === JSON.stringify(c.layer.def)) && (!c.layer.comp || [...labels, ...(layer.comp as string[])].includes(c.layer.comp));
  }
  const ok = c.status === 'pass' ? engineOk && layerOk !== false : layerOk !== false;
  if (!ok) failed++;
  const verdict = !ok ? 'FALHOU' : c.status === 'gap' ? (engineOk ? 'gap-fechado?' : layerOk ? 'corrigido pela camada' : 'lacuna do motor') : 'ok';
  results.push({ id: c.id, family: c.family, status: c.status, verdict, engine: engineOk, layer: layerOk, problems, got, ...(c.layer ? { layerGot: layer } : {}) });
  console.log(`${verdict.padEnd(22)} ${c.id.padEnd(22)} ${problems.join('; ')}${c.layer ? ` | camada: ${JSON.stringify(layer)}` : ''}`);
 }
 // Gutter: marcadores calculados sobre a mesma fixture.
 const markers = hierarchyMarkers([index.get('Sem\\Model\\User')!], index).map(m => `${m.name}:${m.kind}`);
 const expectedMarkers = ['User:subclassed', 'table:implements', 'label:overrides', 'label:overridden'];
 const gutterOk = JSON.stringify(markers) === JSON.stringify(expectedMarkers); if (!gutterOk) failed++;
 console.log(`${(gutterOk ? 'ok' : 'FALHOU').padEnd(22)} ${'INHERIT-GUTTER'.padEnd(22)} ${markers.join(', ')}`);
 results.push({ id: 'INHERIT-GUTTER', family: 'PHP-INHERIT-001', status: 'pass', verdict: gutterOk ? 'ok' : 'FALHOU', layer: gutterOk, got: markers });
 await mkdir('.artifacts', { recursive: true });
 await writeFile('.artifacts/php-semantics.json', JSON.stringify({ engine: 'phpactor (.tools/phpactor.phar)', date: new Date().toISOString(), results }, null, 1));
} finally { lsp.stop(); await rm(temp, { recursive: true, force: true }); }
console.log(failed ? `${failed} caso(s) falharam` : `${results.length} casos; nenhum critério obrigatório falhou`);
process.exit(failed ? 1 : 0);
