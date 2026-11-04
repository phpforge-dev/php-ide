// Run configuration selector in the toolbar's Run widget. Plugins contribute configuration types through the plugin
// service `runConfigurations:<type>` (contract below); the host lists every type in one popup, as the reference does,
// remembers nothing itself (each provider keeps its own selection per project) and runs the selected one.
import {pluginServicesWithPrefix} from './plugin-services';
import {t as tr} from './i18n';

export type RunConfigurationItem={id:string;name:string;temporary?:boolean;description?:string};
export type RunConfigurationProvider={
 type:string;label:string;
 /** Inline SVG markup for the type icon. */
 icon:string;
 list():RunConfigurationItem[];
 run(id:string):void;
 /** Opens the provider's configuration dialog, optionally on one configuration. */
 edit(id?:string):void;
 /** Keeps a temporary configuration. */
 save?(id:string):void;
 /** The user picked a configuration of this type (id) or one of another type/none (undefined). */
 select?(id:string|undefined):void;
 /** Selection the provider restored for this project. */
 selected?():string|undefined;
 /** Called when the list changes; `select` asks the selector to select that configuration (e.g. one created by a gutter run). */
 onChange(fn:(select?:string)=>void):()=>void;
};
const PREFIX='runConfigurations:';

export function mountRunConfigurations(widget:HTMLElement,status:(text:string)=>void){
 const foundLabel=widget.querySelector<HTMLElement>('.run-config');const foundRun=widget.querySelector<HTMLButtonElement>('#run-current');
 if(!foundLabel||!foundRun)return {dispose(){}};
 const label:HTMLElement=foundLabel,run:HTMLButtonElement=foundRun;
 const original={text:label.textContent??'',title:run.title,aria:run.getAttribute('aria-label')??'',disabled:run.disabled};
 const selector=document.createElement('button');selector.type='button';selector.id='run-config-host';selector.className='run-config-select';
 selector.setAttribute('aria-haspopup','menu');selector.setAttribute('aria-expanded','false');
 let providers:{name:string;value:RunConfigurationProvider}[]=[];let offs:(()=>void)[]=[];let selected:{provider:RunConfigurationProvider;id:string}|undefined;let menu:HTMLElement|undefined;
 const item=()=>selected?selected.provider.list().find(i=>i.id===selected!.id):undefined;
 const icon=(markup:string)=>{const span=document.createElement('span');span.className='run-config-icon';span.innerHTML=markup;return span;};
 function choose(provider:RunConfigurationProvider|undefined,id?:string){
  selected=provider&&id?{provider,id}:undefined;
  for(const p of providers)p.value.select?.(p.value===provider?id:undefined);
  paint();
 }
 function paint(){
  if(selected&&!item())selected=undefined;
  const current=item();
  if(!providers.length){label.replaceChildren(original.text);run.disabled=original.disabled;run.title=original.title;run.setAttribute('aria-label',original.aria);delete run.dataset.runConfig;return;}
  const name=document.createElement('span');name.className='run-config-name';name.textContent=current?current.name:tr('Arquivo atual');
  selector.replaceChildren(...(current?[icon(selected!.provider.icon)]:[]),name);selector.classList.toggle('temporary',!!current?.temporary);
  selector.title=current?`${current.name}${current.temporary?tr(' (temporária)'):''}${current.description?' · '+current.description:''}`:tr('Selecionar configuração de execução');
  if(selector.parentElement!==label)label.replaceChildren(selector);
  if(current){const text=`${tr('Executar')} '${current.name}'`;run.disabled=false;run.title=text;run.setAttribute('aria-label',text);run.dataset.runConfig=selected!.provider.type+':'+current.id;}
  else{run.disabled=original.disabled;run.title=original.title;run.setAttribute('aria-label',original.aria);delete run.dataset.runConfig;}
 }
 function scan(){
  for(const off of offs)off();offs=[];
  providers=pluginServicesWithPrefix<RunConfigurationProvider>(PREFIX).filter(p=>p.value&&typeof p.value.list==='function');
  if(selected&&!providers.some(p=>p.value===selected!.provider))selected=undefined;
  if(!selected)for(const p of providers){const id=p.value.selected?.();if(id&&p.value.list().some(i=>i.id===id)){selected={provider:p.value,id};break;}}
  for(const p of providers)offs.push(p.value.onChange(select=>{if(select)choose(p.value,select);else{closeMenu();paint();}}));
  paint();
 }
 run.addEventListener('click',event=>{if(!selected)return;event.stopImmediatePropagation();try{selected.provider.run(selected.id);}catch(error){status(String(error));}},true);
 const closeMenu=()=>{menu?.remove();menu=undefined;selector.setAttribute('aria-expanded','false');};
 function openMenu(){
  closeMenu();menu=document.createElement('div');menu.className='tool-context-menu run-config-menu';menu.setAttribute('role','menu');menu.id='run-config-host-menu';
  const add=(text:string,act:()=>void,attrs:Record<string,string>={},...prefix:Node[])=>{const b=document.createElement('button');b.type='button';b.setAttribute('role','menuitem');for(const [k,v] of Object.entries(attrs))b.setAttribute(k,v);const span=document.createElement('span');span.className='run-config-menu-label';span.textContent=text;b.append(...prefix,span);b.onclick=()=>{closeMenu();act();};menu!.append(b);return b;};
  const current=item();
  for(const p of providers)for(const i of p.value.list()){
   const b=add(i.name,()=>choose(p.value,i.id),{role:'menuitemradio','aria-checked':String(selected?.provider===p.value&&selected.id===i.id),'data-run-config':p.value.type+':'+i.id},icon(p.value.icon));
   if(i.temporary)b.classList.add('temporary');if(i.description)b.title=i.description;
   const play=document.createElement('span');play.className='run-config-menu-run';play.setAttribute('role','button');play.setAttribute('aria-label',`${tr('Executar')} '${i.name}'`);play.title=play.getAttribute('aria-label')!;
   play.innerHTML='<svg viewBox="0 0 16 16" aria-hidden="true"><path d="M4.5 3.2v9.6L12.6 8z" fill="currentColor"/></svg>';
   play.onclick=e=>{e.stopPropagation();closeMenu();choose(p.value,i.id);p.value.run(i.id);};b.append(play);
  }
  if(menu.childElementCount)menu.append(document.createElement('hr'));
  add(tr('Arquivo atual'),()=>choose(undefined),{role:'menuitemradio','aria-checked':String(!current),'data-run-config':''});
  menu.append(document.createElement('hr'));
  if(current?.temporary&&selected!.provider.save){const s=selected!;add(`${tr('Salvar a configuração')} '${current.name}'`,()=>s.provider.save!(s.id),{'data-action':'save'});}
  for(const p of providers)add(providers.length===1?tr('Editar configurações…'):`${tr('Editar configurações')} · ${p.value.label}…`,()=>p.value.edit(selected?.provider===p.value?selected.id:undefined),{'data-action':'edit','data-type':p.value.type});
  document.body.append(menu);const box=selector.getBoundingClientRect();
  menu.style.left=Math.max(8,Math.min(box.left,window.innerWidth-menu.offsetWidth-8))+'px';menu.style.top=box.bottom+4+'px';selector.setAttribute('aria-expanded','true');
  (menu.querySelector<HTMLElement>('[aria-checked=true]')??menu.querySelector('button'))?.focus();
  menu.addEventListener('keydown',e=>{const buttons=[...menu!.querySelectorAll<HTMLButtonElement>('button')];const i=buttons.indexOf(document.activeElement as HTMLButtonElement);
   if(e.key==='ArrowDown'||e.key==='ArrowUp'){e.preventDefault();buttons[(i+(e.key==='ArrowDown'?1:buttons.length-1))%buttons.length]?.focus();}
   if(e.key==='Escape'){e.preventDefault();closeMenu();selector.focus();}});
 }
 selector.onclick=()=>menu?closeMenu():openMenu();
 const outside=(e:Event)=>{if(menu&&!menu.contains(e.target as Node)&&!selector.contains(e.target as Node))closeMenu();};
 document.addEventListener('pointerdown',outside);
 const onService=(e:Event)=>{if(String((e as CustomEvent).detail?.name).startsWith(PREFIX))scan();};
 window.addEventListener('ide-plugin-service',onService);
 scan();
 return {dispose(){window.removeEventListener('ide-plugin-service',onService);document.removeEventListener('pointerdown',outside);for(const off of offs)off();closeMenu();selector.remove();label.replaceChildren(original.text);}};
}
