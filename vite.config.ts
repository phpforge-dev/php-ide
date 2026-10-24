import { defineConfig } from 'vite';

export default defineConfig({
 base: './',
 server: {
  watch: {ignored: ['**/src-tauri/**', '**/.artifacts/**', '**/.tools/**']},
  host: '127.0.0.1',
  hmr: process.env.PHP_IDE_NATIVE_SMOKE_RUN !== '1',
 },
 optimizeDeps: {include: ['monaco-editor']},
});
