import { aliasAt, analyze, codeOnly } from '../shared/language/php-source';

/** Declaration names lead to usages; names at use sites lead to definitions. */
export function isPhpDeclaration(text: string, nameOffset: number): boolean {
 if (analyze(text).declarations.some(d => d.offset === nameOffset)) return true;
 // `use A\B as C`: o alias é uma declaração própria (⌘B nele mostra os usos do alias).
 if (aliasAt(text, nameOffset)?.declaration) return true;
 // Mask comments and literals, retaining offsets and newlines. This also handles
 // a declaration keyword and name on separate lines, or comments between them.
 const prefix = codeOnly(text).slice(0, nameOffset);
 return /\b(?:function\s*&?\s*|const\s+)$/i.test(prefix);
}
