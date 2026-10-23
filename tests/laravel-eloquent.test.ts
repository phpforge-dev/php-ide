import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile, readdir, stat } from 'node:fs/promises';
import { join, relative, resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { PluginHost } from '../shared/language/plugins/host';
import { LaravelPlugin } from '../shared/language/plugins/laravel';
import { applyMigration, eloquentIndex, plural, tableName, type Column } from '../shared/language/plugins/eloquent';
import type { ProjectFiles } from '../shared/language/plugins/api';

// Recorte 25: Eloquent e inspeções sobre fixtures/laravel-eloquent (sem vendor, nada executado).
const root = resolve('fixtures/laravel-eloquent');
async function walk(dir: string): Promise<string[]> {
 const out: string[] = [];
 for (const name of await readdir(dir).catch(() => [])) { const full = join(dir, name); if ((await stat(full)).isDirectory()) out.push(...await walk(full)); else out.push(relative(root, full)); }
 return out;
}
const files: ProjectFiles = {
 root,
 read: async path => readFile(join(root, path), 'utf8').catch(() => null),
 exists: async path => stat(join(root, path)).then(() => true, () => false),
 list: async (dir, accept) => (await walk(join(root, dir))).filter(p => accept(p.split('/').pop()!)),
 uri: path => pathToFileURL(join(root, path)).href,
};
const host = new PluginHost(files, [new LaravelPlugin()]);
const probe = await readFile(join(root, 'app/probe.php'), 'utf8');
const at = (text: string, needle: string, delta = 0) => { const i = text.indexOf(needle); assert.ok(i >= 0, needle); return i + needle.length + delta; };
const where = (list: any[] | null) => list?.map(l => ({ file: relative(root, fileURLToPath(l.uri)), line: l.range.start.line, character: l.range.start.character })) ?? null;
/** Posição (0-based) do trecho no arquivo do fixture, como destino esperado. */
const loc = async (file: string, needle: string) => { const text = (await files.read(file))!; const i = text.indexOf(needle); assert.ok(i >= 0, needle); const before = text.slice(0, i).split('\n'); return [{ file, line: before.length - 1, character: before.at(-1)!.length }]; };
const users = 'database/migrations/2024_01_01_000000_create_users_table.php'; const posts = 'database/migrations/2024_01_02_000000_create_posts_table.php';
const labels = (r: any) => r?.items.map((i: any) => i.label) ?? null;
const item = (r: any, label: string, kind?: number) => r.items.find((i: any) => i.label === label && (kind === undefined || i.kind === kind));
/** Documento sintético: o cursor fica no fim do trecho (ou no marcador `|`). */
const doc = (source: string) => { const offset = source.indexOf('|'); return { text: source.replace('|', ''), offset: offset < 0 ? source.length : offset }; };
const complete = (path: string, source: string) => { const d = doc(source); return host.complete(path, d.text, d.offset); };

test('nomes de tabela pela convenção (Str::snake + pluralStudly)', () => {
 assert.equal(tableName('User'), 'users');
 assert.equal(tableName('BlogPost'), 'blog_posts');
 assert.equal(tableName('Category'), 'categories');
 assert.equal(tableName('Address'), 'addresses');
 assert.equal(tableName('Person'), 'people');
 assert.equal(plural('day'), 'days');
});

test('migrations: create, table, rename, drop e modificadores', () => {
 const tables = new Map<string, Column[]>();
 applyMigration(tables, `<?php Schema::create('a', function (Blueprint $t) { $t->id(); $t->string('x', 20)->nullable(); $t->morphs('owner'); $t->softDeletes(); $t->foo('ignored'); });`, 'm1.php');
 applyMigration(tables, `<?php Schema::table('a', fn (Blueprint $t) => $t->integer('x')->change());`, 'm2.php');
 applyMigration(tables, `<?php Schema::rename('a', 'b'); Schema::create('c', function ($t) { $t->id(); }); Schema::dropIfExists('c');`, 'm3.php');
 assert.deepEqual([...tables.keys()], ['b']);
 assert.deepEqual(tables.get('b')!.map(c => [c.name, c.type, c.nullable, c.table]), [
  ['id', 'int', false, 'b'], ['x', 'int', false, 'b'], ['owner_id', 'int', false, 'b'], ['owner_type', 'string', false, 'b'], ['deleted_at', '\\Illuminate\\Support\\Carbon', true, 'b'],
 ]);
});

test('índice: modelos, colunas das migrations, casts, accessors, relações e scopes', async () => {
 const index = await eloquentIndex(files);
 const user = index.models.find(m => m.name === 'User')!; const post = index.models.find(m => m.name === 'Post')!;
 assert.deepEqual(index.models.map(m => m.fqn).sort(), ['App\\Models\\Post', 'App\\Models\\User']);
 // `alter_users`: nickname adicionada, options removida, name renomeada para full_name.
 assert.deepEqual(user.columns.map(c => c.name), ['id', 'full_name', 'email', 'email_verified_at', 'active', 'remember_token', 'created_at', 'updated_at', 'nickname']);
 assert.deepEqual(post.columns.map(c => c.name), ['id', 'user_id', 'title', 'body', 'rating', 'published_at', 'created_at', 'updated_at', 'deleted_at']);
 assert.deepEqual([...user.casts], [['email_verified_at', 'datetime'], ['active', 'boolean']], 'casts() de método');
 assert.deepEqual([...post.casts], [['published_at', 'immutable_datetime'], ['rating', 'float']], '$casts de propriedade');
 assert.deepEqual(user.fillable, ['full_name', 'email', 'nickname']);
 assert.deepEqual(user.accessors.map(a => [a.name, a.type]), [['display_name', 'string'], ['initials', 'string']]);
 assert.deepEqual(user.relations.map(r => [r.name, r.kind, r.related, r.many]), [['posts', 'hasMany', 'App\\Models\\Post', true]]);
 assert.deepEqual(post.relations.map(r => [r.name, r.kind, r.related, r.many]), [['author', 'belongsTo', 'App\\Models\\User', false]]);
 assert.deepEqual(user.scopes.map(s => [s.name, s.method]), [['active', 'scopeActive'], ['verified', 'verified']], 'scopeX e #[Scope]');
 assert.deepEqual(post.scopes.map(s => [s.name, s.params]), [['published', 'string $since = null']]);
 assert.equal(post.softDeletes, true);
});

test('completion de membros: instância, estático, Builder, relação e coleção', async () => {
 const php = (code: string) => complete('app/x.php', `<?php\nuse App\\Models\\User;\nuse App\\Models\\Post;\n${code}`);
 const instance = await php('$user = User::find(1);\n$user->');
 const columns = ['id', 'full_name', 'email', 'email_verified_at', 'active', 'remember_token', 'created_at', 'updated_at', 'nickname'];
 assert.deepEqual(labels(instance).slice(0, columns.length), columns, 'colunas primeiro, em ordem de migration');
 assert.equal(item(instance, 'active').labelDetails.description, 'bool', 'cast boolean vence tinyint/boolean da coluna');
 assert.equal(item(instance, 'email_verified_at').labelDetails.description, 'Carbon|null', 'cast datetime + nullable');
 assert.equal(item(instance, 'display_name').labelDetails.description, 'string');
 assert.equal(item(instance, 'posts', 10).labelDetails.description, 'Collection<Post>');
 assert.equal(item(instance, 'posts', 2).textEdit.newText, 'posts()');
 assert.ok(item(instance, 'save') && !item(instance, 'scopeActive') && !item(instance, 'where'), 'sem scopes nem Builder na instância');

 const statics = await php('User::');
 for (const name of ['active', 'verified', 'where', 'find', 'first', 'whereEmail', 'whereFullName', 'query', 'class']) assert.ok(item(statics, name), name);
 assert.ok(!item(statics, 'email'), 'colunas não são membros estáticos');
 assert.equal(item(statics, 'whereEmail').detail, "where('email', …)");

 const prefixed = await php('User::wh');
 assert.ok(prefixed);
 const prefixedEdit = prefixed.items[0].textEdit;
 assert.ok('range' in prefixedEdit);
 assert.equal(prefixedEdit.range.start.character, 'User::'.length, 'substitui só o prefixo');

 const chained = await php("User::verified()->whereEmail('x')->first()->");
 assert.ok(item(chained, 'posts') && item(chained, 'email'), 'scope → dynamic where → first() devolve User');
 const relation = await php('$u = new User;\n$u->posts()->');
 for (const name of ['published', 'create', 'saveMany', 'where', 'first']) assert.ok(item(relation, name), name);
 const many = await php('$u = new User;\n$u->posts->');
 for (const name of ['first', 'filter', 'count']) assert.ok(item(many, name), name);
 const element = await php('$u = new User;\n$u->posts->first()->author->');
 assert.ok(item(element, 'nickname'), 'coleção → modelo → belongsTo');
 const loop = await php('foreach (Post::where(\'title\', 1)->get() as $post) {\n $post->');
 assert.ok(item(loop, 'rating'), 'foreach sobre get()');
 assert.equal(item(loop, 'rating').labelDetails.description, 'float');
 assert.equal(item(loop, 'published_at').labelDetails.description, 'CarbonImmutable|null');
 const param = await php('function f(?User $u) { return $u?->');
 assert.ok(item(param, 'email'), 'parâmetro tipado nullable e ?->');
 const doc = await php('/** @var Post[] $posts */\n$posts[0]->');
 assert.ok(item(doc, 'title'), '@var array e índice');
 const self = await complete('app/Models/User.php', (await files.read('app/Models/User.php'))!.replace("$query->where('active', true);", '$this->|'));
 assert.ok(item(self, 'getDisplayNameAttribute') && item(self, 'email'), '$this no modelo inclui métodos não públicos');
 const scopeBody = await complete('app/Models/User.php', (await files.read('app/Models/User.php'))!.replace("$query->where('active', true);", '$query->|'));
 assert.ok(item(scopeBody, 'verified'), 'Builder $query no scope é Builder do modelo');

 // Fora de Eloquent: o plugin não responde e o Phpactor segue.
 assert.equal(await php('$x = new DateTime;\n$x->'), null);
 assert.equal(await php('Foo::'), null);
 assert.equal(await php('$nothing->'), null);
});

test('completion em Blade: variável da view tipada pelo controller', async () => {
 const view = 'resources/views/users/show.blade.php';
 const r = await complete(view, '<h1>{{ $user->| }}</h1>');
 assert.ok(item(r, 'full_name') && item(r, 'posts'), JSON.stringify(labels(r)));
});

test('navegação: coluna → migration, relação, accessor, scope e where dinâmico', async () => {
 const define = async (text: string, needle: string, delta = -1, path = 'app/probe.php') => where(await host.define(path, text, at(text, needle, delta)));
 assert.deepEqual(await define(probe, '$user->email'), await loc(users, "'email'"));
 assert.deepEqual(await define(probe, '->first()->posts'), await loc('app/Models/User.php', 'posts(): HasMany'));
 assert.deepEqual(await define(probe, 'User::verified'), await loc('app/Models/User.php', 'verified('), '#[Scope]');
 assert.deepEqual(await define(probe, '->whereEmail'), await loc(users, "'email'"));
 const controller = (await files.read('app/Http/Controllers/UserController.php'))!;
 const ctl = (needle: string, delta = -1) => define(controller, needle, delta, 'app/Http/Controllers/UserController.php');
 assert.deepEqual(await ctl('->published'), await loc('app/Models/Post.php', 'scopePublished'), 'scopeX via relação');
 assert.deepEqual(await ctl('$post->author'), await loc('app/Models/Post.php', 'author()'));
 assert.deepEqual(await ctl('->author->email'), await loc(users, "'email'"));
 assert.deepEqual(await ctl('$first->posts'), await loc('app/Models/User.php', 'posts(): HasMany'), 'variável de cadeia com scope estático');
 assert.deepEqual(await ctl("->orderBy('published_at", -2), await loc(posts, "'published_at'"), 'string de coluna em orderBy');
 const renamed = `<?php use App\\Models\\User; $u = User::first(); $u->full_name; $u->initials;`;
 assert.deepEqual(await define(renamed, '->full_name'), await loc('database/migrations/2024_02_01_000000_alter_users_table.php', "'full_name'"), 'coluna renomeada aponta para renameColumn');
 assert.deepEqual(await define(renamed, '->initials'), await loc('app/Models/User.php', 'initials()'), 'Attribute::make');
 assert.deepEqual(await define(probe, "with('posts", -2), await loc('app/Models/User.php', 'posts(): HasMany'), 'string de relação em with()');
 assert.deepEqual(await define(probe, "pluck('body", -2), await loc(posts, "'body'"));
 // Método comum sem destino Eloquent: fica para o Phpactor.
 assert.equal(await host.define('app/probe.php', probe, at(probe, 'User::find', -1)), null);
});

test('strings de coluna e relação: completion em where/orderBy/pluck/with', async () => {
 const php = (code: string) => complete('app/x.php', `<?php\nuse App\\Models\\User;\nuse App\\Models\\Post;\n${code}`);
 assert.deepEqual(labels(await php("Post::where('|')")), ['id', 'user_id', 'title', 'body', 'rating', 'published_at', 'created_at', 'updated_at', 'deleted_at']);
 assert.equal(item(await php("Post::query()->orderBy('|')"), 'rating').labelDetails.description, 'float');
 assert.ok(item(await php("User::active()->pluck('|')"), 'email'));
 assert.ok(item(await php("User::whereColumn('created_at', '|')"), 'updated_at'), 'segundo argumento de whereColumn');
 assert.deepEqual(labels(await php("User::with('|')")), ['posts']);
 assert.deepEqual(labels(await php("User::with('posts.|')")), ['posts.author'], 'relação aninhada');
 assert.equal(await php("User::where('x', '|')"), null, 'valor não é coluna');
 assert.equal(await php("collect()->where('|')"), null);
});

test('hover: coluna, accessor, relação, scope e strings', async () => {
 const hover = async (text: string, needle: string, delta = -1) => (await host.hover('app/probe.php', text, at(text, needle, delta)))?.contents ?? null;
 const email = await hover(probe, '$user->email');
 assert.match(email!, /```php\nstring \$email\n```/);
 assert.match(email!, /Coluna `users.email` de User · fillable/);
 assert.match(email!, /2024_01_01_000000_create_users_table.php:14/);
 assert.match((await hover(probe, 'User::verified'))!, /Local scope User::verified\(\)/);
 assert.match((await hover(probe, "orderBy('rating", -2))!, /float \$rating[\s\S]*cast `float`/);
 const renamed = `<?php use App\\Models\\User; $u = User::first(); $u->posts; $u->display_name;`;
 assert.match((await hover(renamed, '->posts'))!, /Collection<Post> \$posts[\s\S]*Relação hasMany/);
 assert.match((await hover(renamed, '->display_name'))!, /string \$display_name[\s\S]*getDisplayNameAttribute/);
 assert.match((await hover(probe, "route('users.show", -2))!, /Rota `users.show` · GET `\/users\/\{user\}`/);
 assert.match((await hover(probe, "config('app.name", -2))!, /Config `app.name` = `Fixture`/);
 assert.match((await hover(probe, "__('messages.welcome", -2))!, /\*\*en\*\*: Welcome\n\n\*\*pt_BR\*\*: Bem-vindo/);
 assert.equal(await hover(probe, 'User::find'), null);
});

test('inspeções: rota, view, config, tradução, coluna e relação inexistentes', async () => {
 const list = await host.diagnose('app/probe.php', probe) as any[];
 const found = list.map(d => [d.code, probe.split('\n')[d.range.start.line].slice(d.range.start.character, d.range.end.character), d.fixes?.map((f: any) => f.title) ?? []]);
 assert.deepEqual(found, [
  ['laravel.route.missing', 'users.missing', []],
  ['laravel.view.missing', 'users.edit', ['Criar resources/views/users/edit.blade.php']],
  ['laravel.config.missing', 'app.missing', []],
  ['laravel.translation.missing', 'messages.goodbye', ["Adicionar 'goodbye' em lang/en/messages.php"]],
  ['laravel.column.missing', 'emial', ["Trocar por 'email'"]],
  ['laravel.relation.missing', 'postz', ["Trocar por 'posts'"]],
 ], 'pacote (vendor::mail), config de pacote (cache.default), texto livre e coluna qualificada não são apontados');
 const view = list.find(d => d.code === 'laravel.view.missing').fixes[0];
 assert.equal(relative(root, fileURLToPath(view.create.uri)), 'resources/views/users/edit.blade.php');
 const column = list.find(d => d.code === 'laravel.column.missing');
 assert.match(column.message, /Coluna 'emial' não existe na tabela 'users' \(User\)/);
 assert.deepEqual(column.fixes[0].edits[0].range, column.range);
 // Correção de tradução: inserção antes do `]` final, com vírgula se faltar.
 const add = (await host.diagnose('app/probe.php', "<?php __('messages.goodbye');") as any[])[0].fixes[0].edits[0];
 assert.equal(add.newText, "\n    'goodbye' => '',");
 assert.deepEqual(add.range.start, { line: 3, character: 27 });
 const ptBR = await host.diagnose('app/probe.php', "<?php __('messages.welcome'); route('users.show'); view('users.show'); config('app.locale');");
 assert.deepEqual(ptBR, [], 'referências existentes não geram problema');
 const dynamic = await host.diagnose('app/probe.php', `<?php route('users.' . $x); view("users.$x"); User::where($col, 1);`);
 assert.deepEqual(dynamic, [], 'strings dinâmicas ficam fora');
 const blade = await host.diagnose('resources/views/users/show.blade.php', `@include('users.nope')\n{{ route('missing') }}\n<p>{{ __('Texto') }}</p>`) as any[];
 assert.deepEqual(blade.map(d => [d.code, d.range.start.line]), [['laravel.view.missing', 0], ['laravel.route.missing', 1]]);
});
