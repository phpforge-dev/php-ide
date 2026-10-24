import test from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, readFileSync, readdirSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { SymfonyPlugin, defaultRouteName, parseRouteAttributes, parseServices, parseYamlRoutes, referenceAt } from '../.tools/plugin-packages/symfony/src/shared/language/plugins/symfony';
import { LaravelPlugin } from '../.tools/plugin-packages/laravel/src/shared/language/plugins/laravel';
import { PluginHost } from '../shared/language/plugins/host';
import type { ProjectFiles } from '../shared/language/plugins/api';

const root = join(import.meta.dirname, './fixtures/projects/symfony');
const read = (path: string) => readFileSync(join(root, path), 'utf8');
function project(dir: string, extra: Record<string, string> = {}): ProjectFiles {
 const walk = (sub: string): string[] => existsSync(join(dir, sub)) ? readdirSync(join(dir, sub)).flatMap(name => { const p = sub ? `${sub}/${name}` : name; return statSync(join(dir, p)).isDirectory() ? walk(p) : [p]; }) : [];
 return {
  root: dir,
  read: async path => extra[path] ?? (existsSync(join(dir, path)) ? readFileSync(join(dir, path), 'utf8') : null),
  exists: async path => path in extra || existsSync(join(dir, path)),
  list: async (sub, accept) => [...walk(sub), ...Object.keys(extra).filter(p => !sub || p.startsWith(sub + '/'))].filter(p => accept(p.split('/').pop()!)),
  uri: path => `file://${dir}/${path}`,
 };
}
const host = (extra: Record<string, string> = {}) => new PluginHost(project(root, extra), [new LaravelPlugin(), new SymfonyPlugin()]);
const controller = read('src/Controller/BlogController.php');
const at = (text: string, marker: string) => { const i = text.indexOf(marker); assert.ok(i >= 0, marker); return i + marker.length; };
const line = (text: string, marker: string) => text.split('\n').findIndex(l => l.includes(marker));

test('detecção por symfony/framework-bundle com versão do lock', async () => {
 assert.deepEqual(await host().status(), [{ id: 'symfony', name: 'Symfony', version: '7.1' }]);
 assert.deepEqual(await new PluginHost(project(join(import.meta.dirname, './fixtures/projects/laravel-strings')), [new SymfonyPlugin()]).status(), []);
});

test('rotas por atributo: prefixo da classe, métodos, FQCN e nome automático', () => {
 assert.equal(defaultRouteName('App\\Controller\\BlogController', 'list'), 'app_blog_list');
 assert.equal(defaultRouteName('App\\Controller\\Admin\\PostController', 'editAction'), 'app_admin_post_edit');
 const routes = parseRouteAttributes(controller, 'src/Controller/BlogController.php');
 assert.deepEqual(routes.map(r => [r.name, r.path, r.methods, r.line + 1, !!r.generated]), [
  ['blog_index', '/blog', 'GET', line(controller, "name: 'index'") + 1, false],
  ['blog_show', '/blog/{slug}', 'GET|HEAD', line(controller, "name: 'show'") + 1, false],
  ['blog_app_blog_feed', '/blog/feed.xml', 'ANY', line(controller, 'feed.xml') + 1, true],
 ]);
 const two = "<?php\nclass A { #[Route('/a', name: 'a')] function a() {} }\nclass B { #[Route('/b')] function b() {} }";
 assert.deepEqual(parseRouteAttributes(two, 'x.php').map(r => [r.name, r.path]), [['a', '/a'], ['b_b', '/b']], 'prefixo não vaza entre classes');
});

test('rotas YAML: ignora imports, entra em when@env', () => {
 assert.deepEqual(parseYamlRoutes(read('config/routes.yaml'), 'config/routes.yaml').map(r => [r.name, r.path, r.methods, r.line]), [['homepage', '/', 'GET', 6], ['debug_page', '/_debug', 'ANY', 15]]);
});

test('serviços e parâmetros de config/*.yaml', () => {
 const parsed = parseServices(read('config/services.yaml'), 'config/services.yaml');
 assert.deepEqual(parsed.services.map(s => [s.key, s.class ?? null, s.value ?? null]), [['app.mailer', 'App\\Mail\\Mailer', null], ['App\\Service\\Clock', 'App\\Service\\Clock', null], ['app.clock', null, '@App\\Service\\Clock']]);
 assert.deepEqual(parsed.parameters.map(p => [p.key, p.value, p.line]), [['app.upload_dir', '%kernel.project_dir%/public/uploads', 1], ['app.admin_email', 'admin@example.com', 2]]);
});

test('referência digitada: %env()%, %parâmetro% e @serviço', () => {
 assert.deepEqual(referenceAt("'%env(int:PO"), { kind: 'env', word: 'PO' });
 assert.deepEqual(referenceAt("'%kernel.pro"), { kind: 'parameter', word: 'kernel.pro' });
 assert.equal(referenceAt("'%a%/x"), null, 'parâmetro já fechado');
 assert.deepEqual(referenceAt("['@app."), { kind: 'service', word: 'app.' });
 assert.equal(referenceAt('admin@exa'), null, 'e-mail não é serviço');
});

