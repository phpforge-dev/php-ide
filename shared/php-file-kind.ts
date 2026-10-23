import { analyze, type Declaration } from './language/php-source';

/** File icons describe declarations, never guesses based on suffixes such as *Interface.php. */
export function phpFileKind(path: string, text: string): Declaration['kind'] | undefined {
 if (!/\.php$/i.test(path) || /\.blade\.php$/i.test(path)) return;
 const declarations = analyze(text).declarations;
 const name = path.replaceAll('\\', '/').split('/').pop()!.slice(0, -4);
 const matching = declarations.filter(d => d.name.toLowerCase() === name.toLowerCase());
 return matching.length === 1 ? matching[0].kind : declarations.length === 1 ? declarations[0].kind : undefined;
}
