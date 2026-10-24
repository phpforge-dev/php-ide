import { LaravelPlugin } from './shared/language/plugins/laravel';
declare const ide: { register(plugin: unknown): void };
ide.register(new LaravelPlugin());
