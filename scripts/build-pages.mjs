import { cp, mkdir, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';

// Only public static files enter the Pages artifact. Never upload the workspace.
const repository = process.env.GITHUB_REPOSITORY || process.env.PAGES_REPOSITORY || null;
if (repository && !/^[\w.-]+\/[\w.-]+$/.test(repository)) throw new Error('Invalid owner/repository');
const destination = resolve('.artifacts/pages');
await mkdir(destination, { recursive: true });
for (const file of ['index.html', 'style.css', 'downloads.js', 'favicon.svg']) {
  await cp(resolve('website', file), resolve(destination, file));
}
await writeFile(resolve(destination, 'config.json'), JSON.stringify({ repository }, null, 2) + '\n');
await writeFile(resolve(destination, '.nojekyll'), '');
console.log(`GitHub Pages: ${destination} (${repository ?? 'preview without repository'})`);
