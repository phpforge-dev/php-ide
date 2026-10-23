import { t as tr, msg, html } from './i18n';
import * as monaco from 'monaco-editor';
import { diffLines } from 'diff';
import type { IdeApi } from '../shared/contracts';
type Block = {line: number; end: number; before: string; after: string; kind:'added'|'modified'|'deleted'};
export function mountEditorChanges(api: IdeApi, editor: monaco.editor.IStandaloneCodeEditor, hooks: {path(): string | undefined; status(text: string): void}) {
 const decorations = editor.createDecorationsCollection(); let blocks: Block[]=[]; let baseline=''; let label=''; let epoch=0; let timer:ReturnType<typeof setTimeout>; let popup:HTMLElement|undefined; let currentPath: string | undefined;
 const close=()=>{popup?.remove();popup=undefined;};
 function update() {
  close(); const model=editor.getModel(); if(!model)return;
  const parts=diffLines(baseline, model.getValue(), {timeout:100,maxEditLength:10000});
  if(!parts) { decorations.clear(); blocks=[]; hooks.status(tr('Diff de linha excedeu o limite; use o painel Git para comparar este arquivo.')); return; }
  blocks=[]; let line=1;
  for(let i=0;i<parts.length;i++) {
   const part=parts[i]; if(!part.added&&!part.removed){line+=part.count;continue;}
   let before='',after='';let added=0;
   while(i<parts.length&&(parts[i].added||parts[i].removed)){const p=parts[i];if(p.removed)before+=p.value;else{after+=p.value;added+=p.count;}i++;}i--;
   blocks.push({line:Math.min(line,model.getLineCount()),end:Math.min(line+Math.max(1,added)-1,model.getLineCount()),before,after,kind:before?(after?'modified':'deleted'):'added'});line+=added;
  }
  decorations.set(blocks.map(b=>({range:new monaco.Range(b.line,1,b.end,1),options:{isWholeLine:true,linesDecorationsClassName:`git-line-${b.kind} git-change-${b.line}`,overviewRuler:{color:{id:b.kind==='added'?'editorGutter.addedBackground':b.kind==='deleted'?'editorGutter.deletedBackground':'editorGutter.modifiedBackground'},position:monaco.editor.OverviewRulerLane.Left},hoverMessage:{value:`**Git · ${b.kind==='added'?'Adicionado':b.kind==='deleted'?'Removido':'Modificado'}**\n\n${label}. Clique na marca para ver o trecho.`}}})));
  editor.render(true);
 }
 async function refresh() {
  const token=++epoch; const path=hooks.path(); const changed=path!==currentPath; if(changed) {close();decorations.clear();blocks=[];baseline='';currentPath=path;} if(!path||!editor.getModel())return;
  try {const base=await api.gitEditorBase(path);if(token!==epoch)return;if(changed || baseline!==base.text || label!==base.label) { baseline=base.text;label=base.label;update(); }}catch{/* Non-Git and virtual documents have no markers. */}
 }
 function show(block:Block) {
  close(); const root=document.createElement('section'); popup=root; root.className='git-line-popup'; root.setAttribute('role','dialog');root.setAttribute('aria-label',tr('Alterações Git do trecho'));
  root.innerHTML=html('<header><strong></strong><button aria-label="Fechar alterações Git">×</button></header><div class="line-diff"></div><footer>Comparação com HEAD · inclui alterações ainda não salvas</footer>');
  root.querySelector('strong')!.textContent=`${label} · linha ${block.line}`;root.querySelector('button')!.onclick=close;
  const content=root.querySelector('.line-diff')!;
  for(const [text,kind]of [[block.before,'removed'],[block.after,'added']])if(text){const pre=document.createElement('pre');pre.className=kind;pre.textContent=text;content.append(pre);}
  const rect=editor.getDomNode()!.getBoundingClientRect();const point=editor.getScrolledVisiblePosition({lineNumber:block.line,column:1});root.style.left=Math.min(rect.left+55,innerWidth-660)+'px';root.style.top=Math.max(8,Math.min(rect.top+(point?.top??30)+22,innerHeight-330))+'px';document.body.append(root);root.querySelector('button')!.focus();
 }
 // Identificar o bloco pela decoração, sem depender do hit-test do gutter.
 const markerHost=editor.getDomNode()!.parentElement!;
 const markerClick=(event:MouseEvent)=>{
  if(event.button!==0)return;
  const marker=(event.target as Element).closest('.git-line-added,.git-line-modified,.git-line-deleted');
  const line=marker&&[...marker.classList].find(name=>/^git-change-\d+$/.test(name));
  const block=line&&blocks.find(b=>b.line===Number(line.slice(11)));
  if(block){event.preventDefault();event.stopImmediatePropagation();show(block);}
 };
 markerHost.addEventListener('mousedown',markerClick,true);
 editor.onMouseDown(e=>{if(e.target.type!==monaco.editor.MouseTargetType.GUTTER_LINE_DECORATIONS||!e.target.position)return; const block=blocks.find(b=>e.target.position!.lineNumber>=b.line&&e.target.position!.lineNumber<=b.end);if(block)show(block);});
 editor.onDidChangeModel(()=>{queueMicrotask(()=>void refresh());}); editor.onDidChangeModelContent(()=>{clearTimeout(timer);timer=setTimeout(update,180);});
 window.addEventListener('focus',()=>void refresh()); const poll=setInterval(()=>{if(document.hasFocus())void refresh();},5000);
 document.addEventListener('keydown',e=>{if(e.key==='Escape')close();});
 document.addEventListener('mousedown',e=>{if(popup&&!popup.contains(e.target as Node)&&!(e.target as HTMLElement).closest('.margin'))close();});
 editor.addAction({id:'php-ide.lineChanges',label:tr('Git: mostrar alterações desta linha'),contextMenuGroupId:'git',run:()=>{const line=editor.getPosition()?.lineNumber;const block=blocks.find(b=>line&&line>=b.line&&line<=b.end);if(block)show(block);else hooks.status(tr('Esta linha não tem alterações em relação a HEAD.'));}});
 editor.addAction({id:'php-ide.lineHistory',label:'Git: autor e commit desta linha',contextMenuGroupId:'git',run:async()=>{
  const model=editor.getModel();const path=hooks.path();const position=editor.getPosition();if(!model||!path||!position)return;
  hooks.status(tr('Buscando autoria da linha…'));try{const info=await api.gitLineInfo(path,position.lineNumber,model.getValue());if(editor.getModel()!==model)return;
   close();const root=document.createElement('section');popup=root;root.className='git-line-popup git-line-history';root.setAttribute('role','dialog');root.setAttribute('aria-label',tr('Git: autoria da linha'));const title=document.createElement('strong');title.textContent=info.uncommitted?tr('Alteração ainda não commitada'):`${info.author} · ${info.hash.slice(0,8)}`;const text=document.createElement('p');text.textContent=info.summary;const date=document.createElement('small');date.textContent=info.uncommitted?tr('Buffer atual'):new Date(info.date).toLocaleString();const button=document.createElement('button');button.textContent=tr('Fechar');button.onclick=close;root.append(title,text,date,button);document.body.append(root);const rect=editor.getDomNode()!.getBoundingClientRect();root.style.left=Math.min(rect.left+70,innerWidth-660)+'px';root.style.top=Math.min(rect.top+80,innerHeight-250)+'px';button.focus();hooks.status(tr('Autoria da linha consultada.'));
  }catch(error){hooks.status(`Git: ${String(error)}`);}
 }});
 return {refresh,dispose(){markerHost.removeEventListener('mousedown',markerClick,true);clearInterval(poll);clearTimeout(timer);decorations.clear();close();}};
}
