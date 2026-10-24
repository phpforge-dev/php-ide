// Browser-only synthetic fixtures execute reviewed, pinned production bundles.
import {readFile} from 'node:fs/promises';
import {createHash} from 'node:crypto';
export async function pinnedWorkbenchFixture(names){
 const defaults=JSON.parse(await readFile(new URL('../default-plugins.json',import.meta.url),'utf8'));
 const packages=[];const errors=[];
 for(const name of names){
  const root=new URL('../.tools/plugin-packages/'+name+'/',import.meta.url);
  const manifest=JSON.parse(await readFile(new URL('plugin.json',root),'utf8'));
  const entry=defaults.find(value=>value.plugin.id===manifest.id);
  const revision=await readFile(new URL('.revision',root),'utf8');
  const hash=createHash('sha256').update(await readFile(new URL(manifest.main,root))).digest('hex');
  if(!entry||entry.plugin.version!==manifest.version||entry.plugin.revision!==revision||entry.sha256!==hash)throw Error('Missing or stale pinned '+name+' fixture package; run npm run setup:plugins');
  packages.push({name,manifest,code:await readFile(new URL(manifest.workbench.main,root),'utf8'),style:await readFile(new URL(manifest.workbench.style,root),'utf8')});
 }
 return {assertClean(){if(errors.length)throw Error(errors.join("\n"));},async route(page){page.on('pageerror',error=>{errors.push(String(error));console.error('Fixture page error:',error.message);});await page.route('**/src/window-layout.ts',route=>route.fulfill({contentType:'application/javascript',body:'export async function welcomeWindow(){} export async function workbenchWindow(){}'}));for(const item of packages){await page.route('**/fixture-'+item.name+'.js',route=>route.fulfill({contentType:'application/javascript',body:item.code}));await page.route('**/fixture-'+item.name+'.css',route=>route.fulfill({contentType:'text/css',body:item.style}));}},bootstrap:`
 const monaco=await import('/node_modules/.vite/deps/monaco-editor.js');
 const {t:tr,msg,html,activeLanguage}=await import('/src/i18n.ts');
 const {keymap}=await import('/src/keymap.ts');const {dockWindow,resizeToolWindow,toolIcon}=await import('/src/tool-window.ts');
 const {fileIcon}=await import('/src/file-icons.ts');const {editorFont}=await import('/src/editor-theme.ts');
 const {editorPreviewLayout}=await import('/src/editor-preview-layout.ts');const {providePluginService}=await import('/src/plugin-services.ts');
 const fixtureOwned=[];for(const name of ${JSON.stringify(names)}){const module=await import('/fixture-'+name+'.js');module.activate({api:window.ide,monaco,tr,msg,html,activeLanguage,keymap,dockWindow,resizeToolWindow,toolIcon,fileIcon,editorFont,editorPreviewLayout,own:value=>{fixtureOwned.push(typeof value==='function'?value:()=>value?.dispose?.());return value;},provide:(service,value)=>{const off=providePluginService('synthetic-'+name+'-fixture',service,value);fixtureOwned.push(off);return off;}});const style=document.createElement('link');style.rel='stylesheet';style.href='/fixture-'+name+'.css';document.head.append(style);}
 window.addEventListener('beforeunload',()=>fixtureOwned.reverse().forEach(dispose=>dispose()));
 `};
}
