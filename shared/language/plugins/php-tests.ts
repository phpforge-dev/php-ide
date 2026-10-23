import type { IdePlugin, PluginCodeLens, ProjectFiles } from './api';
import { discoverTests, isTestFile, type TestCase, type TestFramework } from '../php-tests';

/** Argumento do comando `php-ide.runTests`: arquivo relativo, filtro (vazio = arquivo inteiro) e rótulo do painel. */
export type TestRunRequest = { framework: TestFramework; path: string; filter: string; label: string };
const packages: Record<TestFramework, string> = { pest: 'pestphp/pest', phpunit: 'phpunit/phpunit' };

/**
 * Pest e PHPUnit: detecta o runner pelo `composer.json` (ou `vendor/bin`), mostra a versão
 * instalada do `composer.lock` e oferece ações de executar arquivo, classe, describe e teste.
 * A execução fica no backend (`testRun`), restrita aos binários de `vendor/bin`.
 */
export class PhpTestsPlugin implements IdePlugin {
 readonly id = 'php-tests';
 name = 'PHPUnit';
 framework: TestFramework = 'phpunit';
 documents(path: string) { return isTestFile(path); }

 async detect(files: ProjectFiles) {
  const json = await files.read('composer.json').then(t => t ? JSON.parse(t) : {}).catch(() => ({}));
  const declared = (pkg: string) => !!(json.require?.[pkg] ?? json['require-dev']?.[pkg]);
  const has = async (framework: TestFramework) => declared(packages[framework]) || await files.exists(`vendor/bin/${framework}`);
  const framework: TestFramework | null = await has('pest') ? 'pest' : await has('phpunit') ? 'phpunit' : null;
  if (!framework) return null;
  this.framework = framework; this.name = framework === 'pest' ? 'Pest' : 'PHPUnit';
  const lock = await files.read('composer.lock').then(t => t ? JSON.parse(t) : null).catch(() => null);
  const installed = [...(lock?.packages ?? []), ...(lock?.['packages-dev'] ?? [])].find((p: { name?: string }) => p.name === packages[framework]);
  const version = installed?.version?.replace(/^v/, '') ?? (json.require?.[packages[framework]] ?? json['require-dev']?.[packages[framework]]);
  return version ? { version } : {};
 }

 private lens(test: TestCase, path: string): PluginCodeLens {
  const titles = { class: `▶ Executar ${test.label}`, method: '▶ Executar teste', pest: '▶ Executar teste', describe: '▶ Executar describe' };
  const request: TestRunRequest = { framework: this.framework, path, filter: test.filter, label: test.kind === 'class' ? test.label : test.name };
  return { line: test.line, title: titles[test.kind], tooltip: `${this.name}: ${test.name}`, command: 'php-ide.runTests', arguments: [request] };
 }

 async codeLenses(path: string, text: string) {
  const tests = discoverTests(path, text);
  if (!tests.length) return [];
  const lenses = tests.map(t => this.lens(t, path));
  // Arquivo Pest não tem classe: a ação do arquivo inteiro fica na primeira linha.
  if (!tests.some(t => t.kind === 'class')) lenses.unshift({ line: 0, title: `▶ Executar ${path.split('/').pop()}`, tooltip: `${this.name}: arquivo inteiro`, command: 'php-ide.runTests', arguments: [{ framework: this.framework, path, filter: '', label: path.split('/').pop()! } satisfies TestRunRequest] });
  return lenses;
 }
}
