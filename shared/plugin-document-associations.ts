/** Host file associations only. All completion/navigation behavior is supplied by plugins. */
export const isIgnorePath = (path: string) => /(^|\/)\.[\w-]*ignore$/.test(path) || /(^|\/)\.git\/info\/exclude$/.test(path);
export const isPluginDocument = (path: string) => path === 'composer.json' || (path.startsWith('templates/') && path.endsWith('.twig')) || (path.startsWith('config/') && /\.ya?ml$/.test(path));
