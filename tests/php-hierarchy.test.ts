import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join, relative } from 'node:path';
import { parseHierarchy, PhpHierarchy, hierarchyMarkers } from '../.tools/plugin-packages/php-intelligence/src/shared/language/php-hierarchy';

// Fixture sintética do recorte 20; o teste cobre só a camada léxica própria.
const root = 'docs/research/fixtures/php-semantics';
const files = (dir: string): string[] => readdirSync(dir).flatMap(name => { const path = join(dir, name); return statSync(path).isDirectory() ? files(path) : path.endsWith('.php') ? [path] : []; });
const index = new PhpHierarchy(files(root).flatMap(path => parseHierarchy(readFileSync(path, 'utf8'), relative(root, path))));
const where = (r: ReturnType<PhpHierarchy['resolveMethod']>) => r && `${r.owner.fqn}::${r.method.name}`;

test('parse: extends, implements, traits e adaptações', () => {
 const user = index.get('Sem\\Model\\User')!;
 assert.deepEqual(user.extends, ['Sem\\Model\\Model']);
 assert.deepEqual(user.implements, ['Sem\\Contracts\\Named']);
 assert.deepEqual(user.traits, ['Sem\\Concerns\\HasId', 'Sem\\Concerns\\LegacyId']);
 assert.deepEqual(user.rules, [
  { kind: 'insteadof', trait: 'Sem\\Concerns\\HasId', method: 'id', excluded: ['Sem\\Concerns\\LegacyId'] },
  { kind: 'as', trait: 'Sem\\Concerns\\LegacyId', method: 'id', alias: 'legacyId' },
 ]);
 assert.deepEqual(user.methods.map(m => m.name), ['table', 'label', 'email'], 'métodos após o bloco de adaptações continuam no corpo da classe');
 assert.equal(index.get('Sem\\Model\\Model')!.isAbstract, true);
 assert.equal(index.get('Sem\\Model\\Model')!.methods.find(m => m.name === 'table')!.isAbstract, true);
 assert.equal(index.get('Sem\\Model\\Model')!.methods.find(m => m.name === 'touch')!.visibility, 'protected');
 assert.deepEqual(index.get('Acme\\Collections\\Collection')!.implements, ['IteratorAggregate']);
});

test('TRAIT: insteadof e alias resolvem o método correto', () => {
 assert.equal(where(index.resolveMethod('Sem\\Model\\User', 'id')), 'Sem\\Concerns\\HasId::id', 'insteadof exclui LegacyId::id');
 const alias = index.resolveMethod('Sem\\Model\\User', 'legacyId')!;
 assert.equal(where(alias), 'Sem\\Concerns\\LegacyId::id'); assert.equal(alias.alias, 'legacyId');
 assert.equal(where(index.resolveMethod('Sem\\Model\\Admin', 'legacyId')), 'Sem\\Concerns\\LegacyId::id', 'alias herdado pela subclasse');
 assert.equal(where(index.resolveMethod('Sem\\Model\\Admin', 'id')), 'Sem\\Concerns\\HasId::id');
 assert.deepEqual(index.aliases('Sem\\Model\\Admin').map(a => a.alias), ['legacyId']);
 assert.equal(index.resolveMethod('Sem\\Model\\User', 'missing'), undefined);
});

test('INHERIT: herança, sobrescrita e contratos', () => {
 assert.equal(where(index.resolveMethod('Sem\\Model\\Admin', 'label')), 'Sem\\Model\\Admin::label');
 assert.equal(where(index.resolveMethod('Sem\\Model\\Admin', 'table')), 'Sem\\Model\\User::table');
 assert.equal(where(index.resolveMethod('Sem\\Model\\Admin', 'save')), 'Sem\\Model\\Model::save');
 assert.deepEqual(index.ancestors('Sem\\Model\\Admin').map(c => c.fqn), ['Sem\\Model\\User', 'Sem\\Model\\Model', 'Sem\\Contracts\\Named']);
 assert.deepEqual(index.descendants('Sem\\Contracts\\Named').map(c => c.fqn), ['Sem\\Model\\User', 'Sem\\Model\\Admin']);
});

test('INHERIT: marcadores de gutter', () => {
 const of = (fqn: string) => hierarchyMarkers([index.get(fqn)!], index).map(m => `${m.name}:${m.kind}:${m.targets.map(t => `${t.cls.name}${t.method ? '::' + t.method.name : ''}`).join(',')}`);
 assert.deepEqual(of('Sem\\Model\\User'), [
  'User:subclassed:Admin',
  'table:implements:Model::table',
  'label:overrides:Model::label,Named::label',
  'label:overridden:Admin::label',
 ]);
 assert.deepEqual(of('Sem\\Model\\Admin'), ['label:overrides:User::label,Named::label']);
 assert.deepEqual(of('Sem\\Contracts\\Named'), ['Named:implemented:User,Admin', 'label:implemented:User::label,Admin::label']);
 assert.deepEqual(of('Sem\\Model\\Model'), ['Model:subclassed:User,Admin', 'table:implemented:User::table', 'label:overridden:User::label,Admin::label']);
});

test('robustez: código incompleto e classes anônimas não quebram a análise', () => {
 const partial = parseHierarchy('<?php\nclass A extends B {\n public function x() { $o = new class { function inner() {} }; }\n use T { T::y as z;\n');
 assert.equal(partial.length, 1); assert.deepEqual(partial[0].methods.map(m => m.name), ['x']);
 assert.deepEqual(parseHierarchy('<?php\n/** class Fake extends X {} */ $s = "class Nope {}";'), []);
});
