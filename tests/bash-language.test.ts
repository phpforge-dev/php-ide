import test from 'node:test';
import assert from 'node:assert/strict';
import { BashPlugin, bashIndex } from '../shared/language/plugins/bash';
import { isBashDocument, shellDialect } from '../shared/bash-document';
import { PluginHost } from '../shared/language/plugins/host';
import { NativeLanguage } from '../src/native-language';
const files=(data:Record<string,string>)=>({root:'/fixture',read:async(p:string)=>data[p]??null,list:async(_d:string,accept:(p:string)=>boolean)=>Object.keys(data).filter(accept),exists:async(p:string)=>p in data,uri:(p:string)=>'file:///fixture/'+p});
const site=(text:string,offset=text.length,path='build.sh')=>({path,text,offset,blade:false});
test('Bash association uses extension, dotfiles or shebang and respects other interpreters',()=>{
 for(const path of ['scripts/build.sh','run.bash','.bashrc','.bash_profile','.bash_aliases'])assert(isBashDocument(path),path);
 assert(isBashDocument('bin/build','#!/usr/bin/env -S bash -e\necho hi'));
 assert.equal(shellDialect('run','#!/bin/sh\n'),'sh');assert.equal(shellDialect('.profile'),'sh');
 assert(!isBashDocument('run.sh','#!/bin/zsh\n'));assert(!isBashDocument('run','#!/usr/bin/env python3\n'));assert(!isBashDocument('.env','A=1'));
});
test('lexical index ignores comments, single quotes, escapes and heredoc bodies',()=>{
 const text=`NAME=hello
# fake() { echo \$COMMENT; }
echo '\$SINGLE' "\$NAME" \\\$ESCAPED
cat <<'EOF'
FAKE=value
wrong() { echo \$HEREDOC; }
EOF
greet() { printf '%s' "\$NAME"; }
greet
`;
 const index=bashIndex(text);assert.deepEqual(index.refs.map(r=>r.name),['NAME','NAME']);assert.deepEqual(index.variables.map(v=>v.name),['NAME']);assert.deepEqual(index.functions.map(f=>f.name),['greet']);
});
test('current unsaved variables and functions drive completion without exposing values',async()=>{
 const p=new BashPlugin();const text='SECRET=fixture-secret\nLOCAL_NAME=hello\ngreet() { echo ok; }\necho "${LOCAL_';
 const result=await p.completeCode(site(text));assert(result?.items.some(i=>i.label==='LOCAL_NAME'));assert(!JSON.stringify(result).includes('fixture-secret'));
 assert((await p.completeCode(site('greet() { echo ok; }\ngr')))?.items.some(i=>i.label==='greet'));
 assert((await p.completeCode(site('pri')))?.items.some(i=>i.label==='printf'));
 assert.equal(await p.completeCode(site("echo '$LOCAL_")),null);assert.equal(await p.completeCode(site('# pri')),null);
});
test('F12 resolves variable assignments and command calls with UTF-16 offsets',async()=>{
 const p=new BashPlugin(),f=files({});const text='NAME="🚀"\ngreet() { echo "$NAME"; }\ngreet\n';
 const variable=await p.defineCode(site(text,text.indexOf('$NAME')+2),f);assert.equal(variable?.[0].range.start.line,0);assert.equal(variable?.[0].range.start.character,0);
 const fn=await p.defineCode(site(text,text.lastIndexOf('greet')+2),f);assert.equal(fn?.[0].range.start.line,1);assert.equal(fn?.[0].range.start.character,0);
 assert.deepEqual(await p.defineCode(site("NAME=x\necho '$NAME'",17),f),[]);
});
test('Bash activation detects extensionless scripts and rechecks on creation',async()=>{
 const data:Record<string,string>={};const host=new PluginHost(files(data),[new BashPlugin()]);assert.deepEqual(await host.status(),[]);
 data['bin/run']='#!/bin/bash\necho hello';host.changed('bin/run');assert.equal((await host.status())[0].id,'bash');
});
test('native Bash diagnostics use restricted syntax transport and never PHP',async()=>{
 const data={'build.sh':'echo hi'};const f=files(data);let syntax=false;
 const native=new NativeLanguage(async(method,args=[])=>{if(method==='workspace')return{root:f.root,rootUri:'file:///fixture/'};if(method==='listFiles')return Object.keys(data);if(method==='read')return{text:await f.read(String(args[0])),uri:f.uri(String(args[0]))};if(method==='fileExists')throw Error('missing');if(method==='shellValidate'){syntax=true;assert.equal(args[1],'if true; then');return[{code:'bash.syntax'}];}throw Error('unexpected transport '+method);});
 const result:any=await native.request({method:'textDocument/diagnostic',path:'build.sh',text:'if true; then',version:1,position:{line:0,character:0}});assert(syntax);assert.equal(result[0].code,'bash.syntax');
});
