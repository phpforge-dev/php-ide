# Fixture de semântica PHP v1 (recorte 20)

Código sintético criado para o [recorte 20](../../implementation-slice-20.md). Não contém código do PhpStorm nem de pacotes reais. PHP alvo: 8.2 (`composer.json`), sem execução; todos os arquivos passaram em `php -l` (PHP 8.3 local) em 23/10/2026.

| Arquivo | Propósito |
|---|---|
| `src/Contracts/Named.php` | Interface com `label()` |
| `src/Concerns/HasId.php`, `LegacyId.php` | Dois traits com `id()` em conflito |
| `src/Model/Model.php` | Classe abstrata: método abstrato, `save(): static`, método protegido |
| `src/Model/User.php` | `extends` + `implements` + `use HasId, LegacyId { … insteadof …; … as legacyId; }`, PHPDoc `@property`, `@property-read`, `@method` (estático e de instância) |
| `src/Model/Admin.php` | Subclasse final: sobrescrita, `parent::`, retorno `self` |
| `src/Model/Address.php` | Alvo de `@method` e de `match` |
| `src/UserCollection.php` | `@extends Collection<int, User>` |
| `src/Repository.php` | `@template T of Model`, `class-string<T>`, template de método |
| `vendor/acme/collections` | Pacote local "instalado" (com `vendor/composer/installed.json`): `@template TKey/TValue`, `@implements IteratorAggregate<…>`, `map` com template |
| `probes/*.php` | Um arquivo por família; cada ponto de ensaio tem comentário `// ID` na mesma linha |

Famílias e IDs: `types.php` (PHP-TYPE-001), `doc.php` (PHP-DOC-001), `generics.php` (PHP-GEN-001), `traits.php` (PHP-TRAIT-001), `inherit.php` (PHP-INHERIT-001), `vendor.php` (PHP-VENDOR-001), `native.php` (PHP-NATIVE-001).

Execução automatizada: `npm run test:php-semantics` copia esta pasta para um diretório temporário, sobe o Phpactor de `.tools` com a mesma configuração de `src-tauri/src/language.rs` e confere definição, completion, hover e implementações de cada ID. O resultado vale para a nossa IDE; não é observação do PhpStorm. Para um ensaio manual na referência, copie a pasta (inclusive `vendor/`) para um diretório temporário e posicione o cursor no token anterior ao comentário de cada linha.
