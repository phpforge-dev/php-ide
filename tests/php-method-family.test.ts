import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync } from 'node:fs';
import { parseHierarchy, PhpHierarchy } from '../shared/language/php-hierarchy';
import { methodFamily, methodImplementations } from '../shared/language/php-method-family';

// Fixture v1 dos casos C03/C04/C06 (fixtures/php-intelligence/src).
const dir = 'fixtures/php-intelligence/src';
const index = new PhpHierarchy(readdirSync(dir).flatMap(name => parseHierarchy(readFileSync(`${dir}/${name}`, 'utf8'), `src/${name}`)));
const names = (refs: { cls: { name: string } }[]) => refs.map(r => r.cls.name).sort();

test('família de User::label: base Named, membros Named/User/Admin, Unrelated fora', () => {
 const family = methodFamily(index, 'Fixture\\User', 'label');
 assert.equal(family.current?.cls.name, 'User');
 assert.deepEqual(names(family.bases), ['Named']);
 assert.deepEqual(names(family.members), ['Admin', 'Named', 'User']);
 assert.deepEqual(names(methodFamily(index, 'Fixture\\Admin', 'label').members), ['Admin', 'Named', 'User']);
 assert.deepEqual(names(methodFamily(index, 'Fixture\\Unrelated', 'label').members), ['Unrelated']);
 assert.deepEqual(methodFamily(index, 'Fixture\\Unrelated', 'label').bases, []);
});

test('implementações: na interface {Admin, User}; na chamada inclui a declaração; destino único', () => {
 assert.deepEqual(methodImplementations(index, 'Fixture\\Named', 'label', 'declaration').map(r => r.cls.name), ['Admin', 'User']);
 assert.deepEqual(methodImplementations(index, 'Fixture\\Named', 'label', 'call').map(r => r.cls.name), ['Admin', 'Named', 'User']);
 assert.deepEqual(methodImplementations(index, 'Fixture\\Admin', 'label', 'call').map(r => r.cls.name), ['Admin']);
 assert.deepEqual(methodImplementations(index, 'Fixture\\Admin', 'label', 'declaration'), []);
 // Método de trait chamado por User resolve ao trait, sem implementações por subtipo.
 assert.deepEqual(methodImplementations(index, 'Fixture\\User', 'id', 'declaration'), []);
});
