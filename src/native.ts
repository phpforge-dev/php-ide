import { t as tr, activeLanguage } from './i18n';
import { resolvedTheme, themePreference } from './theme';
import { generateDdl, shortType } from '../shared/sql-ddl';
import { NativeLanguage } from './native-language';
import { invoke } from '@tauri-apps/api/core';
import { listen } from '@tauri-apps/api/event';
import { getCurrentWindow } from '@tauri-apps/api/window';
import { statements } from '../shared/sql';
import type { IdeApi, Event as IdeEvent, TerminalEvent } from '../shared/contracts';
export async function installNativeApi() {
 const syncWindowTheme=()=>{void getCurrentWindow().setTheme(themePreference()==='system'?null:resolvedTheme()).catch(error=>console.warn(tr('Tema da janela indisponível'),error));};
 window.addEventListener('ide-theme-changed',syncWindowTheme);syncWindowTheme();
 const transport=(method:string,args:unknown[]=[])=>invoke<any>('ide',{method,args:['openProject','pickProjectParent'].includes(method)?[...args,activeLanguage]:args});
 const language=new NativeLanguage(transport);
 const redis=new Set<string>();
 const dockerProgress=new Set<(event:{id:string;text:string})=>void>();
 await listen<{id:string;text:string}>('docker-progress',event=>dockerProgress.forEach(fn=>fn(event.payload)));
 const composerProgress=new Set<(event:{id:string;text:string})=>void>();
 await listen<{id:string;text:string}>('composer-progress',event=>composerProgress.forEach(fn=>fn(event.payload)));
 const events=new Set<(event:IdeEvent)=>void>();const terminals=new Set<(event:TerminalEvent)=>void>();
 await listen<{path:string}>('project-changed',event=>{language.changed(event.payload.path);if(event.payload.path.endsWith('.php'))window.dispatchEvent(new Event('ide-project-files-changed'));window.dispatchEvent(new CustomEvent('ide-workspace-file-changed',{detail:event.payload}));});
 await listen<IdeEvent>('event',event=>events.forEach(fn=>fn(event.payload)));
 await listen<TerminalEvent>('terminal-event',event=>terminals.forEach(fn=>fn(event.payload)));
 window.ide=new Proxy({} as IdeApi,{get(_target,key){
  if(key==='onDockerProgress')return (fn:(event:{id:string;text:string})=>void)=>{dockerProgress.add(fn);return ()=>dockerProgress.delete(fn);};
  if(key==='onComposerProgress')return (fn:(event:{id:string;text:string})=>void)=>{composerProgress.add(fn);return ()=>composerProgress.delete(fn);};
  if(key==='onEvent')return (fn:(event:IdeEvent)=>void)=>{events.add(fn);return ()=>events.delete(fn);};
  if(key==='onTerminalEvent')return (fn:(event:TerminalEvent)=>void)=>{terminals.add(fn);return ()=>terminals.delete(fn);};
  if(key==='language')return (input:any)=>language.request(input);
  if(key==='plugins')return ()=>language.plugins();
  // Recorte 29: hierarquia de métodos (usos atual/base, implementações, rename da família).
  if(key==='phpMethodFamily')return (input:any)=>language.methodFamily(input);
  if(key==='phpMethodUsages')return (input:any,scope:'current'|'base')=>language.methodUsages(input,scope);
  if(key==='phpMethodRename')return (input:any,name:string,options:any)=>language.methodRename(input,name,options);
  return async (...args:unknown[])=>{
   if(key==='databaseDdl'){
    const data=await transport('databaseDdlData',args);
    if(typeof data==='string')return data;
    return generateDdl(data.name,data.columns,data.keys,data.primaryKeys,data.current,data.owner);
   }
   if(key==='databaseExecute'){const text=String(args[1]);args[1]=redis.has(String(args[0]))?text.split('\n').map(l=>l.trim()).filter(l=>l&&!l.startsWith('#')):statements(text).map(s=>s.text.trim()).filter(Boolean);language.databaseChanged();}
   const result=await transport(String(key),args);
   if((['openProject','openRecentProject','createProject','cloneProject','closeProject'].includes(String(key)))&&result)language.reset();
   if(key==='save')language.changed(String(args[0]));
   if(key==='databaseModel')for(const schema of result.schemas)for(const table of schema.tables)for(const column of table.columns)column.type=shortType(column.type,column.udt??column.type);
   if(key==='databaseConnect'){if(result.driver==='redis')redis.add(result.id);else language.databases.add(result.id);}
   if(key==='databaseDisconnect'){redis.delete(String(args[0]));language.databases.delete(String(args[0]));language.databaseChanged();}
   return result;
  };
 }});
 await getCurrentWindow().onCloseRequested(event=>{const before=new Event('beforeunload',{cancelable:true});if(!window.dispatchEvent(before))event.preventDefault();});
}
