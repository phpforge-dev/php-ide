import assert from 'node:assert/strict';
import { phpFileKind } from '../shared/php-file-kind';
import { NativeLanguage } from '../src/native-language';
for (const kind of ['class', 'interface', 'trait', 'enum']) {
 assert.equal(phpFileKind('src/Example.php', `<?php namespace App; ${kind} Example {}`), kind);
 assert.equal(phpFileKind('src/Other.php', `<?php ${kind} Example {}`), kind);
}
assert.equal(phpFileKind('Example.php', '<?php interface First {} class Example {}'), 'class');
assert.equal(phpFileKind('Other.php', '<?php interface First {} class Example {}'), undefined);
assert.equal(phpFileKind('Example.php', '<?php // class Example {}\n echo "trait Example {}";'), undefined);
assert.equal(phpFileKind('Example.php', '<?php $a = new class {}; Foo::class;'), undefined);
assert.equal(phpFileKind('Example.blade.php', '<?php class Example {}'), undefined);
assert.equal(phpFileKind('Example.php', '<?php abstract class Example {}'), 'class');
assert.equal(phpFileKind('Example.php', '<?php enum Example: string {case One="one";}'), 'enum');
console.log('PHP declaration icons: four types, filename preference, ambiguity, comments, strings, anonymous classes and Blade passed.');
const files = Object.fromEntries(['class','interface','trait','enum'].map(kind=>[kind+'.php',`<?php namespace App; ${kind} Example${kind} {}`]));
const language = new NativeLanguage(async(method,args=[])=>{
 if(method==='workspace')return {root:'/fixture',rootUri:'file:///fixture/'};
 if(method==='listFiles')return Object.keys(files);
 if(method==='fileExists')return false;
 if(method==='read'){const text=files[String(args[0])];if(!text)throw Error('Missing fixture');return {text,uri:'file:///fixture/'+args[0]};}
 if(method==='language')return {items:[]};
 throw Error('Unexpected transport '+method);
});
const text='<?php new Example';
const result=await language.request({method:'textDocument/completion',path:'probe.php',text,version:1,position:{line:0,character:text.length}});
assert.deepEqual(new Set(result.items.map((item:any)=>item.phpDeclarationKind)),new Set(['class','interface','trait','enum']));
console.log('Native language completion retains all four declaration kinds.');
