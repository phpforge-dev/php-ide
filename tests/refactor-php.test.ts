import { test } from 'node:test';
import assert from 'node:assert/strict';
import { applyEdits, classIndex, moveClass, importFixes, completionImport, extractMethod, extractVariable, inlineVariable, inspect, suppressed, suppressEdit, model, classAt, type FileText } from '../.tools/plugin-packages/php-intelligence/src/refactor-php';

const user = `<?php

namespace App\\Model;

/** Usuário. */
class User
{
    public static function make(): self { return new self(); }
}
`;
const service = `<?php

namespace App;

use App\\Model\\User;
use Other\\User as OtherUser;

class Service
{
    /** @param User $u @return User|null */
    public function run(User $u, OtherUser $o): ?User
    {
        $x = new User();
        $y = User::make();
        $z = new \\App\\Model\\User();
        $name = 'App\\Model\\User';
        if ($x instanceof User) {}
        return $u;
    }
}
`;
const sameNs = `<?php
namespace App\\Model;

class Profile extends User implements \\JsonSerializable
{
    private ?User $owner = null;
    public function jsonSerialize(): mixed { return [User::class]; }
}
`;
const homonym = `<?php
namespace Other;

class User {}
function make(): User { return new User(); }
`;
const aliased = `<?php
namespace App\\Http;

use App\\Model\\User as Member;
use App\\Model;

final class Controller
{
    public function show(Member $m): Model\\User { return $m; }
}
`;
const files: FileText[] = [
 { path: 'src/Model/User.php', text: user }, { path: 'src/Service.php', text: service }, { path: 'src/Model/Profile.php', text: sameNs },
 { path: 'other/User.php', text: homonym }, { path: 'src/Http/Controller.php', text: aliased },
];
const index = classIndex(files);
const after = (plan: ReturnType<typeof moveClass>, path: string) => plan.changes.find(c => c.path === path)?.after;

test('rename de classe: declaração, use, tipos, new, ::, instanceof, FQN, PHPDoc e homônimo preservado', () => {
 const plan = moveClass(files, index, 'App\\Model\\User', 'App\\Model\\Account');
 assert.deepEqual(plan.conflicts, []);
 assert.match(after(plan, 'src/Model/User.php')!, /class Account\n/);
 assert.match(after(plan, 'src/Model/User.php')!, /: self \{ return new self\(\); \}/);
 const s = after(plan, 'src/Service.php')!;
 assert.match(s, /use App\\Model\\Account;\nuse Other\\User as OtherUser;/);
 assert.match(s, /run\(Account \$u, OtherUser \$o\): \?Account/);
 assert.match(s, /new Account\(\);\n\s+\$y = Account::make\(\);\n\s+\$z = new \\App\\Model\\Account\(\);/);
 assert.match(s, /\$x instanceof Account/);
 assert.match(s, /@param Account \$u @return Account\|null/);
 assert.match(s, /'App\\Model\\User'/, 'strings só mudam com a opção explícita');
 const p = after(plan, 'src/Model/Profile.php')!;
 assert.match(p, /extends Account implements \\JsonSerializable/); assert.match(p, /private \?Account \$owner/); assert.match(p, /\[Account::class\]/);
 assert.equal(after(plan, 'other/User.php'), undefined, 'homônimo Other\\User preservado');
 const c = after(plan, 'src/Http/Controller.php')!;
 assert.match(c, /use App\\Model\\Account as Member;/); assert.match(c, /show\(Member \$m\): Model\\Account|show\(Member \$m\): \\App\\Model\\Account/);
});

test('rename com opção de strings e comentários troca o FQN literal', () => {
 const plan = moveClass(files, index, 'App\\Model\\User', 'App\\Model\\Account', { strings: true });
 assert.match(after(plan, 'src/Service.php')!, /'App\\Model\\Account'/);
});

test('rename recusa nome existente e nome inválido; conflito de import usa alias', () => {
 assert.ok(moveClass(files, index, 'App\\Model\\User', 'App\\Model\\Profile').conflicts.length);
 assert.ok(moveClass(files, index, 'App\\Model\\User', 'App\\Model\\class').conflicts.length);
 const clash = moveClass(files, index, 'App\\Model\\User', 'App\\Model\\OtherUser');
 const s = after(clash, 'src/Service.php')!;
 assert.match(s, /use App\\Model\\OtherUser as User;/); assert.match(s, /run\(User \$u, OtherUser \$o\)/); assert.ok(clash.warnings.length);
});

