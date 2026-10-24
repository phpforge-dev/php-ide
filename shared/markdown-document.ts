/** File association only; Markdown behavior is supplied by the installed plugin. */
export const isMarkdownPath=(path:string)=>/\.(md|markdown|mdown|mkd)$/i.test(path);
