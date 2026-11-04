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
 // Test discovery and results come from the external plugin UI module.
 const editor=monaco.editor.getEditors().find(e=>e.getDomNode()?.closest('#editor'))!;
 document.querySelector<HTMLButtonElement>('#tree button[aria-label="SmokeTest.php"]')!.click();
 await wait(()=>editor.getModel()?.uri.path.endsWith('/SmokeTest.php')??false,'test file did not open');
 // Test run icons live in the gutter (as in the reference); the plugin owns the menu and the Run window.
 const glyphAt=(line:number)=>{const top=editor.getDomNode()!.getBoundingClientRect().top+editor.getTopForLineNumber(line)-editor.getScrollTop();return [...document.querySelectorAll<HTMLElement>('#editor .pt-gutter')].find(e=>Math.abs(e.getBoundingClientRect().top-top)<3);};
 await wait(()=>!!glyphAt(3),'test gutter icon missing');
 const glyph=glyphAt(3)!.getBoundingClientRect();glyphAt(3)!.dispatchEvent(new MouseEvent('click',{bubbles:true,cancelable:true,clientX:glyph.left+glyph.width/2,clientY:glyph.top+glyph.height/2,button:0}));
 await wait(()=>!!document.querySelector('#test-gutter-menu [data-action="run"]'),'test gutter menu missing');
 document.querySelector<HTMLButtonElement>('#test-gutter-menu [data-action="run"]')!.click();
 await wait(()=>document.getElementById('test-summary')?.dataset.state==='failed','test results missing');
 const rows=document.querySelectorAll<HTMLElement>('#test-tree .pt-row[data-kind=test]');assert(rows.length===2,'wrong test results');rows[1].dispatchEvent(new MouseEvent('dblclick',{bubbles:true}));
 await wait(()=>editor.getPosition()?.lineNumber===5,'failure navigation did not select source line');
 await wait(()=>!!editor.getModel()?.getAllDecorations().some(d=>String(d.options.glyphMarginClassName).includes('pt-g-all-failed')),'class result icon missing');
 checks.push('PHPUnit/Pest: gutter icon → Rust runner → Run window tree → result icons and navigation');
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
 await wait(()=>!!editor.getModel()?.getAllDecorations().some(d=>String(d.options.lineNumberClassName).startsWith('debug-bp')),'breakpoint decoration missing');
 checks.push('Xdebug: external Rust listener and real plugin workbench controls');
 if((_info as any).docker?.xdebug)checks.push(...await xdebugSession({editor,wait,assert,call}));
 // Revocation is native, not merely hiding the workbench panel.
 await call('pluginSetState',debuggerEntry.key,{enabled:false});
 let denied=false;try{await native(debuggerEntry,'debugStatus')}catch{denied=true}assert(denied,'disabled native provider still accepts calls');reload();
 await wait(()=>!document.getElementById('debug-panel'),'debug UI remained after disable');assert(!document.getElementById('show-debug'),'debug rail remained');
 const decorations=editor.getModel()?.getAllDecorations().filter(d=>/debug-/.test(String(d.options.lineNumberClassName)+String(d.options.className)+String(d.options.glyphMarginClassName)))??[];assert(!decorations.length,'debug decorations leaked');
 await call('pluginSetState',debuggerEntry.key,{enabled:true});reload();await wait(()=>!!document.getElementById('debug-panel'),'debug UI did not restore');
 const restarted=await native(debuggerEntry,'debugStatus');assert(restarted.listening===null,'old listener survived disable');checks.push('Native lifecycle: disable revokes IPC, removes UI/decorations and closes listener; enable starts clean');
 // Removing the packages must leave a usable ordinary PHP editor and no fallback provider.
 for(const entry of [composerEntry,testsEntry,debuggerEntry])await call('pluginRemove',entry.key);
 reload();await wait(()=>!document.getElementById('debug-panel')&&!document.getElementById('composer-panel')&&!document.getElementById('test-panel'),'removed plugins kept tool UI');
 assert(!!editor.getModel(),'core editor disappeared');const model=editor.getModel()!;model.setValue(model.getValue()+'\n// editable without tool plugins\n');assert(model.getValue().includes('editable without'),'editor not usable');
 checks.push('Plugin removal: all three tools disappear and PHP editing remains available');
 return checks;
}

/** Real Xdebug 3 (container from scripts/check-native.mjs --xdebug) driven through the plugin UI in the Tauri window:
 *  breakpoint on the line number, exception breakpoint from View Breakpoints, frames, variables, inline values,
 *  Evaluate (field and ⌥F8), stepping, exception stop and stop. Criteria: docs/research/xdebug-fidelity.md. */
