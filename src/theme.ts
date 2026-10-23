import './themes.css';
export type ThemePreference='system'|'dark'|'light';
const media=matchMedia('(prefers-color-scheme: dark)');
function saved():ThemePreference{try{const value=JSON.parse(localStorage.getItem('php-ide-appearance')??'{}').theme;return value==='dark'||value==='light'?value:'system';}catch{return 'system';}}
let preference=saved();
export const themePreference=()=>preference;
export const resolvedTheme=()=>'light'===document.documentElement.dataset.theme?'light':'dark';
function apply(){const mode=preference==='system'?(media.matches?'dark':'light'):preference;document.documentElement.dataset.theme=mode;document.documentElement.dataset.themePreference=preference;document.documentElement.style.colorScheme=mode;window.dispatchEvent(new Event('ide-theme-changed'));}
export function setThemePreference(value:ThemePreference){preference=value;try{const settings=JSON.parse(localStorage.getItem('php-ide-appearance')??'{}');localStorage.setItem('php-ide-appearance',JSON.stringify({...settings,theme:value}));}catch{/* Theme remains usable with unavailable storage. */}apply();}
media.addEventListener('change',()=>{if(preference==='system')apply();});
window.addEventListener('storage',event=>{if(event.key==='php-ide-appearance'){preference=saved();apply();}});
apply();
// Editor colors live with the syntax palette (recorte 28); re-exported for existing callers.
export { editorColors } from './editor-theme';
