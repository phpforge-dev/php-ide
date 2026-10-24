# Marketplace e instalação pelo Git

A partir da versão **0.2.9**, abra **Aparência → Plugins…** para gerenciar os plugins.

## Procurar e instalar

Na aba **Marketplace**, pesquise pelo nome, autor ou pelo que o plugin faz. Clique em **Instalar** para baixar uma prévia. Confira o nome, a versão, o repositório, o commit e as permissões antes de confirmar. Depois da instalação, você escolhe quais permissões conceder para ativar o plugin.

A aba **Instalados** permite desativar, reativar, revisar permissões e remover plugins do usuário. A origem e o commit instalado aparecem junto ao plugin. Plugins guardados em `.php-ide/plugins` continuam pertencendo ao projeto e são removidos apagando sua pasta.

## Instalar pela URL de um repositório

Use **Instalar pelo Git…**, informe uma URL HTTPS e, se quiser, uma tag, branch ou commit. Se deixar o campo de versão vazio, a IDE usa o commit atual da branch padrão. Ela registra o commit exato que baixou.

O repositório precisa ter `plugin.json` e o JavaScript pronto na raiz. A IDE não roda `npm install`, scripts de build ou comandos fornecidos pelo repositório. Também não baixa submódulos. Git precisa estar instalado; esta primeira versão aceita repositórios públicos via HTTPS, sem autenticação interativa.

Se o ID já estiver instalado, a prévia informa qual versão será substituída. Um download ou manifesto inválido não remove a versão atual. O mesmo fluxo permite voltar a uma versão anterior informando sua tag ou commit.

## Atualizações e uso sem conexão

O botão **Atualizar catálogo** consulta a lista mais recente. Quando uma versão maior está disponível, o cartão oferece **Atualizar**. A atualização segue a mesma prévia e verifica se há novas permissões; não há substituição automática em segundo plano.

Se o catálogo não responder, a IDE mostra a última lista válida que conseguiu salvar, com um aviso. Plugins já instalados continuam funcionando sem conexão. Para instalar ou atualizar pelo Git, é preciso estar online. Pasta e ZIP continuam disponíveis para instalações locais.

## Onde ficam os plugins

