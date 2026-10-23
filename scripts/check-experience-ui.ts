import { _electron as electron, expect } from '@playwright/test';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { randomUUID } from 'node:crypto';
import { mkdir } from 'node:fs/promises';
import { inspectConnection } from '../electron/database';

const exec = promisify(execFile);
const name = `php-ide-experience-${randomUUID()}`;
let app: Awaited<ReturnType<typeof electron.launch>> | undefined;
try {
  await exec('docker', ['run','--rm','-d','--name',name,'-p','127.0.0.1::5432','-e','POSTGRES_PASSWORD=fixture','-e','POSTGRES_DB=fixture','postgres:16']);
  const port = Number((await exec('docker',['port',name,'5432'])).stdout.trim().split(':').at(-1));
  let ready = false;
  for(let i=0;i<40;i++) { try { await inspectConnection({driver:'postgres',host:'127.0.0.1',port,database:'fixture',user:'postgres',password:'fixture',tls:false}); ready=true;break; } catch { await new Promise(r=>setTimeout(r,500)); } }
  expect(ready).toBe(true);
  await exec('docker',['exec',name,'psql','-U','postgres','-d','fixture','-c',"CREATE TABLE customers (id INTEGER PRIMARY KEY, name TEXT, email TEXT); INSERT INTO customers SELECT i, 'Cliente ' || i, CASE WHEN i=1 THEN NULL ELSE 'cliente' || i || '@example.invalid' END FROM generate_series(1,55) i;"]);
  app = await electron.launch({args:['.']}); const page = await app.firstWindow(); page.setDefaultTimeout(20_000);
  const errors: string[] = []; page.on('pageerror', e=>errors.push(e.message));
  const prior = await page.evaluate(()=>localStorage.getItem('php-ide-appearance'));
  try {
    await expect(page.locator('main')).toHaveClass(/right-hidden/);
    await page.keyboard.press('Alt+1'); await expect(page.locator('#tree')).toBeHidden();
    await page.keyboard.press('Alt+1'); await expect(page.locator('#tree')).toBeVisible();
    await page.getByRole('button',{name:'Aparência',exact:true}).click(); await page.getByRole('button',{name:'Restaurar padrão',exact:true}).click(); await page.getByRole('button',{name:'Concluir',exact:true}).click();
    await page.locator('#tree').getByRole('button',{name:'probe.php',exact:true}).click();
    async function clickSymbol(modifier: 'Meta'|'Control') {
      const line = page.locator('#editor .view-line').filter({hasText:'$user->label();'}).first();
      await line.evaluate(() => new Promise<void>(resolve => requestAnimationFrame(() => requestAnimationFrame(() => resolve()))));
      const point = await line.evaluate(element=>{
        const walker=document.createTreeWalker(element,NodeFilter.SHOW_TEXT); let node: Node|null;
        while((node=walker.nextNode())) { const text=node.textContent??''; const i=text.indexOf('label'); if(i>=0){ const range=document.createRange();range.setStart(node,i);range.setEnd(node,i+5);const r=range.getBoundingClientRect();return {x:r.x+r.width/2,y:r.y+r.height/2}; } }
        throw new Error('Symbol label not rendered');
      });
      await page.keyboard.down(modifier); await page.mouse.click(point.x,point.y); await page.keyboard.up(modifier);
    }
    console.log('navigation start');
    await clickSymbol(process.platform==='darwin'?'Meta':'Control');
    try { await expect(page.locator('#tabs .active')).toContainText('User.php',{timeout:120_000}); } catch(error) { console.log('navigation status', await page.locator('#status').textContent(), errors); await mkdir('.artifacts',{recursive:true}); await page.screenshot({path:'.artifacts/navigation-failure.png'}); throw error; }
    console.log('definition opened');
    await page.locator('#nav-back').click(); await expect(page.locator('#tabs .active')).toContainText('probe.php'); await expect(page.locator('#cursor-position')).toContainText('Ln 8,');
    await page.locator('#nav-forward').click(); await expect(page.locator('#tabs .active')).toContainText('User.php');
    await page.locator('#nav-back').click();
    if(process.platform==='darwin') { await clickSymbol('Control'); await expect(page.locator('#tabs .active')).toContainText('User.php',{timeout:30_000}); await page.locator('#nav-back').click(); }
    await page.getByRole('button',{name:'Fechar src/User.php',exact:true}).click();
    await expect(page.locator('#tabs')).not.toContainText('User.php');
    console.log('navigation passed');
    await page.getByRole('button',{name:'Bancos',exact:true}).click();
    await page.locator('#db [name=host]').fill('127.0.0.1'); await page.locator('#db [name=port]').fill(String(port)); await page.locator('#db [name=database]').fill('fixture'); await page.locator('#db [name=user]').fill('postgres'); await page.locator('#db [name=password]').fill('fixture');
    await page.getByRole('button',{name:'Conectar e explorar',exact:true}).click(); await expect(page.locator('#db-result')).toContainText('Conectado.');
    await expect(page.locator('#db [name=password]')).toHaveValue('');
    await page.locator('#db-sources summary').filter({hasText:'public'}).click(); await page.getByRole('button',{name:'customers',exact:true}).click();
    await expect(page.locator('#data-grid')).toContainText('Cliente 1'); await expect(page.locator('#data-grid')).toContainText('NULL');
    await page.getByRole('button',{name:'Próxima',exact:true}).click(); await expect(page.locator('#data-range')).toHaveText('51–55');
    await page.getByRole('button',{name:'Estrutura',exact:true}).click(); await expect(page.locator('#data-grid')).toContainText('PK'); await expect(page.locator('#data-grid')).toContainText('integer');
    await page.getByRole('button',{name:'Dados',exact:true}).click();
    await page.getByRole('button',{name:'Aparência',exact:true}).click(); await page.locator('#appearance-theme').selectOption('light');
    await expect(page.locator('html')).toHaveAttribute('data-theme','light'); await page.locator('#appearance-font').fill('16');
    await expect(page.locator('#appearance-font-value')).toHaveText('16 px'); await page.getByRole('button',{name:'Concluir',exact:true}).click();
    await page.getByRole('separator',{name:'Largura do projeto'}).focus(); await page.keyboard.press('ArrowRight');
    await mkdir('.artifacts',{recursive:true}); await page.screenshot({path:'.artifacts/experience-light.png'});
    await page.getByRole('button',{name:'Aparência',exact:true}).click(); await page.locator('#appearance-theme').selectOption('dark'); await page.getByRole('button',{name:'Concluir',exact:true}).click();
    await page.screenshot({path:'.artifacts/experience-dark.png'});
    await page.getByRole('button',{name:'Bancos',exact:true}).click(); await expect(page.locator('#db')).toBeHidden();
    await page.getByRole('button',{name:'Bancos',exact:true}).click(); await expect(page.locator('#db')).toBeVisible();
    await page.setViewportSize({width:1000,height:700});
    expect(await page.evaluate(()=>document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
    await page.screenshot({path:'.artifacts/workbench-compact.png'});
    expect(errors).toEqual([]);
    console.log('Experience UI: modifier-click, back/forward, close tab, database tree/grid/pagination/metadata, theme/font and keyboard resize passed.');
  } catch (error) { console.log('UI failure', await page.locator('#db-sources').innerText(), await page.locator('#db-result').innerText()); await mkdir('.artifacts',{recursive:true}); await page.screenshot({path:'.artifacts/experience-failure.png'}); throw error; } finally {
    await page.evaluate(value=>{if(value===null)localStorage.removeItem('php-ide-appearance');else localStorage.setItem('php-ide-appearance',value);},prior);
  }
} finally { await app?.close(); await exec('docker',['rm','-f',name]).catch(()=>{}); }
