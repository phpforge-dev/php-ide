# Fixture de inteligência PHP v1

Código sintético criado para esta pesquisa. Não contém código do PhpStorm nem depende de framework. PHP alvo: 8.2; sem execução necessária para navegar e completar. `composer.json` declara PSR-4; os ensaios iniciais não exigem instalar pacotes ou gerar autoload.

Copiar esta pasta para um diretório temporário e abrir a cópia como projeto no PhpStorm. Manter os originais intactos. Confirmar confiança somente para esta fixture conhecida. Configurar PHP language level 8.2, registrar keymap/plugins e esperar o indicador de análise terminar. O PHP CLI e Composer não foram encontrados no PATH inicial deste host; isso não impede os ensaios estáticos. Não confundir language level com versão de interpretador instalada.

| Arquivo | Propósito |
|---|---|
| `src/Named.php` | Interface com método `label` |
| `src/User.php` | Implementação pública, método privado e trait |
| `src/HasId.php` | Método herdado via trait |
| `src/Admin.php` | Herança e sobrescrita |
| `src/Unrelated.php` | Homônimo não relacionado para detectar busca/rename textual |
| `probe.php` | Alias, chamadas, interface, PHPDoc template, narrowing e builtin |

Os comentários identificam pontos de ensaio; posicionar o cursor no token indicado, não no comentário. Para completion, remover `label()` da primeira chamada na cópia, deixando `$user->` antes do ponto e vírgula; depois restaurar. Para rename, começar de cópia limpa a cada variante. Não executar o arquivo diretamente: não há bootstrap/autoloader e sua finalidade é análise estática.

Fixtures futuras separadas: pacote Composer local instalado em vendor, conflito de aliases entre namespaces, templates aninhados, adaptação `insteadof`/`as` em traits, workspace com 1k/10k arquivos e projetos mínimos Laravel/Symfony com lockfile. Estes casos ainda não estão preparados nesta v1 e não podem ser declarados cobertos.

Roteiros: [plano de compatibilidade](../../../../docs/research/phpstorm-compatibility-test-plan.md).

Integridade: [manifesto SHA-256](manifest.sha256.json) dos arquivos de entrada. Em 21/10/2026, os seis arquivos PHP passaram em `php -l` usando a imagem local `php:8.3-cli`, sem rede e com montagem somente leitura. Isso verifica sintaxe em PHP 8.3; não valida inferência da IDE, execução do projeto nem compatibilidade com todos os PHP levels.
