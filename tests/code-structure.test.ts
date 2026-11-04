import test from 'node:test';
import assert from 'node:assert/strict';
import { phpStructure, markdownStructure, symbolPath, crumbLabel, referenceOf, type CodeSymbol } from '../src/code-structure';

const names = (symbols: CodeSymbol[]): unknown => symbols.map(s => s.children.length ? [s.kind + ' ' + s.name, names(s.children)] : s.kind + ' ' + s.name);
const at = (text: string, needle: string, delta = 0) => text.indexOf(needle) + delta;

const broken = `<?php

namespace Fixture;

class Broken
{
    public function total(int $a): int
    {
        $unused = 1;
        return $a + $missing
    }

    private function never(): void
    {
    }
}
`;

test('PHP: namespace, class and methods with their ranges', () => {
 const tree = phpStructure(broken);
 assert.deepEqual(names(tree), [['namespace Fixture', [['class Broken', ['method total', 'method never']]]]]);
 const path = symbolPath(tree, at(broken, '$missing'));
 assert.deepEqual(path.map(s => crumbLabel(s)), ['\\Fixture', 'Broken', 'total()']);
 assert.deepEqual(path.map(s => crumbLabel(s, 'nav')), ['\\Fixture', 'Broken', 'total']);
 assert.equal(referenceOf(path), 'Fixture\\Broken::total');
 // Caret on the modifiers of the method already belongs to it, as in the reference (7:5 → total()).
 assert.equal(symbolPath(tree, at(broken, 'public function')).at(-1)?.name, 'total');
 // Between methods: only the class; before the namespace: nothing.
 assert.deepEqual(symbolPath(tree, at(broken, '\n\n    private', 1)).map(s => s.name), ['Fixture', 'Broken']);
 assert.deepEqual(symbolPath(tree, 2), []);
});

test('PHP: strings, comments, heredocs and member names do not open declarations', () => {
 const text = `<?php
namespace App\\Models;
// class Fake {
/* function nope() { */
#[Attribute]
final class User extends Model implements HasName {
    const LABEL = "class Inner { function x() {} }";
    public function label(): string { return <<<EOT
      function heredoc() {
      EOT; }
    abstract protected function name(): string;
    public function make() { return new class { public function anon() {} }; }
    public function kind() { return static::class . $this->function; }
}
function helper() { $f = function () use ($x) { return fn() => 1; }; }
interface Named { public function label(): string; }
enum Suit: string { case Hearts = 'H'; public function color() {} }
trait HasId { public function id() {} }
`;
 assert.deepEqual(names(phpStructure(text)), [['namespace App\\Models', [
  ['class User', ['method label', 'method name', ['method make', ['method anon']], 'method kind']],
  'function helper', ['interface Named', ['method label']], ['enum Suit', ['method color']], ['trait HasId', ['method id']],
 ]]]);
 const tree = phpStructure(text);
 assert.equal(referenceOf(symbolPath(tree, at(text, "'H'"))), 'App\\Models\\Suit');
 assert.equal(referenceOf(symbolPath(tree, at(text, '$f ='))), 'App\\Models\\helper');
});

test('PHP: several namespaces, braced namespaces, inline HTML and unclosed code', () => {
 const text = `<html><?php namespace A; class One {} namespace B; class Two {} ?><p>{</p><?php function late() {}`;
 assert.deepEqual(names(phpStructure(text)), [['namespace A', ['class One']], ['namespace B', ['class Two', 'function late']]]);
 const braced = `<?php namespace A { class One { function f() { if (1) { } } } } namespace { function g() {} }`;
 assert.deepEqual(names(phpStructure(braced)), [['namespace A', [['class One', ['method f']]]], 'function g']);
 const typing = `<?php class Open { public function half() { $x = [`;
 const tree = phpStructure(typing);
 assert.deepEqual(symbolPath(tree, typing.length).map(s => s.name), ['Open', 'half']);
 assert.deepEqual(phpStructure('no php here'), []);
});

test('Markdown: nested headings, fenced code ignored', () => {
 const text = '# Title\ntext\n## Part\n```\n# not a heading\n```\n### Deep\n## Other\n# Next\n';
 assert.deepEqual(names(markdownStructure(text)), [['heading Title', [['heading Part', ['heading Deep']], 'heading Other']], 'heading Next']);
 assert.deepEqual(symbolPath(markdownStructure(text), at(text, '### Deep', 4)).map(s => s.name), ['Title', 'Part', 'Deep']);
});