test('mover classe para outro namespace atualiza namespace, imports e usos curtos', () => {
 const plan = moveClass(files, index, 'App\\Model\\User', 'App\\Domain\\User');
 const moved = after(plan, 'src/Model/User.php')!; assert.match(moved, /namespace App\\Domain;/);
 const p = after(plan, 'src/Model/Profile.php')!; assert.match(p, /use App\\Domain\\User;/); assert.match(p, /extends User implements/);
 assert.match(after(plan, 'src/Service.php')!, /use App\\Domain\\User;/);
 assert.match(after(plan, 'src/Service.php')!, /new \\App\\Domain\\User\(\)/);
});

test('autoimport: não duplica use, conflito oferece alias e mesmo namespace não importa', () => {
 const text = `<?php\nnamespace App;\n\nuse App\\Model\\User;\n\nnew `; const at = text.length;
 assert.deepEqual(completionImport(text, at, 'App\\Model\\User'), { insert: 'User', edits: [], qualified: '\\App\\Model\\User' });
 const fresh = completionImport(text, at, 'App\\Support\\Collection'); assert.equal(fresh.insert, 'Collection');
 assert.equal(applyEdits(text, fresh.edits), `<?php\nnamespace App;\n\nuse App\\Model\\User;\nuse App\\Support\\Collection;\n\nnew `);
 const clash = completionImport(text, at, 'Other\\User'); assert.equal(clash.alias, 'OtherUser'); assert.match(applyEdits(text, clash.edits), /use Other\\User as OtherUser;/);
 assert.deepEqual(completionImport(text, at, 'App\\Thing').edits, []);
 const bare = `<?php\n\ndeclare(strict_types=1);\n\nfunction f() { new X(); }`; const e = completionImport(bare, bare.indexOf('X'), 'Lib\\X');
 assert.match(applyEdits(bare, e.edits), /declare\(strict_types=1\);\n\nuse Lib\\X;/);
});

test('quick fix importar classe: candidatos do índice, alias em conflito, qualificar', () => {
 const text = `<?php\nnamespace App;\n\nuse Other\\Collection;\n\n$a = new Collection();\n$b = new Profile();\n`;
 const idx = classIndex([{ path: 'a.php', text: '<?php namespace App\\Model; class Profile {}' }, { path: 'b.php', text: '<?php namespace Lib; class Profile {}' }, { path: 'c.php', text: '<?php namespace App\\Support; class Collection {}' }]);
 const fixes = importFixes(text, text.indexOf('Profile'), idx);
 assert.deepEqual(fixes.filter(f => !f.alias && f.title.startsWith('Importar')).map(f => f.fqn), ['App\\Model\\Profile', 'Lib\\Profile']);
 assert.match(applyEdits(text, fixes[0].edits), /use Other\\Collection;\nuse App\\Model\\Profile;/);
 const conflict = importFixes(text, text.indexOf('new Collection') + 5, idx);
 assert.equal(conflict.some(f => f.title === 'Importar classe App\\Support\\Collection'), false, 'sem import direto quando o nome curto já é usado');
 const alias = conflict.find(f => f.alias)!; assert.equal(alias.alias, 'SupportCollection');
 assert.match(applyEdits(text, alias.edits), /use App\\Support\\Collection as SupportCollection;[\s\S]*new SupportCollection\(\)/);
});

test('classAt reconhece declaração e uso resolvido', () => {
 assert.equal(classAt(service, service.indexOf('new User') + 5, index)?.fqn, 'App\\Model\\User');
 assert.equal(classAt(user, user.indexOf('User'))?.fqn, 'App\\Model\\User');
 assert.equal(model(service).refs.filter(r => r.fqn === 'Other\\User').length, 2);
});

