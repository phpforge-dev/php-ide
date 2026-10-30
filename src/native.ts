import { t as tr, activeLanguage } from './i18n';
import {confirmDialog} from './confirm-dialog';
import { resolvedTheme, themePreference } from './theme';
import {pluginService} from './plugin-services';
import { NativeLanguage } from './native-language';
import {protectClose} from '../shared/app-close';
import { invoke } from '@tauri-apps/api/core';
import { listen } from '@tauri-apps/api/event';
import { getCurrentWindow } from '@tauri-apps/api/window';
import type { IdeApi, Event as IdeEvent, TerminalEvent } from '../shared/contracts';
export async function installNativeApi() {
 const syncWindowTheme=()=>{void getCurrentWindow().setTheme(themePreference()==='system'?null:resolvedTheme()).catch(error=>console.warn(tr('Tema da janela indisponível'),error));};
 window.addEventListener('ide-theme-changed',syncWindowTheme);syncWindowTheme();
 const transport=(method:string,args:unknown[]=[])=>invoke<any>('ide',{method,args:['openProject','pickProjectParent'].includes(method)?[...args,activeLanguage]:args});

 await listen('app-maintenance',()=>window.dispatchEvent(new Event('ide-app-maintenance')));
 const language=new NativeLanguage(transport);
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
  if(key==='formatDocument')return (input:import('../shared/language/plugins/api').FormatRequest)=>language.format(input);
  if(key==='language')return (input:any)=>language.request(input);
  if(key==='plugins')return ()=>language.plugins();
  // Recorte 29: hierarquia de métodos (usos atual/base, implementações, rename da família).
  if(key==='phpMethodFamily')return (input:any)=>language.methodFamily(input);
  if(key==='phpMethodUsages')return (input:any,scope:'current'|'base')=>language.methodUsages(input,scope);
  if(key==='phpMethodRename')return (input:any,name:string,options:any)=>language.methodRename(input,name,options);
  return async (...args:unknown[])=>{
   if(String(key).startsWith('database')){
    const feature=pluginService('database');if(!feature?.transport)throw Error('Database plugin is not active. Enable it in Plugins.');
    return feature.transport(String(key),args,transport);
   }
   const result=await transport(String(key),args);
   if(key==='closeProject'||(['openProject','openRecentProject','createProject','cloneProject'].includes(String(key))&&result)){language.reset();window.dispatchEvent(new Event('ide-native-project-changed'));}
   if(key==='save')language.changed(String(args[0]));
   return result;
  };
 }});
 const closeStatus=document.createElement('div');closeStatus.className='app-close-progress';closeStatus.setAttribute('role','status');closeStatus.textContent=tr('Fechando a IDE…');
 let previousInert=false;
 const close=protectClose({
  beforeClose:()=>window.dispatchEvent(new Event('beforeunload',{cancelable:true})),
  applyUpdate:()=>transport('appApplyIdeOnExit'),close:()=>transport('appCloseWindow'),
  closeWithoutUpdate:async error=>{const inert=document.body.inert;document.body.inert=false;try{return await confirmDialog(tr('Não foi possível aplicar a atualização. Fechar sem atualizar?')+'\n'+String(error),tr('Fechar sem atualizar'));}finally{document.body.inert=inert;}},
  pending:value=>{if(value){previousInert=document.body.inert;document.body.inert=true;document.body.append(closeStatus);}else{document.body.inert=previousInert;closeStatus.remove();}},
  error:console.error,
 });
 // Rust performs final destruction after approval; no window-destroy IPC grant is exposed.
 await getCurrentWindow().onCloseRequested(event=>{event.preventDefault();return close(event);});
}