O [repositório de catálogo](https://github.com/phpforge-dev/plugins) contém `catalog.json`. Os pacotes têm seus próprios repositórios:

- [Laravel e Blade](https://github.com/phpforge-dev/plugin-laravel)
- [.env](https://github.com/phpforge-dev/plugin-dotenv)
- [Dockerfile e Compose](https://github.com/phpforge-dev/plugin-docker)
- [Bash](https://github.com/phpforge-dev/plugin-bash)
- [Prettier](https://github.com/phpforge-dev/plugin-prettier)
- [Markdown e Mermaid](https://github.com/phpforge-dev/plugin-markdown)
- [TODO Hints](https://github.com/phpforge-dev/plugin-todo-hints)

Na primeira abertura de um perfil novo, a tela inicial permite escolher os plugins e revisar suas permissões. Apenas os selecionados entram na fila Rust de instalação em segundo plano. É possível continuar para a IDE sem esperar, acompanhar progresso e repetir falhas. A escolha fica concluída por perfil e não é repetida a cada projeto. Perfis existentes preservam as instalações e decisões anteriores.

As atualizações automáticas de plugins e da IDE são independentes e desativadas por padrão. A IDE verifica versões e mostra avisos; só baixa atualizações automaticamente após opção explícita. Atualizações de plugins ficam preparadas para a próxima abertura, e novas permissões exigem revisão. A IDE só instala pacotes assinados e respeita arquivos não salvos antes de reiniciar. Veja [fluxo e distribuição](../specs/first-run-and-updates.md).

A sintaxe e a detecção dos tipos de arquivo continuam na IDE, assim como os serviços nativos de bancos, terminal e Docker. Symfony/Twig, ignore, prévias SVG/imagens, formatação PHP, linguagens web, inteligência PHP, Git, terminal, Docker Services, agentes e bancos/SQL têm pacotes próprios a partir de 0.2.13. Em 0.2.12+, Markdown e Mermaid estão no pacote `phpforge.markdown`, incluindo a prévia; sua ativação pede `project.read` e `workbench`, sem ferramenta nativa. Em 0.2.11+, Composer, PHP/Xdebug e PHPUnit/Pest passam a pacotes nativos separados, com consentimento próprio para executar ferramenta e interface. Essas extrações não transformam todos os serviços da aplicação em extensões.

## Manter o catálogo

O formato tem `schemaVersion: 1` e uma lista `plugins`. Cada entrada contém `id`, `name`, `description`, `author`, `version`, `minIdeVersion`, `repository` e `revision`. A revisão do catálogo exige o hash completo de um commit, com 40 caracteres. A IDE confere ID, versão e commit após o download.

Para publicar, abra um pull request no repositório do catálogo. Os checks validam os campos e a revisão confere a origem e o pacote. O repositório de cada plugin deve manter seu build reproduzível e o `main.js` pronto para instalação.

O catálogo não aceita comandos de shell. Ele também não pesquisa repositórios aleatórios no GitHub: só exibe entradas publicadas na lista. A instalação pela URL permite usar plugins fora do catálogo.

## Validação

Esta é uma implementação própria, sem nova comparação de comportamento com PhpStorm ou VS Code. Os testes locais usam projetos sintéticos. O roteiro `npm run test:native -- --no-db --marketplace-only` testa o catálogo público e a instalação do TODO Hints pela URL real, em um perfil descartável; requer internet e Git. O smoke padrão continua sem depender do catálogo online. `test:native` compila a interface e usa um servidor de arquivos para testar o código de produção, sem hot reload. Isso evita que erros e recargas do servidor de desenvolvimento interfiram nos diálogos e nas edições do teste.

Os instaladores 0.2.8 não têm este recurso. É necessário compilar a versão 0.2.9 ou instalar um pacote dessa versão quando ele for publicado.

Na validação local em macOS, os dois caminhos de instalação do TODO Hints passaram na janela Tauri: URL Git e busca no catálogo, incluindo consentimento, desativação e remoção. Os builds dos quatro pacotes de linguagem também passaram nos seus próprios workflows do GitHub.

## Build e testes dos pacotes separados

O build web não incorpora os bundles de interface desses plugins. O build Rust de 0.2.13 busca e compila seis bibliotecas nativas dos repositórios de plugins, com revisões fixadas em Cargo.toml/Cargo.lock; atualizar essas bibliotecas exige recompilar a IDE. Os bundles instaláveis de interface continuam separados. `npm run setup:plugins` usa `default-plugins.json` e `test-plugins.json` para preparar dependências de teste em `.tools/plugin-packages/` (ignorado pelo Git), conferindo commit, ID, versão e hash. Typecheck e testes unitários fazem essa preparação automaticamente; o cache permite repeti-los offline. Para alterar um plugin, use seu próprio repositório, publique o pacote pronto e atualize o catálogo e os metadados fixados da IDE. Não execute builds de plugins como parte da instalação.

O teste `npm run test:plugins:native` usa um perfil descartável e exercita a instalação automática pelos repositórios reais; a primeira instalação requer rede. O teste de formatação também pode usar o pacote fixado no cache, instalado pela IPC real. A validação da integração não promove equivalência com PhpStorm.

Verificação do Docker: o pacote Git no commit fixado confere com o SHA-256 dos metadados. A comparação inicial por saída textual transformava caracteres de controle; a conferência binária não encontrou divergência. Prettier 1.0.1 codifica NULs no JavaScript gerado e tem build reproduzível e testes no repositório próprio.

Para executar testes nativos em paralelo, use `PHP_IDE_NATIVE_PORT` (somente debug/smoke), `PHP_IDE_NATIVE_REPORT` e, quando necessário, `PHP_IDE_NATIVE_BIN`. `CARGO_TARGET_DIR` separa os artefatos Rust; estas opções pertencem ao runner de testes.

Validação própria em macOS: `--plugins-only` confirmou os cinco pacotes baixados, origem fixada, permissões e workers ativos; `--format-only` confirmou PHP, Prettier, configuração, seleção, undo e erros recuperáveis na janela Tauri. `test:plugins:ui` confirmou primeira pintura independente do download, progresso, falha de conexão e recuperação pelo botão de repetição. Essas evidências não validam Windows/Linux nem equivalência com PhpStorm.

Verificação final do recorte: typecheck, 143 testes TypeScript (1 ignorado), 78 testes Rust (5 ignorados), Clippy com warnings como erros, arquitetura e traduções aprovados. O build web e os roteiros Tauri de instalação dos cinco padrões e formatação passaram.

## Native PHP tools (0.2.11+)

The catalog also lists [PHP/Xdebug](https://github.com/phpforge-dev/plugin-php-debugger), [Composer](https://github.com/phpforge-dev/plugin-composer) and [PHPUnit/Pest](https://github.com/phpforge-dev/plugin-php-tests). Their prebuilt Rust executables are selected by OS/architecture and verified against the package manifest. No build commands run during installation. Default download does not grant native/UI permissions. These packages require the new IDE host; older releases must be updated first.

## Extrações da IDE 0.2.13

As doze novas extrações e seus repositórios estão em [parallel-plugin-extraction](../research/parallel-plugin-extraction.md). A instalação padrão passa a ter 21 pacotes, incluindo os nove anteriores. Todos os pacotes são opcionais na seleção inicial; a escolha apresenta as permissões antes de instalar e ativar. Desativar um plugin remove suas contribuições e bloqueia operações nativas. As seis bibliotecas Rust extraídas são vinculadas estaticamente; não são executáveis intercambiáveis pelo Marketplace.
