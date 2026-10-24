import { DockerPlugin } from './shared/language/plugins/docker';
declare const ide: { register(plugin: unknown): void };
ide.register(new DockerPlugin());
