import { build } from 'esbuild';
await build({ entryPoints: ['electron/main.ts', 'electron/preload.ts'], bundle: true,
  platform: 'node', format: 'cjs', outdir: 'dist-electron', outExtension: { '.js': '.cjs' },
  packages: 'external', sourcemap: true });
