import { t as tr, msg, html } from './i18n';
import type { IdeApi } from '../shared/contracts';
import { keymap, type Binding } from './keymap';
import { mountKeymapSettings } from './keymap-settings';
import * as monaco from 'monaco-editor';
import './islands-shell.css';
import { paintAvatar as paintProjectAvatar } from './project-avatar';

// Islands shell (recorte 28): expui icons are applied by CSS from data-ij-icon, so modules that add stripe
// buttons later keep their own markup and still get the reference look.
const stripeIcons: Record<string,string> = {
 'show-project':'project','show-commit':'commit','show-git':'vcs','show-terminal':'terminal','show-docker':'services',
 'show-tests':'run','show-debug':'debug',
};
function ijIcon(name:string){const span=document.createElement('span');span.className='ij-icon';span.dataset.ijIcon=name;span.setAttribute('aria-hidden','true');return span;}

// Original line icons, kept local rather than importing reference-product assets.
const paths: Record<string,string> = {
 project: '<path d="M3 6h6l2 2h10v11H3z"/><path d="M3 6V4h6l2 2h8v2"/>',
 git: '<circle cx="6" cy="5" r="2"/><circle cx="6" cy="19" r="2"/><circle cx="18" cy="5" r="2"/><path d="M6 7v10m12-10v3c0 4-12 1-12 6"/>',
 database: '<ellipse cx="12" cy="5" rx="8" ry="3"/><path d="M4 5v14c0 4 16 4 16 0V5M4 12c0 4 16 4 16 0"/>',
 agent: '<path d="m12 3 2.5 6.5L21 12l-6.5 2.5L12 21l-2.5-6.5L3 12l6.5-2.5z"/>',
 settings: '<circle cx="12" cy="12" r="4"/><path d="M12 2v3m0 14v3M2 12h3m14 0h3M5 5l2 2m10 10 2 2M5 19l2-2M17 7l2-2"/>',
 save: '<path d="M4 3h13l3 3v15H4zM8 3v6h8V3M8 21v-8h8v8"/>',
 left: '<path d="m14 5-7 7 7 7"/>', right: '<path d="m10 5 7 7-7 7"/>',
 definition: '<path d="M4 6h9v9M13 6 4 15M15 12h5v8h-8v-4"/>',
 usages: '<circle cx="10" cy="10" r="6"/><path d="m15 15 6 6M7 10h6"/>',
 implementation: '<path d="M5 4h14v5H5zM12 9v5M5 14h14M5 14v6m14-6v6"/>',
 hide: '<path d="M5 12h14"/>',
};
function icon(button: HTMLElement, kind: string, label: string) {
 button.innerHTML = html`<svg aria-hidden="true" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round">${paths[kind]}</svg>`;
 button.setAttribute('aria-label',label); button.title=label;
}
export function mountWorkbench(api: IdeApi) {
 const el = (id:string) => document.getElementById(id)!;
 const main=document.querySelector('main')!;
 const left=document.querySelector<HTMLElement>('main > aside')!;
 const right=document.querySelector<HTMLElement>('.tools')!;
 left.classList.add('project-pane');
 const leftRail=document.createElement('nav');leftRail.className='tool-rail left-rail';leftRail.setAttribute('aria-label',tr('Ferramentas de projeto'));
 const rightRail=document.createElement('nav');rightRail.className='tool-rail right-rail';rightRail.setAttribute('aria-label',tr('Ferramentas de desenvolvimento'));
 main.prepend(leftRail);main.append(rightRail);
 let leftTool='show-project';let rightTool='';
 const setLeft=(id:string) => {
  const collapse=leftTool===id&&!main.classList.contains('left-hidden');
  main.classList.toggle('left-hidden',collapse);leftTool=id;
  for(const key of ['show-project','show-commit'])document.getElementById(key)?.setAttribute('aria-pressed',String(!collapse&&key===id));
 };
 const setRight=(id:string) => {
  const collapse=rightTool===id&&!main.classList.contains('right-hidden');
  main.classList.toggle('right-hidden',collapse);rightTool=id;
  for(const key of ['show-agent','show-db'])el(key).setAttribute('aria-pressed',String(!collapse&&key===id));
 };
 for(const [id,kind,label] of [['show-project','project',tr('Projeto')],['show-commit','save',tr('Commit')]]) {
  const button=document.getElementById(id);if(!button)continue;const action=button.onclick;icon(button,kind,label);leftRail.append(button);
  button.onclick=event=>{setLeft(id);action?.call(button,event);};
 }
 document.getElementById('show-project')?.setAttribute('aria-pressed','true');
 for(const [id,kind,label] of [['show-db','database',tr('Bancos')],['show-agent','agent',tr('Agente')]]) {
  const button=el(id);const action=button.onclick;icon(button,kind,label);rightRail.append(button);
  button.onclick=event=>{setRight(id);action?.call(button,event);};
 }
 const gitButton=document.getElementById('show-git');if(gitButton){icon(gitButton,'git','Git');leftRail.append(gitButton);}
 main.classList.add('right-hidden');
 left.querySelector(':scope > .switch')?.remove();right.querySelector(':scope > .switch')?.remove();
 for(const [pane,side] of [[left,'left'],[right,'right']] as const) {
  const hide=document.createElement('button');hide.className='hide-tool';icon(hide,'hide',side==='left'?tr('Ocultar painel do projeto'):'Ocultar ferramentas');
  hide.onclick=()=>{main.classList.add(side+'-hidden');const ids=side==='left'?['show-project','show-commit']:['show-db','show-agent'];for(const id of ids)document.getElementById(id)?.setAttribute('aria-pressed','false');document.getElementById(side==='left'?leftTool:rightTool||'show-db')?.focus();};pane.prepend(hide);
 }
 const header=document.querySelector('header')!;header.className='main-toolbar';
 header.querySelector('strong')?.remove();header.querySelector('.muted')?.remove();
 const project=el('project');const open=el('open');open.replaceChildren(project);open.setAttribute('aria-label',tr('Abrir projeto'));open.title=tr('Abrir projeto');
 const badge=document.createElement('span');badge.className='project-badge project-avatar';badge.setAttribute('aria-hidden','true');open.prepend(badge);
 const paintAvatar=()=>{const slot=paintProjectAvatar(badge,project.textContent?.trim()||'?');header.style.setProperty('--ij-project-tint',`var(--ij-avatar-${slot}-toolbar)`);};
 new MutationObserver(paintAvatar).observe(project,{childList:true,characterData:true,subtree:true});paintAvatar();
 open.append(ijIcon('chevronDown'));
 header.prepend(open);
 const branch=document.createElement('button');branch.id='workspace-branch';branch.title=tr('Abrir ferramentas Git');
 const branchLabel=document.createElement('span');branchLabel.className='branch-label';branch.append(ijIcon('vcs'),branchLabel,ijIcon('chevronDown'));
 const setBranch=(text:string)=>{branchLabel.textContent=text.replace(/^⑂\s*/,'');};setBranch(tr('Git'));branch.onclick=()=>document.dispatchEvent(new Event('ide-git-branches'));open.after(branch);
 let version=0;
 async function refreshBranch(){const current=++version;try{const state=await api.gitStatus();if(current===version)setBranch(state.branch);}catch{if(current===version)setBranch(tr('Git'));}}
 new MutationObserver(()=>{void refreshBranch();}).observe(project,{childList:true,characterData:true,subtree:true});
 const gitBranch=document.getElementById('git-branch');if(gitBranch)new MutationObserver(()=>{const text=gitBranch.textContent;if(text&&text!==tr('Git indisponível'))setBranch(text);}).observe(gitBranch,{childList:true});
 void refreshBranch();
 const space=document.createElement('span');space.className='toolbar-space';header.append(space);
 // Run widget: configuration label, Run (no runner yet: disabled with the reason) and Debug (debugs the current PHP file).
 const runWidget=document.createElement('div');runWidget.className='run-widget';runWidget.setAttribute('role','group');runWidget.setAttribute('aria-label',tr('Executar'));
 const runConfig=document.createElement('span');runConfig.className='run-config';runConfig.textContent=tr('Arquivo atual');
 const runButton=document.createElement('button');runButton.id='run-current';runButton.disabled=true;runButton.title=tr('Executar arquivo atual: ainda não disponível; use Depurar ou o Terminal');runButton.setAttribute('aria-label',tr('Executar arquivo atual'));runButton.append(ijIcon('run'));
 const debugButton=document.createElement('button');debugButton.id='debug-current';debugButton.title=tr('Depurar o arquivo PHP atual');debugButton.setAttribute('aria-label',tr('Depurar o arquivo PHP atual'));debugButton.append(ijIcon('debug'));
 debugButton.onclick=()=>{const target=document.getElementById('debug-script');if(target)target.click();else {el('status').textContent='Instale ou ative PHP Debugger / Xdebug em Plugins.';document.getElementById('plugins')?.click();}};
 runWidget.append(runConfig,runButton,debugButton);header.append(runWidget);
 for(const [id,kind,label] of [['nav-back','left',tr('Voltar')],['nav-forward','right',tr('Avançar')],['appearance','settings',tr('Aparência')]]) {const button=el(id);icon(button,kind,label);header.append(button);}
 for(const [id,kind,label] of [['definition','definition',tr('Declaração')],['references','usages','Encontrar usos'],['implementations','implementation',tr('Implementações')]])icon(el(id),kind,label);
 const themeToggle=document.getElementById('theme-toggle');if(themeToggle)header.insertBefore(themeToggle,el('appearance'));
 const tabs=el('tabs');const strip=document.createElement('div');strip.className='editor-strip';tabs.before(strip);strip.append(tabs,el('navigation'));
 const empty=document.createElement('div');empty.className='workbench-empty';empty.innerHTML=html('<strong>PHP IDE</strong><p>Selecione um arquivo no painel Projeto</p><p class="workbench-keys"></p>');document.querySelector('.code')!.append(empty);
 const footer=document.querySelector('footer')!;footer.prepend(el('breadcrumbs'));
 // UI-KEYMAP-001: atalhos dos botões da área de trabalho vivem no registro central (src/keymap.ts).
 // Padrões preservam os atalhos anteriores; o perfil JetBrains segue a ajuda pública do PhpStorm.
 const hints:[string,string,string][]=[];
 const button=(id:string,target:string,label:string,category:string,aliases:string,defaults:Binding={},jetbrains?:Binding,hint=label,context?:string)=>{
  keymap.registerAction({id,label,category,aliases,context,defaults,jetbrains,enabled:()=>{const b=document.getElementById(target) as HTMLButtonElement|null;return !!b&&!b.disabled&&!b.hidden;},run:()=>document.getElementById(target)?.click()});
  hints.push([id,target,hint]);
 };
 const tools='Janelas de ferramentas',nav='Navegação';
 button('tool.project','show-project','Projeto',tools,'project tree árvore arquivos',{mac:'Alt+1',other:'Alt+1'},{mac:'Meta+1'});
 button('tool.git','show-git','Git',tools,'log history histórico version control',{mac:'Alt+9',other:'Alt+9'},{mac:'Meta+9'});
 button('tool.commit','show-commit','Commit',tools,'git alterações changes',{mac:'Alt+0',other:'Alt+0'},{mac:'Meta+0'});
 button('tool.tests','show-tests','Testes',tools,'tests phpunit pest',{mac:'Alt+4',other:'Alt+4'},{mac:'Meta+4'});
 button('tool.docker','show-docker','Docker',tools,'services serviços containers imagens',{mac:'Alt+8',other:'Alt+8'},{mac:'Meta+8'},'Services · Docker');
 button('tool.database','show-db','Bancos',tools,'database conexão postgres mysql');
 button('tool.agent','show-agent','Agente',tools,'agent ai ia');
 button('ide.settings','appearance','Aparência','Configurações','settings preferences theme font idioma configurações',{mac:'Meta+,',other:'Ctrl+Alt+S'});
 button('git.branches','workspace-branch','Branches','Git','branch git ramificação',{},{mac:'Ctrl+Shift+`',other:'Ctrl+Shift+`'},'Abrir ferramentas Git');
 button('project.open','open','Abrir projeto','Projeto','open project');
 button('nav.back','nav-back','Voltar',nav,'back history',{mac:'Alt+Left',other:'Alt+Left'},{mac:'Meta+[',other:'Ctrl+Alt+Left'});
 button('nav.forward','nav-forward','Avançar',nav,'forward history',{mac:'Alt+Right',other:'Alt+Right'},{mac:'Meta+]',other:'Ctrl+Alt+Right'});
 button('nav.declaration','definition','Declaração',nav,'go to declaration definition definição',{mac:['Meta+B','F12'],other:['Ctrl+B','F12']},{mac:'Meta+B',other:'Ctrl+B'},'Declaração','editor');
 button('nav.implementations','implementations','Implementações',nav,'implementation',{mac:'Meta+Alt+B',other:'Ctrl+Alt+B'},undefined,'Implementações','editor');
 button('nav.usages','references','Encontrar usos',nav,'find usages references referências');
 function refreshHints(){
  for(const [id,target,label] of hints){const b=document.getElementById(target);if(!b)continue;const key=keymap.shortcut(id);b.title=tr(label)+(key?' · '+key:'');const aria=keymap.ariaShortcuts(id);if(aria)b.setAttribute('aria-keyshortcuts',aria);else b.removeAttribute('aria-keyshortcuts');}
  const keys=empty.querySelector('.workbench-keys')!;keys.replaceChildren();
  for(const [id,label] of [['tool.project','Projeto'],['tool.git','Git'],['search.everywhere','Buscar em tudo']]){const key=keymap.shortcut(id);if(!key)continue;const kbd=document.createElement('kbd');kbd.textContent=key;keys.append(kbd,' '+tr(label)+'   ');}
 }
 keymap.onChange(refreshHints);refreshHints();
 // Botões criados depois (Docker, Testes) recebem a dica quando aparecem.
 new MutationObserver(()=>refreshHints()).observe(leftRail,{childList:true});new MutationObserver(()=>refreshHints()).observe(rightRail,{childList:true});
 const paintRails=()=>{for(const b of [...leftRail.children,...rightRail.children] as HTMLElement[]){const name=stripeIcons[b.id];if(name&&b.dataset.ijIcon!==name)b.dataset.ijIcon=name;}};
 for(const rail of [leftRail,rightRail])new MutationObserver(paintRails).observe(rail,{childList:true});paintRails();
 mountStatusWidgets(footer);
 keymap.onError=(error,id)=>{el('status').textContent=msg`Atalho ${tr(keymap.action(id)?.label??id)}: ${String((error as Error)?.message??error)}`;};
 keymap.install(document);
 mountKeymapSettings();
}