test('PHP: completion e navegação de rotas, templates, parâmetros e Autowire', async () => {
 const h = host();
 const routeSite = at(controller, "redirectToRoute('");
 const routes = await h.complete('src/Controller/BlogController.php', controller, routeSite);
 assert.deepEqual(routes!.items.map(i => i.label), ['blog_app_blog_feed', 'blog_index', 'blog_show', 'debug_page', 'homepage']);
 assert.equal(routes!.items[1].labelDetails?.description, '/blog');
 const target = await h.define('src/Controller/BlogController.php', controller, routeSite + 2);
 assert.deepEqual(target!.map(l => [l.uri.split('/').pop(), l.range.start.line]), [['BlogController.php', line(controller, "name: 'index'")]]);
 const templates = await h.complete('src/Controller/BlogController.php', controller, at(controller, "render('"));
 assert.deepEqual(templates!.items.map(i => i.label), ['base.html.twig', 'blog/index.html.twig']);
 const template = await h.define('src/Controller/BlogController.php', controller, at(controller, "render('blog"));
 assert.deepEqual(template!.map(l => [l.uri.endsWith('templates/blog/index.html.twig'), l.preserveView]), [[true, true]]);
 const params = await h.complete('src/Controller/BlogController.php', controller, at(controller, "getParameter('"));
 assert.deepEqual(params!.items.slice(0, 3).map(i => i.label), ['app.admin_email', 'app.locale', 'app.upload_dir']);
 assert.ok(params!.items.some(i => i.label === 'kernel.project_dir'));
 const param = await h.define('src/Controller/BlogController.php', controller, at(controller, "getParameter('app.up"));
 assert.deepEqual(param!.map(l => [l.uri.split('/').pop(), l.range.start.line]), [['services.yaml', 1]]);
 const env = await h.complete('src/Controller/BlogController.php', controller, at(controller, "Autowire('%env("));
 assert.deepEqual(env!.items.map(i => [i.label, i.labelDetails?.detail]), [['%env(APP_ENV)%', ' = dev'], ['%env(APP_SECRET)%', ' = *****'], ['%env(MAILER_DSN)%', ' = null://null']]);
 const envTarget = await h.define('src/Controller/BlogController.php', controller, at(controller, "Autowire('%env(APP_S"));
 assert.deepEqual(envTarget!.map(l => [l.uri.split('/').pop(), l.range.start.line]), [['.env', 1]]);
 const services = await h.complete('src/Controller/BlogController.php', controller, at(controller, "service: '"));
 assert.deepEqual(services!.items.map(i => i.label), ['app.clock', 'app.mailer', 'App\\Service\\Clock']);
 const service = await h.define('src/Controller/BlogController.php', controller, at(controller, "service: 'app.ma"));
 assert.deepEqual(service!.map(l => [l.uri.split('/').pop(), l.range.start.line]), [['services.yaml', 12]]);
});

test('Twig: path()/url() e extends/include', async () => {
 const h = host(); const twig = read('templates/blog/index.html.twig'); const path = 'templates/blog/index.html.twig';
 const routes = await h.completeCode(path, twig, at(twig, "path('blog_"));
 assert.ok(routes!.items.some(i => i.label === 'blog_show'));
 assert.equal(routes!.items[0].textEdit.range.start.character, twig.split('\n')[2].indexOf("blog_show"));
 const route = await h.defineCode(path, twig, at(twig, "path('blog_s"));
 assert.deepEqual(route!.map(l => l.range.start.line), [line(controller, "name: 'show'")]);
 const includes = await h.completeCode(path, twig, at(twig, "include('"));
 assert.deepEqual(includes!.items.map(i => i.label), ['base.html.twig', 'blog/index.html.twig']);
 const base = await h.defineCode(path, twig, at(twig, "extends 'ba"));
 assert.ok(base![0].uri.endsWith('templates/base.html.twig'));
 assert.equal(await h.completeCode(path, twig, at(twig, '<a href')), null);
});

test('YAML: @serviço, %parâmetro% e %env()% com completion e navegação', async () => {
 const h = host(); const yaml = read('config/services.yaml'); const path = 'config/services.yaml';
 const services = await h.completeCode(path, yaml, at(yaml, "'@app."));
 assert.deepEqual(services!.items.map(i => i.label), ['app.clock', 'app.mailer', 'App\\Service\\Clock']);
 const params = await h.completeCode(path, yaml.replace("'%app.admin_email%'", "'%app.ad"), at(yaml, "'%app.ad"));
 assert.equal(params!.items.find(i => i.label === 'app.admin_email')!.textEdit.newText, 'app.admin_email%');
 const env = await h.completeCode(path, yaml, at(yaml, "'%env(MA"));
 assert.equal(env!.items.find(i => i.label === 'MAILER_DSN')!.textEdit.newText, 'MAILER_DSN', 'não duplica )%');
 const toClass = await h.defineCode(path, yaml, at(yaml, "'@App\\Serv"));
 assert.deepEqual(toClass!.map(l => l.range.start.line), [line(yaml, 'App\\Service\\Clock: ~')]);
 const toParam = await h.defineCode(path, yaml, at(yaml, "'%app.admin"));
 assert.deepEqual(toParam!.map(l => l.range.start.line), [2]);
 const toEnv = await h.defineCode('config/packages/framework.yaml', read('config/packages/framework.yaml'), at(read('config/packages/framework.yaml'), '%env(APP_SE'));
 assert.deepEqual(toEnv!.map(l => [l.uri.split('/').pop(), l.range.start.line]), [['.env', 1]]);
 const kernel = await h.completeCode(path, yaml, at(yaml, "'%kernel."));
 assert.ok(kernel!.items.some(i => i.label === 'kernel.project_dir'));
});

test('cache invalidado por alterações em src/config/templates', async () => {
 const extra: Record<string, string> = {};
 const h = new PluginHost(project(root, extra), [new SymfonyPlugin()]);
 const before = await h.complete('src/Controller/BlogController.php', controller, at(controller, "redirectToRoute('"));
 extra['config/routes/admin.yaml'] = 'admin_home:\n    path: /admin\n';
 h.changed(`${root}/config/routes/admin.yaml`);
 const after = await h.complete('src/Controller/BlogController.php', controller, at(controller, "redirectToRoute('"));
 assert.equal(after!.items.length, before!.items.length + 1);
});
