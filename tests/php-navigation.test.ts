import { test } from 'node:test';
import assert from 'node:assert/strict';
import { isPhpDeclaration } from '../.tools/plugin-packages/php-intelligence/src/php-navigation';

test('declarações e usos de classes, interfaces, traits e enums têm destinos distintos', () => {
 const text = `<?php
 namespace Sample;
 interface Named {}
 trait HasId {}
 enum State { case Ready; }
 class User implements Named { use HasId; }
 $user = new User();
 $name = User::class;
 $state = State::Ready;
 `;
 for (const [prefix, name] of [['interface ', 'Named'], ['trait ', 'HasId'], ['enum ', 'State'], ['class ', 'User']]) {
  assert.equal(isPhpDeclaration(text, text.indexOf(prefix + name) + prefix.length), true, name);
 }
 for (const [prefix, name] of [['implements ', 'Named'], ['use ', 'HasId'], ['new ', 'User'], ['$name = ', 'User'], ['$state = ', 'State']]) {
  assert.equal(isPhpDeclaration(text, text.indexOf(prefix + name) + prefix.length), false, prefix + name);
 }
});

test('método com comentários e quebra de linha é declaração; strings e chamadas não são', () => {
 const text = `<?php
 class Example {
  public function /* doc */ &
  label() {}
 }
 $name = 'function label';
 // function label
 $x->label();
 `;
 assert.equal(isPhpDeclaration(text, text.indexOf('label()')), true);
 assert.equal(isPhpDeclaration(text, text.indexOf('function label') + 'function '.length), false);
 assert.equal(isPhpDeclaration(text, text.lastIndexOf('label()')), false);
});

test('alias de import é declaração própria; usos do alias são só os do arquivo', async () => {
 const { aliasAt, aliasUsages } = await import('../shared/language/php-source');
 const text = `<?php
namespace Fixture;
use Fixture\\User as Person;
use Fixture\\Admin;
$user = new Person();
$name = Person::class; // Person em comentário
$s = 'Person';
$user->Person();
function f(Person $p): Person {}
$x = new Admin();
`;
 const decl = text.indexOf('as Person') + 3;
 assert.equal(isPhpDeclaration(text, decl), true);
 assert.equal(aliasAt(text, decl)?.declaration, true);
 const use = text.indexOf('new Person') + 4;
 assert.equal(isPhpDeclaration(text, use), false);
 assert.deepEqual(aliasAt(text, use), { alias: aliasAt(text, decl)!.alias, declaration: false });
 const usages = aliasUsages(text, aliasAt(text, decl)!.alias).map(o => text.slice(o - 4, o + 6));
 assert.deepEqual(usages, ['new Person', 'e = Person', 'n f(Person', 'p): Person']);
 // Import sem alias explícito não é alias.
 assert.equal(aliasAt(text, text.indexOf('new Admin') + 4), undefined);
});
