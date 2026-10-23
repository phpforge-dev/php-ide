import * as monaco from 'monaco-editor';
import { editorPreviewLayout } from './editor-preview-layout';
import { t as tr } from './i18n';
import './svg-preview.css';
type Mode='editor'|'split'|'preview';
export const isSvgPath=(path:string)=>/\.svg$/i.test(path);
/** Serialized XML is rendered only as an image; it is never inserted into the IDE DOM. */
export function svgImageSource(text:string):string {
 if(text.length>2*1024*1024)throw Error('SVG acima de 2 MiB.');
 if(/<!ENTITY|<!DOCTYPE[^>]*\[/i.test(text))throw Error('Declarações de entidades XML não são exibidas na prévia.');
 const source=text.replace(/<!DOCTYPE[^>]*>/gi,'');
 const document=new DOMParser().parseFromString(source,'image/svg+xml');
 const root=document.documentElement;
 if(!root||root.localName!=='svg'||document.querySelector('parsererror'))throw Error('SVG inválido. Corrija o XML para atualizar a imagem.');
 if(root.namespaceURI&&root.namespaceURI!=='http://www.w3.org/2000/svg')throw Error('O documento não contém um elemento SVG válido.');
 if(!root.namespaceURI)root.setAttribute('xmlns','http://www.w3.org/2000/svg');
 return 'data:image/svg+xml;charset=utf-8,'+encodeURIComponent(new XMLSerializer().serializeToString(root));
}
export function mountSvgPreview(editor:monaco.editor.IStandaloneCodeEditor,hooks:{path():string|undefined}){
 const shared=editorPreviewLayout(editor);let mode:Mode='split';try{const saved=localStorage.getItem('php-ide-svg-mode');if(['editor','split','preview'].includes(saved??''))mode=saved as Mode;}catch{}
 const active=()=>{const path=hooks.path();return !!path&&isSvgPath(path)&&!!editor.getModel();};
 const bar=document.createElement('div');bar.id='svg-toolbar';bar.setAttribute('role','group');bar.setAttribute('aria-label',tr('Layout SVG'));bar.hidden=true;
 const modes:[Mode,string][]=[['editor','Fonte'],['split','Fonte e imagem'],['preview','Imagem']];
 const modeButtons=modes.map(([id,label])=>{const button=document.createElement('button');button.type='button';button.dataset.mode=id;button.textContent=tr(label);button.title=tr(label)+' · ⌘/Ctrl+Shift+V';button.setAttribute('aria-label',tr(label));button.onclick=()=>setMode(id);return button;});bar.append(...modeButtons);document.getElementById('navigation')!.prepend(bar);
 const preview=document.createElement('section');preview.id='svg-preview';preview.setAttribute('aria-label',tr('Prévia SVG'));preview.hidden=true;
 const tools=document.createElement('div');tools.className='svg-preview-tools';
 const button=(text:string,label:string,action:()=>void)=>{const b=document.createElement('button');b.type='button';b.textContent=text;b.title=tr(label);b.setAttribute('aria-label',tr(label));b.onclick=action;return b;};
 const zoomOut=button('−','Diminuir zoom',()=>setZoom(scale/1.25));zoomOut.id='svg-zoom-out';const zoomIn=button('+','Aumentar zoom',()=>setZoom(scale*1.25));zoomIn.id='svg-zoom-in';
 const fitButton=button(tr('Ajustar'),'Ajustar imagem à área',()=>{fit=true;zoom();});fitButton.id='svg-fit';
 const actualButton=button('100%','Tamanho original',()=>setZoom(1));actualButton.id='svg-actual';
 const background=document.createElement('select');background.id='svg-background';background.setAttribute('aria-label',tr('Fundo da imagem'));
 for(const [value,label]of [['checker','Quadriculado'],['light','Claro'],['dark','Escuro']]){const option=document.createElement('option');option.value=value;option.textContent=tr(label);background.append(option);}
 background.onchange=()=>{viewport.dataset.background=background.value;};
 tools.append(zoomOut,zoomIn,fitButton,actualButton,background);
 const viewport=document.createElement('div');viewport.className='svg-viewport';viewport.tabIndex=0;viewport.dataset.background='checker';viewport.setAttribute('aria-label',tr('Imagem SVG renderizada'));
 const stage=document.createElement('div');stage.className='svg-stage';viewport.append(stage);
 const info=document.createElement('div');info.id='svg-preview-info';info.setAttribute('role','status');info.setAttribute('aria-live','polite');
 preview.append(tools,viewport,info);
 let generation=0,timer:ReturnType<typeof setTimeout>|undefined,image:HTMLImageElement|undefined,rendered='',currentPath='',fit=true,scale=1,intrinsicWidth=0,intrinsicHeight=0;
 function zoom(){if(!image||!intrinsicWidth||!intrinsicHeight)return;const width=intrinsicWidth,height=intrinsicHeight;if(fit)scale=Math.min(8,Math.max(1,viewport.clientWidth-40)/width,Math.max(1,viewport.clientHeight-40)/height);const actual=Math.min(scale,16384/width,16384/height);image.style.width=width*actual+'px';image.style.height=height*actual+'px';info.textContent=`${width} × ${height} · ${Math.round(actual*100)}%`;fitButton.setAttribute('aria-pressed',String(fit));}
 function setZoom(value:number){fit=false;scale=Math.max(.1,Math.min(8,value));zoom();}
 function layout(){shared.update();modeButtons.forEach(b=>b.setAttribute('aria-pressed',String(b.dataset.mode===mode)));if(active())zoom();}
 function setMode(next:Mode){mode=next;try{localStorage.setItem('php-ide-svg-mode',mode);}catch{}layout();render();if(mode==='preview')viewport.focus();else editor.focus();}
 function error(message:string){image=undefined;stage.replaceChildren();const box=document.createElement('div');box.className='svg-preview-error';box.setAttribute('role','alert');const p=document.createElement('p');p.textContent=tr(message);box.append(p,button(tr('Ver fonte'),'Ver fonte',()=>setMode('split')));stage.append(box);preview.dataset.state='error';info.textContent=tr('Prévia SVG indisponível');}
 function render(){
  if(!active()||mode==='editor')return;const model=editor.getModel()!;const key=model.uri.toString()+'\0'+model.getVersionId();if(key===rendered)return;rendered=key;const token=++generation;const version=model.getVersionId();
  let source:string;try{source=svgImageSource(model.getValue());}catch(e){error((e as Error).message);return;}
  const next=new Image();next.alt=tr('Imagem SVG renderizada');next.draggable=false;next.decoding='sync';
  next.onload=()=>{if(token!==generation||!active()||editor.getModel()!==model||model.isDisposed()||model.getVersionId()!==version)return;intrinsicWidth=next.naturalWidth;intrinsicHeight=next.naturalHeight;image=next;next.hidden=false;preview.dataset.state='ready';preview.dataset.version=String(version);zoom();};
  next.onerror=()=>{if(token===generation)error('Não foi possível renderizar este SVG. Revise o fonte.');};
  image=undefined;stage.replaceChildren(next);preview.dataset.state='loading';info.textContent=tr('Renderizando SVG…');next.src=source;
 }
 shared.register({active,mode:()=>mode,preview,toolbar:bar});
 editor.onDidChangeModel(()=>{generation++;clearTimeout(timer);rendered='';if(currentPath!==hooks.path()){currentPath=hooks.path()??'';fit=true;scale=1;}layout();if(active())render();else{image=undefined;stage.replaceChildren();}});
 editor.onDidChangeModelContent(()=>{if(!active())return;clearTimeout(timer);timer=setTimeout(render,120);});
 new ResizeObserver(()=>{if(active()&&fit)zoom();}).observe(viewport);
 document.addEventListener('keydown',event=>{if(!active()||!(event.metaKey||event.ctrlKey)||!event.shiftKey||event.code!=='KeyV')return;event.preventDefault();event.stopPropagation();setMode(modes[(modes.findIndex(([id])=>id===mode)+1)%modes.length][0]);},true);
 layout();if(active())render();return {setMode};
}
