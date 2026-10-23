import { _electron as electron, expect } from '@playwright/test';
import { execFileSync } from 'node:child_process';
import { mkdir, rm } from 'node:fs/promises';
import { join } from 'node:path';
const fixture=JSON.parse(execFileSync(process.execPath,['scripts/create-git-reference.mjs'],{encoding:'utf8'}));
const remote=join(fixture.root,'.git','remote-fixture.git');
execFileSync('git',['init','--bare','-q',remote]);execFileSync('git',['-C',fixture.root,'remote','add','origin',remote]);
const app=await electron.launch({args:['.'],env:{...process.env,PHP_IDE_PROJECT:fixture.root}});
try {
 const page=await app.firstWindow();page.setDefaultTimeout(20000);const errors:string[]=[];page.on('pageerror',e=>errors.push(e.message));
 await page.getByRole('button',{name:'Git',exact:true}).click();
 await page.getByRole('button',{name:'Conta deste repositório…',exact:true}).click();
 await expect(page.locator('#git-account-dialog')).toBeVisible();
 await page.locator('#account-identity').selectOption('local');await page.locator('#account-name').fill('Empresa UI');await page.locator('#account-email').fill('ui@example.invalid');
 await page.locator('#account-auth').selectOption('https');await page.locator('#account-user').fill('empresa-ui');
 await expect(page.locator('#account-test')).toBeDisabled();await page.locator('#account-save').click();
 await expect(page.locator('#account-result')).toContainText('Configuração salva');await expect(page.locator('#account-effective')).toContainText('Empresa UI <ui@example.invalid>');
 expect(execFileSync('git',['-C',fixture.root,'config','--local','credential.username'],{encoding:'utf8'}).trim()).toBe('empresa-ui');
 await page.locator('#account-test').click();await expect(page.locator('#account-result')).toContainText('Leitura do remoto concluída',{timeout:40000});
 await mkdir('.artifacts',{recursive:true});await page.screenshot({path:'.artifacts/git-account.png'});
 await page.locator('#account-close').click();await page.getByRole('button',{name:'Conta deste repositório…',exact:true}).click();
 await expect(page.locator('#account-name')).toHaveValue('Empresa UI');await expect(page.locator('#account-user')).toHaveValue('empresa-ui');
 expect(errors).toEqual([]);console.log('Git account UI: repository identity, HTTPS username, save, remote read and reload passed.');
}finally{await app.close();await rm(fixture.root,{recursive:true,force:true});}
