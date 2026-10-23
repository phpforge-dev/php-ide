import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import { readFile, mkdir } from 'node:fs/promises';
import { chromium } from '@playwright/test';

// Synthetic GitHub responses: never requires a token or publishes anything.
const files = new Set(['index.html', 'style.css', 'downloads.js', 'favicon.svg']);
const server = createServer(async (request, response) => {
  const file = request.url?.split('?')[0].split('/').at(-1) || 'index.html';
  if (!files.has(file)) { response.writeHead(404).end(); return; }
  const types = { html: 'text/html', css: 'text/css', js: 'text/javascript', svg: 'image/svg+xml' };
  response.setHeader('Content-Type', `${types[file.split('.').at(-1)]}; charset=utf-8`);
  response.end(await readFile(new URL(`../website/${file}`, import.meta.url)));
});
await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
const browser = await chromium.launch(process.env.PLAYWRIGHT_CHANNEL ? { channel: process.env.PLAYWRIGHT_CHANNEL } : {});
try {
  const page = await browser.newPage({ viewport: { width: 1440, height: 1080 }, deviceScaleFactor: 1 });
  let repository = null;
  let fail = false;
  let releases = [];
  await page.route('**/config.json', route => route.fulfill({ json: { repository } }));
  await page.route('https://api.github.com/**', route => fail ? route.fulfill({ status: 403, json: {} }) : route.fulfill({ json: releases }));
  const url = `http://127.0.0.1:${server.address().port}/project/`;
  const status = page.locator('#release-status');
  await page.goto(url);
  await assert.doesNotReject(() => status.getByText('Os downloads serão disponibilizados', { exact: false }).waitFor());
  assert.equal(await page.locator('.download-list a').count(), 0);
  await mkdir('.artifacts', { recursive: true });
  await page.screenshot({ path: '.artifacts/pages-preview.png', fullPage: true });
  repository = 'example/php-ide';
  const asset = name => ({ name, browser_download_url: `https://github.com/${repository}/releases/download/v0.2.7/${name}` });
  releases = [{ tag_name: 'v0.2.8-beta', prerelease: true, assets: [asset('future_x64.exe')] }, {
    tag_name: 'v0.2.7', prerelease: false, assets: [asset('PHP.IDE_0.2.7_aarch64.dmg'), asset('PHP.IDE_0.2.7_aarch64.dmg.sha256'),
      asset('PHP.IDE_0.2.7_x64.exe'), asset('PHP.IDE_0.2.7_amd64.deb'), asset('PHP.IDE_0.2.7_x86_64.AppImage'),
      { name: 'unsafe_x64.msi', browser_download_url: 'https://untrusted.example/installer.msi' }],
  }];
  await page.reload();
  await status.getByText('v0.2.7', { exact: false }).waitFor();
  assert.equal(await page.locator('.download-list a').count(), 4);
  assert.match(await page.locator('[data-platform="mac"] .download-list').innerText(), /Apple Silicon/);
  assert.match(await page.locator('[data-platform="linux"] .download-list').innerText(), /x64/);
  assert.equal(await page.locator('a[href*="future"]').count(), 0);
  assert.equal(await page.locator('a[href*="untrusted"]').count(), 0);
  await mkdir('.artifacts', { recursive: true });
  await page.screenshot({ path: '.artifacts/pages-desktop.png', fullPage: true });
  await page.setViewportSize({ width: 390, height: 844 });
  await page.evaluate(() => new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve))));
  assert.equal(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), true);
  await page.screenshot({ path: '.artifacts/pages-mobile.png', fullPage: true });
  releases = [{ tag_name: 'v0.2.8-beta', prerelease: true, assets: [asset('PHP.IDE_arm64.dmg')] }];
  await page.reload();
  await status.getByText('Prévia experimental', { exact: false }).waitFor();
  assert.equal(await page.locator('.pending').count(), 2);
  releases = [];
  await page.reload();
  await status.getByText('A primeira versão ainda não foi publicada.', { exact: false }).waitFor();
  fail = true;
  await page.reload();
  await page.getByRole('button', { name: 'Tentar novamente' }).waitFor();
  assert.equal(await page.locator('[data-releases]').isVisible(), true);
  fail = false;
  await page.getByRole('button', { name: 'Tentar novamente' }).click();
  await status.getByText('A primeira versão ainda não foi publicada.', { exact: false }).waitFor();
  console.log('Pages OK: subdirectory, unconfigured, stable/prerelease, platforms/architectures, absent assets, unsafe URL, API failure/retry, mobile overflow.');
} finally {
  await browser.close();
  server.close();
}