const method = `<?php
class Cart
{
    private array $items = [];

    public function total(float $rate): float
    {
        $sum = 0;
        foreach ($this->items as $item) {
            $sum += $item->price;
        }
        $tax = $sum * $rate;
        $total = $sum + $tax;
        return $total;
    }
}
`;
const sel = (text: string, from: string, to: string) => [text.indexOf(from), text.indexOf(to) + to.length] as const;
test('Extract Method: parâmetros, retorno único e chamada no lugar', () => {
 const [a, b] = sel(method, '$tax = ', '$sum + $tax;');
 const r = extractMethod('Cart.php', method, a, b, 'withTax'); assert.equal(r.error, undefined);
 assert.deepEqual(r.params, ['sum', 'rate']); assert.deepEqual(r.returns, ['total']);
 const out = r.plan!.changes[0].after;
 assert.match(out, /\$total = \$this->withTax\(\$sum, \$rate\);\n\s+return \$total;/);
 assert.match(out, /    private function withTax\(\$sum, float \$rate\)\n    \{\n        \$tax = \$sum \* \$rate;\n        \$total = \$sum \+ \$tax;\n        return \$total;\n    \}\n\}/);
});
test('Extract Method: laço com acumulador retorna variável; múltiplas saídas usam array', () => {
 const [a, b] = sel(method, '$sum = 0;', '        }\n');
 const r = extractMethod('Cart.php', method, a, b - 1, 'sumItems');
 assert.deepEqual(r.params, []); assert.deepEqual(r.returns, ['sum']); assert.match(r.plan!.changes[0].after, /\$sum = \$this->sumItems\(\);/);
 const [c, d] = sel(method, '$tax = ', '$sum + $tax;');
 const text = method.replace('return $total;', 'return $total + $tax;');
 const multi = extractMethod('Cart.php', text, c, d, 'calc'); assert.deepEqual(multi.returns, ['tax', 'total']);
 assert.match(multi.plan!.changes[0].after, /\[\$tax, \$total\] = \$this->calc\(\$sum, \$rate\);/);
 assert.match(multi.plan!.changes[0].after, /return \[\$tax, \$total\];/);
});
test('Extract Method: expressão, return final, estático e recusas', () => {
 const [a, b] = sel(method, '$sum * $rate', '$sum * $rate');
 const e = extractMethod('Cart.php', method, a, b, 'taxOf'); assert.match(e.plan!.changes[0].after, /\$tax = \$this->taxOf\(\$sum, \$rate\);/); assert.match(e.plan!.changes[0].after, /return \$sum \* \$rate;/);
 const [c, d] = sel(method, '$total = $sum', 'return $total;');
 const ret = extractMethod('Cart.php', method, c, d, 'finish'); assert.match(ret.plan!.changes[0].after, /return \$this->finish\(\$sum, \$tax\);/);
 const st = method.replace('public function total', 'public static function total').replace('$this->items', 'self::$items');
 const [f, g] = sel(st, '$tax = ', '$sum + $tax;'); assert.match(extractMethod('Cart.php', st, f, g, 'x').plan!.changes[0].after, /self::x\(\$sum, \$rate\)[\s\S]*private static function x/);
 assert.match(extractMethod('Cart.php', method, method.indexOf('$tax ='), method.indexOf('$tax =') + 6, 'x').error!, /instruções completas|expressão/);
 const early = method.replace('$tax = $sum * $rate;', 'if ($rate < 0) { return 0; }\n        $tax = $sum * $rate;');
 const [h, i] = sel(early, 'if ($rate', '$sum + $tax;'); assert.match(extractMethod('Cart.php', early, h, i, 'x').error!, /return/);
 assert.match(extractMethod('Cart.php', method, a, b, 'total').error!, /Já existe/);
 assert.match(extractMethod('Cart.php', method, a, b, 'list').error!, /válido/);
});

