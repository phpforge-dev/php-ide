import * as monaco from 'monaco-editor';

/** Editor syntax only: never evaluates environment values or runs Laravel. */
export function registerDotenvLanguage() {
 monaco.languages.register({ id: 'dotenv', aliases: ['DotEnv', '.env'], filenames: ['.env'], filenamePatterns: ['.env.*'] });
 monaco.languages.setLanguageConfiguration('dotenv', { comments: { lineComment: '#' }, brackets: [['{', '}']], autoClosingPairs: [{ open: '"', close: '"' }, { open: "'", close: "'" }, { open: '{', close: '}' }] });
 monaco.languages.setMonarchTokensProvider('dotenv', { tokenizer: {
  root: [
   [/^\s*#.*/, 'comment'],
   [/^(\s*)(export)(\s+)/, ['', 'keyword', '']],
   [/([A-Za-z_][\w.]*)(\s*)(=)/, ['variable', '', { token: 'delimiter', next: '@value' }]],
   [/\s+/, ''], [/./, '']
  ],
  value: [
   [/^/, { token: '@rematch', next: '@popall' }],
   [/\s+#.*$/, 'comment', '@pop'], [/^#.*$/, 'comment', '@pop'],
   [/"/, 'string.quote', '@double'], [/'/, 'string.quote', '@single'],
   [/\$\{[A-Za-z_][\w]*\}/, 'type.identifier'],
   [/\b(?:true|false|null|empty)\b/, 'keyword'], [/\b\d+(?:\.\d+)?\b/, 'number'],
   [/[^"'$\s]+/, 'string'],
   [/\s+$/, '', '@pop'], [/\s+/, ''], [/$/, '', '@pop'], [/./, 'string']
  ],
  double: [[/\\./, 'string.escape'], [/\$\{[A-Za-z_][\w]*\}/, 'type.identifier'], [/"/, 'string.quote', '@pop'], [/[^"\\$]+/, 'string'], [/./, 'string']],
  single: [[/'/, 'string.quote', '@pop'], [/[^']+/, 'string']]
 } });
}