/** Status bar widgets from the editor model (reference 05/40: line separator, indentation, read-only lock). */
function mountStatusWidgets(footer:HTMLElement){
 const box=document.createElement('span');box.className='status-widgets';
 const eol=document.createElement('span');eol.className='status-widget';eol.id='status-eol';
 const indent=document.createElement('span');indent.className='status-widget';indent.id='status-indent';
 const lock=document.createElement('span');lock.className='status-widget status-lock';lock.id='status-lock';
 box.append(eol,indent,lock);footer.append(box);
 let listeners:monaco.IDisposable[]=[];
 const paint=(editor:monaco.editor.ICodeEditor)=>{const model=editor.getModel();box.hidden=!model;if(!model)return;
  eol.textContent=model.getEOL()==='\r\n'?'CRLF':'LF';
  const options=model.getOptions();indent.textContent=options.insertSpaces?msg`${options.indentSize} espaços`:tr('Tab');
  const readOnly=!!editor.getOption(monaco.editor.EditorOption.readOnly);lock.dataset.locked=String(readOnly);lock.replaceChildren(ijIcon(readOnly?'locked':'unlocked'));
  const label=readOnly?tr('Arquivo somente leitura'):tr('Arquivo editável');lock.title=label;lock.setAttribute('aria-label',label);};
 const attach=(editor:monaco.editor.ICodeEditor)=>{if(!editor.getContainerDomNode().closest('#editor'))return;listeners.forEach(d=>d.dispose());
  listeners=[editor.onDidChangeModel(()=>paint(editor)),editor.onDidChangeModelOptions(()=>paint(editor)),editor.onDidChangeConfiguration(()=>paint(editor)),editor.onDidChangeModelContent(()=>paint(editor))];paint(editor);};
 monaco.editor.getEditors().forEach(attach);monaco.editor.onDidCreateEditor(attach);box.hidden=true;
}