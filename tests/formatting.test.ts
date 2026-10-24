import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {Worker} from 'node:worker_threads';
import {formatPhp} from '../.tools/plugin-packages/php-formatter/src/php';
import {formatEdit} from '../shared/formatting/edits';
import {readStyle,type Style} from '../.tools/plugin-packages/php-formatter/src/config';
import {format as prettier} from '../.tools/plugin-packages/prettier/src/format';
import {SandboxedPlugin,WORKER_SOURCE,type Channel} from '../shared/language/plugins/sandbox';
import {PluginHost,setExternalPlugins} from '../shared/language/plugins/host';
import type {ProjectFiles,FormatRequest,PluginManifest} from '../shared/language/plugins/api';

const style:Style={tabSize:4,insertSpaces:true,eol:'\n',finalNewline:true,classBrace:'next_line',methodBrace:'next_line'};
const files=(data:Record<string,string>={}):ProjectFiles=>({root:'/proj',read:async p=>data[p]??null,exists:async p=>p in data,list:async()=>Object.keys(data),uri:p=>'file:///proj/'+p});
const request=(text:string,language='javascript',path='a.js'):FormatRequest=>({text,path,language,options:{tabSize:2,insertSpaces:true}});
const channel=():Channel=>{
 const worker=new Worker("const {parentPort}=require('node:worker_threads');self=globalThis;self.postMessage=m=>parentPort.postMessage(m);self.addEventListener=(_,fn)=>parentPort.on('message',data=>fn({data}));\n"+WORKER_SOURCE,{eval:true});worker.unref();
 return {post:m=>worker.postMessage(m),listen:(receive,fail)=>{worker.on('message',receive);worker.on('error',e=>fail(String(e)));},terminate:()=>{void worker.terminate();}};
};
test('PHP own printer: declarations, controls, arrays and idempotence',()=>{
 const before='<?php class User{public function label(int $n=1):string{if($n>0){return "Olá";}return "";}}';
 const after=formatPhp(before,style);
 assert.match(after,/class User\n\{/);assert.match(after,/public function label\(int \$n = 1\): string\n    \{/);assert.match(after,/if \(\$n > 0\) \{/);
 assert.equal(formatPhp(after,style),after);
 const array=formatPhp('<?php $v=[\n"a"=>1,\n"b"=>2,\n];',style);assert.match(array,/    "a" => 1,/);assert.equal(formatPhp(array,style),array);
});
test('PHP preserves comments, interpolated strings, heredoc, CRLF and selection boundaries',()=>{
 const before='<?php\r\n// { untouched }\r\n$a="hello {$user->name}";\r\n$b=<<<TXT\r\n  Keep this\r\nTXT;\r\n';
 const result=formatPhp(before,{...style,eol:'\r\n'});assert.ok(result.includes('"hello {$user->name}"'));assert.ok(result.includes('<<<TXT\r\n  Keep this\r\nTXT'));assert.ok(!result.includes('\r\r\n'));
 const input='<?php\n$a=1;\n$b=2;\n';const start=input.indexOf('$b');const output=formatPhp(input,style,{start,end:input.length});assert.equal(output.slice(0,start),input.slice(0,start));assert.ok(output.includes('$b = 2;'));
});
test('PHP refuses invalid and mixed syntax rather than changing it',()=>{
 assert.throws(()=>formatPhp('<?php function {',style));assert.throws(()=>formatPhp('<p><?php echo 1; ?></p>',style));
 const modern='<?php #[Test] final readonly class A{public function f(?Foo $x):Foo|Bar{return $x?->next()??new Bar();}}';
 const out=formatPhp(modern,style);assert.equal(formatPhp(out,style),out);
});
test('EditorConfig inheritance, brace settings, tabs, unset and CRLF',async()=>{
 const values={'.editorconfig':'root=true\n[*]\nindent_size=2\nend_of_line=crlf\n[*.php]\nij_php_class_brace_style=end_of_line\n','src/.editorconfig':'[*.php]\nindent_style=tab\nindent_size=tab\ntab_width=8\n'};
 const result=await readStyle('src/A.php',files(values).read,{tabSize:4,insertSpaces:true},'');assert.equal(result.tabSize,8);assert.equal(result.insertSpaces,false);assert.equal(result.classBrace,'end_of_line');assert.equal(result.eol,'\r\n');
 assert.match(formatPhp('<?php class A{}',result),/class A \{/);
});
test('Prettier JS, TSX, Vue, CSS and Markdown use the real standalone parsers',async()=>{
 for(const [language,path,text,expected]of [
  ['javascript','a.js','const x={a:1}',/const x = \{ a: 1 \};/],
  ['typescript','a.tsx','const C=()=> <div a="b"/>',/const C = \(\) => <div a="b" \/>;/],
  ['vue','a.vue','<template><div>{{x}}</div></template>',/\{\{ x \}\}/],
  ['css','a.css','a{color:red}',/color: red;/],
  ['markdown','a.md','#   Title',/# Title/],
 ] as const){const result=await prettier(request(text,language,path),files());assert.match(result!.text,expected);assert.equal((await prettier(request(result!.text,language,path),files()))!.text,result!.text);}
});
test('Prettier data configuration, overrides, ignore and actionable unsupported config errors',async()=>{
 const source=files({'.prettierrc':'{"semi":false,"singleQuote":true,"overrides":[{"files":"*.js","options":{"tabWidth":4}}]}'});
 const result=await prettier(request('const x="ok";'),source);assert.equal(result!.text,"const x = 'ok'\n");
 await assert.rejects(()=>prettier(request('const x=1'),files({'.prettierignore':'*.js\n'})),/excluído/);
 await assert.rejects(()=>prettier(request('const x=1'),files({'prettier.config.js':'throw Error()'})),/executável/);
 await assert.rejects(()=>prettier(request('const x=1'),files({'.prettierrc':'plugins: [other]'})),/adicionais/);
 await assert.rejects(()=>prettier(request('const x='),files()));
});
test('Formatting hook runs the packaged Prettier inside the same worker sandbox',async()=>{
 const manifest=JSON.parse(await readFile('.tools/plugin-packages/prettier/plugin.json','utf8')) as PluginManifest;
 const plugin=new SandboxedPlugin('user:phpforge.prettier',manifest,await readFile('.tools/plugin-packages/prettier/main.js','utf8'),['project.read'],{files:files({'.prettierrc':'{"semi":false}'}),write:async()=>null,exec:async()=>'',fetch:async()=>({status:0,body:''})},channel,{rootUri:'file:///proj/'});
 setExternalPlugins(()=>[plugin]);
 try{assert.ok(await plugin.ready,plugin.info.errors.join('\n'));assert.ok(plugin.info.hooks.includes('format'));const host=new PluginHost(files());assert.equal((await host.format(request('const x=1;')))!.text,'const x = 1\n');assert.equal(await host.format(request('<?php $x=1;','php','a.php')),null);}finally{plugin.stop();setExternalPlugins(null);}
});
test('Minimal edits preserve surrounding text, emoji and CRLF boundaries',()=>{
 for(const [before,after]of [['a\r\nb','a\nb'],['x😀y','x😃y'],['hello','hello!'],['abc','a bc']]){const e=formatEdit(before,after)!;assert.equal(before.slice(0,e.start)+e.text+before.slice(e.end),after);}
 assert.equal(formatEdit('same','same'),null);
});
test('Malformed formatting results and plugin errors are visible and never silently change providers',async()=>{
 const manifest:PluginManifest={id:'test.formatter',name:'Test formatter',version:'1.0.0',minIdeVersion:'0.2.10',main:'main.js',activation:{languages:['javascript']},permissions:[]};
 for(const body of ['return {text:42};','throw Error("broken configuration");']){
  const plugin=new SandboxedPlugin('user:test.formatter',manifest,`ide.register({format(){${body}}})`,[],{files:files(),write:async()=>null,exec:async()=>'',fetch:async()=>({status:0,body:''})},channel,{rootUri:'file:///proj/'});
  try{assert.ok(await plugin.ready);await assert.rejects(()=>plugin.format(request('const x=1')));assert.ok(plugin.info.errors.some(e=>e.startsWith('format:')));}finally{plugin.stop();}
 }
});

test('PHP formatter package executes safely inside the language sandbox',async()=>{
 const manifest=JSON.parse(await readFile('.tools/plugin-packages/php-formatter/plugin.json','utf8')) as PluginManifest;
 const plugin=new SandboxedPlugin('user:phpforge.php-formatter',manifest,await readFile('.tools/plugin-packages/php-formatter/main.js','utf8'),['project.read'],{files:files({'.editorconfig':'[*]\nindent_size=2'}),write:async()=>null,exec:async()=>'',fetch:async()=>({status:0,body:''})},channel,{rootUri:'file:///proj/'});
 setExternalPlugins(()=>[plugin]);
 try{assert.ok(await plugin.ready,plugin.info.errors.join('\n'));const host=new PluginHost(files());const result=await host.format(request('<?php $x=1;','php','a.php'));assert.equal(result!.text,'<?php\n$x = 1;\n');assert.equal(await host.format(request('<?php $x=1;','php','a.blade.php')),null);await assert.rejects(()=>host.format(request('<?php function {','php','a.php')));}finally{plugin.stop();setExternalPlugins(null);}
});
