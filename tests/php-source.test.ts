import test from 'node:test';
import assert from 'node:assert/strict';
import { analyze, literalAt, codeOnly } from '../shared/language/php-source';
import { classContext, classInsertion, signature } from '../.tools/plugin-packages/php-intelligence/src/shared/language/php-completion';

test('literal sob o cursor ignora comentários, heredoc e interpolação', () => {
 const text = "<?php\n// 'comentario'\n$a = 'src/User.php'; $b = \"x{$y}\"; $c = <<<EOT\n'dentro'\nEOT;\n$d = 'it\\'s';";
 assert.equal(literalAt(text, text.indexOf('User'))?.value, 'src/User.php');
 assert.equal(literalAt(text, text.indexOf('comentario')), null);
 assert.equal(literalAt(text, text.indexOf('x{')), null);
 assert.equal(literalAt(text, text.indexOf('dentro')), null);
 assert.equal(literalAt(text, text.indexOf("it\\'s") + 1)?.value, "it's");
 assert.equal(literalAt(text, text.indexOf('$a')), null);
 assert.equal(codeOnly("<?php $a = 'x'; # c\n").length, "<?php $a = 'x'; # c\n".length);
});

test('declarações, namespaces e imports', () => {
 const text = `<?php
namespace App\\Models;
use Fixture\\User as Person, Other\\Thing;
use Group\\{First, Second as Two};
use function strlen;
#[Attr]
final class Order extends Base { use HasId; public function x() { return Order::class; } }
interface Shape {}
trait Mixin {}
enum Status: string { case A = 'a'; }
$x = new class {};
$enum = 'enum Fake {}';`;
 const c = analyze(text);
 assert.deepEqual(c.declarations.map(d => [d.kind, d.fqn]), [['class', 'App\\Models\\Order'], ['interface', 'App\\Models\\Shape'], ['trait', 'App\\Models\\Mixin'], ['enum', 'App\\Models\\Status']]);
 assert.deepEqual(c.imports.map(i => [i.alias, i.fqn]), [['Person', 'Fixture\\User'], ['Thing', 'Other\\Thing'], ['First', 'Group\\First'], ['Two', 'Group\\Second']]);
 assert.deepEqual(c.namespaces.map(n => n.name), ['App\\Models']);
 assert.equal(text.slice(c.imports[0].offset, c.imports[0].end), 'use Fixture\\User as Person, Other\\Thing;');
});

test('contexto de nome de classe', () => {
 assert.equal(classContext('<?php $x = new Us'), 'Us');
 assert.equal(classContext('<?php $x = new '), '');
 assert.equal(classContext('<?php class A extends B'), 'B');
 assert.equal(classContext('<?php class A implements X, Y'), 'Y');
 assert.equal(classContext('<?php try {} catch (A | B'), 'B');
 assert.equal(classContext('<?php $x instanceof U'), 'U');
 assert.equal(classContext('<?php $user->la'), null);
 assert.equal(classContext("<?php $s = 'new Us"), null);
 assert.equal(classContext('<?php new \\App\\Us'), null);
});

test('assinatura do item de completion', () => {
 assert.deepEqual(signature('pub label(): string'), { params: '', returns: 'string' });
 assert.deepEqual(signature('pub with(array $a = [], ?callable $f = null): static'), { params: 'array $a = [], ?callable $f = null', returns: 'static' });
 assert.deepEqual(signature('pub $name: string'), { params: null, returns: 'string' });
 assert.deepEqual(signature(undefined), { params: null, returns: null });
});

test('inserção de classe: mesmo namespace, alias, use novo, conflito e global', () => {
 const none = () => false;
 const ns = "<?php\n\nnamespace Fixture;\n\nuse Fixture\\User as Person;\n\n$x = new U";
 const at = ns.length;
 assert.deepEqual(classInsertion(ns, at, 'Fixture\\Unrelated', analyze(ns), none), { insert: 'Unrelated' });
 assert.deepEqual(classInsertion(ns, at, 'Fixture\\User', analyze(ns), none), { insert: 'Person' });
 const added = classInsertion(ns, at, 'Vendor\\Lib\\Url', analyze(ns), none);
 assert.equal(added.insert, 'Url');
 assert.deepEqual(added.edit, { range: { start: { line: 4, character: 27 }, end: { line: 4, character: 27 } }, newText: '\nuse Vendor\\Lib\\Url;' });
 assert.deepEqual(classInsertion(ns, at, 'Vendor\\Person', analyze(ns), none), { insert: '\\Vendor\\Person' });
 assert.deepEqual(classInsertion(ns, at, 'Vendor\\Unrelated', analyze(ns), name => name === 'Fixture\\Unrelated'), { insert: '\\Vendor\\Unrelated' });
 assert.deepEqual(classInsertion(ns, at, 'DateTime', analyze(ns), none), { insert: '\\DateTime' });
 const plain = "<?php\nnamespace App;\n$x = new U";
 assert.deepEqual(classInsertion(plain, plain.length, 'Lib\\Url', analyze(plain), none).edit?.newText, '\n\nuse Lib\\Url;');
 const global = '<?php\n$x = new D';
 assert.deepEqual(classInsertion(global, global.length, 'DateTime', analyze(global), none), { insert: 'DateTime' });
});
