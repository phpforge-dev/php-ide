import * as monaco from 'monaco-editor';
import { t as tr } from './i18n';
import { invoke } from '@tauri-apps/api/core';
import type { AgentEvent } from '../shared/contracts';
export async function nativeSmoke(info:any){
 const checks:string[]=[];const failures:string[]=[];const errors:string[]=[];window.addEventListener('error',e=>errors.push(e.error?.stack??e.message));
 const raw=(method:string,args:unknown[]=[])=>invoke<any>('ide',{method,args});const assert=(value:unknown,message:string)=>{if(!value)throw Error(message);};
 const wait=async(test:()=>boolean,ms=30000,label='Tempo esgotado')=>{const end=Date.now()+ms;while(!test()){if(Date.now()>end)throw Error(label);await new Promise(r=>setTimeout(r,40));}};
 async function check(name:string,work:()=>Promise<void>){if(!!info.docker?.webOnly!==name.startsWith('Web:'))return;if(info.docker?.searchOnly&&!name.startsWith('Busca geral:'))return;if(info.docker?.insightsOnly&&!name.startsWith('PHP: usos no editor'))return;if(info.docker?.referencesOnly&&!name.startsWith('PHP: referências de funções'))return;if((info.docker?.editorOnly||(import.meta.env.DEV&&import.meta.env.VITE_SMOKE_EDITOR_ONLY==='1'))&&!name.startsWith('Editor: seleção'))return;if(import.meta.env.DEV&&import.meta.env.VITE_SMOKE_REFACTOR_ONLY==='1'&&!name.startsWith('Refatoração:'))return;try{await raw('nativeSmokeProgress',[name]);await work();checks.push(name);}catch(e){failures.push(name+': '+String(e));}}
 // Modo --compare-p0: só os roteiros C01–C06 (recorte 29), sem os demais checks.
 if(info.docker?.compareP0){let result:any;try{await wait(()=>!!document.querySelector('#tree button'));result=await(await import('./compare-p0')).compareP0(info.docker.compareReps??3);}catch(e){failures.push('compare-p0: '+String((e as Error)?.stack??e));}if(errors.length)failures.push('renderer: '+errors.join('; '));await raw('nativeSmokeReport',[{ok:failures.length===0,runtime:info.runtime,backend:info.backend,failures,...result}]);return;}
 const api=window.ide;let pending:AgentEvent[]=[];api.onEvent(e=>{if(e.type==='acp')pending.push(e.event);});
 await check('runtime Tauri/Rust sem Node no renderer',async()=>{assert(info.runtime==='tauri'&&info.backend==='rust','runtime errado');assert(!('process'in window),'Node exposto');});
 await check('UI real inicializa editor e árvore',async()=>{await wait(()=>!!document.querySelector('#tree button'));assert(document.querySelector('.monaco-editor'),'Monaco ausente');});
 await check('Web: TypeScript, React e Vue na janela Tauri',async()=>{
  await wait(()=>!!document.querySelector('#tree button[aria-label="web-main.ts"]'));
  const ed=monaco.editor.getEditors().find(e=>e.getDomNode()?.closest('#editor'))!;
  const open=async(path:string)=>{document.querySelector<HTMLButtonElement>(`#tree button[aria-label="${path}"]`)!.click();await wait(()=>ed.getModel()?.uri.path.endsWith('/'+path)===true);return ed.getModel()!;};
  const tsWorker=async(model:monaco.editor.ITextModel):Promise<monaco.typescript.TypeScriptWorker>=>{for(let n=0;;n++){try{return await(await monaco.typescript.getTypeScriptWorker())(model.uri);}catch(e){if(n>100)throw e;await new Promise(r=>setTimeout(r,20));}}};
  const model=await open('web-main.ts');
  await wait(()=>monaco.editor.getModels().some(m=>m.uri.path.endsWith('/web-person.ts')),15000,'snapshot do projeto ausente');
  const worker=await tsWorker(model),text=model.getValue();
  assert((await worker.getCompletionsAtPosition(model.uri.toString(),text.indexOf('person.na')+9))?.entries.some((e:{name:string})=>e.name==='name'),'autocomplete TypeScript ausente');
  assert((await worker.getSemanticDiagnostics(model.uri.toString())).some(d=>d.code===2322),'erro de tipo TypeScript ausente');
  ed.setPosition({lineNumber:2,column:3});document.getElementById('definition')!.click();
  await wait(()=>ed.getModel()?.uri.path.endsWith('/web-person.ts')===true,15000,'navegação TypeScript não abriu o arquivo importado');
  const react=await open('web-react.tsx'),reactWorker=await tsWorker(react);
  assert((await reactWorker.getCompletionsAtPosition(react.uri.toString(),react.getValue().lastIndexOf('ti')+2))?.entries.some((e:{name:string})=>e.name==='title'),'props React ausentes');
  assert((await reactWorker.getSemanticDiagnostics(react.uri.toString())).some(d=>d.code===2345),'inferência useState ausente');
  const vue=await open('WebParent.vue');ed.setPosition(vue.getPositionAt(vue.getValue().indexOf('tit />')+3));ed.focus();ed.trigger('web-native','editor.action.triggerSuggest',{});
  await wait(()=>[...document.querySelectorAll('.suggest-widget .label-name')].some(e=>e.textContent==='title'),30000,'props Vue ausentes');
  await wait(()=>monaco.editor.getModelMarkers({resource:vue.uri,owner:'vue'}).some(m=>String(m.code)==='2322'),15000,'diagnóstico Vue ausente');
  ed.trigger('web-native','hideSuggestWidget',{});
 });
 await check('Busca geral: Shift duplo, arquivos e símbolos PHP reais',async()=>{
  const press=()=>{for(const type of ['keydown','keyup'])document.body.dispatchEvent(new KeyboardEvent(type,{key:'Shift',code:'ShiftLeft',bubbles:true}));};press();press();
  await wait(()=>!!document.querySelector('#search-everywhere[open]'));
  const dialog=document.getElementById('search-everywhere') as HTMLDialogElement,input=document.getElementById('everywhere-query') as HTMLInputElement;
  const tab=(label:string)=>[...dialog.querySelectorAll<HTMLButtonElement>('nav button')].find(b=>b.textContent===tr(label))!.click();
  tab('Arquivos');input.value='probe.php';input.dispatchEvent(new Event('input'));
  await wait(()=>!![...dialog.querySelectorAll('[role=option]')].find(r=>r.textContent?.includes('probe.php')));
  input.dispatchEvent(new KeyboardEvent('keydown',{key:'Enter',bubbles:true}));await wait(()=>!dialog.open);
  await wait(()=>monaco.editor.getEditors().some(e=>e.getDomNode()?.closest('#editor')&&e.getModel()?.uri.path.endsWith('/probe.php')));
  const found=await api.searchSymbols('User');assert(found.some(s=>s.name.includes('User')&&s.location.uri.endsWith('/User.php')),'classe ausente no índice workspace/symbol');
  const functions=await api.searchSymbols('describe');assert(functions.some(s=>s.name.includes('describe')),'função ausente no índice');
  let rejected=false;try{await api.searchSymbols('');}catch{rejected=true;}assert(rejected,'consulta vazia aceita');
 });
 await check('Editor: seleção por teclado, cores PHP e paleta após trocar tema',async()=>{
  document.querySelector<HTMLButtonElement>('#tree button[aria-label="probe.php"]')!.click();
  await wait(()=>monaco.editor.getEditors().some(e=>e.getDomNode()?.closest('#editor')&&e.getModel()?.uri.path.endsWith('/probe.php')));
  const ed=monaco.editor.getEditors().find(e=>e.getDomNode()?.closest('#editor'))!;ed.focus();ed.setPosition({lineNumber:7,column:1});ed.trigger('native-editor-test','cursorRightSelect',{});ed.trigger('native-editor-test','cursorRightSelect',{});
  assert(ed.getModel()!.getValueInRange(ed.getSelection()!)==='$u','seleção de teclado incorreta');
  assert(!ed.getModel()!.getOptions().bracketPairColorizationOptions.enabled,'modelo recuperou cores de brackets padrão');
  const colors=()=>new Set([...document.querySelectorAll('#editor .view-lines .view-line span')].map(e=>getComputedStyle(e).color));
  try{await wait(()=>colors().size>=4,5000,'cores PHP ausentes');}catch{throw Error(JSON.stringify({colors:[...colors()],language:ed.getModel()!.getLanguageId(),tokens:monaco.editor.tokenize(ed.getModel()!.getValue(),'php').slice(0,8),spans:[...document.querySelectorAll('#editor .view-lines .view-line span')].slice(0,10).map(e=>({text:e.textContent,class:e.className,color:getComputedStyle(e).color})),rect:ed.getDomNode()!.getBoundingClientRect().toJSON(),theme:document.documentElement.dataset.theme}));}
  document.getElementById('theme-toggle')!.click();await wait(()=>colors().size>=4,15000,'cores perdidas após tema');
  assert(!ed.getSelection()!.isEmpty(),'troca de tema removeu seleção');await wait(()=>[...document.querySelectorAll('#editor .selected-text')].some(e=>!['transparent','rgba(0, 0, 0, 0)'].includes(getComputedStyle(e).backgroundColor)),5000,'seleção sem destaque visível');document.getElementById('theme-toggle')!.click();
 });
 await check('Editor: seleção múltipla, edição simultânea e desfazer',async()=>{
  document.querySelector<HTMLButtonElement>('#tree button[aria-label="probe.php"]')!.click();
  await wait(()=>monaco.editor.getEditors().some(e=>e.getDomNode()?.closest('#editor')&&e.getModel()?.uri.path.endsWith('/probe.php')));
  const ed=monaco.editor.getEditors().find(e=>e.getDomNode()?.closest('#editor'))!,model=ed.getModel()!,saved=model.getValue();
  try{
   model.setValue('<?php\nold old old');ed.setSelection(new monaco.Selection(2,1,2,4));ed.focus();
   await ed.getAction('php-ide.multicursor.nextOccurrence')!.run();assert(ed.getSelections()!.length===2,'próxima ocorrência não adicionou seleção');
   await ed.getAction('php-ide.multicursor.allOccurrences')!.run();assert(ed.getSelections()!.length===3,'todas as ocorrências não selecionadas');
   ed.trigger('native-multicursor','type',{text:'new'});assert(model.getValue()==='<?php\nnew new new','edição não atingiu todos os cursores');
   await model.undo();assert(model.getValue()==='<?php\nold old old','undo não restaurou edição simultânea');
   await ed.getAction('php-ide.multicursor.removeLastCursor')!.run();assert(ed.getSelections()!.length===2,'último cursor não removido');
   ed.trigger('native-multicursor','removeSecondaryCursors',{});assert(ed.getSelections()!.length===1,'cursores secundários mantidos');
   await ed.getAction('php-ide.multicursor.columnSelection')!.run();assert(ed.getOption(monaco.editor.EditorOption.columnSelection),'modo coluna não ativado');
   assert(document.getElementById('cursor-position')!.textContent?.includes(tr('Seleção em coluna')),'modo coluna sem indicação: '+JSON.stringify({text:document.getElementById('cursor-position')!.textContent,language:document.documentElement.lang}));
  }finally{ed.updateOptions({columnSelection:false});model.setValue(saved);ed.setPosition({lineNumber:1,column:1});}
 });
 await check('arquivos: salvar, detectar conflito e confinar caminhos',async()=>{const file=await api.read('scratch.txt');await api.save('scratch.txt','native change\n',file.etag);let rejected=false;try{await api.save('scratch.txt','stale',file.etag);}catch{rejected=true;}assert(rejected,'edição obsoleta aceita');rejected=false;try{await api.read('../outside.txt');}catch{rejected=true;}assert(rejected,'escape aceito');});
 await check('PHP: usos no editor com Phpactor real, métodos e funções sem referências',async()=>{
  document.querySelector<HTMLButtonElement>('#tree button[aria-label="usage-insights.php"]')!.click();
  await wait(()=>monaco.editor.getEditors().some(e=>e.getDomNode()?.closest('#editor')&&e.getModel()?.uri.path.endsWith('/usage-insights.php')));
  const ed=monaco.editor.getEditors().find(e=>e.getDomNode()?.closest('#editor'))!;
  await wait(()=>[...document.querySelectorAll('#editor .codelens-decoration a')].filter(e=>e.textContent==='Sem usos no índice').length===3,110000,'Contagens reais ausentes: '+document.getElementById('status')?.textContent);
  await wait(()=>[...document.querySelectorAll('#editor .php-unused-symbol')].some(e=>e.textContent==='insight_unused'),10000,'Função sem usos não esmaeceu');
  const names=[...document.querySelectorAll('#editor .php-unused-symbol')].map(e=>e.textContent);
  for(const name of ['insight_unused','hidden','unused'])assert(names.includes(name),'Símbolo sem usos não esmaecido: '+name);
  assert(!names.includes('used')&&!names.includes('insight_used'),'Símbolo usado esmaecido');
  assert([...document.querySelectorAll('#editor .codelens-decoration a')].filter(e=>e.textContent==='1 uso(s)').length===2,'Contagem dos símbolos usados incorreta');
  const saved=ed.getValue();ed.getModel()!.setValue(saved+'\n// unsaved');
  await wait(()=>!![...document.querySelectorAll('#editor .codelens-decoration a')].find(e=>e.textContent==='Salve para atualizar usos'));
  assert(!document.querySelector('#editor .php-unused-symbol'),'Editar preservou aviso antigo');
  ed.getModel()!.setValue(saved);
 });
 await check('Git: diff, staging, commit e histórico',async()=>{let d=await api.gitDiff('scratch.txt',false);assert(d.after==='native change\n','diff incorreto');await api.gitStage('scratch.txt',false,d.token);const st=await api.gitStatus();const id=await api.gitCommit('Native Tauri fixture',st.indexToken);assert((await api.gitLog())[0].hash===id,'histórico incorreto');const history=await api.gitHistory(id);assert(history.files.some(f=>f.path==='scratch.txt'),'arquivo ausente no histórico');});
 await check('Git: contas locais e remoto somente leitura',async()=>{const state=await api.gitAccount();const after=await api.gitSaveAccount({token:state.token,identity:'local',name:'Native Fixture',email:'native@example.invalid',authentication:'https',username:'native-fixture',sshKey:''});assert(after.username==='native-fixture'&&after.email==='native@example.invalid','conta incorreta');assert((await api.gitTestAccount('origin',after.token)).includes('Leitura'),'remoto inacessível');});
 await check('Branches: menu do topo, busca, criar, trocar, excluir e fetch sem perder buffer',async()=>{
  const st=await api.gitStatus();
  if(st.changes.length)await api.gitOperation({kind:'stash',target:'branch-ui-fixture',expectedHead:st.head});
  const click=(id:string)=>document.getElementById(id)!.click();
  const idle=async()=>{await wait(()=>!(document.getElementById('branch-fetch') as HTMLButtonElement).disabled);};
  try{
   click('workspace-branch');await wait(()=>!!document.querySelector('#git-branches-popup[open]'));
   click('branch-new');const name=document.getElementById('branch-name') as HTMLInputElement;name.value='feature/native-ui';
   (document.getElementById('branch-create') as HTMLFormElement).requestSubmit();
   await wait(()=>document.getElementById('branch-current')?.textContent?.includes('feature/native-ui')??false);await idle();
   assert((await api.gitStatus()).branch==='feature/native-ui','criação não trocou branch');
   const search=document.getElementById('branch-search') as HTMLInputElement;search.value='main';search.dispatchEvent(new Event('input'));
   assert(!document.querySelector('[data-branch="feature/native-ui"]'),'busca não filtrou');
   document.querySelector<HTMLButtonElement>('[data-checkout="main"]')!.click();
   await wait(()=>document.getElementById('branch-current')?.textContent==='Branch atual: main');await idle();
   search.value='';search.dispatchEvent(new Event('input'));
   document.querySelector<HTMLButtonElement>('[data-delete="feature/native-ui"]')!.click();
   assert(!(document.getElementById('branch-delete') as HTMLElement).hidden,'exclusão não pediu confirmação');click('branch-delete-confirm');
   await wait(()=>!document.querySelector('[data-branch="feature/native-ui"]'));await idle();
   click('branch-close');document.querySelector<HTMLButtonElement>('#tree button[aria-label="scratch.txt"]')!.click();
   await wait(()=>monaco.editor.getEditors().some(e=>e.getDomNode()?.closest('#editor')&&e.getModel()?.uri.path.endsWith('/scratch.txt')));
   const ed=monaco.editor.getEditors().find(e=>e.getDomNode()?.closest('#editor'))!;
   const model=ed.getModel()!;const original=model.getValue();model.setValue(original+'unsaved buffer');
   click('workspace-branch');await wait(()=>!!document.querySelector('#git-branches-popup[open]'));
   click('branch-fetch');await wait(()=>document.getElementById('branch-result')?.textContent?.startsWith('Operação concluída.')??false);await idle();
   assert(ed.getModel()===model&&model.getValue().includes('unsaved buffer'),'fetch descartou buffer');
   click('branch-new');(document.getElementById('branch-name') as HTMLInputElement).value='blocked';(document.getElementById('branch-create') as HTMLFormElement).requestSubmit();
   assert(document.getElementById('branch-result')?.textContent?.includes('Salve'),'operação aceitou buffer alterado');
   model.setValue(original);click('branch-close');
  }finally{(document.getElementById('git-branches-popup') as HTMLDialogElement).close();if(st.changes.length){const state=await api.gitStatus();await api.gitOperation({kind:'stash-apply',target:'stash@{0}',expectedHead:state.head});}}
 });
 await check('Git UI: Log separado, busca, arquivos do commit, diff e Commit lateral',async()=>{
  const click=(id:string)=>document.getElementById(id)!.click();click('show-git');await wait(()=>!!document.querySelector('.git-commit-row'));
  document.querySelector<HTMLButtonElement>('.git-commit-row')!.click();await wait(()=>!!document.querySelector('#git-history-files button'));
  assert(document.getElementById('git-history-info')?.textContent?.includes('Native Tauri fixture'),'detalhes do commit ausentes');
  const filter=document.getElementById('git-log-search') as HTMLInputElement;filter.value='NO_MATCH_FIXTURE';filter.dispatchEvent(new Event('input'));assert(!document.querySelector('.git-commit-row'),'busca não filtrou');filter.value='';filter.dispatchEvent(new Event('input'));
  document.querySelector<HTMLButtonElement>('#git-history-files button')!.click();await wait(()=>!(document.getElementById('git-review') as HTMLElement).hidden);click('git-close-diff');
  click('git-log-commit');assert(!(document.getElementById('git-panel') as HTMLElement).hidden,'Commit não abriu painel lateral');click('show-project');click('git-log-hide');
 });
 await check('PTY Rust: entrada, tamanho, encerramento',async()=>{let output='';const id=crypto.randomUUID();const off=api.onTerminalEvent(e=>{if(e.id!==id)return;if(e.type==='output'){output+=e.data;void api.terminalAck(id,e.data.length);}});try{await api.terminalCreate(id,100,30);await api.terminalWrite(id,"printf 'RUST_%s\n' PTY; stty size\r");await wait(()=>output.includes('RUST_PTY')&&output.includes('30 100'));await api.terminalClose(id);let rejected=false;try{await api.terminalWrite(id,'x');}catch{rejected=true;}assert(rejected,'sessão fechada aceita entrada');}finally{off();await api.terminalClose(id);}});
 await check('painel terminal no WebView',async()=>{document.getElementById('show-terminal')!.click();await wait(()=>document.querySelectorAll('#terminal-tabs button').length===1);await wait(()=>document.getElementById('terminal-message')?.textContent==='');assert(document.querySelector('.xterm'),'emulador ausente');document.getElementById('terminal-hide')!.click();assert((document.getElementById('terminal-panel') as HTMLElement).hidden,'painel não ocultou');});
 await check('Editor: Cmd+clique navega, voltar restaura e autocomplete insere método',async()=>{
  const button = document.querySelector<HTMLButtonElement>('#tree button[aria-label="probe.php"]')!; button.click();
  const ed = monaco.editor.getEditors().find(e=>e.getDomNode()?.closest('#editor'))!;
  await wait(()=>!!ed.getModel()?.uri.path.endsWith('/probe.php'));
  const original = ed.getModel()!.getValue(); ed.setPosition({lineNumber:8,column:10}); ed.revealLineInCenter(8);
  await new Promise(r=>setTimeout(r,150));
  const pos = ed.getScrolledVisiblePosition({lineNumber:8,column:10})!; const bounds=ed.getDomNode()!.getBoundingClientRect();
  ed.getDomNode()!.dispatchEvent(new MouseEvent('mousedown',{bubbles:true,cancelable:true,button:0,metaKey:true,clientX:bounds.left+pos.left+2,clientY:bounds.top+pos.top+pos.height/2}));
  ed.getDomNode()!.dispatchEvent(new MouseEvent('mouseup',{bubbles:true,cancelable:true,button:0,metaKey:true,clientX:bounds.left+pos.left+2,clientY:bounds.top+pos.top+pos.height/2}));
  await wait(()=>!!ed.getModel()?.uri.path.endsWith('/src/User.php'),120000);
  document.getElementById('nav-back')!.click(); await wait(()=>!!ed.getModel()?.uri.path.endsWith('/probe.php'));
  ed.getModel()!.setValue(original.replace('$user->label();','$user->la')); ed.setPosition({lineNumber:8,column:10}); ed.focus();
  ed.trigger('native-ui-test','editor.action.triggerSuggest',{});
  await wait(()=>!!document.querySelector('.suggest-widget.visible .monaco-list-row'),60000);
  assert(document.querySelector('.suggest-widget.visible')!.textContent?.includes('label'),'sugestão label não visível');
  ed.trigger('native-ui-test','acceptSelectedSuggestion',{});
  await wait(()=>ed.getModel()!.getLineContent(8).length>7);
  assert(ed.getModel()!.getLineContent(8).includes('$user->label'),'sugestão label não inserida: '+ed.getModel()!.getLineContent(8));
  ed.getModel()!.setValue(original);
 });
 await check('Referências: Cmd+clique na declaração, filtro e abrir chamada',async()=>{
  const ed=monaco.editor.getEditors().find(e=>e.getDomNode()?.closest('#editor'))!;
  document.querySelector<HTMLButtonElement>('#tree button[aria-label="probe.php"]')!.click();await wait(()=>!!ed.getModel()?.uri.path.endsWith('/probe.php'));
  ed.setPosition({lineNumber:8,column:10});ed.trigger('native-ui-test','editor.action.revealDefinition',{});await wait(()=>!!ed.getModel()?.uri.path.endsWith('/src/User.php'));
  ed.revealLineInCenter(9);await new Promise(r=>setTimeout(r,150));const col=ed.getModel()!.getLineContent(9).indexOf('label')+2;
  const point=ed.getScrolledVisiblePosition({lineNumber:9,column:col})!;const rect=ed.getDomNode()!.getBoundingClientRect();
  ed.getDomNode()!.dispatchEvent(new MouseEvent('mousedown',{bubbles:true,cancelable:true,button:0,metaKey:true,clientX:rect.left+point.left+2,clientY:rect.top+point.top+point.height/2}));
  ed.getDomNode()!.dispatchEvent(new MouseEvent('mouseup',{bubbles:true,cancelable:true,button:0,metaKey:true,clientX:rect.left+point.left+2,clientY:rect.top+point.top+point.height/2}));
  // User::label implementa Named::label: a pergunta método atual/base aparece antes dos usos.
  await wait(()=>!!document.querySelector('.usage-result, .usages-base-dialog'),60000);document.querySelector<HTMLButtonElement>('.usages-base-dialog button[value=current]')?.click();
  await wait(()=>!!document.querySelector('.usage-result'),60000);
  const popup=document.querySelector('.usages-popup')!;assert(popup.textContent?.includes('probe.php'),'chamada no probe ausente');
  assert(![...popup.querySelectorAll('.usage-result')].some(r=>r.textContent?.includes('NEGATIVE-01')),'método homônimo incluído');
  const filter=popup.querySelector('input')!;filter.value='probe.php';filter.dispatchEvent(new Event('input',{bubbles:true}));
  const row=[...popup.querySelectorAll<HTMLButtonElement>('.usage-result')].find(r=>r.textContent?.includes('NAV-01'))!;assert(row,'chamada esperada ausente');row.click();
  await wait(()=>!!ed.getModel()?.uri.path.endsWith('/probe.php'));assert(ed.getPosition()?.lineNumber===8,'não abriu a linha da chamada');assert(!document.querySelector('.usages-popup'),'popup permaneceu aberto');
 });
 await check('Classes, interfaces, traits e enums: ir à declaração e abrir referências por Cmd+clique',async()=>{
  const ed=monaco.editor.getEditors().find(e=>e.getDomNode()?.closest('#editor'))!;
  async function clickSymbol(line:number,name:string) {
   const col=ed.getModel()!.getLineContent(line).indexOf(name)+2;assert(col>1,'símbolo não existe: '+name);ed.revealLineInCenter(line);ed.render(true);await new Promise(r=>setTimeout(r,100));
   const point=ed.getScrolledVisiblePosition({lineNumber:line,column:col})!;const rect=ed.getDomNode()!.getBoundingClientRect();
   ed.getDomNode()!.dispatchEvent(new MouseEvent('mousedown',{bubbles:true,cancelable:true,button:0,metaKey:true,clientX:rect.left+point.left+2,clientY:rect.top+point.top+point.height/2}));
  ed.getDomNode()!.dispatchEvent(new MouseEvent('mouseup',{bubbles:true,cancelable:true,button:0,metaKey:true,clientX:rect.left+point.left+2,clientY:rect.top+point.top+point.height/2}));
  }
  async function usages(line:number,name:string,expected:string) {
   await clickSymbol(line,name);await wait(()=>!!document.querySelector('.usages-popup .usage-result'),30000,'Referências ausentes para '+name);
   assert(document.querySelector('.usages-popup')!.textContent?.includes(expected),'uso esperado ausente para '+name);
   document.querySelector<HTMLButtonElement>('.usages-popup header button')!.click();
  }
  document.querySelector<HTMLButtonElement>('#tree button[aria-label="probe.php"]')!.click();await new Promise(r=>setTimeout(r,150));await wait(()=>!!ed.getModel()?.uri.path.endsWith('/probe.php'));
  await clickSymbol(7,'Person');await wait(()=>!!ed.getModel()?.uri.path.endsWith('/probe.php')&&ed.getPosition()?.lineNumber===5,30000,'Alias Person não foi ao use … as Person: '+ed.getModel()?.uri.path+' · '+document.getElementById('status')?.textContent);
  await clickSymbol(5,'User');await wait(()=>!!ed.getModel()?.uri.path.endsWith('/src/User.php'),30000,'User no import não navegou');await usages(5,'User','probe.php');
  await clickSymbol(5,'Named');await wait(()=>!!ed.getModel()?.uri.path.endsWith('/src/Named.php'),30000,'Named não navegou: '+ed.getModel()?.uri.path+' · '+document.getElementById('status')?.textContent);await usages(5,'Named','User.php');
  document.getElementById('nav-back')!.click();await wait(()=>!!ed.getModel()?.uri.path.endsWith('/src/User.php'));
  await clickSymbol(7,'HasId');await wait(()=>!!ed.getModel()?.uri.path.endsWith('/src/HasId.php'),30000,'HasId não navegou: '+ed.getModel()?.uri.path+' · '+document.getElementById('status')?.textContent);await usages(5,'HasId','User.php');
  document.querySelector<HTMLButtonElement>('#tree button[aria-label="probe.php"]')!.click();await wait(()=>!!ed.getModel()?.uri.path.endsWith('/probe.php'));
  const enumLine=ed.getModel()!.getValue().split('\n').findIndex(line=>line.includes('State::Ready'))+1;
  await clickSymbol(enumLine,'State');await wait(()=>!!ed.getModel()?.uri.path.endsWith('/src/State.php'),30000,'State não navegou: '+ed.getModel()?.uri.path+' · '+document.getElementById('status')?.textContent);await clickSymbol(5,'State');await wait(()=>!!ed.getModel()?.uri.path.endsWith('/probe.php'),30000,'uso único de State não navegou direto');
  document.querySelector<HTMLButtonElement>('#tree button[aria-label="probe.php"]')!.click();await wait(()=>!!ed.getModel()?.uri.path.endsWith('/probe.php'));
 });
 await check('Git no editor: marca de linha, diff do trecho e autoria',async()=>{
  const ed=monaco.editor.getEditors().find(e=>e.getDomNode()?.closest('#editor'))!;const model=ed.getModel()!;const original=model.getValue();
  model.setValue(original.replace('$user->label();','$user->label(); // local edit'));
  ed.revealLineInCenter(8); await wait(()=>!!document.querySelector('.git-line-modified'),10000,'Marca modificada ausente');await new Promise(r=>setTimeout(r,250));
  const marker=document.querySelector<HTMLElement>('.git-line-modified')!;const rect=marker.getBoundingClientRect();marker.dispatchEvent(new MouseEvent('mousedown',{bubbles:true,cancelable:true,button:0,clientX:rect.left+2,clientY:rect.top+rect.height/2}));
  await wait(()=>!!document.querySelector('.git-line-popup .line-diff'),10000,'Popup ausente: '+JSON.stringify({x:rect.x,y:rect.y,w:rect.width,h:rect.height,target:document.elementFromPoint(rect.left+2,rect.top+rect.height/2)?.className,uri:model.uri.toString()}));
  assert(document.querySelector('.line-diff .added')?.textContent?.includes('local edit'),'diff não mostrou alteração');
  document.querySelector<HTMLButtonElement>('.git-line-popup button')!.click();
  ed.setPosition({lineNumber:8,column:1});await ed.getAction('php-ide.lineHistory')!.run();
  assert(document.querySelector('.git-line-history')?.textContent?.includes('não commitada'),'autoria ignorou buffer não salvo');
  model.setValue(original);await new Promise(r=>setTimeout(r,300));
  ed.setPosition({lineNumber:8,column:1});await ed.getAction('php-ide.lineHistory')!.run();assert(document.querySelector('.git-line-history')?.textContent?.includes('Native Fixture'),'autor do commit ausente');document.querySelector<HTMLButtonElement>('.git-line-history button')!.click();
  await wait(()=>!document.querySelector('.git-line-modified'),10000,'Marca permaneceu após restaurar buffer');
  model.setValue(original.replace('$user->label(); // NAV-01: caret on label; COMPLETE-01: replace label() with caret after ->\n',''));
  ed.revealLineInCenter(8);await wait(()=>!!document.querySelector('.git-line-deleted'),10000,'Marca de remoção ausente: '+model.getValue().slice(0,400));
  model.setValue(original+'\n// Added line\n');ed.revealLineInCenter(model.getLineCount());await wait(()=>!!document.querySelector('.git-line-added'),10000,'Marca de adição ausente');
  model.setValue(original);ed.revealLineInCenter(8);

 });
 await check('Banco: diálogo, driver e campos acessíveis',async()=>{
  document.getElementById('db-add')!.click(); const dialog=document.querySelector<HTMLDialogElement>('.connection-dialog')!;
  assert(dialog.open,'diálogo não abriu'); dialog.querySelector<HTMLButtonElement>('[data-driver="mysql"]')!.click();
  assert(dialog.querySelector<HTMLInputElement>('[name="port"]')!.value==='3306','porta MySQL incorreta');
  dialog.querySelector<HTMLInputElement>('[name="password"]')!.value='temporary'; document.getElementById('db-dialog-close')!.click();
  await wait(()=>dialog.querySelector<HTMLInputElement>('[name="password"]')!.value==='');
 });
 await check('PHP: referências de funções, homônimos e registro ausente',async()=>{
  async function refs(path:string,needle:string,text?:string){const file=await api.read(path);const source=text??file.text;const at=source.indexOf(needle)+2;assert(at>=2,'símbolo fixture ausente');const before=source.slice(0,at).split('\n');const result=await api.language({method:'textDocument/references',path,text:source,version:monaco.editor.getModels().find(m=>m.uri.path.endsWith('/'+path))?.getVersionId()??1,position:{line:before.length-1,character:before.at(-1)!.length}});assert(Array.isArray(result),'referências não são lista');return result as {uri:string;range:{start:{line:number}}}[];}
  const known=await refs('reference-functions.php','reference_target');
  assert(known.some(r=>r.uri.endsWith('/reference-functions.php')&&r.range.start.line===3),'chamada no arquivo de declaração ausente');
  assert(known.some(r=>r.uri.endsWith('/reference-functions-call.php')),'chamada em outro arquivo ausente');
  assert(!known.some(r=>r.uri.endsWith('/reference-functions-other.php')),'incluiu função homônima');assert(!known.some(r=>r.uri.endsWith('/reference-functions.php')&&r.range.start.line>=4),'incluiu string/comentário');
  await refs('probe.php','strlen');
  const text='<?php\nmissing_function_for_reference_test();\n';await refs('reference-functions-call.php','missing_function_for_reference_test',text);
 });
 await check('PHP LSP por Rust: declaração e completion',async()=>{const file=await api.read('probe.php');const value=await api.language({method:'textDocument/definition',path:file.path,text:file.text,version:10001,position:{line:7,character:9}}) as any;assert(JSON.stringify(value).includes('User.php'),'declaração não resolvida: '+JSON.stringify(value));const text=file.text.replace('$user->label();','$user->');const result:any=await api.language({method:'textDocument/completion',path:file.path,text,version:10002,position:{line:7,character:7}});assert(JSON.stringify(result).includes('label'),'completion ausente');});
 if(info.database)for(const input of info.database){await check('banco Rust '+input.driver+': console, NULL, metadata, paginação e DDL',async()=>{const session=await api.databaseConnect(input);try{let results=await api.databaseExecute(session.id,'CREATE TABLE native_fixture (id INTEGER PRIMARY KEY, name VARCHAR(64)); INSERT INTO native_fixture VALUES (1, NULL), (2, \'Rust\'); SELECT * FROM native_fixture ORDER BY id;');assert(results.every(r=>r.kind!=='error'),JSON.stringify(results));const rows=results.at(-1)!;assert(rows.rows?.[0][1]===null&&rows.rows?.[1][1]==='Rust','dados incorretos');const tables=await api.databaseTables(session.id,input.driver==='postgres'?'public':input.database);assert(tables.some(t=>t.name==='native_fixture'),'tabela não listada: '+JSON.stringify(tables));const page=await api.databasePage(session.id,input.driver==='postgres'?'public':input.database,'native_fixture',0);assert(page.rows.length===2&&page.columns[0].primary,'prévia incorreta');const ddl=await api.databaseDdl(session.id,input.driver==='postgres'?'public':input.database,'native_fixture');assert(/create table/i.test(ddl),'DDL ausente');const model=await api.databaseModel(session.id);assert(model.schemas.some(s=>s.tables.some(t=>t.name==='native_fixture')),'modelo ausente');const empty=await api.databaseExecute(session.id,'SELECT * FROM native_fixture WHERE id=99');assert(empty[0].kind==='rows'&&empty[0].columns?.length===2&&empty[0].rows?.length===0,'SELECT vazio perdeu colunas');}finally{await api.databaseDisconnect(session.id);}});}
 if(info.database?.[0])await check('Banco: fonte de dados pelo diálogo, OK conecta, árvore, persistência sem senha',async()=>{const input=info.database[0];const dialog=document.querySelector<HTMLDialogElement>('.datasources-dialog')!;
  document.getElementById('db-add')!.click();assert(dialog.open&&!document.getElementById('ds-driver-menu')!.hidden,'menu de drivers não abriu');dialog.querySelector<HTMLButtonElement>(`[data-driver="${input.driver}"]`)!.click();
  const set=(name:string,value:string)=>{const f=dialog.querySelector<HTMLInputElement>(`[name="${name}"]`)!;f.value=value;f.dispatchEvent(new Event('input',{bubbles:true}));};
  set('host',input.host);set('port',String(input.port));set('database',input.database);set('user',input.user);set('password',input.password);
  assert(dialog.querySelector<HTMLInputElement>('[name="url"]')!.value.includes(`${input.host}:${input.port}/${input.database}`),'URL não acompanhou os campos');
  document.getElementById('db-test')!.click();await wait(()=>document.getElementById('db-connection-result')!.dataset.kind==='ok',20000,'teste falhou: '+document.getElementById('db-connection-result')!.textContent);
  dialog.querySelector<HTMLButtonElement>('[data-tab="schemas"]')!.click();assert(document.querySelectorAll('#ds-schemas input').length>0,'schemas não listados após teste');
  document.getElementById('db-connect')!.click();await wait(()=>!dialog.open&&!!document.querySelector('.db-source .db-state[data-connected="true"]'),20000,'OK não conectou: '+document.getElementById('db-result')!.textContent);
  const schema=input.driver==='postgres'?'public':input.database;await wait(()=>[...document.querySelectorAll('.db-source.expanded summary')].some(s=>s.textContent===schema),10000,'schema ausente na árvore');
  const saved=await api.databaseSources();assert(saved.length===1&&saved[0].host===input.host&&!('password' in saved[0]),'persistência incorreta: '+JSON.stringify(saved));
  assert(await api.databasePasswordStored(saved[0].id),'senha até reiniciar não ficou em memória');
  document.getElementById('db-disconnect')!.click();await wait(()=>!!document.querySelector('.db-source .db-state[data-connected="false"]'));
  document.querySelector<HTMLElement>('.db-source-title')!.dispatchEvent(new KeyboardEvent('keydown',{key:'Enter',bubbles:true}));await wait(()=>!!document.querySelector('.db-source .db-state[data-connected="true"]'),20000,'reconexão com senha em memória falhou: '+document.getElementById('db-result')!.textContent);
  document.getElementById('db-properties')!.click();assert(dialog.open,'propriedades não abriu');document.getElementById('ds-remove')!.click();document.getElementById('db-connect')!.click();
  await wait(()=>!document.querySelector('.db-source'),10000,'fonte não removida');assert(!(await api.databaseSources()).length,'remoção não persistiu');
 });
 await check('ACP Rust: eventos, permissão, preview e manter alteração',async()=>{await api.agentStart('fake');await api.agentPrompt('editar fora');await wait(()=>pending.some(e=>e.type==='permission'));const permission=pending.find(e=>e.type==='permission') as Extract<AgentEvent,{type:'permission'}>;await api.agentPermission(permission.id,'allow');await wait(()=>pending.some(e=>e.type==='done'));assert(pending.some(e=>e.type==='changes'&&e.changes.length===2),'preview ausente');assert(!(await api.read('src/User.php')).text.includes('Edited by agent'),'escrita sem confirmação');await api.agentKeep(['src/User.php']);assert((await api.read('src/User.php')).text.includes('Edited by agent'),'keep não gravou');assert(JSON.stringify(pending).includes('Escrita externa recusada'),'escape de escrita não recusado');await api.agentDiscard();});
 await check('Markdown: prévia dividida, HTML escapado, imagem local, link relativo e completion',async()=>{
  const ed=monaco.editor.getEditors().find(e=>e.getDomNode()?.closest('#editor'))!;
  document.querySelector<HTMLButtonElement>('#tree button[aria-label="notes.md"]')!.click();await wait(()=>!!ed.getModel()?.uri.path.endsWith('/notes.md'));
  assert(ed.getModel()!.getLanguageId()==='markdown','linguagem markdown não aplicada');
  document.querySelector<HTMLButtonElement>('#markdown-toolbar button[data-mode="split"]')!.click();
  const preview=document.getElementById('markdown-preview')!;await wait(()=>preview.querySelector('h1')?.textContent==='Notas',10000,'prévia não renderizou');
  assert(!preview.hidden&&!document.getElementById('editor')!.hidden,'modo dividido não mostra editor e prévia');
  assert(!preview.querySelector('script')&&preview.textContent!.includes('<script>'),'HTML bruto não foi escapado');
  await wait(()=>!!preview.querySelector('img[src^="data:image/svg+xml;base64,"]'),10000,'imagem local não carregou');
  const model=ed.getModel()!;const original=model.getValue();
  model.setValue(original+'\n## Ao vivo\n');await wait(()=>!!preview.querySelector('[id="ao-vivo"]'),5000,'atualização ao vivo ausente');model.setValue(original);
  const items=(await api.language({method:'textDocument/completion',path:'notes.md',text:'[x](md-',version:1,position:{line:0,character:7}}) as any).items.map((i:any)=>i.textEdit.newText);
  assert(items.includes('md-guide.md'),'completion de caminho ausente: '+items.join(','));
  const anchors=(await api.language({method:'textDocument/completion',path:'notes.md',text:'[x](md-guide.md#',version:1,position:{line:0,character:16}}) as any).items.map((i:any)=>i.label);
  assert(anchors.includes('md-guide.md#seção'),'âncoras ausentes: '+anchors.join(','));
  preview.querySelector<HTMLAnchorElement>('a[href="md-guide.md#seção"]')!.click();
  await wait(()=>!!ed.getModel()?.uri.path.endsWith('/md-guide.md'),10000,'link relativo não abriu');assert(ed.getPosition()?.lineNumber===3,'âncora não posicionou na linha 3: '+ed.getPosition()?.lineNumber);
  document.getElementById('nav-back')!.click();await wait(()=>!!ed.getModel()?.uri.path.endsWith('/notes.md'));
  const defs=await api.language({method:'textDocument/definition',path:'notes.md',text:original,version:1,position:{line:2,character:15}}) as any[];
  assert(defs.length===1&&defs[0].uri.endsWith('/md-guide.md')&&defs[0].range.start.line===2,'⌘+clique no link não resolveu: '+JSON.stringify(defs));
  document.querySelector<HTMLButtonElement>('#markdown-toolbar button[data-mode="preview"]')!.click();assert(document.getElementById('editor')!.hidden&&!preview.hidden,'modo prévia');
  document.querySelector<HTMLButtonElement>('#markdown-toolbar button[data-mode="split"]')!.click();
  document.querySelector<HTMLButtonElement>('#tree button[aria-label="md-diagram.md"]')!.click();await wait(()=>!!ed.getModel()?.uri.path.endsWith('/md-diagram.md'));
  await wait(()=>preview.querySelectorAll('figure.md-mermaid').length===2,30000,'diagramas Mermaid não renderizaram');
  const [ok,bad]=[...preview.querySelectorAll<HTMLElement>('figure.md-mermaid')];
  assert(!!ok.querySelector('svg')&&ok.textContent!.includes('Início'),'SVG do fluxograma ausente');assert(bad.classList.contains('md-mermaid-error')&&bad.textContent!.includes('inválido'),'erro do diagrama inválido não exibido');
  assert(!document.querySelector('body > [id^="dmd-mermaid-"]'),'nós temporários do Mermaid ficaram no body');
  await wait(()=>monaco.editor.getModelMarkers({resource:ed.getModel()!.uri}).some(m=>m.message.includes('nao-existe.md')),10000,'aviso de arquivo inexistente ausente');
  document.querySelector<HTMLButtonElement>('#markdown-toolbar button[data-mode="split"]')!.click();
 });
 if(info.docker) await check('Docker '+(info.docker.real?'engine real':'CLI sintético')+': Services, logs, ciclo de vida, terminal e Compose',async()=>{
  const fixture=info.docker;const row=()=>document.querySelector<HTMLButtonElement>(`#docker-tree .docker-resource[data-id="${fixture.id}"]`);
  document.getElementById('show-docker')!.click();await wait(()=>!!document.querySelector(`#docker-context option[value="${fixture.context}"]`));
  const context=document.getElementById('docker-context') as HTMLSelectElement;
  if(context.value!==fixture.context){context.value=fixture.context;context.dispatchEvent(new Event('change'));}
  await wait(()=>!!row(),30000,'Container fixture não apareceu no Services');const services=document.getElementById('docker-panel')!;const h=services.clientHeight;document.getElementById('docker-resize')!.dispatchEvent(new KeyboardEvent('keydown',{key:'ArrowUp',bubbles:true,cancelable:true}));assert(services.clientHeight>h,'Services não redimensionou');row()!.click();
  const action=(name:string)=>document.querySelector<HTMLButtonElement>(`#docker-actions [data-action="${name}"]`)!;
  const stopped=document.getElementById('docker-show-stopped') as HTMLInputElement;stopped.checked=false;stopped.dispatchEvent(new Event('change'));assert(!row(),'filtro não ocultou parado');stopped.checked=true;stopped.dispatchEvent(new Event('change'));row()!.click();
  row()!.dispatchEvent(new MouseEvent('contextmenu',{bubbles:true,cancelable:true,clientX:250,clientY:400}));assert(!!document.querySelector('.tool-context-menu [role=menuitem]'),'menu contextual ausente');document.dispatchEvent(new KeyboardEvent('keydown',{key:'Escape'}));
  assert(!action('start').disabled,'iniciar desabilitado para container parado');action('start').click();await wait(()=>row()?.dataset.state==='running');
  document.getElementById('docker-tab-logs')!.click();await wait(()=>document.getElementById('docker-logs')?.textContent?.includes('DOCKER_FIXTURE_READY')??false);
  if(!fixture.real)assert(document.getElementById('docker-logs')?.textContent?.includes('DOCKER_FIXTURE_STDERR'),'stderr não foi mostrado');
  const logFilter=document.getElementById('docker-log-search') as HTMLInputElement;logFilter.value='NO_MATCH_FIXTURE';logFilter.dispatchEvent(new Event('input'));assert(!document.getElementById('docker-logs')?.textContent?.includes('DOCKER_FIXTURE_READY'),'busca de logs não filtrou');logFilter.value='';logFilter.dispatchEvent(new Event('input'));
  let output='';const off=api.onTerminalEvent(e=>{if(e.type==='output')output+=e.data;});
  try{document.getElementById('docker-exec')!.click();await wait(()=>[...document.querySelectorAll('#terminal-tabs button')].some(b=>b.textContent?.includes(fixture.name)));
   await wait(()=>document.getElementById('terminal-message')?.textContent==='');const tab=[...document.querySelectorAll<HTMLButtonElement>('#terminal-tabs button')].find(b=>b.textContent?.includes(fixture.name))!;
   await api.terminalWrite(tab.dataset.id!,"printf 'IDE_%s\n' DOCKER_EXEC\r");await wait(()=>output.includes('IDE_DOCKER_EXEC'),15000,'Exec não retornou saída pela PTY');document.getElementById('terminal-kill')!.click();
  }finally{off();}
  document.getElementById('show-docker')!.click();await wait(()=>!!row());row()!.click();action('restart').click();await wait(()=>!action('restart').disabled);action('stop').click();await wait(()=>row()?.dataset.state==='exited');
  action('rm').click();await wait(()=>!!document.querySelector('.docker-dialog'));document.querySelector<HTMLButtonElement>('.docker-dialog .cancel')!.click();assert(!!row(),'cancelar removeu container');
  action('rm').click();document.querySelector<HTMLButtonElement>('.docker-dialog .confirm')!.click();await wait(()=>!row());
  let progressText='';const offProgress=api.onDockerProgress(e=>progressText+=e.text);
  if(!fixture.real){document.getElementById('docker-pull')!.click();const dialog=document.querySelector('.docker-dialog')!;dialog.querySelector<HTMLInputElement>('input')!.value='alpine:fixture';dialog.querySelector('form')!.dispatchEvent(new Event('submit',{bubbles:true,cancelable:true}));await wait(()=>document.getElementById('docker-tree')?.textContent?.includes('alpine:fixture')??false);}
  await raw('nativeSmokeProgress',['Docker: cancelar download']);
  if(!fixture.real){document.getElementById('docker-pull')!.click();const dialog=document.querySelector('.docker-dialog')!;dialog.querySelector<HTMLInputElement>('input')!.value='slow:fixture';dialog.querySelector('form')!.dispatchEvent(new Event('submit',{bubbles:true,cancelable:true}));await wait(()=>document.getElementById('docker-message')?.textContent?.includes('PULL_FIXTURE_WAIT')??false,15000,'Pull lento não publicou progresso');document.getElementById('docker-cancel')!.click();await wait(()=>document.getElementById('docker-message')?.textContent?.includes('interrompida')??false,15000,'Cancelamento não concluiu');await wait(()=>(document.getElementById('docker-cancel') as HTMLElement).hidden===true);}
  await raw('nativeSmokeProgress',['Docker: Compose']);
  document.getElementById('docker-tab-compose')!.click();await wait(()=>!!document.querySelector('#docker-compose-file option'));
  const compose=(name:string)=>document.querySelector<HTMLButtonElement>(`[data-compose="${name}"]`)!;await wait(()=>!compose('services').disabled,15000,'Compose não habilitou após atualizar recursos');compose('services').click();await wait(()=>document.getElementById('docker-compose-output')?.textContent?.includes('app')??false);
  await wait(()=>!compose('up').disabled);compose('up').click();await wait(()=>document.getElementById('docker-message')?.textContent?.includes('up concluído')??false,45000);
  assert((await api.dockerSnapshot(fixture.context)).containers.some(c=>c.name.includes(fixture.project)&&c.state==='running'),'Compose não criou serviço');
  await wait(()=>!compose('stop').disabled,15000,'Compose stop permaneceu desabilitado');compose('stop').click();await wait(()=>document.getElementById('docker-message')?.textContent?.includes('stop concluído')??false,45000);
  assert((await api.dockerSnapshot(fixture.context)).containers.some(c=>c.name.includes(fixture.project)&&c.state==='exited'),'Compose não parou serviço');
  await wait(()=>progressText.includes('Compose started')||progressText.includes('Started')||fixture.real,10000,'Progresso Docker não chegou ao renderer');offProgress();
  let rejected=false;try{await api.dockerContainerAction(fixture.context,'--all','rm');}catch{rejected=true;}assert(rejected,'aceitou opção como ID');rejected=false;try{await api.dockerCompose(fixture.context,'../compose.yaml','up');}catch{rejected=true;}assert(rejected,'aceitou Compose externo');
  if(!fixture.real){context.value='fixture-offline';context.dispatchEvent(new Event('change'));await wait(()=>document.getElementById('docker-connection-status')?.textContent?.includes('offline')??false);assert(!document.querySelector('#docker-tree .docker-resource'),'conexão offline manteve recursos antigos');context.value=fixture.context;context.dispatchEvent(new Event('change'));await wait(()=>document.getElementById('docker-connection-status')?.textContent?.includes('Conectado')??false);}
  document.getElementById('docker-hide')!.click();assert((document.getElementById('docker-panel') as HTMLElement).hidden,'Services não ocultou');
 });
 await check('Testes: CodeLens executa teste e painel mostra falha com link para a linha',async()=>{
  const ed=monaco.editor.getEditors().find(e=>e.getDomNode()?.closest('#editor'))!;
  document.querySelector<HTMLButtonElement>('#tree button[aria-label="SmokeTest.php"]')!.click();await wait(()=>!!ed.getModel()?.uri.path.endsWith('/SmokeTest.php'));
  const lens=()=>[...document.querySelectorAll<HTMLAnchorElement>('#editor .codelens-decoration a')];
  await wait(()=>lens().some(a=>a.textContent?.includes('Executar SmokeTest')),15000,'CodeLens de teste ausente');
  const link=lens().find(a=>a.textContent?.includes('Executar teste'))!;const box=link.getBoundingClientRect();
  for(const type of ['mousedown','mouseup','click'])link.dispatchEvent(new MouseEvent(type,{bubbles:true,cancelable:true,clientX:box.left+box.width/2,clientY:box.top+box.height/2,button:0,buttons:type==='mousedown'?1:0}));
  const summary=document.getElementById('test-summary')!;
  await wait(()=>summary.dataset.state==='failed',20000,'painel não mostrou resultado: '+summary.textContent);
  assert(!(document.getElementById('test-panel') as HTMLElement).hidden,'painel oculto');
  const rows=[...document.querySelectorAll<HTMLButtonElement>('#test-list button')];assert(rows.length===2&&rows[1].dataset.status==='failed','lista incorreta');
  assert(document.getElementById('test-message')!.textContent!.includes('Failed asserting that false is true.'),'mensagem ausente');
  assert(document.getElementById('test-output')!.textContent!.includes('fake phpunit SmokeTest.php --filter='),'saída/comando ausente');
  ed.setPosition({lineNumber:1,column:1});rows[1].dispatchEvent(new MouseEvent('dblclick',{bubbles:true}));await wait(()=>ed.getPosition()?.lineNumber===5,5000,'link não levou à linha da falha');
  let rejected=false;try{await api.testRun('smoke-x','phpunit','../outside','');}catch{rejected=true;}assert(rejected,'aceitou caminho fora do projeto');
  document.getElementById('test-hide')!.click();
 });
 await (await import('./refactor-smoke')).refactorSmoke({check,assert,wait});
 await check('Árvore: menu de contexto, novo, renomear, colar, recortar, histórico local, excluir e terminal',async()=>{
  const node=(path:string)=>document.querySelector<HTMLElement>(`#tree button[data-path="${path}"], #tree summary[data-path="${path}"]`);
  const item=(label:string)=>[...document.querySelectorAll<HTMLButtonElement>('.context-menu button')].find(b=>b.textContent!.startsWith(label));
  const context=async(path:string)=>{await wait(()=>!path||!!node(path),10000,'item da árvore ausente: '+path);const el=path?node(path)!:document.getElementById('tree')!;const r=el.getBoundingClientRect();el.dispatchEvent(new MouseEvent('contextmenu',{bubbles:true,cancelable:true,clientX:r.left+10,clientY:r.bottom-4}));await wait(()=>!!document.querySelector('.context-menu'),5000,'menu não abriu');};
  const choose=async(...labels:string[])=>{for(const label of labels){await wait(()=>!!item(label)&&!item(label)!.disabled,5000,'item de menu ausente: '+label);item(label)!.click();}};
  const submit=async(values:Record<string,string>={})=>{await wait(()=>!!document.querySelector('.project-dialog'),5000,'diálogo ausente');const d=document.querySelector<HTMLDialogElement>('.project-dialog')!;for(const [name,value] of Object.entries(values))(d.querySelector(`[name="${name}"]`) as HTMLInputElement).value=value;d.querySelector<HTMLButtonElement>('.primary')!.click();await wait(()=>!document.querySelector('.project-dialog'),5000,'diálogo não fechou');};
  const status=()=>document.getElementById('status')!.textContent!;
  await context('src');await choose('Novo','Classe PHP…');await submit({name:'Invoice'});
  await wait(()=>!!node('src/Invoice.php'),10000).catch(()=>{throw Error('classe não apareceu na árvore: '+status()+' · '+[...document.querySelectorAll('#tree [data-path]')].map(n=>(n as HTMLElement).dataset.path).join(','));});const created=(await api.read('src/Invoice.php')).text;assert(created.includes('namespace Fixture;')&&created.includes('class Invoice'),'modelo PSR-4 incorreto: '+created);
  await context('src/Invoice.php');await choose('Refatorar','Renomear…');await submit({name:'Bill.php'});
  await wait(()=>!!node('src/Bill.php')&&!node('src/Invoice.php'),10000,'renomear não atualizou a árvore');await wait(()=>document.querySelector<HTMLElement>('#tabs .active')?.title==='src/Bill.php',5000,'aba não acompanhou o arquivo renomeado');assert(![...document.querySelectorAll<HTMLElement>('#tabs button')].some(b=>b.title==='src/Invoice.php'),'aba antiga ficou aberta após renomear: '+status());
  const bill=await api.read('src/Bill.php');const v2=await api.save('src/Bill.php',bill.text+'// v2\n',bill.etag);await api.save('src/Bill.php',bill.text+'// v2\n// v3\n',v2);
  await context('src/Bill.php');await choose('Copiar');await context('');await choose('Colar');await wait(()=>!!node('Bill.php'),10000,'colar na raiz falhou');
  await context('src/Bill.php');await choose('Copiar');await context('src');await choose('Colar');await submit();await wait(()=>!!node('src/Bill_1.php'),10000,'colar com conflito não sugeriu novo nome');
  await context('src/Bill_1.php');await choose('Recortar');await context('');await choose('Colar');await wait(()=>!!node('Bill_1.php')&&!node('src/Bill_1.php'),10000,'recortar/colar não moveu');
  await context('src/User.php');await choose('Copiar caminho/referência','Referência PHP (FQN)');await wait(()=>status().includes('Fixture\\User'),5000).catch(()=>{throw Error('FQN não copiado: '+status()+' · diálogos: '+[...document.querySelectorAll('dialog[open], [role=dialog]')].map(d=>(d.className||d.tagName)+':'+(d.textContent??'').slice(0,120)).join(' | ')+' · abas: '+[...document.querySelectorAll('#tabs button')].map(b=>(b as HTMLElement).title+(b.textContent?.endsWith(' •')?'*':'')).join(','));});
  await context('src/Bill.php');await choose('Histórico local','Mostrar histórico');await wait(()=>document.querySelectorAll('.local-history-list button').length>=2,10000,'histórico sem revisões');
  await wait(()=>!document.querySelector<HTMLButtonElement>('.local-history .restore')!.disabled,10000,'revisão não carregou');assert(document.querySelector('.local-history-list button')!.textContent!.includes('Antes de salvar'),'revisão mais recente incorreta');
  document.querySelector<HTMLButtonElement>('.local-history .restore')!.click();await wait(()=>status().startsWith('Restaurado src/Bill.php'),10000,'restaurar falhou: '+status());const restored=(await api.read('src/Bill.php')).text;assert(restored.includes('// v2')&&!restored.includes('// v3'),'conteúdo não restaurado: '+restored);document.querySelector<HTMLButtonElement>('.local-history .close')!.click();
  await context('Bill_1.php');await choose('Excluir…');await submit();await wait(()=>!node('Bill_1.php'),10000,'excluir não removeu');assert((await api.fileHistory('')).some(r=>r.path==='Bill_1.php'&&r.label==='Antes de excluir'),'exclusão sem histórico');
  node('src/Bill.php')!.focus();node('src/Bill.php')!.dispatchEvent(new KeyboardEvent('keydown',{key:'F6',shiftKey:true,bubbles:true,cancelable:true}));await wait(()=>!!document.querySelector('.project-dialog'),5000,'Shift+F6 não abriu renomear');document.querySelector<HTMLDialogElement>('.project-dialog')!.close();
  await context('src');await choose('Abrir em','Terminal');await wait(()=>[...document.querySelectorAll('#terminal-tabs button')].some(b=>b.textContent!.includes('· src')),15000,'terminal não abriu no diretório');document.getElementById('terminal-hide')!.click();
 });
 await check('Projetos recentes: listar, filtrar, proteger buffer, trocar, voltar e remover',async()=>{
  const originalRoot=(await api.workspace()).root;const ed=monaco.editor.getEditors().find(e=>e.getDomNode()?.closest('#editor'))!;
  document.getElementById('open')!.click();await wait(()=>!!document.querySelector('.recent-row'),30000,'Projetos recentes: etapa 1');
  const popup=document.querySelector('.recent-projects')!;assert(popup.textContent?.includes('recent-fixture'),'projeto anterior ausente');
  const missing=[...popup.querySelectorAll<HTMLElement>('.recent-row')].find(r=>r.textContent?.includes('missing-project'))!;
  assert(missing.querySelector<HTMLButtonElement>('.recent-target')!.disabled,'projeto ausente habilitado');
  const filter=popup.querySelector('input')!;filter.dispatchEvent(new KeyboardEvent('keydown',{key:'ArrowUp',bubbles:true,cancelable:true}));assert(document.activeElement?.closest('.recent-row')?.textContent?.includes('recent-fixture'),'seta para cima não selecionou o último disponível');filter.focus();filter.value='recent-fixture';filter.dispatchEvent(new Event('input',{bubbles:true}));await wait(()=>popup.querySelectorAll('.recent-row').length===1,30000,'Projetos recentes: etapa 2');
  const model=ed.getModel()!;const text=model.getValue();model.setValue(text+'\n// unsaved recent test');
  popup.querySelector<HTMLButtonElement>('.recent-target')!.click();await wait(()=>!!popup.querySelector('.recent-feedback')?.textContent?.includes('Salve'),30000,'Projetos recentes: etapa 3');
  assert((await api.workspace()).root===originalRoot,'perdeu projeto com buffer sujo');assert(model.getValue().includes('unsaved recent test'),'perdeu edição');
  model.setValue(text);popup.querySelector<HTMLButtonElement>('.recent-target')!.click();await wait(()=>document.getElementById('project')?.textContent==='recent-fixture',30000,'Projetos recentes: etapa 4').catch(e=>{throw Error(String(e)+' · '+(popup.querySelector('.recent-feedback')?.textContent??'')+' · abas sujas: '+[...document.querySelectorAll('button')].map(b=>b.textContent??'').filter(t=>t.endsWith(' •')).join(', '));});await wait(()=>!!document.querySelector('#tree button[aria-label="index.php"]'),30000,'Projetos recentes: etapa 5');
  assert(ed.getModel()===null,'editor preservou modelo de outro projeto');assert((await api.recentProjects())[0].name==='recent-fixture','ordem MRU não atualizou');
  document.getElementById('open')!.click();await wait(()=>!!document.querySelector('.recent-row'),30000,'Projetos recentes: etapa 6');
  const previous=[...document.querySelectorAll<HTMLElement>('.recent-row')].find(r=>r.dataset.path===originalRoot)!;previous.querySelector<HTMLButtonElement>('.recent-target')!.click();await wait(()=>document.getElementById('project')?.textContent==='project',30000,'Projetos recentes: etapa 7');
  document.getElementById('open')!.click();await wait(()=>!!document.querySelector('.recent-row'),30000,'Projetos recentes: etapa 8');
  const row=[...document.querySelectorAll<HTMLElement>('.recent-row')].find(r=>r.textContent?.includes('recent-fixture'))!;row.querySelector<HTMLButtonElement>('.recent-remove')!.click();await wait(()=>![...document.querySelectorAll('.recent-row')].some(r=>r.textContent?.includes('recent-fixture')),30000,'Projetos recentes: etapa 9');
  assert(!(await api.recentProjects()).some(e=>e.name==='recent-fixture'),'remoção não persistiu');document.getElementById('open')!.click();
 });
 if(errors.length)failures.push('renderer: '+errors.join('; '));
 await raw('nativeSmokeReport',[{ok:failures.length===0,runtime:info.runtime,backend:info.backend,checks,failures}]);
}
