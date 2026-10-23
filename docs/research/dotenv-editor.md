# Editor DotEnv — 23/10/2026

## Evidências e causa

Relato do usuário: `.env` não era interpretado/renderizado como esperado, com suspeita de plugin Laravel inativo. Inspeção do código: NativeLanguage já registrava LaravelPlugin e DotenvPlugin, mas DotenvPlugin só atendia strings PHP (`env()`/`getenv()`). Não havia linguagem Monaco para `.env` nem providers para o próprio documento.

Referência documental: [DotEnv no PhpStorm](https://www.jetbrains.com/help/phpstorm/dotenv.html) e [suporte integrado](https://blog.jetbrains.com/phpstorm/2025/01/support-for-env-files/). A documentação descreve realce, completion e navegação; nenhuma observação local do PhpStorm foi realizada nesta entrega. Implementação independente; nenhum componente da referência foi extraído.

## Recorte implementado

- `.env` e `.env.*` reconhecidos como DotEnv, com comentários, chaves, valores, booleanos, números e interpolação destacados nos temas claro/escuro.
- Completion dentro de `${...}` e navegação para a declaração; o buffer atual prevalece sobre disco. Sugestões mostram nomes e arquivo, sem valores.
- Comentários, strings simples e dólares escapados não geram referências.
- Documentos DotEnv são atendidos pelo host de plugins, sem encaminhar ao Phpactor.
- Continua disponível a integração existente de `env()`/`getenv()` em PHP.

Limites: não executa Laravel, não avalia/substitui variáveis, não reproduz precedência de ambientes/cache do framework. Não inclui inspeções completas de sintaxe, ocultação visual de valores no editor, referências em Docker/Compose ou Find Usages global. O arquivo aberto continua editável como texto, inclusive seus valores.

## Validação própria

`node --import tsx --test tests/dotenv-editor.test.ts`: três testes passaram (referências válidas/literais, declarações não salvas e transporte nativo sem PHP). `npm run typecheck` passou; `npm test`: 66 passaram, 5 ignorados.

`npm run test:native -- --no-db --dotenv-only`: passou na janela Tauri real. Verifica ativação Laravel/DotEnv, linguagem de `.env` e `.env.testing`, tokens/cores renderizadas nos dois temas, sugestões no buffer e navegação. Fixture Laravel e arquivos `.env` sintéticos; nenhum segredo de projeto real foi lido.

Estado comparativo de TOOL-DOTENV-001: Em desenvolvimento / não validada. O teste próprio não comprova equivalência integral com PhpStorm.

Entrega 0.2.2: aplicativo e DMG gerados; `npm run test:packaged -- --no-db --dotenv-only` passou no aplicativo release. DMG verificado com hdiutil e SHA-256 gerado.
