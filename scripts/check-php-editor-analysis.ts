import assert from 'node:assert/strict';
import { phpEditorAnalysis } from '../shared/php-editor-analysis';
const text=`<?php
// function fake() { $comment->fake(); }
$text = 'function fakeString() {}';
$user->label(); $user?->id(); User::create(); new User();
function describe(string $value): string { return $value; }
class Example {
 private function hidden() {}
 public function visible() {}
 public function __invoke() {}
 abstract protected function contract();
}
interface Contract { public function required(); }
trait Reused { public function shared() {} }
class Child extends ParentClass { public function inherited() {} private function local() {} }
$object = new class { public function anonymousOwner() {} };
`;
const result=phpEditorAnalysis(text);
assert.deepEqual(result.callables.map(c=>c.name),['describe','hidden','visible','__invoke','shared','inherited','local','anonymousOwner']);
for(const name of ['describe','hidden','visible','local','anonymousOwner'])assert.equal(result.callables.find(c=>c.name===name)?.canFade,true,name);
for(const name of ['__invoke','shared','inherited'])assert.equal(result.callables.find(c=>c.name===name)?.canFade,false,name);
const values=(kind:string)=>result.highlights.filter(t=>t.kind===kind).map(t=>text.slice(t.offset,t.offset+t.length));
assert(values('variable').includes('$user'));
assert(!values('variable').includes('$comment'));
for(const name of ['label','id','create','hidden'])assert(values('method').includes(name),name);
assert(values('function').includes('describe'));
assert(values('constructor').includes('User'));
assert.equal(result.highlights.some(t=>text.slice(t.offset,t.offset+t.length)==='fake'),false);
console.log('PHP editor analysis: variable/method categories, declarations, comments/strings, contracts and magic entry points passed.');