test('Extract Variable: uma ou todas as ocorrências; recusa condição de laço e elseif', () => {
 const text = `<?php\nfunction f($a) {\n    echo $a->b() + 1;\n    return $a->b() * 2;\n}\n`;
 const [s, e] = sel(text, '$a->b()', '$a->b()');
 const one = extractVariable('f.php', text, s, e, 'value'); assert.match(one.plan!.changes[0].after, /    \$value = \$a->b\(\);\n    echo \$value \+ 1;\n    return \$a->b\(\) \* 2;/);
 const all = extractVariable('f.php', text, s, e, '$value', true); assert.equal(all.occurrences, 2); assert.match(all.plan!.changes[0].after, /return \$value \* 2;/);
 const loop = `<?php\nfunction f($a) {\n    while ($a->next()) {}\n}\n`; const [l1, l2] = sel(loop, '$a->next()', '$a->next()');
 assert.match(extractVariable('f.php', loop, l1, l2, 'n').error!, /laço/);
 const chain = `<?php\nfunction f($a) {\n    if ($a) {} elseif ($a->ok()) {}\n}\n`; const [c1, c2] = sel(chain, '$a->ok()', '$a->ok()');
 assert.match(extractVariable('f.php', chain, c1, c2, 'n').error!, /elseif/);
 assert.match(extractVariable('f.php', text, s, s + 3, 'n').error!, /expressão|corta/);
});

test('Inline Variable: substitui leituras, parentetiza e recusa múltiplas atribuições', () => {
 const text = `<?php\nfunction f($a, $b) {\n    $sum = $a + $b;\n    return $sum * $sum;\n}\n`;
 const r = inlineVariable('f.php', text, text.indexOf('$sum'));
 assert.equal(r.plan!.changes[0].after, `<?php\nfunction f($a, $b) {\n    return ($a + $b) * ($a + $b);\n}\n`);
 const call = `<?php\nfunction f($a) {\n    $v = $a->get();\n    return $v;\n}\n`; assert.match(inlineVariable('f.php', call, call.indexOf('$v')).plan!.changes[0].after, /return \$a->get\(\);/);
 const twice = `<?php\nfunction f($a) {\n    $v = 1;\n    $v = 2;\n    return $v;\n}\n`; assert.match(inlineVariable('f.php', twice, twice.indexOf('$v')).error!, /2 atribuições/);
 assert.match(inlineVariable('f.php', text, text.indexOf('$a')).error!, /parâmetro/);
 const changed = `<?php\nfunction f($a) {\n    $v = $a + 1;\n    $a = 5;\n    return $v;\n}\n`; assert.match(inlineVariable('f.php', changed, changed.indexOf('$v')).error!, /mudam/);
});

test('inspeções: tipo de retorno e argumento incompatíveis, void, com quick fix e supressão', () => {
 const text = `<?php
class A
{
    public function id(): int
    {
        return 'x';
    }
    public function ok(): ?float { return 1; }
    public function none(): string { return null; }
    public function v(): void { return 1; }
    public function call(): void
    {
        $this->take('nope');
        $this->take(3);
        take2(flag: 1);
    }
    private function take(int $n): void {}
}
function take2(bool $flag) {}
`;
 const problems = inspect(text);
 const ret = problems.find(p => p.id === 'PhpIncompatibleReturnTypeInspection' && p.message.includes('string'))!;
 assert.equal(text.slice(ret.start, ret.end), "'x'"); assert.equal(ret.severity, 'warning');
 assert.equal(applyEdits(text, ret.fixes[0].edits).includes('public function id(): string'), true);
 assert.ok(!problems.some(p => p.message.includes('float, encontrado int')));
 assert.ok(problems.some(p => p.fixes[0]?.title === 'Alterar tipo de retorno para ?string'));
 assert.ok(problems.some(p => p.id === 'PhpVoidFunctionResultUsedInspection'));
 const args = problems.filter(p => p.id === 'PhpParamsInspection'); assert.deepEqual(args.map(a => text.slice(a.start, a.end)), ["'nope'", '1']);
 const fixed = applyEdits(text, [suppressEdit(text, ret.start, ret.id, 'statement')]);
 assert.match(fixed, /        \/\*\* @noinspection PhpIncompatibleReturnTypeInspection \*\/\n        return 'x';/);
 const again = inspect(fixed).find(p => p.id === ret.id && p.message.includes('string'))!;
 assert.equal(suppressed(fixed, again.start, again.id), true);
 assert.equal(suppressed(fixed, again.start, 'Other'), false);
 const file = applyEdits(text, [suppressEdit(text, 0, 'PhpParamsInspection', 'file')]);
 assert.equal(suppressed(file, file.indexOf("'nope'"), 'PhpParamsInspection'), true);
 assert.equal(suppressed(file, file.indexOf("'nope'"), 'PhpIncompatibleReturnTypeInspection'), false);
});
