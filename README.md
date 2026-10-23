# PHP IDE — Rust + Tauri

IDE desktop independente, experimental, com referência de usabilidade no PhpStorm. A aplicação usa **Tauri 2 e backend Rust**. A interface usa TypeScript, Monaco e xterm.js no WebView do sistema. Não depende de Electron nem de servidor Node em execução.

Projeto de **Jeidison Farias**, na organização [PHP Forge](https://github.com/phpforge-dev).

- [Site e downloads](https://phpforge-dev.github.io/php-ide/).
- [Releases e instaladores](https://github.com/phpforge-dev/php-ide/releases).
- [Plugins](https://github.com/phpforge-dev/plugins).

O instalador disponível inicialmente é para macOS Apple Silicon. Windows, Linux e macOS Intel dependem de builds e validações próprios; a página mostra apenas os pacotes publicados.

## Documentação

- [Índice geral](docs/README.md): guias atuais, pesquisa e compatibilidade.
- [Estrutura do projeto](docs/development/project-structure.md) e [guia de contribuição](docs/development/contributing.md).
- [Gerar e verificar o instalador macOS](docs/development/contributing.md#build-e-instalador-macos).
- [Instalar plugins](docs/plugins/README.md), [criar um plugin](docs/plugins/getting-started.md), [API](docs/plugins/api.md) e [distribuir](docs/plugins/distribution.md).

## Executar

Requisitos de desenvolvimento: Rust estável/Cargo, ferramentas nativas do sistema, Node/npm para compilar a interface e Git no PATH. PHP 8.2+ local ou Docker para Phpactor. Validado em macOS Apple Silicon; Windows/Linux ainda precisam de validação.

```sh
npm ci
npm run setup:php
npm run dev
```

Se Cargo não estiver no PATH, os scripts também procuram `~/.cargo/bin`. `npm run dev` abre Tauri e usa Vite apenas durante desenvolvimento.

Para gerar e abrir o aplicativo macOS:

```sh
npm run build
npm start
```

Pacote: `src-tauri/target/release/bundle/macos/PHP IDE.app`. O aplicativo usa recursos locais incluídos no pacote. `PHP_IDE_PROJECT` escolhe o diretório inicial; sem essa variável, retoma o último projeto recente disponível ou usa o projeto sintético incluído. O seletor no nome do projeto oferece recentes e **Abrir projeto…**.

## Componentes ativos

- Arquivos, confinamento à raiz, gravação atômica e detecção de conflito: Rust.
- SVG: fonte XML, imagem e modo dividido, atualização sem salvar, zoom e fundos para transparência. [Uso e limites](docs/research/svg-preview.md).
- Árvore do projeto diferencia arquivos e pastas ignorados pelo Git nos dois temas, com atualização após mudanças de regras. [Escopo e limites](docs/research/git-ignored-tree.md).
- Git nativo via subprocessos controlados em Rust: status, diff, staging, commit, histórico, branches, trechos, conflitos, operações e contas locais por repositório.
- Plugin Bash incluído: scripts `.sh`/`.bash`, dotfiles e shebang, sugestões, F12 e verificação de sintaxe do buffer. [Uso e limites](docs/research/bash-editor.md).
- Plugin Docker incluído: Dockerfile e Compose (inclusive `composer.yml`), sugestões, diagnósticos e navegação entre estágios/serviços. [Uso e limites](docs/research/docker-editor.md).
- Terminal integrado: Rust/portable-pty + xterm.js, múltiplas sessões, Ctrl+C, resize e ciclo de vida por projeto. Alt+F12 ou ícone lateral.
- PostgreSQL/MySQL/MariaDB: drivers Rust/SQLx, exploração, metadados, prévia, console SQL e cancelamento. Credenciais somente em memória.
- PHP: cliente LSP Rust para Phpactor. Parsers próprios, autoimport e plugins Laravel/Blade/.env/SQL compartilham módulos TypeScript puros na interface, sem Node.
- Agentes: cliente ACP e Codex app-server em Rust. CLIs externos precisam ser instalados/autenticados. ACP permite revisão de alterações; Codex usa consulta somente leitura. O adaptador Claude é ferramenta externa e pode exigir Node (`npm run setup:acp`).

A interface continua em evolução. Nenhuma declaração de equivalência integral com PhpStorm; generics e stubs externos ainda têm lacunas documentadas. A migração não promove testes antigos automaticamente para o novo backend.

## Verificação

```sh
npm run typecheck
npm test
npm run test:native
npm run test:packaged
```

`test:native` compila o backend Rust e abre a janela Tauri real com Vite como servidor de testes. Testa arquivos/Git/PTY/PHP, PostgreSQL/MySQL em containers próprios e agente ACP sintético sem inferência. Relatório: `.artifacts/native-smoke.json`. Requer Docker em execução e Phpactor preparado. O teste de UI usa o IPC real; não simula respostas do backend. `test:packaged` repete o roteiro no `.app` já compilado, sem Vite; relatório `.artifacts/native-packaged.json`.

Variáveis: `PHP_IDE_PHP_BIN` aponta PHP local; `PHP_IDE_TOOLS` pode apontar uma pasta de ferramentas; `PHP_IDE_CODEX_BIN` aponta Codex; `PHP_IDE_ACP_AGENT` configura agente ACP externo. Senhas/tokens não devem ser inseridos nessas variáveis de configuração de agentes.

## Pesquisa

- [Migração para Rust/Tauri e evidências](docs/research/tauri-migration.md)
- [Metodologia e pesquisa](docs/research/README.md)
- [Catálogo](docs/research/phpstorm-feature-catalog.md)
- [Compatibilidade](docs/compatibility/phpstorm.md)
- [Avisos de terceiros](THIRD_PARTY_NOTICES.md)

O diretório `electron/` e testes antigos foram preservados como registro da implementação anterior. Não são usados pelo build/runtime atual. O código próprio usa MIT. Nenhum componente proprietário da JetBrains é distribuído.

### Projetos recentes

Clique no nome do projeto, no canto superior esquerdo, para abrir o seletor com busca e projetos recentes. O histórico é salvo nas configurações locais da aplicação; reabrir promove a entrada ao topo. Remover da lista não apaga arquivos. A aplicação retoma o último recente disponível ao iniciar, salvo quando `PHP_IDE_PROJECT` define uma raiz explícita. Sem recentes disponíveis, abre o fixture de demonstração.

### Docker / Services

Alt+8 ou ícone Docker na lateral abre Services. Selecione um contexto do Docker CLI e conecte para gerenciar containers, consultar imagens/volumes/redes, ver logs e abrir terminal. A aba Compose usa os arquivos da raiz do projeto. Download e Compose exibem progresso e podem ser interrompidos. Requer Docker CLI, engine iniciado e plugin Compose para ações Compose. Limites e evidências em [Docker integrado](docs/research/docker-integration.md).

### Inicialização

A abertura exibe splash animado e restaura o projeto ativo. Sem projeto, mostra boas-vindas com busca nos recentes, Abrir, Novo projeto PHP e Clonar repositório. Use **Fechar projeto** para voltar à tela inicial, após salvar alterações. Clone usa o Git configurado no sistema e tem limite atual de 30s. Evidências e limites em [startup-welcome.md](docs/research/startup-welcome.md). Teste isolado do pacote: `node scripts/check-startup.mjs`.
