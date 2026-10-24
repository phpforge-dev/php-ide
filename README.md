# PHP IDE

Uma IDE de código aberto para PHP e Laravel, construída com **Rust e Tauri 2**, com **interface inspirada no PhpStorm**. Editor, Git, terminal, banco de dados e Docker ficam no mesmo ambiente, junto das ferramentas para trabalhar com Blade, Vue e React.

**Disponível em versão beta para macOS, Windows e Linux.**

**[Baixar PHP IDE](https://github.com/phpforge-dev/php-ide/releases)** · [Notas das versões](https://github.com/phpforge-dev/php-ide/releases) · [Plugins](https://github.com/phpforge-dev/plugins) · [Documentação](docs/README.md)

## Recursos

- **PHP e Laravel:** autocomplete, navegação entre símbolos, busca de referências e refatorações, com suporte a Blade e arquivos `.env`.
- **Git:** alterações, commits, histórico e branches em um painel integrado.
- **Banco de dados:** conexão com PostgreSQL, MySQL e MariaDB, navegação por tabelas e execução de SQL. Em projetos Laravel, importe a conexão diretamente do `.env`.
- **Terminal:** várias sessões dentro da IDE, acessíveis pelo atalho **Alt+F12**.
- **Docker:** containers, logs e serviços Compose no painel **Alt+8**, além de suporte a Dockerfile, Compose e Bash no editor.
- **Prévia de arquivos:** visualize SVG como imagem, código ou ambos, com atualização enquanto edita. Markdown também tem prévia.
- **Vue e React:** suporte incluído para trabalhar no frontend do projeto.

## Instalação

Escolha o instalador do seu sistema nas **[releases do GitHub](https://github.com/phpforge-dev/php-ide/releases)**:

| Sistema | Pacotes disponíveis |
|---|---|
| macOS com Apple Silicon | `.dmg` |
| Windows x64 | `.exe` |
| Linux x64 | `.deb` e `.AppImage` |

Depois de instalar, abra a IDE e clique no nome do projeto para escolher uma pasta. Seus projetos recentes ficam disponíveis nesse mesmo menu. Para usar as ferramentas de Docker, tenha o Docker e o Compose instalados, com o engine em execução.

## Sobre a beta

A beta recebe melhorias e correções a cada versão. Alguns recursos têm limitações, e o comportamento pode variar entre os sistemas. Consulte as [notas da versão](https://github.com/phpforge-dev/php-ide/releases) e o [catálogo de funcionalidades](docs/research/phpstorm-feature-catalog.md) para conhecer o suporte atual.

Encontrou um problema ou sentiu falta de algo no dia a dia? [Abra uma issue](https://github.com/phpforge-dev/php-ide/issues) e conte o que aconteceu, informando a versão da IDE e seu sistema operacional.

## Participar do projeto

O PHP IDE é um projeto de [Jeidison Farias](https://github.com/jeidison), na [PHP Forge](https://github.com/phpforge-dev). Sugestões, relatos de uso e contribuições são bem-vindos. Para contribuir com código, consulte o [guia de desenvolvimento](docs/development/contributing.md). Para criar uma extensão, veja o [tutorial de plugins](docs/plugins/getting-started.md).

O projeto é independente e não tem vínculo com a JetBrains. A inspiração na interface do PhpStorm não implica equivalência de recursos. O código próprio é distribuído sob a licença MIT; as dependências mantêm suas [licenças e avisos](THIRD_PARTY_NOTICES.md).
