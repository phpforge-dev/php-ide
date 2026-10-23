import { analyze, phpTokens, type PhpToken } from './php-source';

// Descoberta de testes PHPUnit/Pest e leitura do relatório JUnit. Implementado a partir da
// documentação pública do PHPUnit (`--filter`, `--log-junit`) e do comportamento observado
// do Pest 3 na CLI; não reproduz código do PhpStorm nem do plugin pest-intellij.
export type TestFramework = 'pest' | 'phpunit';
/** `line` é 0-based; `filter` vazio executa o arquivo inteiro. */
export type TestCase = { kind: 'class' | 'method' | 'pest' | 'describe'; name: string; label: string; line: number; filter: string };
export type TestStatus = 'passed' | 'failed' | 'error' | 'skipped';
/** `line`: 1-based, do teste; `failureLine`: 1-based, onde a falha ocorreu no arquivo do teste. */
export type TestResult = { name: string; className?: string; file?: string; line?: number; failureLine?: number; status: TestStatus; message?: string; time: number };
export type TestSummary = { total: number; passed: number; failed: number; errors: number; skipped: number; time: number };

export const isTestFile = (path: string) => /Test\.php$/.test(path) && !path.split('/').includes('vendor');
const escapeRegex = (value: string) => value.replace(/[\\^$.*+?()[\]{}|/#]/g, '\\$&');
/** Delimitado explicitamente: o PHPUnit aceita a expressão com `/…/` como regex completa. */
export const phpunitFilter = (method: string, className?: string) => `/${className ? escapeRegex(className) : ''}::${escapeRegex(method)}( with data set .*)?$/`;
// O Pest compara o filtro com a descrição; âncoras não casam (observado no Pest 3.8).
export const pestFilter = (fullName: string) => escapeRegex(fullName);

function matching(tokens: PhpToken[], open: number): number {
 const pair: Record<string, string> = { '(': ')', '[': ']', '{': '}' };
 const stack: string[] = [];
 for (let i = open; i < tokens.length; i++) {
  const v = tokens[i].value;
  if (tokens[i].type !== 'punct') continue;
  if (pair[v]) stack.push(pair[v]);
  else if (v === stack.at(-1)) { stack.pop(); if (!stack.length) return i; }
 }
 return tokens.length - 1;
}
const lineOf = (text: string, offset: number) => text.slice(0, offset).split('\n').length - 1;

/** Testes Pest: `it()`, `test()` e `describe()` com descrição literal, inclusive aninhados em `describe`. */
function pestCases(text: string, tokens: PhpToken[]): TestCase[] {
 type Call = { kind: 'it' | 'test' | 'describe'; title: string; start: number; end: number; offset: number };
 const calls: Call[] = [];
 for (let i = 0; i < tokens.length - 2; i++) {
  const t = tokens[i]; const prev = tokens[i - 1]?.value;
  if (t.type !== 'word' || !['it', 'test', 'describe'].includes(t.value)) continue;
  if (prev === '->' || prev === '::' || prev === 'function' || prev === 'new' || prev === '\\' && tokens[i - 2]?.type === 'word') continue;
  if (tokens[i + 1].value !== '(' || tokens[i + 2].type !== 'string') continue;
  calls.push({ kind: t.value as Call['kind'], title: tokens[i + 2].value, start: i, end: matching(tokens, i + 1), offset: t.offset });
 }
 return calls.map(call => {
  const parents = calls.filter(c => c.kind === 'describe' && c !== call && c.start < call.start && c.end >= call.end);
  const prefix = parents.map(p => `\`${p.title}\` → `).join('');
  const own = call.kind === 'it' ? `it ${call.title}` : call.title;
  const name = call.kind === 'describe' ? prefix + `\`${call.title}\`` : prefix + own;
  // Para describe, o prefixo com a seta seleciona todos os testes do bloco.
  return { kind: call.kind === 'describe' ? 'describe' : 'pest', name, label: call.kind === 'describe' ? call.title : own, line: lineOf(text, call.offset), filter: pestFilter(call.kind === 'describe' ? `${name} → ` : name) };
 });
}

/** Classes `*Test` concretas e métodos públicos `test*`, `#[Test]` ou `@test`. */
function phpunitCases(text: string, tokens: PhpToken[]): TestCase[] {
 const out: TestCase[] = [];
 const context = analyze(text);
 for (let i = 0; i < tokens.length - 1; i++) {
  if (tokens[i].value !== 'class' || tokens[i + 1].type !== 'word' || tokens[i - 1]?.value === '::' || tokens[i - 1]?.value === 'new') continue;
  const name = tokens[i + 1].value;
  if (!name.endsWith('Test') || tokens[i - 1]?.value === 'abstract') continue;
  const fqn = context.declarations.find(d => d.name === name)?.fqn ?? name;
  out.push({ kind: 'class', name: fqn, label: name, line: lineOf(text, tokens[i + 1].offset), filter: '' });
  let open = i + 2; while (open < tokens.length && tokens[open].value !== '{') open++;
  const close = matching(tokens, open);
  let depth = 0; let boundary = open;
  for (let j = open + 1; j < close; j++) {
   const v = tokens[j].value;
   if (v === '{') depth++;
   else if (v === '}') { depth--; if (depth === 0) boundary = j; }
   else if (v === ';' && depth === 0) boundary = j;
   if (depth !== 0 || v !== 'function' || tokens[j + 1]?.type !== 'word') continue;
   const method = tokens[j + 1].value;
   const modifiers = tokens.slice(boundary + 1, j).map(t => t.value);
   const head = text.slice(tokens[boundary].offset + 1, tokens[j].offset);
   const marked = /#\[\s*\\?(?:PHPUnit\\Framework\\Attributes\\)?Test\s*[\](,]/.test(head) || /@test\b/.test(head);
   if (modifiers.includes('private') || modifiers.includes('protected') || modifiers.includes('static') || modifiers.includes('abstract')) continue;
   if (!method.startsWith('test') && !marked) continue;
   out.push({ kind: 'method', name: `${fqn}::${method}`, label: method, line: lineOf(text, tokens[j + 1].offset), filter: phpunitFilter(method, fqn) });
  }
  i = close;
 }
 return out;
}

/** Testes do arquivo; Pest tem prioridade quando o arquivo usa a sintaxe funcional. */
export function discoverTests(path: string, text: string): TestCase[] {
 if (!isTestFile(path)) return [];
 const tokens = phpTokens(text);
 const pest = pestCases(text, tokens);
 return [...pest, ...phpunitCases(text, tokens)].sort((a, b) => a.line - b.line);
}

const entities: Record<string, string> = { quot: '"', amp: '&', lt: '<', gt: '>', apos: "'" };
const unescape = (value: string) => value.replace(/&(#x[0-9a-f]+|#\d+|\w+);/gi, (m, e: string) => e[0] === '#' ? String.fromCodePoint(e[1] === 'x' || e[1] === 'X' ? parseInt(e.slice(2), 16) : Number(e.slice(1))) : entities[e] ?? m);
function attributes(tag: string) {
 const out: Record<string, string> = {};
 for (const m of tag.matchAll(/([\w:-]+)="([^"]*)"/g)) out[m[1]] = unescape(m[2]);
 return out;
}
/** Caminho relativo à raiz do projeto, sem o sufixo `::descrição` que o Pest acrescenta. */
function relative(file: string | undefined, root: string) {
 if (!file) return undefined;
 const plain = file.replace(/\.php::.*$/s, '.php');
 return plain.startsWith(root + '/') ? plain.slice(root.length + 1) : plain;
}

/** Lê `<testcase>` do relatório `--log-junit` (PHPUnit 10+ e Pest 2+). */
export function parseJunit(xml: string, root: string): TestResult[] {
 const out: TestResult[] = [];
 for (const m of xml.matchAll(/<testcase\b([^>]*?)(\/>|>([\s\S]*?)<\/testcase>)/g)) {
  const a = attributes(m[1]); const body = m[3] ?? '';
  const file = relative(a.file, root);
  const problem = /<(failure|error)\b[^>]*?(?:\/>|>([\s\S]*?)<\/\1>)/.exec(body);
  const status: TestStatus = problem ? (problem[1] === 'failure' ? 'failed' : 'error') : /<skipped\b/.test(body) ? 'skipped' : 'passed';
  const result: TestResult = { name: a.name ?? '', status, time: Number(a.time ?? 0) || 0 };
  if (a.class) result.className = a.class;
  if (file) result.file = file;
  if (a.line) result.line = Number(a.line);
  if (problem) {
   const detail = unescape(problem[2] ?? '').trim();
   const name = file?.split('/').pop();
   const at = [...detail.matchAll(/([^\s:]+\.php):(\d+)/g)].filter(l => !name || l[1].endsWith(name)).at(-1);
   if (at) result.failureLine = Number(at[2]);
   // A primeira linha do PHPUnit repete o nome do teste; o Pest a concatena sem quebra.
   const lines = detail.split('\n').filter(l => l.trim() && !/^(at )?\S+\.php:\d+$/.test(l.trim()));
   if (lines[0]?.startsWith(`${a.class}::${a.name}`) || lines[0] === a.name) lines.shift();
   else if (a.name && lines[0]?.startsWith(a.name)) lines[0] = lines[0].slice(a.name.length);
   result.message = lines.join('\n').trim() || detail;
  }
  out.push(result);
 }
 return out;
}

export function summarize(results: TestResult[]): TestSummary {
 const count = (s: TestStatus) => results.filter(r => r.status === s).length;
 return { total: results.length, passed: count('passed'), failed: count('failed'), errors: count('error'), skipped: count('skipped'), time: results.reduce((t, r) => t + r.time, 0) };
}

/** Linha do teste (1-based) para resultados sem `line` (Pest), pela descrição mais longa que casa. */
export function locate(result: TestResult, cases: TestCase[]): number | undefined {
 if (result.line) return result.line;
 const name = result.name.replace(/ with data set .*$/s, '');
 const found = cases.filter(c => c.kind === 'pest' && (name === c.name || result.name.startsWith(c.name + ' with data set'))).sort((a, b) => b.name.length - a.name.length)[0]
  ?? cases.find(c => c.kind === 'method' && result.className && c.name === `${result.className}::${name}`);
 return found ? found.line + 1 : undefined;
}
