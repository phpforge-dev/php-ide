import * as monaco from 'monaco-editor';
import type {IdeApi} from '../shared/contracts';
import {t,html,msg} from './i18n';
import {fileIcon} from './file-icons';
import {keymap,DOUBLE_SHIFT} from './keymap';
import './search-everywhere.css';

type Category='all'|'classes'|'files'|'symbols'|'actions'|'text';
type Row={label:string;detail:string;path?:string;run:()=>void|Promise<void>};
export function mountSearchEverywhere(api:IdeApi,editor:monaco.editor.IStandaloneCodeEditor,open:(path:string,line?:number,column?:number)=>Promise<void>){
 const dialog=document.createElement('dialog');dialog.id='search-everywhere';dialog.setAttribute('aria-label',t('Buscar em tudo'));
 dialog.innerHTML=html`<header><strong>Buscar em tudo</strong><button type="button" aria-label="Fechar busca">×</button></header><nav aria-label="Categorias de busca"></nav><input id="everywhere-query" role="combobox" aria-label="Buscar em tudo" aria-controls="everywhere-results" aria-expanded="true" autocomplete="off" placeholder="Arquivos, classes, símbolos, ações ou texto…" maxlength="256"><label class="everywhere-scope"><input type="checkbox"> Incluir vendor</label><p id="everywhere-status" role="status"></p><div id="everywhere-results" role="listbox" aria-label="Resultados da busca"></div><footer>↑ ↓ navegar · Enter abrir · Esc fechar</footer>`;
 document.body.append(dialog);
 const input=dialog.querySelector<HTMLInputElement>('#everywhere-query')!,vendor=dialog.querySelector<HTMLInputElement>('[type=checkbox]')!,list=dialog.querySelector<HTMLElement>('#everywhere-results')!,status=dialog.querySelector<HTMLElement>('#everywhere-status')!;
 let category:Category='all',generation=0,selected=0,rows:Row[]=[],timer:ReturnType<typeof setTimeout>|undefined,files:Promise<string[]>|undefined,previous:HTMLElement|null=null;
 let symbolQueue:Promise<unknown>=Promise.resolve();
 function symbols(query:string,token:number){const next=symbolQueue.then(()=>token===generation?api.searchSymbols(query):[]);symbolQueue=next.catch(()=>{});return next;}
 const tabs=[['all','Tudo'],['classes','Classes'],['files','Arquivos'],['symbols','Símbolos'],['actions','Ações'],['text','Texto']] as const;
 const buttons=tabs.map(([id,label])=>{const b=document.createElement('button');b.type='button';b.textContent=t(label);b.onclick=()=>{category=id;updateTabs();search();input.focus();};dialog.querySelector('nav')!.append(b);return b;});
 function updateTabs(){buttons.forEach((b,i)=>b.setAttribute('aria-pressed',String(tabs[i][0]===category)));vendor.disabled=category==='actions'||category==='text';}
 function close(){generation++;clearTimeout(timer);dialog.close();if(previous?.isConnected)previous.focus();else editor.focus();}
 dialog.querySelector('header button')!.addEventListener('click',close);dialog.addEventListener('cancel',event=>{event.preventDefault();close();});
 dialog.addEventListener('click',event=>{if(event.target===dialog){const r=dialog.getBoundingClientRect();if(event.clientX<r.left||event.clientX>r.right||event.clientY<r.top||event.clientY>r.bottom)close();}});
 function render(){
  list.replaceChildren();selected=Math.min(selected,Math.max(0,rows.length-1));
  for(const [i,row]of rows.slice(0,100).entries()){
   const item=document.createElement('div');item.id='everywhere-row-'+i;item.role='option';item.setAttribute('aria-selected',String(i===selected));item.className='everywhere-row';
   if(row.path)item.append(fileIcon(row.path));else{const badge=document.createElement('span');badge.className='everywhere-action-icon';badge.textContent='⌘';item.append(badge);}
   const text=document.createElement('span'),label=document.createElement('strong'),detail=document.createElement('small');label.textContent=row.label;detail.textContent=row.detail;text.append(label,detail);item.append(text);item.onmousedown=e=>e.preventDefault();item.onclick=()=>execute(i);list.append(item);
  }
  if(rows.length){input.setAttribute('aria-activedescendant','everywhere-row-'+selected);list.children[selected]?.scrollIntoView({block:'nearest'});}else input.removeAttribute('aria-activedescendant');
 }
 function execute(index=selected){const row=rows[index];if(!row)return;close();Promise.resolve().then(row.run).catch(error=>{show(category);status.textContent=String(error);});}
 const matches=(label:string,query:string)=>label.toLocaleLowerCase().includes(query);
 function actions(query:string):Row[]{
  const result:Row[]=[];
  // Ações da IDE vêm do registro central (UI-KEYMAP-001) e exibem o atalho do perfil atual.
  const origin=previous?.isConnected?previous:null;
  for(const action of keymap.actions()){
   if(action.id==='search.everywhere'||!keymap.available(action.id,origin))continue;
   const key=keymap.shortcut(action.id);
   if(matches(`${t(action.label)} ${action.label} ${action.aliases??''} ${action.id} ${key}`,query))result.push({label:t(action.label),detail:[t('Ação da IDE'),action.category?t(action.category):'',key].filter(Boolean).join(' · '),run:()=>{keymap.run(action.id,{target:origin});}});
  }
  const mirrored=new Set(keymap.actions().map(a=>a.editorActionId));
  for(const action of editor.getSupportedActions())if(action.isSupported()&&action.id!=='php-ide.searchEverywhere'&&!mirrored.has(action.id)&&matches(action.label,query))result.push({label:action.label,detail:t('Ação do editor'),run:async()=>{editor.focus();await action.run();}});
  return result;
 }
 function search(){
  const token=++generation;clearTimeout(timer);selected=0;rows=[];render();
  const query=input.value.trim(),lower=query.toLocaleLowerCase();const scope=category,includeVendor=vendor.checked;
  status.textContent=query?t('Buscando…'):t('Digite para buscar ou escolha uma ação.');
  if(scope==='all'||scope==='actions'){rows=actions(lower).slice(0,50);render();}
  if(!query||scope==='actions')return;
  if(scope==='text'&&query.length<2){status.textContent=t('Digite ao menos dois caracteres para buscar texto.');return;}
  timer=setTimeout(()=>{
   const errors:string[]=[];let pending=0;
   function finish(){if(token!==generation)return;render();status.textContent=errors.join(' · ')||(pending?t('Buscando…'):rows.length?msg`${rows.length} resultado(s) · até 100 exibidos`:t('Nenhum resultado encontrado.'));}
   const add=(work:Promise<Row[]>,label:string)=>{pending++;void work.then(found=>{if(token===generation){rows.push(...found);rows=rows.slice(0,300);}}).catch(error=>{if(token===generation)errors.push(label+': '+String(error));}).finally(()=>{pending--;finish();});};
   if(scope==='all'||scope==='files'){
    files??=api.listFiles('',includeVendor).catch(error=>{files=undefined;throw error;});
    add(files.then(paths=>paths.filter(path=>matches(path,lower)).sort((a,b)=>{const exact=(s:string)=>s.split('/').pop()?.toLocaleLowerCase()===lower?0:1;return exact(a)-exact(b)||a.length-b.length||a.localeCompare(b);}).slice(0,100).map(path=>({label:path.split('/').pop()!,detail:path,path,run:()=>open(path)}))),t('Arquivos'));
   }
   if(scope==='all'||scope==='symbols'||scope==='classes')add(symbols(query,token).then(symbols=>symbols.filter(s=>scope!=='classes'||[5,10,11,23].includes(s.kind)).filter(s=>includeVendor||!new URL(s.location.uri).pathname.includes('/vendor/')).slice(0,100).map(s=>({label:s.name,detail:(s.containerName?s.containerName+' · ':'')+decodeURIComponent(new URL(s.location.uri).pathname),path:new URL(s.location.uri).pathname,run:()=>open(monaco.Uri.parse(s.location.uri).fsPath,s.location.range.start.line+1,s.location.range.start.character+1)}))),t('Símbolos PHP'));
   if(scope==='text'||(scope==='all'&&query.length>=3))add(api.fileSearch(query).then(result=>{if(result.truncated)errors.push(t('Busca textual limitada a 500 ocorrências.'));return result.matches.slice(0,100).map(m=>({label:m.text.trim(),detail:`${m.path}:${m.line}:${m.column}`,path:m.path,run:()=>open(m.path,m.line,m.column)}));}),t('Texto no projeto (sem vendor)'));
   finish();
  },180);
 }
 input.oninput=search;vendor.onchange=()=>{files=undefined;search();};
 dialog.addEventListener('keydown',event=>{
  if(event.key==='ArrowDown'||event.key==='ArrowUp'){event.preventDefault();if(rows.length){selected=(selected+(event.key==='ArrowDown'?1:-1)+Math.min(rows.length,100))%Math.min(rows.length,100);render();}}
  if(event.key==='Enter'&&event.target===input){event.preventDefault();execute();}
 });
 function show(scope:Category='all'){previous=document.activeElement as HTMLElement;category=scope;files=undefined;input.value='';updateTabs();if(!dialog.open)dialog.showModal();input.focus();search();}
 const button=document.createElement('button');button.id='search-everywhere-open';button.type='button';button.textContent='⌕';button.setAttribute('aria-label',t('Buscar em tudo'));button.onclick=()=>show();document.querySelector('.main-toolbar')!.insertBefore(button,document.getElementById('appearance'));
 editor.addAction({id:'php-ide.searchEverywhere',label:t('Buscar em tudo'),run:()=>show()});
 // Atalhos padrão: ajuda pública do PhpStorm (Search Everywhere, Find Action, Go to File/Class/Symbol, Find in Files).
 const open_=(id:string,label:string,scope:Category,aliases:string,mac:string,other:string)=>keymap.registerAction({id,label,category:'Busca',aliases,defaults:{mac,other},run:()=>show(scope)});
 open_('search.everywhere','Buscar em tudo','all','search everywhere',DOUBLE_SHIFT,DOUBLE_SHIFT);
 open_('search.actions','Encontrar ação','actions','find action comandos commands','Meta+Shift+A','Ctrl+Shift+A');
 open_('search.files','Ir para arquivo','files','go to file abrir arquivo','Meta+Shift+O','Ctrl+Shift+N');
 open_('search.classes','Ir para classe','classes','go to class','Meta+O','Ctrl+N');
 open_('search.symbols','Ir para símbolo','symbols','go to symbol função método','Meta+Alt+O','Ctrl+Alt+Shift+N');
 open_('search.text','Buscar texto no projeto','text','find in files busca textual','Meta+Shift+F','Ctrl+Shift+F');
 const hint=()=>{const key=keymap.shortcut('search.everywhere');button.title=t('Buscar em tudo')+(key?' · '+key:'');};keymap.onChange(hint);hint();
 let pressed=0,last=0,clean=false;
 function reset(){pressed=0;last=0;clean=false;}
 window.addEventListener('blur',reset);document.addEventListener('pointerdown',reset,true);
 document.addEventListener('keydown',event=>{if(event.key!=='Shift'){reset();return;}if(event.repeat||event.isComposing||clean||event.ctrlKey||event.altKey||event.metaKey){reset();return;}pressed=performance.now();clean=true;},true);
 document.addEventListener('keyup',event=>{
  if(event.key!=='Shift'||!clean)return;const now=performance.now();clean=false;
  if(now-pressed>300||event.ctrlKey||event.altKey||event.metaKey||document.querySelector('dialog[open]')){last=0;return;}
  if(last&&now-last<450){last=0;keymap.dispatchGesture(DOUBLE_SHIFT,document.activeElement);}else last=now;
 },true);
 // O keymap consome keydown de atalhos antes deste detector; o keyup ainda invalida o Shift duplo.
 document.addEventListener('keyup',event=>{if(event.key!=='Shift')reset();},true);
 window.addEventListener('ide-project-files-changed',()=>{files=undefined;if(dialog.open)search();});
 return {show};
}
