import { isBashDocument } from '../shared/bash-document';
import type { LanguageInput } from '../shared/contracts';
import { PluginHost } from '../shared/language/plugins/host';
import type { DatabaseServices } from '../shared/database-contracts';
import type { FormatRequest, IdePlugin, ProjectFiles } from '../shared/language/plugins/api';
import { offsetOf } from '../shared/language/php-source';
import { pluginService } from './plugin-services';

type Transport=(method:string,args?:unknown[])=>Promise<any>;
type Engine={reset():void;changed(path:string):void;request(input:LanguageInput):Promise<any>;methodFamily(input:LanguageInput):Promise<any>;methodUsages(input:LanguageInput,scope:'current'|'base'):Promise<any>;methodRename(input:LanguageInput,name:string,options:unknown):Promise<any>};
type PhpContribution={createLanguage(call:Transport,makeHost:(files:ProjectFiles)=>PluginHost):Engine};
type DatabaseContribution={languageServices?:DatabaseServices;createLanguagePlugin?(services:DatabaseServices):IdePlugin};
/** Coordinates optional providers; PHP semantics and server adapters belong to the plugin. */
export class NativeLanguage {
 private host?:PluginHost;private files?:ProjectFiles;private loading?:Promise<void>;private epoch=0;
 private databaseProvider?:DatabaseContribution;private phpProvider?:PhpContribution;private engine?:Engine;
 private uris=new Map<string,string>();
 constructor(private call:Transport,private databaseServices?:DatabaseServices){}
 reset(){this.epoch++;this.engine?.reset();this.engine=undefined;this.phpProvider=undefined;this.host=undefined;this.files=undefined;this.loading=undefined;this.databaseProvider=undefined;this.uris.clear();}
 changed(path:string){this.host?.changed(path);this.engine?.changed(path);}
 private services():DatabaseServices{return this.databaseServices??pluginService('database')?.languageServices??{sessions:async()=>[],ddl:async()=>{throw Error('Database plugin is not active')}};}
 private makeHost(files:ProjectFiles){const provider=pluginService<DatabaseContribution>('database');const database=provider?.createLanguagePlugin?.(this.services());this.databaseProvider=provider;return new PluginHost(files,database?[database]:[]);}
 private async init(){
  if(!this.files){if(!this.loading){const epoch=this.epoch;this.loading=(async()=>{const info=await this.call('workspace');if(epoch!==this.epoch)throw Error('Project changed during language initialization');const base=info.rootUri??new URL('file://'+info.root.replaceAll('\\','/')+'/').href;
   const files:ProjectFiles={root:info.root,read:async path=>{try{const f=await this.call('read',[path]);if(epoch!==this.epoch)return null;this.uris.set(path,f.uri);return f.text;}catch{return null;}},exists:async path=>{try{return !!await this.call('fileExists',[path]);}catch{return false;}},list:async(dir,accept)=>{const paths:string[]=await this.call('listFiles',[dir,false]);return epoch===this.epoch?paths.filter(p=>accept(p.split('/').pop()!)):[];},uri:path=>this.uris.get(path)??new URL(path,base).href};this.files=files;this.host=this.makeHost(files);})();}const pending=this.loading;try{await pending;}finally{if(this.loading===pending)this.loading=undefined;}}
  if(this.databaseProvider!==pluginService<DatabaseContribution>('database')){this.engine?.reset();this.host=this.makeHost(this.files!);}
 }
 private php(){const provider=pluginService<PhpContribution>('phpIntelligence');if(provider!==this.phpProvider){this.engine?.reset();this.engine=undefined;this.phpProvider=provider;if(provider){const epoch=this.epoch;const current=()=>epoch===this.epoch&&pluginService('phpIntelligence')===provider;this.engine=provider.createLanguage(async(method,args)=>{if(!current())throw Error('PHP plugin is inactive');const result=await this.call(method,args);if(!current())throw Error('PHP plugin is inactive');return result;},()=>this.host!);}}return this.engine;}
 async format(request:FormatRequest){await this.init();return this.host!.format(request);}
 async plugins(){await this.init();return this.host!.status();}
 async request(input:LanguageInput){
  await this.init();const offset=offsetOf(input.text,input.position);const host=this.host!;
  if(input.method==='textDocument/codeLens')return host.codeLenses(input.path,input.text);
  if(/\.php$/i.test(input.path)){const engine=this.php();if(engine){const result=await engine.request(input);return this.phpProvider===pluginService('phpIntelligence')?result:null;}
   if(input.method==='textDocument/definition')return await host.define(input.path,input.text,offset)??[];
   if(input.method==='textDocument/completion')return await host.complete(input.path,input.text,offset)??{isIncomplete:false,items:[]};
  }else{
   if(input.method==='textDocument/definition')return await host.defineCode(input.path,input.text,offset)??[];
   if(input.method==='textDocument/completion')return await host.completeCode(input.path,input.text,offset)??{isIncomplete:false,items:[]};
  }
  if(input.method==='textDocument/diagnostic'){if(isBashDocument(input.path,input.text))return this.call('shellValidate',[input.path,input.text]);return host.diagnose(input.path,input.text);}
  if(input.method==='textDocument/hover'){const value=await host.hover(input.path,input.text,offset);return value?{contents:{kind:'markdown',value:value.contents},range:value.range}:null;}
  return null;
 }
 async methodFamily(input:LanguageInput){await this.init();return this.php()?.methodFamily(input)??null;}
 async methodUsages(input:LanguageInput,scope:'current'|'base'){await this.init();return this.php()?.methodUsages(input,scope)??null;}
 async methodRename(input:LanguageInput,name:string,options:unknown={}){await this.init();return this.php()?.methodRename(input,name,options)??null;}
}