async function xdebugSession({editor,wait,assert,call}:{editor:monaco.editor.ICodeEditor;wait:(test:()=>boolean,label:string)=>Promise<void>;assert:(ok:unknown,message:string)=>void;call:(method:string,...args:unknown[])=>Promise<any>}){
 const checks:string[]=[];const $=<T extends HTMLElement>(s:string)=>document.querySelector<T>(s);
 const shot=async(name:string)=>{await call('nativeSmokeProgress',`shot:${name}:0:0:1:1`);await new Promise(r=>setTimeout(r,1200));};
 const pause=(ms:number)=>new Promise(r=>setTimeout(r,ms));
 const input=(el:HTMLInputElement,value:string)=>{el.value=value;el.dispatchEvent(new Event('input',{bubbles:true}));};
 // Only the Debug tool window stays open below the editor, as in the reference captures.
 for(const id of ['composer-panel','test-panel'])document.getElementById(id)?.setAttribute('hidden','');
 // Clean slate: the toggle check above left a breakpoint in another file.
 document.querySelector<HTMLButtonElement>('#tree button[aria-label="debug-app.php"]')!.click();
 await wait(()=>editor.getModel()?.uri.path.endsWith('/debug-app.php')??false,'debug-app.php did not open');await pause(300);
 // Path mapping through the settings view: container /app → project root.
 $<HTMLButtonElement>('#debug-more')!.click();[...document.querySelectorAll<HTMLButtonElement>('.debug-more-menu button')].find(b=>b.textContent?.includes('Configurações'))!.click();
 $<HTMLInputElement>('#debug-map-server')!.value='/app';$<HTMLFormElement>('#debug-mapping-form')!.requestSubmit();
 await wait(()=>!!$('#debug-mappings')?.textContent?.includes('/app'),'mapping not saved');$<HTMLButtonElement>('#debug-settings-close')!.click();
 // Breakpoint by clicking line number 21 (real Monaco hit test through the host gutter remap).
 editor.revealLineInCenter(21);await pause(200);
 const number=(line:number)=>{const top=editor.getTopForLineNumber(line)-editor.getScrollTop()+editor.getDomNode()!.getBoundingClientRect().top+4;return [...document.querySelectorAll<HTMLElement>('#editor .margin-view-overlays .line-numbers')].find(el=>{const r=el.getBoundingClientRect();return r.top<=top&&r.bottom>top;});};
 const cell=number(21);assert(cell,'line number 21 not rendered');const r=cell!.getBoundingClientRect();
 for(const type of ['pointerdown','mousedown','pointerup','mouseup'])cell!.dispatchEvent(new (type.startsWith('pointer')?PointerEvent:MouseEvent)(type,{bubbles:true,cancelable:true,composed:true,clientX:r.right-6,clientY:r.top+r.height/2,button:0,buttons:type.endsWith('down')?1:0,...(type.startsWith('pointer')?{pointerId:1,pointerType:'mouse',isPrimary:true}:{})} as any));
 await wait(()=>/debug-bp-line/.test(number(21)?.className??''),'click on line number 21 did not create a breakpoint');
 assert(editor.getSelection()?.isEmpty(),'clicking the line number selected the line');
 checks.push('Xdebug UI: click on the line number creates the breakpoint in place of the number (no line selection)');
 // Exception breakpoint through View Breakpoints → + → PHP exception.
 $<HTMLButtonElement>('#debug-view-breakpoints')!.click();await wait(()=>!!$('.debug-breakpoints-dialog'),'Breakpoints dialog did not open');
 $<HTMLButtonElement>('.debug-breakpoints-dialog .debug-bp-tools button')!.click();$<HTMLButtonElement>('.debug-add-menu button')!.click();
 await wait(()=>!!$('.debug-add-exception input'),'Add exception dialog did not open');input($<HTMLInputElement>('.debug-add-exception input')!,'InvalidArgumentException');
 [...document.querySelectorAll<HTMLButtonElement>('.debug-add-exception button')].find(b=>b.textContent==='OK')!.click();
 await wait(()=>!!$('.debug-bp-tree')?.textContent?.includes('InvalidArgumentException'),'exception breakpoint not listed');await shot('xdebug-01-breakpoints-dialog');
 [...document.querySelectorAll<HTMLButtonElement>('.debug-breakpoints-dialog button')].find(b=>b.textContent==='Concluir')!.click();
 checks.push('Xdebug UI: PHP exception breakpoint added from View Breakpoints');
 // Real session from the container (it retries every second while the IDE listens).
 await wait(()=>!!$('#debug-frames')?.textContent?.includes('debug-app.php:21, checkout()'),'Xdebug did not stop at debug-app.php:21: '+$('#debug-console')?.textContent?.slice(-400));
 await wait(()=>!!$('#debug-tree')?.textContent?.replace(/\s+/g,' ').includes('$order = {Order}'),'variables missing: '+$('#debug-tree')?.textContent);
 await wait(()=>/debug-bp-verified/.test(number(21)?.className??''),'breakpoint not verified by Xdebug: '+number(21)?.className);
 await wait(()=>[...document.querySelectorAll('#editor .debug-inline-value')].some(e=>e.textContent?.replace(/\u00a0/g,' ').includes('$order: Order')),'inline values missing');
 assert(document.querySelectorAll('#editor .debug-exec-line').length===1,'execution line not highlighted');
 assert($<HTMLButtonElement>('#debug-pause')!.disabled,'Pause should be disabled while paused');
 await shot('xdebug-02-paused');
 checks.push('Xdebug real: stops at the clicked breakpoint (verified ✓), frames "file:line, function()", {type} variables, inline values');
 // Evaluate from the field (Enter) and from ⌥F8.
 const field=$<HTMLInputElement>('#debug-eval')!;field.value='$order->total() + 1';$<HTMLFormElement>('#debug-eval-form')!.requestSubmit();
 await wait(()=>!!$('#debug-tree > li')?.textContent?.replace(/\s+/g,' ').includes('result = {int} 61'),'evaluate field result missing: '+$('#debug-tree')?.textContent);
 editor.setPosition({lineNumber:21,column:20});editor.focus();keymap.run('debug.evaluate');await wait(()=>!!$('.debug-evaluate input'),'Evaluate window did not open');
 const ev=$<HTMLInputElement>('.debug-evaluate input')!;ev.value='$order';[...document.querySelectorAll<HTMLButtonElement>('.debug-evaluate button')].find(b=>b.textContent==='Avaliar')!.click();
 await wait(()=>!!$('.debug-evaluate-result')?.textContent?.includes('"A-1"'),'⌥F8 result missing: '+$('.debug-evaluate-result')?.textContent);
 await shot('xdebug-03-evaluate');[...document.querySelectorAll<HTMLButtonElement>('.debug-evaluate button')].find(b=>b.textContent==='Fechar')!.click();
 checks.push('Xdebug real: Evaluate (field and ⌥F8 window) against the paused frame');
 // Step over, then resume to the second checkout() and to the exception breakpoint.
 keymap.run('debug.stepOver');await wait(()=>!!$('#debug-frames')?.textContent?.includes('debug-app.php:22, checkout()'),'step over did not reach line 22');
 await wait(()=>!!$('#debug-tree')?.textContent?.replace(/\s+/g,' ').includes('$total = {int} 60'),'variables not refreshed after step: '+$('#debug-tree')?.textContent);
 keymap.run('debug.resume');await wait(()=>!!$('#debug-frames')?.textContent?.includes('debug-app.php:21, checkout()')&&!!$('#debug-frames')?.textContent?.includes(':34'),'second checkout() stop missing: '+$('#debug-frames')?.textContent);
 keymap.run('debug.resume');await wait(()=>!!$('#debug-tree')?.textContent?.replace(/\s+/g,' ').includes('Exception = {InvalidArgumentException}'),'exception stop missing: '+$('#debug-frames')?.textContent+' '+$('#debug-console')?.textContent?.slice(-300));
 await wait(()=>/debug-bp-exception/.test(number(23)?.className??''),'exception icon missing on line 23');
 await shot('xdebug-04-exception');
 checks.push('Xdebug real: step over, resume and stop on the PHP exception breakpoint (lightning on the line number)');
 // Stop listening first (the container retries), then stop the session.
 $<HTMLButtonElement>('#debug-listen')!.click();await wait(()=>$('#debug-listen')?.getAttribute('aria-pressed')==='false','listener did not stop');
 keymap.run('debug.stop');await wait(()=>!!$('#debug-frames')?.textContent?.includes('Sem sessão'),'session did not end: '+$('#debug-frames')?.textContent);
 await wait(()=>!document.querySelector('#editor .debug-exec-line')&&!document.querySelector('#editor .debug-inline-value'),'execution decorations leaked after stop');
 await shot('xdebug-05-stopped');
 checks.push('Xdebug real: stop ends the session and clears execution decorations');
 return checks;
}
