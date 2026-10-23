# PHP IDE

Uma IDE de código aberto para trabalhar com PHP e Laravel. Reúne editor, Git, terminal, banco de dados e Docker, com suporte também a Blade, Vue, React e scripts do projeto.

Estou desenvolvendo o PHP IDE na [PHP Forge](https://github.com/phpforge-dev). O projeto nasceu da vontade de ter uma IDE PHP aberta, com uma experiência de uso inspirada no PhpStorm. Ainda há bastante trabalho pela frente, mas já é possível baixar, testar no seu projeto e ajudar a melhorar.

— [Jeidison Farias](https://github.com/jeidison)

**[Baixar a IDE](https://phpforge-dev.github.io/php-ide/)** · [Notas das versões](https://github.com/phpforge-dev/php-ide/releases) · [Plugins](https://github.com/phpforge-dev/plugins) · [Documentação](docs/README.md)

## O que já dá para fazer

- Escrever PHP com autocomplete, navegação entre símbolos, busca de referências e refatorações. O suporte a Laravel inclui Blade e arquivos `.env`.
- Conferir alterações, preparar commits, consultar o histórico e trabalhar com branches pelo painel Git.
- Conectar a PostgreSQL, MySQL ou MariaDB, explorar tabelas e executar SQL. Em projetos Laravel, dá para importar a conexão do `.env`. As credenciais ficam apenas na memória.
- Usar várias sessões de terminal dentro da IDE. O atalho é **Alt+F12**.
- Acompanhar containers, logs e serviços Compose pelo painel Docker (**Alt+8**). Dockerfile, Compose e Bash também têm suporte no editor.
- Abrir SVG como imagem, fonte ou os dois ao mesmo tempo, com a prévia acompanhando as edições. Markdown também tem prévia.
- Trabalhar com Vue e React sem instalar plugins adicionais: o suporte já vem incluído.

A IDE ainda é experimental. O suporte às linguagens não está completo, e há diferenças entre os sistemas operacionais. Se algo não funcionar, [abra uma issue](https://github.com/phpforge-dev/php-ide/issues) com os passos para reproduzir e a versão que você está usando. Os detalhes do suporte estão no [catálogo de funcionalidades](docs/research/phpstorm-feature-catalog.md).

## Baixar e instalar

Os instaladores estão no [site do projeto](https://phpforge-dev.github.io/php-ide/) e nas [releases do GitHub](https://github.com/phpforge-dev/php-ide/releases).

A versão 0.2.8 tem pacotes para Windows x64 (`.exe`), Linux x64 (`.deb` e `.AppImage`) e macOS com Apple Silicon (`.dmg`). Ainda não há instalador para macOS Intel ou Windows/Linux ARM64. Consulte os [requisitos e testes de cada sistema](docs/research/desktop-distribution.md).

Depois de abrir a IDE, clique no nome do projeto para escolher uma pasta ou voltar a um projeto recente. Para usar o painel Docker, você precisa do Docker CLI, do engine em execução e do Compose instalado.

## Rodar a partir do código

A aplicação usa **Rust e Tauri 2**, com TypeScript, Monaco e xterm.js na interface. Node e npm são usados nas ferramentas de desenvolvimento e na compilação da interface.

Você vai precisar de Rust/Cargo estável, Node/npm, Git e das ferramentas nativas do Tauri para o seu sistema. O Phpactor precisa de PHP 8.2 ou superior, local ou via Docker. Veja o [guia de desenvolvimento](docs/development/contributing.md) para preparar o ambiente.

```sh
npm ci
npm run setup:php
npm run dev
```

O comando `dev` abre a IDE e atualiza a interface enquanto você edita o código. Se Cargo não estiver no PATH, os scripts também procuram em `~/.cargo/bin`.

No macOS, para compilar e abrir o aplicativo:

```sh
npm run build
npm start
```

O aplicativo fica em `src-tauri/target/release/bundle/macos/PHP IDE.app`. Há guias para gerar os instaladores de [macOS](docs/development/contributing.md#build-e-instalador-macos), [Windows e Linux](docs/development/windows-linux-builds.md).

## Testar e contribuir

Contribuições com código, relatos de problemas e sugestões de uso são bem-vindas. O [guia de contribuição](docs/development/contributing.md) explica como preparar e verificar uma mudança; a [estrutura do projeto](docs/development/project-structure.md) ajuda a encontrar o código.

```sh
npm run check
npm run test:native
npm run test:packaged
```

`check` verifica tipos, arquitetura, testes TypeScript e Rust, Clippy e traduções. `test:native` abre a janela Tauri e testa a integração com o backend. Ele usa projetos de exemplo, bancos em containers descartáveis e um agente de teste, sem consumir inferência. Requer Docker em execução e Phpactor preparado. Para rodar sem os bancos, use `npm run test:native -- --no-db`.

No macOS, `test:packaged` testa o `.app` já compilado. Os relatórios ficam em `.artifacts/`. Os requisitos e as limitações desses testes estão na [documentação de desenvolvimento](docs/development/contributing.md).

Para criar uma extensão, comece pelo [tutorial de plugins](docs/plugins/getting-started.md). A [API](docs/plugins/api.md) e o [guia de distribuição](docs/plugins/distribution.md) detalham o que os plugins podem fazer hoje.

## Sobre o projeto

O PHP IDE é um projeto independente, sem vínculo com a JetBrains. O código próprio usa a licença MIT; as dependências e os recursos de terceiros mantêm suas [licenças e avisos](THIRD_PARTY_NOTICES.md).

As referências ao PhpStorm e os testes de comparação estão documentados em [pesquisa](docs/research/README.md) e na [matriz de compatibilidade](docs/compatibility/phpstorm.md). Eles ajudam a orientar o desenvolvimento, sem significar que a IDE já oferece todos os recursos do PhpStorm.
