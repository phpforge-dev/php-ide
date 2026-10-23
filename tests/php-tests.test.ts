import test from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { existsSync, readFileSync, readdirSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { discoverTests, isTestFile, locate, parseJunit, pestFilter, phpunitFilter, summarize } from '../shared/language/php-tests';
import { PhpTestsPlugin } from '../shared/language/plugins/php-tests';
import { PluginHost } from '../shared/language/plugins/host';
import type { ProjectFiles } from '../shared/language/plugins/api';

const fixtures = join(import.meta.dirname, '../fixtures/php-tests');
const read = (path: string) => readFileSync(join(fixtures, path), 'utf8');
/** Projeto em disco com leitura confinada à pasta, como o `ProjectFiles` do renderer. */
function project(root: string, extra: Record<string, string> = {}): ProjectFiles {
 const walk = (dir: string): string[] => readdirSync(join(root, dir)).flatMap(name => { const p = dir ? `${dir}/${name}` : name; return statSync(join(root, p)).isDirectory() ? walk(p) : [p]; });
 return {
  root,
  read: async path => extra[path] ?? (existsSync(join(root, path)) ? readFileSync(join(root, path), 'utf8') : null),
  exists: async path => path in extra || existsSync(join(root, path)),
  list: async (dir, accept) => walk(dir).filter(p => accept(p.split('/').pop()!)),
  uri: path => `file://${root}/${path}`,
 };
}

test('arquivos de teste: sufixo Test.php fora de vendor', () => {
 assert.ok(isTestFile('tests/Unit/CalculatorTest.php'));
 assert.ok(!isTestFile('src/Calculator.php') && !isTestFile('vendor/x/tests/FooTest.php') && !isTestFile('tests/Pest.php'));
});

test('PHPUnit: classe, métodos test*, #[Test]; ignora privados, estáticos e provedores', () => {
 const cases = discoverTests('tests/Unit/CalculatorTest.php', read('phpunit/tests/Unit/CalculatorTest.php'));
 assert.deepEqual(cases.map(c => [c.kind, c.label, c.line + 1]), [
  ['class', 'CalculatorTest', 10], ['method', 'testAddsNumbers', 12], ['method', 'divides_numbers', 18],
  ['method', 'testFailsOnPurpose', 24], ['method', 'testSums', 30], ['method', 'testSkipped', 40],
 ]);
 assert.equal(cases[0].name, 'Tests\\Unit\\CalculatorTest');
 assert.equal(cases[0].filter, '', 'classe executa o arquivo inteiro');
 assert.equal(cases[4].filter, '/Tests\\\\Unit\\\\CalculatorTest::testSums( with data set .*)?$/');
});

test('PHPUnit: @test em docblock, classe abstrata e strings que parecem código', () => {
 const text = `<?php\nabstract class BaseTest extends TestCase { public function testInherited() {} }\nfinal class OtherTest extends BaseTest {\n /** @test */\n public function it_works() { $s = 'function testFake() {}'; }\n protected function testHelper() {}\n}\n`;
 assert.deepEqual(discoverTests('tests/OtherTest.php', text).map(c => c.label), ['OtherTest', 'it_works']);
});

test('Pest: it/test/describe com descrições literais, prefixos e filtros', () => {
 const cases = discoverTests('tests/Unit/CalculatorTest.php', read('pest/tests/Unit/CalculatorTest.php'));
 assert.deepEqual(cases.map(c => [c.kind, c.name, c.line + 1]), [
  ['pest', 'adds numbers', 5], ['pest', 'it divides numbers', 9], ['pest', 'it fails on purpose', 13],
  ['describe', '`datasets`', 17], ['pest', '`datasets` → it sums', 18], ['pest', '`datasets` → accepts emails', 22],
  ['pest', 'it is skipped', 27], ['pest', "name with 'quotes' and (parens)", 31],
 ]);
 assert.equal(cases[3].filter, '`datasets` → ', 'describe seleciona o bloco inteiro');
 assert.equal(cases.at(-1)!.filter, "name with 'quotes' and \\(parens\\)");
 assert.deepEqual(discoverTests('tests/XTest.php', "<?php\n$this->it('x');\nfunction test() {}\n// it('comentário')\n"), [], 'métodos, declarações e comentários não contam');
});

test('filtros escapam metacaracteres de regex', () => {
 assert.equal(phpunitFilter('test_a', 'A\\BTest'), '/A\\\\BTest::test_a( with data set .*)?$/');
 assert.equal(pestFilter('soma [1+1] = 2?'), 'soma \\[1\\+1\\] = 2\\?');
});

test('JUnit do PHPUnit 11: status, linha, mensagem e data sets', () => {
 const results = parseJunit(read('junit/phpunit-11.xml'), '/projeto');
 assert.deepEqual(results.map(r => [r.name, r.status, r.line]), [
  ['testAddsNumbers', 'passed', 12], ['divides_numbers', 'passed', 18], ['testFailsOnPurpose', 'failed', 24],
  ['testSums with data set "zero"', 'passed', 30], ['testSums with data set "positivos"', 'passed', 30], ['testSkipped', 'skipped', 40],
 ]);
 const failed = results[2];
 assert.equal(failed.file, 'tests/Unit/CalculatorTest.php');
 assert.equal(failed.failureLine, 26);
 assert.equal(failed.message, 'Failed asserting that 4 is identical to 5.');
 assert.deepEqual(summarize(results), { total: 6, passed: 4, failed: 1, errors: 0, skipped: 1, time: summarize(results).time });
});

test('JUnit do Pest 3: arquivo sem sufixo, falha na linha e linha do teste pela descoberta', () => {
 const results = parseJunit(read('junit/pest-3.xml'), '/projeto');
 const cases = discoverTests('tests/Unit/CalculatorTest.php', read('pest/tests/Unit/CalculatorTest.php'));
 assert.ok(results.every(r => r.file === 'tests/Unit/CalculatorTest.php'));
 const failed = results.find(r => r.status === 'failed')!;
 assert.equal(failed.message, 'Failed asserting that 4 is identical to 5.');
 assert.equal(failed.failureLine, 14);
 assert.deepEqual(results.map(r => locate(r, cases)), [5, 9, 13, 18, 18, 22, 22, 27, 31]);
 assert.equal(summarize(results).skipped, 1);
});

test('JUnit: erro, entidades e relatório vazio', () => {
 const xml = `<testsuites><testsuite><testcase name="t &amp; &#233;" class="A" file="/r/tests/ATest.php" line="3" time="0.5"><error type="Error">A::t &amp; é\nCall to undefined function x()\n\n/r/tests/ATest.php:4</error></testcase></testsuite></testsuites>`;
 assert.deepEqual(parseJunit(xml, '/r'), [{ name: 't & é', className: 'A', file: 'tests/ATest.php', line: 3, failureLine: 4, status: 'error', message: 'Call to undefined function x()', time: 0.5 }]);
 assert.deepEqual(parseJunit('<testsuites/>', '/r'), []);
});

test('plugin: detecta Pest/PHPUnit pelo composer.json e oferece ações por teste', async () => {
 const pest = new PhpTestsPlugin();
 assert.deepEqual(await pest.detect(project(join(fixtures, 'pest'))), { version: '^3.0' });
 assert.equal(pest.name, 'Pest');
 const phpunit = new PhpTestsPlugin();
 assert.deepEqual(await phpunit.detect(project(join(fixtures, 'phpunit'), { 'composer.lock': JSON.stringify({ packages: [], 'packages-dev': [{ name: 'phpunit/phpunit', version: '11.5.57' }] }) })), { version: '11.5.57' });
 assert.equal(await new PhpTestsPlugin().detect(project(join(fixtures, '../laravel-strings'))), null, 'projeto sem runner');
 const host = new PluginHost(project(join(fixtures, 'pest')), [new PhpTestsPlugin()]);
 assert.deepEqual(await host.status(), [{ id: 'php-tests', name: 'Pest', version: '^3.0' }]);
 const lenses = await host.codeLenses('tests/Unit/CalculatorTest.php', read('pest/tests/Unit/CalculatorTest.php'));
 assert.equal(lenses[0].title, '▶ Executar CalculatorTest.php');
 assert.deepEqual(lenses[0].arguments, [{ framework: 'pest', path: 'tests/Unit/CalculatorTest.php', filter: '', label: 'CalculatorTest.php' }]);
 assert.deepEqual(lenses.slice(1).map(l => [l.line, l.title]), [[4, '▶ Executar teste'], [8, '▶ Executar teste'], [12, '▶ Executar teste'], [16, '▶ Executar describe'], [17, '▶ Executar teste'], [21, '▶ Executar teste'], [26, '▶ Executar teste'], [30, '▶ Executar teste']]);
 assert.deepEqual(await host.codeLenses('src/Calculator.php', read('pest/src/Calculator.php')), [], 'só arquivos de teste');
 const unit = new PluginHost(project(join(fixtures, 'phpunit')), [new PhpTestsPlugin()]);
 const classLens = (await unit.codeLenses('tests/Unit/CalculatorTest.php', read('phpunit/tests/Unit/CalculatorTest.php')))[0];
 assert.equal(classLens.title, '▶ Executar CalculatorTest');
 assert.equal((classLens.arguments[0] as { framework: string }).framework, 'phpunit');
});

// Ensaio real opcional: PHP_IDE_TEST_RUNNERS aponta para cópias das fixtures com `composer install` feito.
// Confirma que os filtros gerados selecionam exatamente o teste pedido no PHPUnit/Pest instalados.
const runners = process.env.PHP_IDE_TEST_RUNNERS;
test('filtros gerados selecionam o teste nos runners reais', { skip: !runners && 'defina PHP_IDE_TEST_RUNNERS' }, () => {
 const run = (framework: 'pest' | 'phpunit', filter: string) => {
  const cwd = join(runners!, framework);
  try { return execFileSync('php', [`vendor/bin/${framework}`, 'tests/Unit/CalculatorTest.php', `--filter=${filter}`, '--colors=never'], { cwd, encoding: 'utf8' }); }
  catch (error) { return String((error as { stdout?: string }).stdout ?? error); }
 };
 for (const c of discoverTests('tests/Unit/CalculatorTest.php', read('phpunit/tests/Unit/CalculatorTest.php')).filter(c => c.kind === 'method')) {
  const expected = c.label === 'testSums' ? 2 : 1;
  assert.match(run('phpunit', c.filter), new RegExp(`Tests: ${expected}\\b|OK \\(${expected} tests?`), c.label);
 }
 const counts: Record<string, number> = { '`datasets`': 4, '`datasets` → it sums': 2, '`datasets` → accepts emails': 2 };
 for (const c of discoverTests('tests/Unit/CalculatorTest.php', read('pest/tests/Unit/CalculatorTest.php'))) {
  const output = run('pest', c.filter);
  const total = [...output.matchAll(/^\s+(?:✓|⨯|-|✗)\s/gm)].length;
  assert.equal(total, counts[c.name] ?? 1, `${c.name}\n${output}`);
 }
});
