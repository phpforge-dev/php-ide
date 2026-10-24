import {pluginService,providePluginService} from './plugin-services';
import {fileIcon} from './file-icons';
import {editorFont} from './editor-theme';
import {activeLanguage} from './i18n';
import {editorPreviewLayout} from './editor-preview-layout';
import * as monaco from 'monaco-editor';
import {listen} from '@tauri-apps/api/event';
import {t as tr,msg,html} from './i18n';
import {keymap} from './keymap';
import {resizeToolWindow,toolIcon} from './tool-window';
import type {IdeApi} from '../shared/contracts';
import type {InstalledPlugin} from '../shared/language/plugins/api';

type Host={virtual?:(...args:any[])=>any;chooseProject?:(path?:string)=>Promise<boolean>;terminal?:(cwd?:string)=>any;path():string|undefined;editor:monaco.editor.IStandaloneCodeEditor;open(path:string,line?:number):Promise<void>;status(text:string):void;changed():void};
type Controller={run?(request:unknown):unknown;reset?():void;dispose?():void};
/** Trusted native-tool UI is opt-in. Ordinary language plugins stay in workers. */
export function mountToolPlugins(api:IdeApi,host:Host){
 const call=(method:string,...args:unknown[])=>(api as any)[method](...args) as Promise<any>;
 const mounted=new Map<string,{stop():Promise<void>;controller:Controller;methods:string[]}>();
 let generation=0;let queue=Promise.resolve();
 async function dispose(){generation++;const pending=[...mounted.values()].map(p=>p.stop());mounted.clear();await Promise.all(pending);}
 async function load(){
  await dispose();const epoch=generation;
  const listing=await call('pluginList');
  for(const entry of listing.plugins as InstalledPlugin[]){
   if(epoch!==generation)return;
   if(!(entry.manifest?.tool||entry.manifest?.workbench)||!entry.enabled||entry.needsConsent||!entry.granted.includes('workbench')||(entry.manifest.tool&&!entry.granted.includes('native.tool')))continue;
   const cleanup:(()=>void)[]=[];let projectRoot:string|undefined;let alive=true;let controller:Controller={};
   const own=(item:{dispose():void}|(()=>void))=>{const fn=typeof item==='function'?item:()=>item.dispose();if(alive)cleanup.push(fn);else fn();return item;};
   const stop=async()=>{if(!alive)return;alive=false;try{controller.dispose?.();}catch(error){console.warn(error)}for(const fn of cleanup.reverse())try{fn()}catch(error){console.warn(error)}if(entry.manifest?.tool)void call('pluginToolStop',entry.key).catch(()=>{});window.dispatchEvent(new CustomEvent('ide-tool-state',{detail:{key:entry.key,state:'stopped'}}));if(entry.manifest?.workbench&&projectRoot)await call('pluginReleaseResources',entry.key,projectRoot).catch(error=>console.warn(error));};
   try{
    const source=await call(entry.manifest.tool?'pluginToolSource':'pluginWorkbenchSource',entry.key);if(epoch!==generation)return;
    const root=(await api.workspace()).root;projectRoot=root;if(epoch!==generation)return;
    const style=document.createElement('style');style.dataset.toolPlugin=entry.key;style.textContent=source.style;document.head.append(style);own(()=>style.remove());
    const before=new Set(document.querySelectorAll('.code > *, .left-rail > *'));
    const events=new Map<string,Set<(event:any)=>void>>();
    const unlisten=await listen<any>('plugin-tool-event',event=>{const v=event.payload;if(alive&&v.key===entry.key&&v.root===root)for(const fn of events.get(v.channel)??[])fn({payload:v.payload});});own(unlisten);
    const scopedListen=async(channel:string,fn:(event:any)=>void)=>{if(channel!==entry.manifest!.tool?.event)throw Error('Undeclared tool event');let listeners=events.get(channel);if(!listeners){listeners=new Set();events.set(channel,listeners)}listeners.add(fn);const off=()=>listeners!.delete(fn);own(off);return off;};
    const toolApi=new Proxy(api,{get(target,key){
     if(entry.manifest!.tool?.methods.includes(String(key)))return(...args:unknown[])=>{if(!alive)return Promise.reject(Error('Plugin stopped'));return call('pluginToolCall',entry.key,String(key),args)};
     if(key==='onComposerProgress'&&entry.manifest!.tool)return(fn:(event:any)=>void)=>{void scopedListen(entry.manifest!.tool!.event,e=>fn(e.payload));return()=>events.clear()};
     if(entry.manifest!.workbench?.services?.includes(String(key))||key==='read'||key==='readImage'||key==='language'||key==='workspace')return (...args:unknown[])=>{if(key!=='workspace'&&!entry.granted.includes('project.read'))return Promise.reject(Error('PermissionDenied: project.read'));if(!alive)return Promise.reject(Error('Plugin stopped'));if(String(key).startsWith('on')){const off=(target as any)[key](...args);own(off);return off;}if(entry.manifest!.workbench)return call('pluginAuthorizeService',entry.key,String(key)).then(()=>{if(!alive)throw Error('Plugin stopped');const result=(target as any)[key](...args);return Promise.resolve(result).then(value=>{if(!alive)throw Error('Plugin stopped');return value;});});return (target as any)[key](...args)};
     return undefined;
    }});
    const scopedKeymap={ariaShortcuts:(id:string)=>keymap.ariaShortcuts(id),defineContext:(...args:Parameters<typeof keymap.defineContext>)=>{const off=keymap.defineContext(...args);own(off);return off;},registerAction:(spec:Parameters<typeof keymap.registerAction>[0])=>{const remove=keymap.registerAction(spec);own(remove);return remove;},onChange:(fn:()=>void)=>{const off=keymap.onChange(fn);own(off);return off;},shortcut:(id:string)=>keymap.shortcut(id)};
    const dockWindow=(panel:HTMLElement,button:HTMLElement,hide:()=>void)=>{const handler=(event:Event)=>{if((event as CustomEvent).detail!==panel.id)hide()};document.addEventListener('ide-dock-open',handler);own(()=>document.removeEventListener('ide-dock-open',handler));return()=>{document.dispatchEvent(new CustomEvent('ide-dock-open',{detail:panel.id}));panel.hidden=false;button.setAttribute('aria-pressed','true')};};
    const url=URL.createObjectURL(new Blob([source.code],{type:'text/javascript'}));own(()=>URL.revokeObjectURL(url));
    const module=await import(/* @vite-ignore */ url);if(epoch!==generation){await stop();return;}
    controller=module.activate({service:pluginService,provide:(name:string,value:unknown)=>{const off=providePluginService(entry.key,name,value);own(off);return off;},fileIcon,editorFont,activeLanguage,api:toolApi,host,monaco,tr,msg,html,keymap:scopedKeymap,listen:scopedListen,own,dockWindow,resizeToolWindow,toolIcon,editorPreviewLayout})??{};
    for(const el of document.querySelectorAll('.code > *, .left-rail > *'))if(!before.has(el)&&!el.contains(host.editor.getDomNode()))own(()=>el.remove());
    if(epoch!==generation){await stop();return;}
    mounted.set(entry.key,{stop,controller,methods:entry.manifest.tool?.methods??[]});window.dispatchEvent(new CustomEvent('ide-tool-state',{detail:{key:entry.key,state:'active'}}));
   }catch(error){await stop();window.dispatchEvent(new CustomEvent('ide-tool-state',{detail:{key:entry.key,state:'failed',error:String(error)}}));host.status(`${entry.manifest.name}: ${String(error)} · Plugins → Recarregar`);}
  }
 }
 const reload=()=>queue=queue.catch(()=>{}).then(load).catch(error=>host.status(String(error)));
 window.addEventListener('ide-plugins-changed',()=>{void reload()});
 window.addEventListener('ide-tool-command',event=>{const {key,args}=(event as CustomEvent).detail;const plugin=mounted.get(key);if(plugin?.controller.run)void plugin.controller.run(args?.[0]);else host.status('Plugin indisponível. Abra Plugins para instalar ou ativar.');});
 window.addEventListener('ide-native-project-changed',()=>{void dispose();});
 window.addEventListener('beforeunload',()=>{void dispose();});
 void reload();
 return {reset:()=>dispose(),reload,ready:()=>queue};
}
