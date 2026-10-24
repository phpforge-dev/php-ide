import * as monaco from 'monaco-editor';
import {invoke} from '@tauri-apps/api/core';
import {keymap} from './keymap';
export async function toolPluginsSmoke(_info:unknown){
 const checks:string[]=[];const call=(method:string,...args:unknown[])=>invoke<any>('ide',{method,args});
 const assert=(ok:unknown,message:string)=>{if(!ok)throw Error(message)};
 const wait=async(test:()=>boolean,label:string)=>{const end=Date.now()+30000;while(!test()){if(Date.now()>end)throw Error(label+': '+document.getElementById('status')?.textContent+' | composer: '+document.getElementById('composer-summary')?.textContent+' | output: '+document.getElementById('composer-output')?.textContent+' | tests: '+document.getElementById('test-summary')?.textContent);await new Promise(r=>setTimeout(r,40));}};
 const reload=()=>document.querySelector<HTMLButtonElement>('#plugins-dialog .plugins-toolbar button:last-child')!.click();
 const list=await call('pluginList');const tools=list.plugins.filter((p:any)=>p.manifest?.tool);assert(tools.length===3,'three tool providers expected');
 const debuggerEntry=tools.find((p:any)=>p.manifest.id==='phpforge.php-debugger');
 const composerEntry=tools.find((p:any)=>p.manifest.id==='phpforge.composer');
 const testsEntry=tools.find((p:any)=>p.manifest.id==='phpforge.php-tests');
 const native=(entry:any,method:string,...args:unknown[])=>call('pluginToolCall',entry.key,method,args);
 const root=(await window.ide.workspace()).root;
 // Composer UI drives the separately installed executable and receives streamed output.
 document.getElementById('show-composer')!.click();document.getElementById('composer-settings')!.click();
 const mode=document.getElementById('composer-mode') as HTMLSelectElement;mode.value='path';mode.dispatchEvent(new Event('change'));
 (document.getElementById('composer-path') as HTMLInputElement).value=root+'/composer.phar';
 (document.getElementById('composer-config') as HTMLFormElement).requestSubmit();
 await wait(()=>document.getElementById('composer-probe-result')?.dataset.state==='passed','Composer probe failed');
 document.querySelector<HTMLButtonElement>('[data-composer="validate"]')!.click();
 await wait(()=>document.getElementById('composer-summary')?.dataset.state==='passed','Composer UI did not complete');
 assert(document.getElementById('composer-output')?.textContent?.includes('composer fixture'),'Composer output did not reach plugin UI');
 const manifest=await window.ide.read('composer.json');const project=JSON.parse(manifest.text);project.scripts={...(project.scripts??{}),slow:'fixture'};await window.ide.save('composer.json',JSON.stringify(project,null,2),manifest.etag);
 const running=native(composerEntry,'composerRun','cancel-fixture',{mode:'path',path:root+'/composer.phar'},{action:'run-script',script:'slow'});
 await new Promise(r=>setTimeout(r,200));await native(composerEntry,'composerCancel','cancel-fixture');const cancelled=await running;assert(cancelled.cancelled,'Composer cancellation queued behind long request');
 checks.push('Composer: external Rust service, configured executable and live output through plugin UI');
 // Test CodeLens comes from the external worker; results/navigation come from its UI module.
 const editor=monaco.editor.getEditors().find(e=>e.getDomNode()?.closest('#editor'))!;
 document.querySelector<HTMLButtonElement>('#tree button[aria-label="SmokeTest.php"]')!.click();
 await wait(()=>editor.getModel()?.uri.path.endsWith('/SmokeTest.php')??false,'test file did not open');
 await wait(()=>[...document.querySelectorAll('#editor .codelens-decoration a')].some(a=>a.textContent?.includes('Executar teste')),'external test CodeLens missing');
 const lens=[...document.querySelectorAll<HTMLAnchorElement>('#editor .codelens-decoration a')].find(a=>a.textContent?.includes('Executar teste'))!;
 const box=lens.getBoundingClientRect();for(const type of ['mousedown','mouseup','click'])lens.dispatchEvent(new MouseEvent(type,{bubbles:true,cancelable:true,clientX:box.left+box.width/2,clientY:box.top+box.height/2,button:0}));
 await wait(()=>document.getElementById('test-summary')?.dataset.state==='failed','test results missing');
 const rows=document.querySelectorAll<HTMLButtonElement>('#test-list button');assert(rows.length===2,'wrong test results');rows[1].dispatchEvent(new MouseEvent('dblclick',{bubbles:true}));
 await wait(()=>editor.getPosition()?.lineNumber===5,'failure navigation did not select source line');checks.push('PHPUnit/Pest: external CodeLens → Rust runner → report → failure navigation');
 // Listener ownership and breakpoint settings are handled outside the IDE executable.
 document.getElementById('show-debug')!.click();
 const listening=await native(debuggerEntry,'debugListen',0,false).catch(()=>null);
 assert(!listening,'invalid debug port accepted');
 // OS-selected test port is supplied by the runner to avoid shared-port collisions.
 const port=(_info as any).docker.toolPort;
 (document.getElementById('debug-port') as HTMLInputElement).value=String(port);
 document.getElementById('debug-listen')!.click();
 await wait(()=>document.getElementById('debug-listen')?.getAttribute('aria-pressed')==='true','debug listener did not start');
 assert((await native(debuggerEntry,'debugStatus')).listening.port===port,'listener state incorrect');
 editor.setPosition({lineNumber:4,column:1});assert(keymap.run('debug.toggleBreakpoint'),'debug action missing');
 await wait(()=>!!editor.getModel()?.getAllDecorations().some(d=>String(d.options.glyphMarginClassName).startsWith('debug-bp')),'breakpoint decoration missing');
 checks.push('Xdebug: external Rust listener and real plugin workbench controls');
 // Revocation is native, not merely hiding the workbench panel.
 await call('pluginSetState',debuggerEntry.key,{enabled:false});
 let denied=false;try{await native(debuggerEntry,'debugStatus')}catch{denied=true}assert(denied,'disabled native provider still accepts calls');reload();
 await wait(()=>!document.getElementById('debug-panel'),'debug UI remained after disable');assert(!document.getElementById('show-debug'),'debug rail remained');
 const decorations=editor.getModel()?.getAllDecorations().filter(d=>String(d.options.glyphMarginClassName).startsWith('debug-'))??[];assert(!decorations.length,'debug decorations leaked');
 await call('pluginSetState',debuggerEntry.key,{enabled:true});reload();await wait(()=>!!document.getElementById('debug-panel'),'debug UI did not restore');
 const restarted=await native(debuggerEntry,'debugStatus');assert(restarted.listening===null,'old listener survived disable');checks.push('Native lifecycle: disable revokes IPC, removes UI/decorations and closes listener; enable starts clean');
 // Removing the packages must leave a usable ordinary PHP editor and no fallback provider.
 for(const entry of [composerEntry,testsEntry,debuggerEntry])await call('pluginRemove',entry.key);
 reload();await wait(()=>!document.getElementById('debug-panel')&&!document.getElementById('composer-panel')&&!document.getElementById('test-panel'),'removed plugins kept tool UI');
 assert(!!editor.getModel(),'core editor disappeared');const model=editor.getModel()!;model.setValue(model.getValue()+'\n// editable without tool plugins\n');assert(model.getValue().includes('editable without'),'editor not usable');
 checks.push('Plugin removal: all three tools disappear and PHP editing remains available');
 return checks;
}
