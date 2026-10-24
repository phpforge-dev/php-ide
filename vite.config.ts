import { defineConfig } from 'vite';
import {fileURLToPath} from 'node:url';
// php-parser uses process.arch only to select PHP integer bounds; browser builds target 64-bit PHP.
// Replace that constant at build time without introducing a process object in the renderer.
export default defineConfig({base:'./',define:{'process.arch':JSON.stringify('x64')},resolve:{alias:['beautify/beautify-html.js','utils/strings.js'].map(path=>({
 // Vue's formatter imports the UMD entries explicitly; use their published browser ESM equivalents.
 find:'vscode-html-languageservice/lib/umd/'+path,replacement:fileURLToPath(new URL('./node_modules/vscode-html-languageservice/lib/esm/'+path,import.meta.url)),
}))},server:{watch:{ignored:['**/src-tauri/**','**/.artifacts/**','**/.tools/**']},host:'127.0.0.1',hmr:process.env.PHP_IDE_NATIVE_SMOKE_RUN!=='1'},optimizeDeps:{include:[
 'yaml','monaco-editor','@volar/monaco','@volar/monaco/worker','@volar/language-service/lib/types',
 '@vue/language-core','@vue/language-service','volar-service-typescript','typescript','vscode-uri',
 ...['getComponentNames','getComponentProps','getComponentSlots','getComponentDirectives','getElementAttrs','getElementNames','resolveModuleName','getImportPathForFile','isRefAtPosition'].map(name=>'@vue/typescript-plugin/lib/requests/'+name),
]}});
