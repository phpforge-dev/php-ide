/** File associations shared by the editor and language plugin. */
const basename = (path: string) => path.replaceAll('\\', '/').split('/').pop()!;
export const isDockerfilePath = (path: string) => /^(?:dockerfile(?:[.-].+)?|.+\.dockerfile)$/i.test(basename(path));
export const isYamlPath = (path: string) => /\.ya?ml$/i.test(path);
export const isComposePath = (path: string) => /^(?:docker-)?compose(?:[.-].+)?\.ya?ml$/i.test(basename(path)) || /^composer(?:[.-].+)?\.ya?ml$/i.test(basename(path));
/** Content detection also accepts user-chosen names passed to docker compose -f. */
export const isComposeDocument = (path: string, text = '') => isYamlPath(path) && (isComposePath(path) || (/^(?:services|"services"|'services')\s*:/m.test(text.slice(0, 1024 * 1024)) && /^ {4,}(?:image|build|ports|depends_on|container_name|networks|volumes|command|entrypoint|environment|restart)\s*:/m.test(text.slice(0, 1024 * 1024))));
export const isDockerDocument = (path: string, text = '') => isDockerfilePath(path) || isComposeDocument(path, text);
