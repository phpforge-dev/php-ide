import {dockWindow} from './tool-window';
import { editorFont } from './editor-theme';
import { t as tr, html } from './i18n';
import { Terminal } from '@xterm/xterm';
import { FitAddon } from '@xterm/addon-fit';
import '@xterm/xterm/css/xterm.css';
import type { IdeApi } from '../shared/contracts';
import { keymap } from './keymap';
export function mountTerminal(api:IdeApi){
 const panel=document.createElement('section');panel.id='terminal-panel';panel.hidden=true;
 panel.innerHTML=html('<div id="terminal-resize" role="separator" tabindex="0" aria-label="Altura do terminal" aria-orientation="horizontal"></div><div class="terminal-toolbar"><strong>Terminal</strong><div id="terminal-tabs"></div><button id="terminal-new" title="Nova sessão" aria-label="Novo terminal">＋</button><button id="terminal-kill">Encerrar sessão</button><button id="terminal-hide" title="Ocultar sem encerrar" aria-label="Ocultar terminal">−</button></div><div id="terminal-message" role="status"></div><div id="terminal-views"></div>');
 document.querySelector('.code')!.append(panel);
 const button=document.createElement('button');button.id='show-terminal';button.title=tr('Terminal · Alt+F12');button.setAttribute('aria-label',tr('Terminal'));button.innerHTML=html('<svg aria-hidden="true" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5"><path d="m4 6 6 6-6 6m9 0h7"/></svg>');document.querySelector('.left-rail')!.append(button);
 const el=<T extends HTMLElement=HTMLElement>(id:string)=>document.getElementById(id) as T;
 type Session={id:string;label:string;term:Terminal;fit:FitAddon;view:HTMLElement;ended:boolean};
 const sessions=new Map<string,Session>();let active:string|undefined;let sequence=0;let epoch=0;let creating=false;let frame=0;
 function message(value:string){el('terminal-message').textContent=value;}
 function theme(term:Terminal){const light=document.documentElement.dataset.theme==='light';term.options.theme=light?{background:'#FFFFFF',foreground:'#080808',cursor:'#000000',selectionBackground:'#A6D2FF',black:'#252831',red:'#a52d39',green:'#286535',yellow:'#825813',blue:'#315fc3',magenta:'#7947a9',cyan:'#236d79',white:'#727a87',brightBlack:'#596273',brightRed:'#b92e3e',brightGreen:'#327a40',brightYellow:'#956419',brightBlue:'#426fca',brightMagenta:'#8c50bc',brightCyan:'#297f8c',brightWhite:'#252831'}:{background:'#191A1C',foreground:'#BCBEC4',cursor:'#CED0D6',selectionBackground:'#214283',black:'#4a4f59',red:'#f29b9d',green:'#94c79a',yellow:'#edc27c',blue:'#8bb1ff',magenta:'#c49aec',cyan:'#83c4cd',white:'#dfe1e5',brightBlack:'#a4aab7',brightRed:'#ffadb0',brightGreen:'#a9dbaf',brightYellow:'#ffda93',brightBlue:'#abc6ff',brightMagenta:'#dbb7ff',brightCyan:'#a6dce3',brightWhite:'#ffffff'};}
 function fit(){cancelAnimationFrame(frame);frame=requestAnimationFrame(()=>{const s=active?sessions.get(active):undefined;if(!s||panel.hidden)return;s.fit.fit();if(!s.ended)void api.terminalResize(s.id,s.term.cols,s.term.rows).catch(e=>message(String(e)));});}
 function tabs(){el('terminal-tabs').replaceChildren(...[...sessions.values()].map(s=>{const b=document.createElement('button');b.dataset.id=s.id;b.textContent=s.label+(s.ended?tr(' · encerrado'):'');b.setAttribute('aria-pressed',String(s.id===active));b.onclick=()=>select(s.id);return b;}));}
 function select(id:string){active=id;for(const s of sessions.values())s.view.hidden=s.id!==id;tabs();fit();sessions.get(id)?.term.focus();}
 async function create(docker?:{context:string;container:string;name:string},cwd?:string){if(creating)return;if(sessions.size>=8){message(tr('Feche uma aba antes de abrir outra (limite: 8).'));return;}creating=true;el<HTMLButtonElement>('terminal-new').disabled=true;const version=epoch;const id=crypto.randomUUID();const view=document.createElement('div');view.className='terminal-view';el('terminal-views').append(view);
  const term=new Terminal({cursorBlink:true,fontSize:editorFont.size,lineHeight:1.25,fontFamily:editorFont.family,scrollback:5000,screenReaderMode:true,allowProposedApi:false});const addon=new FitAddon();term.loadAddon(addon);theme(term);term.open(view);
  const s:Session={id,label:`Shell ${++sequence}`,term,fit:addon,view,ended:false};sessions.set(id,s);select(id);message(tr('Iniciando shell…'));
  term.onData(data=>{if(!s.ended)void api.terminalWrite(id,data).catch(e=>message(String(e)));});
  try{const info=docker ? await api.dockerTerminal(id,docker.context,docker.container) : await api.terminalCreate(id,80,24,cwd);if(version!==epoch){await api.terminalClose(id);return;}s.label=docker ? docker.name+' · sh' : info.shell+' '+sequence+(cwd?' · '+cwd.split('/').pop():'');message('');tabs();fit();term.focus();}
  catch(error){s.ended=true;message(String(error));tabs();}
  finally{creating=false;el<HTMLButtonElement>('terminal-new').disabled=false;}
 }
 const dock=dockWindow(panel,button,hide);
 function show(){dock();panel.hidden=false;button.setAttribute('aria-pressed','true');if(!sessions.size)void create();else{fit();if(active)sessions.get(active)?.term.focus();}}
 function hide(){panel.hidden=true;button.setAttribute('aria-pressed','false');button.focus();}
 button.onclick=()=>panel.hidden?show():hide();el('terminal-hide').onclick=hide;el('terminal-new').onclick=()=>{void create();};
 el('terminal-kill').onclick=async()=>{const id=active;if(!id)return;try{await api.terminalClose(id);const s=sessions.get(id);s?.term.dispose();s?.view.remove();sessions.delete(id);const next=[...sessions.keys()].at(-1);if(next)select(next);else{active=undefined;tabs();message(tr('Sessão encerrada. Use + para abrir outra.'));}}catch(error){message(String(error));}};
 api.onTerminalEvent(event=>{const s=sessions.get(event.id);if(!s)return;if(event.type==='output')s.term.write(event.data,()=>{void api.terminalAck(event.id,event.data.length).catch(()=>{});});else{s.ended=true;s.term.write(`\r\n[Processo encerrado: ${event.code}]\r\n`);tabs();}});
 const resize=new ResizeObserver(fit);resize.observe(panel);new MutationObserver(()=>{for(const s of sessions.values())theme(s.term);}).observe(document.documentElement,{attributes:true,attributeFilter:['data-theme']});
 const handle=el('terminal-resize');function height(value:number){const max=Math.max(120,document.querySelector('.code')!.clientHeight*.7);panel.style.height=Math.round(Math.min(max,Math.max(120,value)))+'px';fit();}
 handle.onpointerdown=e=>{handle.setPointerCapture(e.pointerId);e.preventDefault();};handle.onpointermove=e=>{if(handle.hasPointerCapture(e.pointerId))height(panel.getBoundingClientRect().bottom-e.clientY);};handle.onpointerup=e=>handle.releasePointerCapture(e.pointerId);
 handle.onkeydown=e=>{if(e.key==='ArrowUp'||e.key==='ArrowDown'){e.preventDefault();height(panel.clientHeight+(e.key==='ArrowUp'?20:-20));}};
 keymap.registerAction({id:'tool.terminal',label:'Terminal',category:'Janelas de ferramentas',aliases:'shell console',defaults:{mac:'Alt+F12',other:'Alt+F12'},run:()=>panel.hidden?show():hide()});
 const hint=()=>{const key=keymap.shortcut('tool.terminal');button.title=tr('Terminal')+(key?' · '+key:'');const aria=keymap.ariaShortcuts('tool.terminal');if(aria)button.setAttribute('aria-keyshortcuts',aria);else button.removeAttribute('aria-keyshortcuts');};keymap.onChange(hint);hint();
 return {async open(cwd:string){dock();panel.hidden=false;button.setAttribute('aria-pressed','true');await create(undefined,cwd);},async docker(context:string,container:string,name:string){dock();panel.hidden=false;button.setAttribute('aria-pressed','true');await create({context,container,name});},reset(){epoch++;for(const s of sessions.values()){s.term.dispose();s.view.remove();}sessions.clear();active=undefined;tabs();hide();message('');}};
}
