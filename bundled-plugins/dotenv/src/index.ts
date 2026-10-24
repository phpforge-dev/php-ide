import { DotenvPlugin } from './shared/language/plugins/dotenv';
declare const ide: { register(plugin: unknown): void };
ide.register(new DotenvPlugin());
