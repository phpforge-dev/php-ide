import test from 'node:test';
import assert from 'node:assert/strict';
import { diff, lines, merge3, simpleMerge, summary } from '../.tools/plugin-packages/git/shared/merge';

const base = "<?php\n// cabeçalho\nfunction a() { return 1; }\n\nfunction b() { return 'b'; }\n\nfunction c() { return 'c'; }\n\nfunction d() { return 'd'; }\n";
const ours = base.replace('return 1;', 'return 10;').replace("'c'", "'c-main'").replace("'d'", "'d2'");
const theirs = base.replace("'b'", "'b-feature'").replace("'c'", "'c-feature'").replace("'d'", "'d2'");

test('chunks do caso observado no PhpStorm: 3 alterações e 1 conflito', () => {
 const m = merge3(base, ours, theirs);
 assert.deepEqual(m.chunks.map(c => [c.kind, c.base]), [['left', [2, 3]], ['right', [4, 5]], ['conflict', [6, 7]], ['both', [8, 9]]]);
 assert.equal(summary(3, 1), '3 alterações. 1 conflito.');
 assert.equal(summary(0, 1), 'Nenhuma alteração. 1 conflito.');
 assert.equal(summary(1, 0), '1 alteração.');
 assert.equal(summary(0, 0), 'Todas as alterações foram processadas.');
});

test('inserções, exclusões e faixas projetadas em cada lado', () => {
 const b = 'a\nb\nc\nd\n';
 const m = merge3(b, 'a\nnovo\nb\nc\nd\n', 'a\nb\nc\n');
 assert.deepEqual(m.chunks.map(c => ({ kind: c.kind, base: c.base, left: c.left, right: c.right })), [
  { kind: 'left', base: [1, 1], left: [1, 2], right: [1, 1] },
  { kind: 'right', base: [3, 4], left: [4, 5], right: [3, 3] },
 ]);
 const add = merge3('', 'x\n', 'y\n');
 assert.deepEqual(add.chunks.map(c => c.kind), ['conflict'], 'add/add sem base');
 assert.deepEqual(merge3(b, b, b).chunks, []);
 assert.deepEqual(merge3('x', 'x\n', 'x').chunks.map(c => c.kind), ['left'], 'última linha sem terminador');
});

test('diff reconstrói o destino (propriedade com sequências aleatórias)', () => {
 let seed = 7; const rnd = () => (seed = (seed * 1103515245 + 12345) % 2 ** 31) / 2 ** 31;
 for (let t = 0; t < 500; t++) {
  const gen = () => Array.from({ length: Math.floor(rnd() * 15) }, () => 'abcd'[Math.floor(rnd() * 4)]);
  const a = gen(); const b = gen(); const out: string[] = []; let i = 0;
  for (const h of diff(a, b)) { assert.ok(h.a[0] >= i); out.push(...a.slice(i, h.a[0]), ...b.slice(...h.b)); i = h.a[1]; }
  out.push(...a.slice(i));
  assert.equal(out.join(''), b.join(''), `${a.join('')} → ${b.join('')}`);
 }
 assert.deepEqual(lines('a\nb'), ['a\n', 'b']);
});

test('conflitos simples só quando os lados alteram caracteres diferentes', () => {
 assert.equal(simpleMerge('return $a + $b;\n', 'return $x + $b;\n', 'return $a + $y;\n'), 'return $x + $y;\n');
 assert.equal(simpleMerge("function c() { return 'c'; }\n", "function c() { return 'c-main'; }\n", "function c() { return 'c-feature'; }\n"), null);
 assert.equal(simpleMerge('a b c', 'A b c', 'A b c'), 'A b c', 'mesma edição dos dois lados');
});
