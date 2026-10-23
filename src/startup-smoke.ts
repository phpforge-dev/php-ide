import * as monaco from 'monaco-editor';
import {getCurrentWindow} from '@tauri-apps/api/window';
import {invoke} from '@tauri-apps/api/core';
import {showWelcome} from './welcome';
export async function startupSmoke(parent:string){
 const previousLocale=localStorage.getItem('php-ide-language');
 const checks:string[]=[];const failures:string[]=[];const api=window.ide;let opened=0;
 const assert=(value:unknown,message:string)=>{if(!value)throw Error(message);};
 const wait=async(test:()=>boolean)=>{const start=Date.now();while(!test()){if(Date.now()-start>15000)throw Error('Timeout na tela inicial');await new Promise(r=>setTimeout(r,50));}};
 const click=(selector:string)=>{const button=document.querySelector<HTMLButtonElement>(selector);assert(button,'Botão ausente: '+selector);button!.click();};
 const fill=(name:string,value:string)=>{const input=document.querySelector<HTMLInputElement>(`.welcome-dialog input[name="${name}"]`)!;input.value=value;input.dispatchEvent(new Event('input',{bubbles:true}));};
 const welcome=()=>showWelcome(api,async()=>{opened++;});
 try{
  const win=getCurrentWindow();let size=(await win.innerSize()).toLogical(await win.scaleFactor());assert(Math.abs(size.width-960)<3&&Math.abs(size.height-680)<3,'Welcome não reduziu a janela: '+JSON.stringify(size));checks.push('Welcome: janela compacta 960×680');
  assert(!(await api.startupInfo()).project,'Perfil limpo abriu projeto indevido');assert(document.querySelector('.welcome-empty'),'Faltou estado vazio');assert(document.getElementById('startup-splash'),'Splash ausente');checks.push('Perfil limpo: splash e boas-vindas sem projeto de exemplo');
  await welcome();click('#welcome-new');fill('parent',parent);fill('name','created');click('.welcome-dialog button[type="submit"]');await wait(()=>opened===1);size=(await win.innerSize()).toLogical(await win.scaleFactor());assert(size.width>=1000&&size.height>=650,'Área de trabalho manteve tamanho compacto');assert((await api.workspace()).name==='created','Não ativou projeto criado');assert((await api.read('index.php')).text.includes('<?php'),'Não criou arquivo PHP');checks.push('Novo projeto pela interface: criação e ativação');
  await api.closeProject();assert(!(await api.startupInfo()).project,'Fechar manteve projeto ativo');await welcome();size=(await win.innerSize()).toLogical(await win.scaleFactor());assert(Math.abs(size.width-960)<3,'Fechar projeto não reduziu janela');checks.push('Fechar/reabrir: restaura tamanho de trabalho e reduz ao fechar');assert(document.querySelector('.welcome-target strong')?.textContent==='created','Histórico perdido ao fechar');
  click('#welcome-new');fill('parent',parent);fill('name','created');click('.welcome-dialog button[type="submit"]');await wait(()=>!!document.querySelector('.welcome-wizard-status')?.textContent?.includes('já existe'));assert(opened===1,'Sobrescreveu projeto existente');click('#welcome-cancel');checks.push('Fechar preserva recentes; criar rejeita sobrescrita com erro recuperável');
  click('#welcome-clone');fill('repository',parent+'/source');fill('parent',parent);fill('name','cloned');click('.welcome-dialog button[type="submit"]');await wait(()=>opened===2);assert((await api.read('hello.php')).text.includes('fixture'),'Clone não leu repositório local');checks.push('Clonar pela interface usando Git real e repositório descartável');
  await api.closeProject();await welcome();const search=document.querySelector<HTMLInputElement>('#welcome-search')!;search.value='created';search.dispatchEvent(new Event('input'));await wait(()=>document.querySelectorAll('.welcome-project').length===1);click('.welcome-target');
  const trust=()=>{const button=document.querySelector<HTMLButtonElement>('.trust-dialog .primary');if(button)button.click();};
  trust();await wait(()=>opened===3);assert((await api.workspace()).name==='created','Recente não abriu');checks.push('Buscar recente e reabrir projeto');
  await api.fileCreate('composer.json','file','{}');await api.fileCreate('src','directory');
  let ready=false;await showWelcome(api,async()=>{await (await import('./main')).ready;ready=true;});click('.welcome-target');trust();await wait(()=>ready);assert(document.querySelector('#tree button'),'Workbench sem árvore');assert(document.querySelector<HTMLButtonElement>('#nav-back')?.disabled,'Welcome alterou estado dos controles do editor');await wait(()=>[...document.querySelectorAll<HTMLImageElement>('.resource-icon img')].length>=6&&[...document.querySelectorAll<HTMLImageElement>('.resource-icon img')].every(img=>img.complete&&img.naturalWidth===16));checks.push('Welcome abre workbench real, preserva controles e carrega ícones SVG no pacote');
  click('#appearance');const theme=document.querySelector<HTMLSelectElement>('#appearance-theme')!;
  for(const mode of ['light','dark']){theme.value=mode;theme.dispatchEvent(new Event('change'));await wait(()=>document.documentElement.dataset.theme===mode);await wait(()=>document.querySelector('.monaco-editor')!.classList.contains(mode==='light'?'vs':'vs-dark'));}
  click('#appearance-close');click('#theme-toggle');assert(document.documentElement.dataset.theme==='light','Alternância rápida falhou');assert(JSON.parse(localStorage.getItem('php-ide-appearance')!).theme==='light','Tema não persistiu');checks.push('Aparência: claro/escuro no editor, alternância rápida e preferência persistida');
  document.querySelector<HTMLButtonElement>('#tree button[aria-label="index.php"]')!.click();const ed=monaco.editor.getEditors().find(editor=>editor.getDomNode()?.closest('#editor'))!;await wait(()=>!!ed.getModel()?.uri.path.endsWith('/index.php'));const before=ed.getModel()!.getValue();ed.getModel()!.setValue(before+'\n// unsaved locale test');click('#appearance');const language=document.querySelector<HTMLSelectElement>('#interface-language')!;language.value=document.documentElement.lang==='en'?'pt-BR':'en';language.dispatchEvent(new Event('change'));assert(localStorage.getItem('php-ide-language')===language.value,'Idioma não persistiu');const active=document.documentElement.lang;click('#apply-language');assert(document.documentElement.lang===active,'Recarregou com buffer sujo');assert(!!document.getElementById('language-feedback')!.textContent,'Faltou aviso de alterações');assert(ed.getModel()!.getValue().includes('unsaved locale test'),'Perdeu edição');ed.getModel()!.setValue(before);checks.push('Idioma: configuração persistida e recarga bloqueada com arquivo não salvo');


 }catch(error){failures.push(String(error));}
 if(previousLocale===null)localStorage.removeItem('php-ide-language');else localStorage.setItem('php-ide-language',previousLocale);
 await invoke('ide',{method:'nativeSmokeReport',args:[{ok:!failures.length,runtime:'tauri',checks,failures}]});
}
