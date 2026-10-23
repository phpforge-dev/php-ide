import * as monaco from 'monaco-editor';
import { phpEditorAnalysis } from '../shared/php-editor-analysis';
import { analyze, codeOnly } from '../shared/language/php-source';
import { adaptedMethod, hierarchyMarkers, hoverClassName, parseHierarchy, type HierarchyMarker, type MarkerTarget, type PhpClass } from '../shared/language/php-hierarchy';
import { ProjectHierarchy, type HierarchyFiles } from './php-hierarchy-index';
import { t, msg } from './i18n';
import './php-gutter.css';

type Target = { uri: monaco.Uri; range: monaco.IRange };
export function mountPhpInsights(editor:monaco.editor.IStandaloneCodeEditor,hooks:{
 references(model:monaco.editor.ITextModel,position:monaco.Position):Promise<any>;
 clean():boolean;
 show(position:monaco.Position):void;
 /** Pedido LSP (hover) usado para o tipo do receptor em `$var->membro`. */
 request?(method:'textDocument/hover',model:monaco.editor.ITextModel,position:monaco.Position):Promise<any>;
 open?(target:Target):Promise<void>;
 files?:HierarchyFiles;
}){
 const semanticKinds=['variable','method','function','type','keyword'];
 monaco.languages.registerDocumentSemanticTokensProvider('php',{
  getLegend:()=>({tokenTypes:semanticKinds,tokenModifiers:['constructor']}),
  provideDocumentSemanticTokens(model){
   const data:number[]=[];let line=0,column=0;
   for(const token of phpEditorAnalysis(model.getValue()).highlights){
    const start=model.getPositionAt(token.offset);const nextLine=start.lineNumber-1,nextColumn=start.column-1;
    const kind={variable:0,method:1,function:2,constructor:3,builtin:4}[token.kind];
    data.push(nextLine-line,nextLine===line?nextColumn-column:nextColumn,token.length,kind,token.kind==='constructor'?1:0);line=nextLine;column=nextColumn;
   }
   return {data:new Uint32Array(data)};
  },releaseDocumentSemanticTokens(){},
 });
 const listeners=new Set<(provider:monaco.languages.CodeLensProvider)=>unknown>();
 const notify=()=>listeners.forEach(listener=>listener(lensProvider));
 const decorations=editor.createDecorationsCollection();
 let generation=0,timer:ReturnType<typeof setTimeout>|undefined;
 let current:monaco.editor.ITextModel|null=null,version=0;
 let rows: {range:monaco.Range;offset:number;canFade:boolean;state:'pending'|'dirty'|'failed'|'ready';count?:number}[]=[];
 monaco.editor.registerCommand('php-ide.showDeclarationUsages',(_accessor,uri:string,line:number,column:number)=>{
  if(editor.getModel()?.uri.toString()===uri)hooks.show(new monaco.Position(line,column));
 });
 const lensProvider:monaco.languages.CodeLensProvider={
  onDidChange:listener=>{listeners.add(listener);return {dispose:()=>listeners.delete(listener)};},
  provideCodeLenses(model){return {lenses:model===current&&model.getVersionId()===version?rows.map(row=>({range:row.range,command:{
   id:'php-ide.showDeclarationUsages',
   title:row.state==='pending'?t('Analisando usos…'):row.state==='dirty'?t('Salve para atualizar usos'):row.state==='failed'?t('Usos indisponíveis'):row.count===0?t('Sem usos no índice'):msg`${row.count} uso(s)`,
   tooltip:t('Referências no índice do projeto. Chamadas dinâmicas e usos externos podem não aparecer. Clique para buscar usos.'),
   arguments:[model.uri.toString(),row.range.startLineNumber,row.range.startColumn],
  }})):[],dispose(){}};},
 };
 monaco.languages.registerCodeLensProvider('php',lensProvider);
 function refresh(){
  const token=++generation;clearTimeout(timer);decorations.clear();
  current=editor.getModel();version=current?.getVersionId()??0;
  // Stubs nativos (phar://) e outros documentos somente leitura não têm usos no índice do projeto.
  rows=current?.getLanguageId()==='php'&&current.uri.scheme==='file'?phpEditorAnalysis(current.getValue()).callables.filter(c=>!c.name.startsWith('__')).map(c=>{
   const p=current!.getPositionAt(c.offset);return {range:new monaco.Range(p.lineNumber,p.column,p.lineNumber,p.column+c.length),offset:c.offset,canFade:c.canFade,state:hooks.clean()?'pending':'dirty'};
  }):[];
  notify();
  scheduleGutter();
  if(!current||!rows.length||!hooks.clean())return;
  const model=current,snapshot=rows;
  // Debounce edits/model switches and issue one query at a time; navigation can interleave.
  timer=setTimeout(()=>{void(async()=>{
   for(const row of snapshot){
    if(token!==generation||model.isDisposed()||model.getVersionId()!==version||!hooks.clean())return;
    try{
     const found=await hooks.references(model,new monaco.Position(row.range.startLineNumber,row.range.startColumn));
     if(token!==generation||model.isDisposed()||!hooks.clean())return;
     if(!Array.isArray(found))throw Error('Incomplete references response');
     const seen=new Set<string>();
     for(const location of found){const range=location.range; if(!location.uri||!range?.start||!range?.end)throw Error('Invalid reference');
      if(location.uri===model.uri.toString()&&range.start.line===row.range.startLineNumber-1&&range.start.character===row.range.startColumn-1)continue;
      seen.add(location.uri+JSON.stringify(range));
     }
     row.count=seen.size;row.state='ready';
    }catch{if(token!==generation)return;row.state='failed';}
    decorations.set(snapshot.filter(r=>r.state==='ready'&&r.count===0&&r.canFade).map(r=>({range:r.range,options:{inlineClassName:'php-unused-symbol',hoverMessage:{value:t('Nenhuma referência encontrada no índice do projeto. Isso não garante ausência de chamadas dinâmicas ou usos externos.')}}})));
    notify();
   }
  })();},900);
 }

 // Hierarquia: marcadores de override/implement no gutter e adaptações de trait.
 const files=hooks.files??(window as any).ide as HierarchyFiles|undefined;
 const project=files?new ProjectHierarchy(files):undefined;
 const gutter=editor.createDecorationsCollection();
 let gutterRows=new Map<number,HierarchyMarker[]>(),gutterGeneration=0,gutterTimer:ReturnType<typeof setTimeout>|undefined;
 editor.updateOptions({glyphMargin:true});
 /** Não bloqueia navegação enquanto o índice de hierarquia é construído pela primeira vez. */
 async function ready(wait=1500){if(!project)return false;let done=false;const build=project.ready().then(()=>done=true,()=>false);await Promise.race([build,new Promise(r=>setTimeout(r,wait))]);return done;}
 /** Sobrepõe o buffer aberto (talvez não salvo) ao índice e devolve as classes dele. */
 function overlay(model:monaco.editor.ITextModel):PhpClass[]{const path=project?.relative(model.uri.fsPath);return path?project!.put(path,model.getValue()):parseHierarchy(model.getValue());}
 const upward=(m:HierarchyMarker)=>m.kind==='overrides'||m.kind==='implements';
 const targetName=(target:MarkerTarget)=>target.method?`${target.cls.fqn}::${target.method.name}`:target.cls.fqn;
 function describe(marker:HierarchyMarker){
  const names=marker.targets.map(target=>'`'+targetName(target)+'`').join(', ');
  return marker.kind==='overrides'?msg`Sobrescreve ${names}`:marker.kind==='implements'?msg`Implementa ${names}`:marker.kind==='overridden'?msg`Sobrescrito em ${names}`:marker.kind==='implemented'?msg`Implementado em ${names}`:msg`Estendido por ${names}`;
 }
 function scheduleGutter(){clearTimeout(gutterTimer);gutterTimer=setTimeout(()=>void refreshGutter(),400);}
 async function refreshGutter(){
  const token=++gutterGeneration;const model=editor.getModel();
  if(!project||!model||model.getLanguageId()!=='php'||model.uri.scheme!=='file'){gutter.clear();gutterRows=new Map();return;}
  try{await project.ready();}catch{gutter.clear();gutterRows=new Map();return;}
  if(token!==gutterGeneration||model.isDisposed()||editor.getModel()!==model)return;
  const result=new Map<number,HierarchyMarker[]>();
  for(const marker of hierarchyMarkers(overlay(model),project.index)){const line=model.getPositionAt(marker.offset).lineNumber;result.set(line,[...(result.get(line)??[]),marker]);}
  gutterRows=result;
  gutter.set([...result].map(([line,markers])=>{
   const kind=markers.some(upward)&&markers.some(m=>!upward(m))?'both':markers[0].kind;
   return {range:new monaco.Range(line,1,line,1),options:{glyphMarginClassName:`php-gutter php-gutter-${kind}`,glyphMarginHoverMessage:{value:markers.map(describe).join('\n\n')+'\n\n'+t('Clique para navegar.')}}};
  }));
 }
 async function go(target:MarkerTarget){
  const location=project?.location(target.cls.path!,(target.method??target.cls).offset,(target.method??target.cls).name.length);
  if(!location||!hooks.open)return;
  const r=location.range;await hooks.open({uri:monaco.Uri.parse(location.uri),range:{startLineNumber:r.start.line+1,startColumn:r.start.character+1,endLineNumber:r.end.line+1,endColumn:r.end.character+1}});
 }
 let menu:HTMLElement|undefined;
 const closeMenu=()=>{menu?.remove();menu=undefined;};
 function choose(markers:HierarchyMarker[],x:number,y:number){
  const items=markers.flatMap(marker=>marker.targets.map(target=>({marker,target})));
  if(items.length===1){void go(items[0].target);return;}
  closeMenu();const root=document.createElement('section');menu=root;root.className='usages-popup php-hierarchy-menu';root.setAttribute('role','dialog');root.setAttribute('aria-label',t('Hierarquia'));
  const header=document.createElement('header');const title=document.createElement('strong');title.textContent=t('Hierarquia');header.append(title);
  const list=document.createElement('div');list.className='usages-results';list.setAttribute('role','list');
  for(const {marker,target} of items){
   const button=document.createElement('button');button.type='button';button.className='usage-result';button.setAttribute('role','listitem');
   const path=document.createElement('span');path.className='usage-path';path.textContent=`${upward(marker)?'↑':'↓'} ${target.cls.path??''}`;
   const code=document.createElement('code');code.textContent=targetName(target);button.append(path,code);
   button.onclick=()=>{closeMenu();void go(target);};list.append(button);
  }
  const footer=document.createElement('footer');footer.textContent=t('↑ ↓ navegar · Enter abrir · Esc fechar');
  root.append(header,list,footer);document.body.append(root);
  root.style.left=Math.max(8,Math.min(x,innerWidth-680))+'px';root.style.top=Math.max(8,Math.min(y,innerHeight-320))+'px';
  root.addEventListener('keydown',e=>{
   const buttons=[...list.querySelectorAll<HTMLButtonElement>('button')];const at=buttons.indexOf(document.activeElement as HTMLButtonElement);
   if(e.key==='Escape'){e.preventDefault();closeMenu();editor.focus();}
   if(e.key==='ArrowDown'||e.key==='ArrowUp'){e.preventDefault();buttons[(at+(e.key==='ArrowDown'?1:-1)+buttons.length)%buttons.length]?.focus();}
  });
  list.querySelector<HTMLButtonElement>('button')?.focus();
 }
 document.addEventListener('pointerdown',e=>{if(menu&&!menu.contains(e.target as Node))closeMenu();});
 editor.onMouseDown(e=>{
  if(e.target.type!==monaco.editor.MouseTargetType.GUTTER_GLYPH_MARGIN)return;
  const markers=gutterRows.get(e.target.position?.lineNumber??-1);if(!markers)return;
  e.event.preventDefault();choose(markers,e.event.posx,e.event.posy+12);
 });

 /** Classe do receptor em `$var->membro` (tipo do hover do servidor) ou `$this->membro`. */
 async function receiver(model:monaco.editor.ITextModel,offset:number):Promise<PhpClass|undefined>{
  if(!project)return undefined;
  const text=model.getValue();const before=codeOnly(text).slice(0,offset);
  const access=/(\$[A-Za-z_]\w*)\s*(?:\?->|->)\s*$/.exec(before);if(!access)return undefined;
  const classes=overlay(model);
  if(access[1]==='$this')return classes.filter(c=>c.offset<offset&&c.kind!=='interface').at(-1);
  if(!hooks.request)return undefined;
  const hover=await hooks.request('textDocument/hover',model,model.getPositionAt(access.index+1)).catch(()=>null);
  const value=[hover?.contents].flat().map((c:any)=>typeof c==='string'?c:c?.value??'').join('\n');
  const name=hoverClassName(value);if(!name)return undefined;
  return project.index.resolveShort(name,analyze(text),offset);
 }
 async function memberAt(model:monaco.editor.ITextModel,position:monaco.IPosition){
  const word=model.getWordAtPosition(position);if(!word||!project||model.getLanguageId()!=='php'||model.uri.scheme!=='file'||!await ready())return undefined;
  const offset=model.getOffsetAt({lineNumber:position.lineNumber,column:word.startColumn});
  const cls=await receiver(model,offset);if(!cls)return undefined;
  const resolved=adaptedMethod(project.index,cls.fqn,word.word);if(!resolved)return undefined;
  return {word,cls,...resolved};
 }
 /** Corrige a definição quando há `insteadof`/`as` em traits; sem adaptação, o servidor de linguagem prevalece. */
 async function refineDefinition(model:monaco.editor.ITextModel,position:monaco.IPosition,result:any){
  try{
   const empty=!result||(Array.isArray(result)&&!result.length);
   if(!project||(!empty&&!project.index.all().some(c=>c.rules.length)))return result;
   const member=await memberAt(model,position);if(!member||(!member.adapted&&!empty))return result;
   const location=project.location(member.found.owner.path!,member.found.method.offset,member.found.method.name.length);
   return location?[location]:result;
  }catch{return result;}
 }
 const hasAliases=()=>!!project?.index.all().some(c=>c.rules.some(r=>r.kind==='as'&&r.alias));
 monaco.languages.registerCompletionItemProvider('php',{triggerCharacters:['>'],async provideCompletionItems(model,position){
  if(!project||model.uri.scheme!=='file'||!await ready()||!hasAliases())return {suggestions:[]};
  const word=model.getWordUntilPosition(position);const offset=model.getOffsetAt({lineNumber:position.lineNumber,column:word.startColumn});
  const cls=await receiver(model,offset);if(!cls)return {suggestions:[]};
  const inside=/\$this\s*(?:\?->|->)\s*$/.test(codeOnly(model.getValue()).slice(0,offset));
  const range=new monaco.Range(position.lineNumber,word.startColumn,position.lineNumber,word.endColumn);
  return {suggestions:project.index.aliases(cls.fqn).filter(a=>(inside||a.visibility==='public')&&a.alias.toLowerCase().startsWith(word.word.toLowerCase())).map(a=>({
   label:{label:a.alias,detail:'()',description:`${a.target.owner.name}::${a.target.method.name}`},kind:monaco.languages.CompletionItemKind.Method,
   detail:msg`Alias de trait para ${a.target.owner.fqn}::${a.target.method.name}`,insertText:`${a.alias}($0)`,insertTextRules:monaco.languages.CompletionItemInsertTextRule.InsertAsSnippet,range,
  }))};
 }});
 monaco.languages.registerHoverProvider('php',{async provideHover(model,position){
  if(!hasAliases())return null;
  const member=await memberAt(model,position).catch(()=>undefined);if(!member?.found.alias)return null;
  const {word,found}=member;
  return {range:new monaco.Range(position.lineNumber,word.startColumn,position.lineNumber,word.endColumn),contents:[{value:msg`**${found.alias}** — alias de trait para \`${found.owner.fqn}::${found.method.name}\``}]};
 }});

 editor.onDidChangeModel(refresh);
 editor.onDidChangeModelContent(refresh);
 window.addEventListener('ide-project-files-changed',refresh);
 window.addEventListener('ide-workspace-file-changed',event=>{const path=(event as CustomEvent<{path?:string}>).detail?.path;if(path&&project)void project.refreshPath(path).then(scheduleGutter);});
 refresh();
 return {refresh,refineDefinition};
}
