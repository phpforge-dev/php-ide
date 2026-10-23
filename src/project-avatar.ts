import './project-avatar.css';
// Project avatar (recorte 28): colored square with initials, as in the reference project widget and Welcome list.
// Observed rule (01-welcome-dark): first letters of the first and last word ("php-intelligence" → PI,
// "php-ide-git-reference-fs1xyn8b" → PF), one letter for single words, leading digits skipped ("4vet" → V).
export function projectInitials(name:string){
 const words=name.split(/[\s._-]+/).map(word=>word.match(/\p{L}/u)?.[0]??'').filter(Boolean);
 const letters=words.length>1?words[0]+words[words.length-1]:words[0]??name.trim()[0]??'?';
 return letters.toLocaleUpperCase();
}
/** Stable slot 1–9 of RecentProject.ColorN for a name. The product's own assignment is not documented. */
export function projectColor(name:string){let hash=0;for(const char of name)hash=(hash*31+char.codePointAt(0)!)>>>0;return hash%9+1;}
export function paintAvatar(element:HTMLElement,name:string){element.classList.add('project-avatar');element.textContent=projectInitials(name);element.dataset.color=String(projectColor(name));return projectColor(name);}
