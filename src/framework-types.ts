// Actual MIT-licensed framework declarations; no handwritten substitute framework types.
const files=import.meta.glob<string>([
 '../node_modules/@types/react/**/*.d.ts','../node_modules/@types/react/package.json',
 '../node_modules/csstype/index.d.ts','../node_modules/csstype/package.json',
 '../node_modules/vue/dist/*.d.ts','../node_modules/vue/jsx-runtime/*.d.ts','../node_modules/vue/package.json',
 '../node_modules/@vue/runtime-core/dist/*.d.ts','../node_modules/@vue/runtime-core/package.json',
 '../node_modules/@vue/runtime-dom/dist/*.d.ts','../node_modules/@vue/runtime-dom/package.json',
 '../node_modules/@vue/reactivity/dist/*.d.ts','../node_modules/@vue/reactivity/package.json',
 '../node_modules/@vue/shared/dist/*.d.ts','../node_modules/@vue/shared/package.json',
 '../node_modules/@vue/language-core/types/*.d.ts',
],{query:'?raw',import:'default',eager:true});
export const frameworkTypes:Record<string,string>=Object.fromEntries(Object.entries(files).filter(([path])=>!path.includes('/ts5.0/')&&!/\/(canary|experimental)\.d\.ts$/.test(path)).map(([path,text])=>[path.replace(/^\.\./,''),text]));
// @types packages are resolved through their real package name too.
for(const [path,text]of Object.entries(frameworkTypes))if(path.startsWith('/node_modules/@types/react/'))frameworkTypes[path.replace('/@types/react/','/react/')]=text;
