const basename = (path: string) => path.replaceAll('\\', '/').split('/').pop()!;
export const isBashPath = (path: string) => /\.(?:sh|bash)$/i.test(path) || /^\.(?:bashrc|bash_profile|bash_login|bash_logout|bash_aliases|profile)$/.test(basename(path));
/** Explicit interpreters win over a .sh extension; never classify zsh/fish as Bash. */
export function shellDialect(path: string, text = ''): 'bash' | 'sh' | undefined {
 const first = text.split('\n', 1)[0].replace(/\r$/, '');
 if (first.startsWith('#!')) {
  const match = /^#!\s*\S*\/(bash|sh)(?:\s|$)/.exec(first) ?? /^#!\s*\S*\/env\s+(?:-S\s+)?(bash|sh)(?:\s|$)/.exec(first);
  return match?.[1] as 'bash' | 'sh' | undefined;
 }
 return isBashPath(path) ? basename(path) === '.profile' ? 'sh' : 'bash' : undefined;
}
export const isBashDocument = (path: string, text = '') => shellDialect(path, text) !== undefined;
