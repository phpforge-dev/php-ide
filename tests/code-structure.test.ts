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

// --- Round 2: JavaScript/TypeScript, JSON, YAML and HTML ---------------------------------------------
import { jsStructure, jsonStructure, yamlStructure, htmlStructure, structureOf, breadcrumbLanguage } from '../src/code-structure';
const crumbsAt = (symbols: CodeSymbol[], text: string, needle: string, delta = 0) => symbolPath(symbols, at(text, needle, delta)).map(s => crumbLabel(s));

test('JavaScript: classes, methods, functions and function variables; callbacks and calls are not declarations', () => {
 const js = `import { api } from './api';
// class Fake { nope() {} }
export class Cart {
  constructor(items) { this.items = items; }
  total() {
    return this.items.reduce((sum, item) => sum + item.price, 0);
  }
  static async load({ id } = {}) { return new Cart(await api.get(\`/cart/\${id}\`)); }
  handler = async (event) => { if (event) { this.total(); } };
}
export function checkout(cart) { const re = /}{/g; return api.post('/checkout', cart); }
const format = (value) => { return '{' + value; };
`;
 const tree = jsStructure(js);
 assert.deepEqual(names(tree), [['class Cart', ['method constructor', 'method total', 'method load', 'method handler']], 'function checkout', 'function format']);
 assert.deepEqual(crumbsAt(tree, js, 'sum + item'), ['Cart', 'total()']);
 assert.deepEqual(crumbsAt(tree, js, 'this.total()'), ['Cart', 'handler()']);
 assert.deepEqual(crumbsAt(tree, js, "api.post"), ['checkout()']);
 assert.deepEqual(crumbsAt(tree, js, "'{' + value"), ['format()']);
 assert.deepEqual(crumbsAt(tree, js, 'import'), []);
});

test('TypeScript: interfaces, enums, namespaces and typed methods', () => {
 const ts = `export interface Item { price: number; }
export enum Kind { A, B }
export namespace Shop {
  export function format(item: Item): string { return '$' + item.price; }
  export class Basket<T> {
    private items: T[] = [];
    add<U extends T>(item: U): void { this.items.push(item); }
  }
}
`;
 const tree = jsStructure(ts);
 assert.deepEqual(names(tree), ['interface Item', 'enum Kind', ['module Shop', ['function format', ['class Basket', ['method add']]]]]);
 assert.deepEqual(crumbsAt(tree, ts, "'$'"), ['Shop', 'format()']);
 assert.deepEqual(crumbsAt(tree, ts, 'this.items.push'), ['Shop', 'Basket', 'add()']);
});

test('JSON: key path, escaped keys, arrays transparent, bare values', () => {
 const json = `{
    "name": "fixture/shop",
    "autoload": { "psr-4": { "Fixture\\\\": "src/" } },
    "repositories": [ { "type": "vcs", "url": "x" } ],
    "config": { "sort": true, "n": 3 }
}`;
 const tree = jsonStructure(json);
 assert.deepEqual(crumbsAt(tree, json, '"src/"'), ['autoload', 'psr-4', 'Fixture\\']);
 assert.deepEqual(crumbsAt(tree, json, '"vcs"'), ['repositories', 'type']);
 assert.deepEqual(crumbsAt(tree, json, 'true'), ['config', 'sort']);
 assert.deepEqual(crumbsAt(tree, json, '"name"', 2), ['name']);
 assert.deepEqual(crumbsAt(tree, json, '{', 0), []);
});

test('YAML: indentation path, quoted keys, sequences and block scalars', () => {
 const yaml = `services:
    _defaults:
        autowire: true
    App\\Mailer:
        arguments:
            - '%mailer.dsn%'
        tags:
            - { name: mailer }
    'quoted key':
        script: |
            fake: value
        after: 1
---
second: doc
`;
 const tree = yamlStructure(yaml);
 assert.deepEqual(crumbsAt(tree, yaml, '%mailer'), ['services', 'App\\Mailer', 'arguments']);
 assert.deepEqual(crumbsAt(tree, yaml, 'true'), ['services', '_defaults', 'autowire']);
 assert.deepEqual(crumbsAt(tree, yaml, 'fake: value'), ['services', 'quoted key', 'script']);
 assert.deepEqual(crumbsAt(tree, yaml, 'after'), ['services', 'quoted key', 'after']);
 assert.deepEqual(crumbsAt(tree, yaml, 'doc'), ['second']);
});

test('HTML: element path with id and classes; void, raw and unclosed elements', () => {
 const page = `<!doctype html>
<html>
<head><meta charset="utf-8"><script>if (a < b) { "<div>" }</script></head>
<body>
  <!-- <section> -->
  <main id="app" class="page wide">
    <ul class='items'>
      <li>First
      <li>Second</li>
    </ul>
    <img src="x.png" alt=">">
  </main>
</body>
</html>`;
 const tree = htmlStructure(page);
 assert.deepEqual(crumbsAt(tree, page, 'Second'), ['html', 'body', 'main#app.page.wide', 'ul.items', 'li']);
 assert.deepEqual(crumbsAt(tree, page, 'First'), ['html', 'body', 'main#app.page.wide', 'ul.items', 'li']);
 assert.deepEqual(crumbsAt(tree, page, '"<div>"'), ['html', 'head', 'script']);
 assert.deepEqual(crumbsAt(tree, page, 'x.png'), ['html', 'body', 'main#app.page.wide', 'img']);
 assert.deepEqual(crumbsAt(tree, page, '<section>'), ['html', 'body']);
});

test('structureOf: language groups of the settings page', () => {
 assert.equal(breadcrumbLanguage('jsonc'), 'json');
 assert.equal(structureOf('css', 'a{}'), undefined);
 assert.ok(structureOf('yaml', 'a: 1')?.length);
});
