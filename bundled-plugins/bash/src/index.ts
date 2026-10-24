import { BashPlugin } from './shared/language/plugins/bash';
declare const ide: { register(plugin: unknown): void };
ide.register(new BashPlugin());
