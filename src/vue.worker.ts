import {initialize} from 'monaco-editor/editor/editor.worker.js';
import type {worker} from 'monaco-editor';
import ts from 'typescript';
import {URI} from 'vscode-uri';
import {createTypeScriptWorkerLanguageService} from '@volar/monaco/worker';
import type {} from '@volar/typescript';
import {FileType} from '@volar/language-service/lib/types';
import {createVueLanguagePlugin,getDefaultCompilerOptions} from '@vue/language-core';
import {createVueLanguageServicePlugins} from '@vue/language-service';
import {create as createTypeScriptPlugins} from 'volar-service-typescript';
import {frameworkTypes} from './framework-types';
import {createVueRequests} from './vue-requests';

const libs=import.meta.glob<string>('../node_modules/typescript/lib/lib*.d.ts',{query:'?raw',import:'default',eager:true});
const bundled={...frameworkTypes,...Object.fromEntries(Object.entries(libs).map(([path,text])=>[path.replace(/^\.\./,''),text]))};
self.onmessage=()=>initialize((context:worker.IWorkerContext)=>{
 // The editor worker's mirror-model manager is available after the bootstrap factory returns.
 let service:ReturnType<typeof createService>|undefined;
 return new Proxy({}, {get(_target,key){if(key==='then')return undefined;return(...args:unknown[])=>{service??=createService(context);return (service as any)[key](...args);};}});
});
function createService(context:worker.IWorkerContext){
 const texts=()=>new Map([...Object.entries(bundled),...context.getMirrorModels().map(m=>[m.uri.path,m.getValue()] as [string,string])]);
 const options:ts.CompilerOptions={allowJs:true,checkJs:false,allowNonTsExtensions:true,jsx:ts.JsxEmit.Preserve,target:ts.ScriptTarget.ESNext,module:ts.ModuleKind.ESNext,moduleResolution:ts.ModuleResolutionKind.Node10,skipLibCheck:true,strict:false};
 const vuePlugin=createVueLanguagePlugin<URI>(ts,options,getDefaultCompilerOptions(3.5,'vue',true,'/node_modules/@vue/language-core/types'),uri=>uri.fsPath);
 const getServiceScript=vuePlugin.typescript!.getServiceScript;
 // The browser host serves virtual code directly, unlike the tsserver plugin's padded snapshots.
 vuePlugin.typescript!.getServiceScript=code=>{const script=getServiceScript(code);if(script)script.preventLeadingOffset=true;return script;};
 let service:ReturnType<typeof createTypeScriptWorkerLanguageService>;
 service=createTypeScriptWorkerLanguageService({
  typescript:ts,compilerOptions:options,workerContext:context as any,
  uriConverter:{asFileName:uri=>uri.fsPath,asUri:file=>URI.file(file)},
  env:{workspaceFolders:[URI.file('/')],console,fs:{
   readFile:uri=>texts().get(uri.path),
   stat:uri=>{const values=texts();const content=values.get(uri.path);if(content!==undefined)return {type:FileType.File,size:content.length,ctime:0,mtime:0};if([...values.keys()].some(path=>path.startsWith(uri.path.replace(/\/$/,'')+'/')))return {type:FileType.Directory,size:0,ctime:0,mtime:0};},
   readDirectory:uri=>{const prefix=uri.path.replace(/\/$/,'')+'/';const entries=new Map<string,FileType>();for(const path of texts().keys())if(path.startsWith(prefix)){const tail=path.slice(prefix.length),name=tail.split('/')[0];entries.set(name,tail.includes('/')?FileType.Directory:FileType.File);}return [...entries];},
  }},
  languagePlugins:[vuePlugin],
  // The Jade/Pug adapter requires a Node environment; the browser integration supports HTML SFCs.
  languageServicePlugins:[...createVueLanguageServicePlugins(ts,createVueRequests(()=>service)),...createTypeScriptPlugins(ts)].filter(plugin=>!plugin.name?.includes('jade')&&!plugin.name?.includes('pug')),
 });
 return service;
}
