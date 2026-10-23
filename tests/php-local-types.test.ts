import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { functionDocs, memberCalls, typeLabel, variableTypes } from '../shared/language/php-local-types';

const probe = readFileSync('fixtures/php-intelligence/probe.php', 'utf8');
const at = (needle: string) => probe.indexOf(needle);

test('C05: template identidade, união com null e new por alias', () => {
 assert.deepEqual(functionDocs(probe).find(f => f.name === 'identity'), { name: 'identity', fqn: 'Fixture\\identity', params: ['value'], templates: ['T'], paramTypes: { value: 'T' }, returnType: 'T' });
 assert.deepEqual(variableTypes(probe, at('$inferred->label'), 'inferred'), [{ name: 'User', fqn: 'Fixture\\User' }]);
 assert.equal(typeLabel(variableTypes(probe, at('$nullable = rand') + 2, 'nullable')!), 'User|null');
 assert.deepEqual(variableTypes(probe, at('$user->label'), 'user'), [{ name: 'User', fqn: 'Fixture\\User' }], 'alias Person resolve para Fixture\\User');
 assert.equal(variableTypes(probe, at('$user = new'), 'other'), undefined, 'antes da atribuição não há tipo');
 assert.equal(variableTypes(probe, at('strlen'), 'text'), undefined, 'literal string não é inferida aqui');
});

test('casos negativos: template sem @param correspondente, ternário com operandos desconhecidos', () => {
 const text = `<?php
/** @template T @return T */
function make($x) { return $x; }
$a = make(new \\A\\B());
$b = $flag ? foo() : null;
$c = $o?->x ?? null;
`;
 assert.equal(variableTypes(text, text.length, 'a'), undefined);
 assert.equal(variableTypes(text, text.length, 'b'), undefined);
 assert.equal(variableTypes(text, text.length, 'c'), undefined);
});

test('chamadas $var->método( com offset do nome', () => {
 const calls = memberCalls(probe, 'label');
 assert.deepEqual(calls.map(c => [c.variable, probe.slice(c.offset, c.offset + 5)]), [['user', 'label'], ['admin', 'label'], ['other', 'label'], ['value', 'label'], ['inferred', 'label']]);
});
