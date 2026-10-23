import { _electron as electron, expect } from '@playwright/test';
import { mkdir, mkdtemp, rm, realpath } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
const root=await realpath(await mkdtemp(join(tmpdir(),'php-ide-terminal-')));
const app=await electron.launch({args:['.'],env:{...process.env,HOME:root,XDG_CONFIG_HOME:root,SHELL:'/bin/sh',PHP_IDE_PROJECT:root}});
try {
 const page=await app.firstWindow();page.setDefaultTimeout(15000);const errors:string[]=[];page.on('pageerror',e=>errors.push(e.message));
 await page.evaluate(()=>{(window as any).terminalOutput='';window.ide.onTerminalEvent(e=>{if(e.type==='output'){(window as any).terminalOutput+=e.data;(window as any).lastTerminalId=e.id;}});});
 await page.getByRole('button',{name:'Terminal',exact:true}).click();
 await expect(page.locator('#terminal-message')).toHaveText('');
 async function command(text:string){const input=page.locator('.terminal-view:not([hidden]) .xterm-helper-textarea');await input.focus();await page.keyboard.type(text);await page.keyboard.press('Enter');}
 async function output(pattern:RegExp){await expect.poll(()=>page.evaluate(()=>(window as any).terminalOutput),{timeout:15000}).toMatch(pattern);}
 await command('pwd');await output(new RegExp(root));
 await command("printf 'TERM_%s\n' READY");await output(/TERM_READY/);
 await command('export IDE_TERM_TEST=first');
 await page.getByRole('button',{name:'Novo terminal',exact:true}).click();await expect(page.locator('#terminal-tabs button')).toHaveCount(2);await expect(page.locator('#terminal-message')).toHaveText('');
 await command('echo SECOND_${IDE_TERM_TEST-unset}');await output(/SECOND_unset/);
 await command('sleep 30');await page.keyboard.press('Control+c');await command("printf 'CTRL_%s\n' OK");await output(/CTRL_OK/);
 await page.getByRole('separator',{name:'Altura do terminal'}).focus();await page.keyboard.press('ArrowUp');await command('stty size');await output(/\d+ \d+/);
 await page.getByRole('button',{name:'Ocultar terminal',exact:true}).click();await expect(page.locator('#terminal-panel')).toBeHidden();await page.keyboard.press('Alt+F12');await expect(page.locator('#terminal-panel')).toBeVisible();await expect(page.locator('#terminal-tabs button')).toHaveCount(2);
 await mkdir('.artifacts',{recursive:true});await page.screenshot({path:'.artifacts/terminal.png'});
 await page.getByRole('button',{name:'Encerrar sessão',exact:true}).click();await expect(page.locator('#terminal-tabs button')).toHaveCount(1);
 await command('echo FIRST_$IDE_TERM_TEST');await output(/FIRST_first/);await command('exit 7');await expect(page.locator('#terminal-tabs')).toContainText('encerrado');
 await page.getByRole('button',{name:'Novo terminal',exact:true}).click();await expect(page.locator('#terminal-message')).toHaveText('');await command('echo BEFORE_SWITCH');await output(/BEFORE_SWITCH/);
 const previous=await page.evaluate(()=>(window as any).lastTerminalId);
 const next=join(root,'next-project');await mkdir(next);
 await app.evaluate(({dialog},path)=>{dialog.showOpenDialog=(async()=>({canceled:false,filePaths:[path]})) as typeof dialog.showOpenDialog;},next);
 await page.getByRole('button',{name:'Abrir projeto',exact:true}).click();await expect(page.locator('#terminal-tabs button')).toHaveCount(0);await expect(page.locator('#terminal-panel')).toBeHidden();
 await expect(page.evaluate(id=>window.ide.terminalWrite(id,'x'),previous)).rejects.toThrow();
 await page.getByRole('button',{name:'Terminal',exact:true}).click();await expect(page.locator('#terminal-message')).toHaveText('');await command('pwd');await output(new RegExp(next));
 expect(errors).toEqual([]);console.log('Terminal UI: real PTY, cwd, keyboard input, isolated sessions, Ctrl+C, resize, hide/reopen, close and exit passed.');
}finally{await app.close();await rm(root,{recursive:true,force:true});}
