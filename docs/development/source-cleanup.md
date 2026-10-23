# Limpeza do fonte — 23/10/2026

O runtime ativo permanece Rust + Tauri 2. Esta mudança remove implementação sem uso e fortalece as verificações, sem redesenhar a interface ou declarar nova compatibilidade funcional.

## Removido e preservado

- Removidos os 24 arquivos de `electron/`, os scripts de build/dev e correção de node-pty dessa implementação, os scripts de integração exclusivos de Electron e seus testes de backend.
- Preservados os parsers e plugins ativos em `shared/language/`. Os testes de análise PHP e plugins agora importam a implementação atual; o merge mantém os testes puros e usa os cenários Rust para a integração Git.
- O adaptador `tests/fixtures/project-files.ts` fornece acesso a projetos sintéticos para os testes de plugins. Ele não é usado na aplicação nem substitui o confinamento do backend Rust.
- Mantidos os documentos históricos de pesquisa. Eles registram o que foi executado na época; nomes de arquivos removidos continuam como referências históricas. A implementação anterior pode ser consultada no [Git antes da limpeza](https://github.com/phpforge-dev/php-ide/tree/7d3651e/electron).
- Preservados instaladores já publicados, fixtures, licenças e ferramentas atuais. Nenhuma senha é persistida e nenhum banco real é usado nos testes.

## Melhorias de manutenção

- TypeScript verifica tipos da aplicação **e dos testes**. O fonte ativo rejeita imports/variáveis/parâmetros sem uso.
- `npm run test:unit` executa os testes TypeScript atuais. `npm run check` reúne tipos, arquitetura, testes TypeScript/Rust, Clippy e traduções.
- `npm run test:architecture` rejeita imports diretos de módulos Node/Electron em `src/` e `shared/`, além da reintrodução do diretório de runtime antigo. Não é um auditor completo de dependências transitivas nem uma prova de isolamento da WebView.
- `npm run lint:rust` executa Clippy em todos os targets de teste do host, sem warnings. Refatorações pequenas preservam os contratos IPC: agrupamento da expressão/posição da consulta sintética, dimensões do PTY, `Default` derivado e remoção de alocações/clones dispensáveis.
- Os wrappers Cargo/Tauri/start compartilham a execução sem shell e o tratamento de falhas. Argumentos de Cargo são montados antes de `--`, e executáveis Windows usam `.exe`.
- Scripts de navegador importam a dependência declarada `@playwright/test`, em vez de depender de um pacote transitivo diretamente.
- O smoke nativo completo prepara também as fixtures de SVG, Bash, Docker, DotEnv e arquivos ignorados. Todas entram na base Git sintética antes dos cenários de branches; edições deliberadas dos plugins são restauradas entre cenários. O Compose seleciona explicitamente seu arquivo de exemplo.
- Os avisos de terceiros refletem a remoção das dependências exclusivas de Electron; licenças dos componentes ativos foram mantidas.
- O workflow **Source quality** executa as verificações e o build web em pushes/PRs de código, em Ubuntu 22.04. Não gera uma release automaticamente.

## Verificar e continuar

```sh
npm ci
npm run setup:php
rustup component add clippy
npm run check
npm run test:native -- --no-db
```

Os testes de backend Electron foram retirados porque não validavam a aplicação atual. Isso não torna cada cenário antigo automaticamente coberto em Rust. Os 5 testes Rust de integração marcados como ignorados continuam fora da execução padrão; testes nativos e bancos descartáveis têm seus próprios requisitos. O teste TypeScript que depende de PHPUnit externo pode permanecer ignorado quando ele não estiver instalado.

Resultados desta limpeza são evidência própria. Não há nova validação comparativa com PhpStorm, nem nova versão de instalador por esta alteração de fonte.

## Resultado local

Em macOS, `npm run check` passou com 133 testes TypeScript e 72 testes Rust; ficaram 1 teste TypeScript e 5 testes Rust ignorados conforme os requisitos acima. O build web passou. A execução real `npm run test:native -- --no-db` passou nos 33 cenários, com CLI Docker e agente sintéticos, sem bancos reais. Esse resultado não valida a janela em Windows/Linux nem uma conexão com Docker real.
