import { BashPlugin } from '../shared/language/plugins/bash';
import { isBashDocument } from '../shared/bash-document';
import { DockerPlugin } from '../shared/language/plugins/docker';
import { isDockerDocument } from '../shared/docker-document';
import type { LanguageInput } from '../shared/contracts';
import { PluginHost } from '../shared/language/plugins/host';
import { LaravelPlugin } from '../shared/language/plugins/laravel';
import { DotenvPlugin, isEnvPath } from '../shared/language/plugins/dotenv';
import { DatabasePlugin } from '../shared/language/plugins/database';
import { MarkdownPlugin } from '../shared/language/plugins/markdown';
import { isMarkdownPath } from '../shared/markdown';
import { GitignorePlugin, isIgnorePath } from '../shared/language/plugins/gitignore';
import { PhpTestsPlugin } from '../shared/language/plugins/php-tests';
import { ComposerPlugin } from '../shared/language/plugins/composer';
import { SymfonyPlugin, isPluginDocument } from '../shared/language/plugins/symfony';
import type { ProjectFiles } from '../shared/language/plugins/api';
import { aliasAt, aliasUsages, analyze, literalAt, codeOnly, position, offsetOf } from '../shared/language/php-source';
import { classContext, signature } from '../shared/language/php-completion';
import { completionImport } from './refactor-php';
import type { SqlModel } from '../shared/sql';
import { parseHierarchy, PhpHierarchy, hoverClassName } from '../shared/language/php-hierarchy';
import { methodFamily, methodImplementations, type MethodRef } from '../shared/language/php-method-family';
import { functionDocs, memberCalls, typeLabel, variableTypes, type FunctionDoc } from '../shared/language/php-local-types';
import { segments } from '../shared/language/php-source';
type Loc={uri:string;range:{start:{line:number;character:number};end:{line:number;character:number}}};
type Semantic={hierarchy:PhpHierarchy;functions:FunctionDoc[];texts:Map<string,string>};
type Transport=(method:string,args?:unknown[])=>Promise<any>;
export class NativeLanguage {
 private host?:PluginHost;private files?:ProjectFiles;private classes?:Promise<any[]>;private semantic?:Promise<Semantic>;private root='';private uris=new Map<string,string>();
 readonly databases=new Set<string>();private models=new Map<string,Promise<SqlModel>>();
 constructor(private call:Transport){}
 reset(){this.host=undefined;this.files=undefined;this.classes=undefined;this.semantic=undefined;this.uris.clear();this.databases.clear();this.models.clear();}
 changed(path:string){this.classes=undefined;this.semantic=undefined;this.host?.changed(path);}
 databaseChanged(){this.models.clear();}
 private async init(){if(this.host)return;const info=await this.call('workspace');this.root=info.root;const base=info.rootUri??new URL('file://'+info.root.replaceAll('\\','/')+'/').href;
 const files:ProjectFiles={root:info.root,read:async path=>{try{const f=await this.call('read',[path]);this.uris.set(path,f.uri);return f.text;}catch{return null;}},exists:async path=>{try{await this.call('fileExists',[path]);return true;}catch{return false;}},list:async(dir,accept)=>{const paths:string[]=await this.call('listFiles',[dir,false]);return paths.filter(p=>accept(p.split('/').pop()!));},uri:path=>this.uris.get(path)??new URL(path,base).href};this.files=files;
 this.host=new PluginHost(files,[new LaravelPlugin(),new DotenvPlugin(),new DockerPlugin(),new BashPlugin(),new DatabasePlugin({sessions:async()=>Promise.all([...this.databases].map(async id=>{let model=this.models.get(id);if(!model){model=this.call('databaseModel',[id]);this.models.set(id,model);}return{id,model:await model};})),ddl:(id,schema,table)=>this.call('databaseDdl',[id,schema,table])}),new MarkdownPlugin(),new GitignorePlugin(),new PhpTestsPlugin(),new ComposerPlugin(),new SymfonyPlugin()]);}
 async plugins(){await this.init();return this.host!.status();}
 private index(){return this.classes??= (async()=>{await this.init();const paths:string[]=await this.call('listFiles',['',true]);const items:any[]=[];let next=0;await Promise.all(Array.from({length:8},async()=>{while(next<paths.length){const path=paths[next++];if(!path.endsWith('.php'))continue;const text=await this.files!.read(path);if(text===null)continue;for(const d of analyze(text).declarations)items.push({...d,path,...position(text,d.offset)});}}));return items;})();}
 async request(input:LanguageInput){await this.init();if(/\.php$/i.test(input.path))void this.project().catch(()=>undefined);const offset=offsetOf(input.text,input.position);
 // Ações de executar testes (Pest/PHPUnit) vêm só dos plugins.
 if(input.method==='textDocument/codeLens')return this.host!.codeLenses(input.path,input.text);
 if(isDockerDocument(input.path,input.text)){if(input.method==='textDocument/definition')return await this.host!.defineCode(input.path,input.text,offset)??[];if(input.method==='textDocument/completion')return await this.host!.completeCode(input.path,input.text,offset)??{isIncomplete:false,items:[]};if(input.method==='textDocument/diagnostic')return this.host!.diagnose(input.path,input.text);if(input.method==='textDocument/hover'){const v=await this.host!.hover(input.path,input.text,offset);return v?{contents:{kind:'markdown',value:v.contents},range:v.range}:null;}return null;}
 if(isBashDocument(input.path,input.text)){if(input.method==='textDocument/definition')return await this.host!.defineCode(input.path,input.text,offset)??[];if(input.method==='textDocument/completion')return await this.host!.completeCode(input.path,input.text,offset)??{isIncomplete:false,items:[]};if(input.method==='textDocument/diagnostic')return this.call('shellValidate',[input.path,input.text]);if(input.method==='textDocument/hover'){const v=await this.host!.hover(input.path,input.text,offset);return v?{contents:{kind:'markdown',value:v.contents},range:v.range}:null;}return null;}
 // Markdown é atendido só pelo plugin; o Phpactor não recebe documentos que não são PHP.
 if(isMarkdownPath(input.path)){if(input.method==='textDocument/definition')return await this.host!.defineCode(input.path,input.text,offset)??[];if(input.method==='textDocument/completion')return await this.host!.completeCode(input.path,input.text,offset)??{isIncomplete:false,items:[]};if(input.method==='textDocument/diagnostic')return this.host!.diagnose(input.path,input.text);return null;}
 // Arquivos ignore (.gitignore, .dockerignore…): só completion de padrões pelo plugin.
 if(isIgnorePath(input.path))return input.method==='textDocument/completion'?await this.host!.completeCode(input.path,input.text,offset)??{isIncomplete:false,items:[]}:null;
 // composer.json, Twig e YAML de config/: só plugins (Composer/Symfony), sem Phpactor.
 if(isPluginDocument(input.path)||isEnvPath(input.path)){if(input.method==='textDocument/definition')return await this.host!.defineCode(input.path,input.text,offset)??[];if(input.method==='textDocument/completion')return await this.host!.completeCode(input.path,input.text,offset)??{isIncomplete:false,items:[]};if(input.method==='textDocument/diagnostic')return this.host!.diagnose(input.path,input.text);return null;}
 if(input.method==='textDocument/definition'||input.method==='textDocument/completion'){
  const answer=input.method==='textDocument/definition'?await this.host!.define(input.path,input.text,offset):await this.host!.complete(input.path,input.text,offset);if(answer)return answer;
 }
 // Alias de import (`use A\B as C`): o uso de `C` leva ao alias, e os usos do alias são só os do arquivo.
 if(/\.php$/i.test(input.path)&&(input.method==='textDocument/definition'||input.method==='textDocument/references')){const found=aliasAt(input.text,offset);if(found){const loc=(o:number)=>{const start=position(input.text,o);return{uri:this.files!.uri(input.path),range:{start,end:{...start,character:start.character+found.alias.alias.length}}};};
  if(input.method==='textDocument/references')return aliasUsages(input.text,found.alias).map(loc);if(!found.declaration)return[loc(found.alias.offset)];}}
 if(input.method==='textDocument/definition'){
  const literal=literalAt(input.text,offset);if(literal){const before=codeOnly(input.text.slice(0,literal.start));
   if(/(?:__DIR__|dirname\s*\(\s*__FILE__\s*\))\s*\.\s*$/.test(before)){try{const file=await this.call('read',[input.path.slice(0,input.path.lastIndexOf('/')+1)+literal.value.replace(/^\//,'')]);return[{uri:file.uri,range:{start:{line:0,character:0},end:{line:0,character:0}},preserveView:true}];}catch{return[];}}
   if(/^\\?[A-Za-z_]\w*(\\[A-Za-z_]\w*)+$/.test(literal.value)){const found=(await this.index()).find(c=>c.fqn.toLowerCase()===literal.value.replace(/^\\/,'').toLowerCase());if(found){const start={line:found.line,character:found.character};return[{uri:this.files!.uri(found.path),range:{start,end:{...start,character:start.character+found.name.length}}}];}}
   const callable=/\[\s*(\\?[A-Za-z_][\w\\]*)\s*::\s*class\s*,\s*$/.exec(input.text.slice(0,literal.start));if(callable)return this.call('languageSynthetic',[input,`${callable[1]}::${literal.value}();`,callable[1].length+2]);
  }
 }
 // Hover e inspeções de plugins (Laravel/Eloquent…) antes do Phpactor; recorte 25.
 if(input.method==='textDocument/hover'){const h=await this.host!.hover(input.path,input.text,offset);if(h)return{contents:{kind:'markdown',value:h.contents},range:h.range};}
 if(input.method==='textDocument/diagnostic')return this.host!.diagnose(input.path,input.text);
 const result=await this.call('language',[input]);
 if(input.method==='textDocument/hover'&&/\.php$/i.test(input.path))return await this.variableHover(input,offset,result).catch(()=>result);
 if(input.method!=='textDocument/completion')return result;
 let items:any[]=Array.isArray(result)?result:result?.items??[];
 if(/\.php$/i.test(input.path))items=await this.memberCompletion(input,offset,items).catch(()=>items);const prefix=classContext(input.text.slice(0,offset));
 if(prefix!==null){const classes=await this.index();const seen=new Set<string>();const kinds={class:7,interface:8,enum:13,trait:7};const out:any[]=[];
 const edit=(e:{start:number;end:number;text:string})=>({range:{start:position(input.text,e.start),end:position(input.text,e.end)},newText:e.text});
 // Autoimport: novo `use` sem duplicar; nome curto já usado por outro import vira alias (com a alternativa FQN).
 for(const c of classes.filter(c=>c.name.toLowerCase().startsWith(prefix.toLowerCase())).sort((a,b)=>a.name.localeCompare(b.name)||a.fqn.localeCompare(b.fqn)).slice(0,150)){if(seen.has(c.fqn.toLowerCase()))continue;seen.add(c.fqn.toLowerCase());const insertion=completionImport(input.text,offset,c.fqn);const base={label:c.name,kind:kinds[c.kind as keyof typeof kinds],phpDeclarationKind:c.kind,filterText:c.name,labelDetails:{detail:` [${c.namespace??c.fqn.slice(0,-c.name.length-1)}]`},detail:c.fqn};
  out.push({...base,insertText:insertion.insert,sortText:`0${String(out.length).padStart(4,'0')}`,...(insertion.alias?{labelDetails:{detail:` as ${insertion.alias} [${c.fqn}]`},detail:`use ${c.fqn} as ${insertion.alias}`}:{}),additionalTextEdits:insertion.edits.length?insertion.edits.map(edit):undefined});
  if(insertion.alias)out.push({...base,insertText:insertion.qualified,sortText:`0${String(out.length).padStart(4,'0')}`,labelDetails:{detail:` ${insertion.qualified}`}});}
 items=[...out,...items.filter(i=>![7,8,13].includes(i.kind))];}
 return{isIncomplete:prefix!==null||!!result?.isIncomplete,items:items.map(item=>{if(![2,3,5,10].includes(item.kind)||!item.detail)return item;const{params,returns}=signature(item.detail);const callable=item.kind===2||item.kind===3;return{...item,labelDetails:{detail:callable&&params!==null?`(${params})`:undefined,description:returns??undefined},...(callable&&params!==null&&!item.textEdit?{insertText:params?`${item.label}($0)`:`${item.label}()`,insertTextFormat:2}:{})};})};
 }

 // ── Recorte 29: tipos locais e hierarquia de métodos (complementam o Phpactor) ──────────────
 private project(){return this.semantic??=(async()=>{await this.init();const paths:string[]=(await this.call('listFiles',['',true])).filter((p:string)=>p.endsWith('.php')&&!p.endsWith('.blade.php')).slice(0,20000);
  const hierarchy=new PhpHierarchy();const functions:FunctionDoc[]=[];const texts=new Map<string,string>();let next=0;
  await Promise.all(Array.from({length:8},async()=>{while(next<paths.length){const path=paths[next++];const text=await this.files!.read(path);if(text===null||text.length>1024*1024)continue;for(const c of parseHierarchy(text,path))hierarchy.add(c);functions.push(...functionDocs(text));if(!path.startsWith('vendor/'))texts.set(path,text);}}));
  return{hierarchy,functions,texts};})().catch(e=>{this.semantic=undefined;throw e;});}
 /** Projeto com o buffer atual sobreposto (texto não salvo). */
 private async current(input:{path:string;text:string}):Promise<Semantic>{const base=await this.project();const hierarchy=new PhpHierarchy(base.hierarchy.all().filter(c=>c.path!==input.path));for(const c of parseHierarchy(input.text,input.path))hierarchy.add(c);const texts=new Map(base.texts);texts.set(input.path,input.text);return{hierarchy,functions:[...base.functions,...functionDocs(input.text)],texts};}
 private loc(path:string,text:string,offset:number,length:number):Loc{const start=position(text,offset);return{uri:this.files!.uri(path),range:{start,end:{...start,character:start.character+length}}};}
 private variableAt(text:string,offset:number){let a=offset;while(a>0&&/\w/.test(text[a-1]))a--;if(text[a-1]==='$')a--;const m=/^\$([A-Za-z_]\w*)/.exec(text.slice(a));return m&&offset<=a+m[0].length?{name:m[1],start:a}:undefined;}
 /** Hover de variável: união/template que o Phpactor não resolve (`User|null`, `T`). */
 private async variableHover(input:LanguageInput,offset:number,result:any){
  const v=this.variableAt(input.text,offset);if(!v)return result;const sem=await this.current(input);
  const types=variableTypes(input.text,v.start,v.name,sem.functions);if(!types?.length)return result;
  const shown=[result?.contents].flat().map((c:any)=>typeof c==='string'?c:c?.value??'').join('\n');const theirs=/variable \$?\w+: `([^`]*)`/.exec(shown)?.[1]?.replace(/[^\w\\|?]/g,'');
  if(types.length<2&&theirs&&theirs!=='T'&&!/^[A-Z]$/.test(theirs))return result;
  return{contents:{kind:'markdown',value:`variable ${v.name}: \`${typeLabel(types)}\`\n`},range:result?.range};
 }
 /** Classe do receptor em `$var->`: tipo local primeiro, depois o hover do servidor. */
 private async receiverAt(input:{path:string;text:string;version?:number},sem:Semantic,at:number){
  const m=/\$([A-Za-z_]\w*)\s*\??->\s*\w*$/.exec(codeOnly(input.text.slice(0,at)));if(!m)return undefined;
  const types=variableTypes(input.text,m.index,m[1],sem.functions)?.filter(t=>t.fqn);if(types?.length===1)return sem.hierarchy.get(types[0].fqn!);
  if(m[1]==='this')return sem.hierarchy.all().filter(c=>c.path===input.path&&c.offset<at&&c.kind!=='interface').at(-1);
  const hover=await this.call('language',[{method:'textDocument/hover',path:input.path,text:input.text,version:input.version??1,position:position(input.text,m.index+1)}]).catch(()=>null);
  const name=hoverClassName([hover?.contents].flat().map((c:any)=>typeof c==='string'?c:c?.value??'').join('\n'));return name?sem.hierarchy.resolveShort(name,analyze(input.text),at):undefined;
 }
 /** Membros após `->`: declarados no próprio tipo primeiro, com tipo de retorno; supre o servidor quando ele não lista nada. */
 private async memberCompletion(input:LanguageInput,offset:number,items:any[]){
  if(!/\??->\s*\w*$/.test(codeOnly(input.text.slice(0,offset))))return items;
  // Índice frio não segura a lista do servidor: após 1,5 s segue sem ordenação/tipos próprios.
  const sem=await Promise.race([this.current(input),new Promise<undefined>(r=>setTimeout(r,1500))]);if(!sem)return items;const cls=await this.receiverAt(input,sem,offset);if(!cls)return items;
  const names=new Map<string,{owner:string;returnType?:string;own:boolean}>();
  const visit=(fqn:string,seen=new Set<string>())=>{const c=sem.hierarchy.get(fqn);if(!c||seen.has(c.fqn))return;seen.add(c.fqn);for(const m of c.methods){const r=sem.hierarchy.resolveMethod(cls.fqn,m.name);if(r&&!names.has(m.name.toLowerCase())&&r.method.visibility==='public'&&!r.method.isStatic)names.set(m.name.toLowerCase(),{owner:r.owner.fqn,returnType:r.method.returnType,own:r.owner.fqn===cls.fqn});}for(const n of [...c.traits,...c.extends,...c.implements])visit(n,seen);};visit(cls.fqn);
  if(!items.length)items=[...names.keys()].map(low=>{const r=sem.hierarchy.resolveMethod(cls.fqn,low)!;return{label:r.method.name,kind:2,insertText:`${r.method.name}()`,filterText:r.method.name};});
  return items.map(item=>{const info=item.kind===2?names.get(String(item.label).toLowerCase()):undefined;if(!info)return item;
   return{...item,sortText:`${info.own?'0':'1'}${String(item.label).toLowerCase()}`,labelDetails:{detail:'()',description:info.returnType?.replace(/^\\/,'')??item.labelDetails?.description},detail:item.detail};});
 }
 /** Método no cursor: declaração no arquivo ou chamada `$x->m()`. */
 private async methodAt(input:LanguageInput,sem:Semantic){
  const offset=offsetOf(input.text,input.position);let a=offset;while(a>0&&/\w/.test(input.text[a-1]))a--;const word=/^[A-Za-z_]\w*/.exec(input.text.slice(a))?.[0];if(!word)return undefined;
  for(const c of parseHierarchy(input.text,input.path))for(const m of c.methods)if(m.offset===a)return{fqn:c.fqn,name:m.name,from:'declaration' as const};
  const cls=await this.receiverAt(input,sem,a);if(!cls)return undefined;const r=sem.hierarchy.resolveMethod(cls.fqn,word);return r?{fqn:cls.fqn,name:r.method.name,from:'call' as const}:undefined;
 }
 private refLoc(sem:Semantic,ref:MethodRef){const text=sem.texts.get(ref.cls.path!)??'';return{...this.loc(ref.cls.path!,text,ref.method.offset,ref.method.name.length),owner:ref.cls.fqn,name:ref.cls.name,isAbstract:ref.method.isAbstract,path:ref.cls.path};}
 /** Família do método no cursor (base × atual) para Find Usages, Implementations e Rename. */
 async methodFamily(input:LanguageInput){await this.init();const sem=await this.current(input);const at=await this.methodAt(input,sem);if(!at)return null;
  const family=methodFamily(sem.hierarchy,at.fqn,at.name);const resolved=sem.hierarchy.resolveMethod(at.fqn,at.name)!;const current=family.current??{cls:resolved.owner,method:resolved.method};
  const only=(refs:MethodRef[])=>refs.filter(r=>r.cls.path&&sem.texts.has(r.cls.path));
  return{name:at.name,from:at.from,owner:current.cls.fqn,ownerName:current.cls.name,current:only([current]).map(r=>this.refLoc(sem,r)),bases:only(family.bases).map(r=>this.refLoc(sem,r)),members:only(family.members).map(r=>this.refLoc(sem,r)),
   implementations:only(methodImplementations(sem.hierarchy,at.from==='call'?at.fqn:current.cls.fqn,at.name,at.from)).map(r=>this.refLoc(sem,r))};}
 /** Usos de `scope`: 'base' é a família inteira; 'current' é o método atual e quem o sobrescreve. */
 async methodUsages(input:LanguageInput,scope:'current'|'base'){
  const sem=await this.current(input);const at=await this.methodAt(input,sem);if(!at)return null;const family=methodFamily(sem.hierarchy,at.fqn,at.name);const resolved=sem.hierarchy.resolveMethod(at.fqn,at.name)!;
  const owner=family.current?.cls??resolved.owner;const subtree=new Set([owner.fqn,...sem.hierarchy.descendants(owner.fqn).map(c=>c.fqn)].map(f=>f.toLowerCase()));
  const members=family.members.filter(m=>scope==='base'||subtree.has(m.cls.fqn.toLowerCase()));const owners=new Set(members.map(m=>m.cls.fqn.toLowerCase()));
  const seen=new Map<string,Loc>();const key=(l:Loc)=>l.uri+':'+l.range.start.line+':'+l.range.start.character;
  const decls=new Set(family.members.map(m=>m.cls.path?key(this.loc(m.cls.path,sem.texts.get(m.cls.path)??'',m.method.offset,m.method.name.length)):''));
  for(const m of members){const text=sem.texts.get(m.cls.path!);if(text===undefined)continue;
   const found=await this.call('language',[{method:'textDocument/references',path:m.cls.path,text,version:1,position:position(text,m.method.offset)}]).catch(()=>[]);
   for(const l of Array.isArray(found)?found:[])if(!decls.has(key(l)))seen.set(key(l),l);}
  // Chamadas cujo receptor só tem tipo local (template identidade): o servidor não as encontra.
  for(const [path,text] of sem.texts)for(const call of memberCalls(text,at.name)){const l=this.loc(path,text,call.offset,at.name.length);if(seen.has(key(l)))continue;
   const types=variableTypes(text,call.offset,call.variable,sem.functions)?.filter(t=>t.fqn);if(types?.some(t=>{const r=sem.hierarchy.resolveMethod(t.fqn!,at.name);return r&&owners.has(r.owner.fqn.toLowerCase());}))seen.set(key(l),l);}
  return[...seen.values()];
 }
 /** Rename da família inteira; opções de comentários/strings e texto em outros arquivos (desmarcadas por padrão). */
 async methodRename(input:LanguageInput,newName:string,options:{comments?:boolean;text?:boolean}={}){
  const sem=await this.current(input);const at=await this.methodAt(input,sem);if(!at)return null;const family=methodFamily(sem.hierarchy,at.fqn,at.name);
  const edits=new Map<string,{uri:string;range:Loc['range'];newText:string;category:string}>();const add=(l:Loc,category:string)=>{const k=l.uri+':'+l.range.start.line+':'+l.range.start.character;if(!edits.has(k))edits.set(k,{...l,newText:newName,category});};
  for(const m of family.members){const text=sem.texts.get(m.cls.path!);if(text!==undefined)add(this.loc(m.cls.path!,text,m.method.offset,m.method.name.length),'declaration');}
  for(const l of await this.methodUsages(input,'base')??[])add(l,'call');
  if(options.comments)for(const [path,text] of sem.texts)for(const seg of segments(text))if(seg.kind==='comment'||seg.kind==='string'){const re=new RegExp(`\\b${at.name}\\b`,'g');const piece=text.slice(seg.start,seg.end);for(let m=re.exec(piece);m;m=re.exec(piece))add(this.loc(path,text,seg.start+m.index,at.name.length),seg.kind);}
  if(options.text){const others=(await this.call('listFiles',['',false]) as string[]).filter(p=>/\.(md|txt|json|ya?ml|xml|twig|html?|neon|ini)$/i.test(p));for(const path of others){const text=await this.files!.read(path);if(text===null||text.length>1024*1024)continue;const re=new RegExp(`\\b${at.name}\\b`,'g');for(let m=re.exec(text);m;m=re.exec(text))add(this.loc(path,text,m.index,at.name.length),'text');}}
  const changes:Record<string,{range:Loc['range'];newText:string;category:string}[]>={};for(const e of [...edits.values()].sort((a,b)=>a.range.start.line-b.range.start.line||a.range.start.character-b.range.start.character))(changes[e.uri]??=[]).push({range:e.range,newText:e.newText,category:e.category});
  return{changes,name:at.name,owner:family.current?.cls.fqn??at.fqn};
 }
}
