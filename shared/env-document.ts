/** File association only; environment parsing and masking belong to language plugins. */
export const isEnvPath = (path: string) => /(^|\/)\.env(?:\.[\w.-]+)?$/.test(path);
