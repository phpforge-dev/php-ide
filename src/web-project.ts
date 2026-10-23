import * as monaco from 'monaco-editor';
import type {IdeApi} from '../shared/contracts';
import {webLanguage} from './web-languages';
import {msg} from './i18n';

/** Project snapshots for browser language services; never execute project code. */
export class WebProject {
 private owned=new Set<monaco.editor.ITextModel>();private loading?:Promise<void>;private generation=0;private started=false;private extras:monaco.IDisposable[]=[];
 constructor(private api:IdeApi,private status:(text:string)=>void){}
 claim(model:monaco.editor.ITextModel){this.owned.delete(model);}
 retain(model:monaco.editor.ITextModel){if(!webLanguage(model.getLanguageId()))return false;this.owned.add(model);return true;}
 reset(){this.generation++;for(const model of this.owned)if(!model.isDisposed())model.dispose();this.owned.clear();for(const extra of this.extras)extra.dispose();this.extras=[];this.loading=undefined;this.started=false;}
 invalidate(){this.generation++;this.loading=undefined;if(this.started)void this.prepare().catch(error=>this.status(String(error)));}
 prepare(){this.started=true;return this.loading??=this.load().catch(error=>{this.loading=undefined;throw error;});}
 private async load(){
  const token=this.generation;const info=await this.api.workspace(),root=monaco.Uri.file(info.root);
  const all=(await this.api.listFiles('',false)).filter(path=>/\.(?:[cm]?[jt]sx?|vue)$/i.test(path));
  if(token!==this.generation)return;
  const present=new Set(all.map(path=>monaco.Uri.joinPath(root,path).toString()));
  for(const model of this.owned)if(!model.uri.path.includes('/node_modules/')&&!present.has(model.uri.toString())){model.dispose();this.owned.delete(model);}
  for(const extra of this.extras)extra.dispose();this.extras=[];
  let bytes=0,next=0,count=0,unreadable=false;const paths=all.slice(0,750);
  const snapshot=async(path:string)=>{if(token!==this.generation)return;const uri=monaco.Uri.joinPath(root,path);const existing=monaco.editor.getModel(uri);if(existing&&!this.owned.has(existing)){count++;return;}
   const file=await this.api.read(path);if(token!==this.generation)return;bytes+=file.text.length;if(bytes>8*1024*1024)return;
   const current=monaco.editor.getModel(uri);if(current&&!this.owned.has(current))return;
   if(current){if(current.getValue()!==file.text)current.setValue(file.text);}else{const model=monaco.editor.createModel(file.text,undefined,uri);this.owned.add(model);}count++;
   if(path.endsWith('package.json'))for(const defaults of [monaco.typescript.javascriptDefaults,monaco.typescript.typescriptDefaults])this.extras.push(defaults.addExtraLib(file.text,uri.toString()));
  };
  await Promise.all(Array.from({length:4},async()=>{while(next<paths.length&&token===this.generation&&bytes<8*1024*1024){const path=paths[next++];try{await snapshot(path);}catch{unreadable=true;/* Keep open buffers untouched when disk reads fail. */}}}));
  const packages=['@types/react','csstype','vue/dist','vue/jsx-runtime','@vue/runtime-core/dist','@vue/runtime-dom/dist','@vue/reactivity/dist','@vue/shared/dist'];
  let declarations=0;
  const walk=async(dir:string,depth=0):Promise<void>=>{if(depth>3||declarations>=500||token!==this.generation||bytes>8*1024*1024)return;let entries;try{entries=await this.api.tree(dir);}catch{return;}
   for(const entry of entries){if(entry.directory){if(!entry.name.startsWith('ts')&&!['node_modules','.git'].includes(entry.name))await walk(entry.path,depth+1);}else if(/\.d\.ts$/.test(entry.path)&&!/(experimental|canary)/.test(entry.name)){declarations++;try{await snapshot(entry.path);}catch{}}}
  };
  for(const pkg of packages){const name=pkg.startsWith('@')?pkg.split('/').slice(0,2).join('/'):pkg.split('/')[0];try{await snapshot('node_modules/'+name+'/package.json');}catch{}await walk('node_modules/'+pkg);}
  if(token===this.generation)this.status(unreadable||all.length>paths.length||declarations>=500||bytes>8*1024*1024?msg`Índice web parcial: ${count} arquivo(s).`:msg`Índice web: ${count} arquivo(s).`);
 }
}
