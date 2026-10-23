# Documentação do PHP IDE

IDE experimental em Rust + Tauri 2. Estes guias descrevem o projeto atual; os recortes em pesquisa preservam decisões e evidências históricas.

## Começar

| Objetivo | Guia |
|---|---|
| Executar ou compilar a IDE | [README do projeto](../README.md) |
| Entender as pastas e os componentes ativos | [Estrutura e arquitetura](development/project-structure.md) |
| Contribuir, testar e preparar uma entrega | [Desenvolvimento](development/contributing.md) |
| Gerar e verificar o instalador macOS | [Build e instalador](development/contributing.md#build-e-instalador-macos) |
| Gerar instaladores Windows e Linux | [Builds no GitHub Actions](development/windows-linux-builds.md) |
| Publicar a página e disponibilizar downloads | [GitHub Pages e releases](development/github-pages.md) |
| Instalar e gerenciar plugins | [Plugins](plugins/README.md) |
| Criar o primeiro plugin | [Tutorial](plugins/getting-started.md) |
| Consultar manifesto, hooks e serviços | [Referência da API](plugins/api.md) |
| Empacotar e diagnosticar um plugin | [Distribuição e testes](plugins/distribution.md) |
| Entender permissões e limites | [Permissões e isolamento](plugins/permissions.md) |

## Pesquisa e compatibilidade

- [Índice da pesquisa](research/README.md): fontes, observações e recortes por funcionalidade.
- [Catálogo de funcionalidades](research/phpstorm-feature-catalog.md): estado, critérios e limites.
- [Matriz de compatibilidade](compatibility/phpstorm.md): comparação com PhpStorm, separada dos testes próprios.
- [Migração Rust/Tauri](research/tauri-migration.md): diferencia runtime atual dos registros Electron.
- [Licenças de terceiros](../THIRD_PARTY_NOTICES.md).

## Como manter a documentação

Guias operacionais ficam em `docs/development/` e `docs/plugins/`. Pesquisa e histórico ficam em `docs/research/`; resultados comparativos ficam em `docs/compatibility/`. Exemplos executáveis ficam em `fixtures/`, reutilizados pelos testes. Relatórios gerados ficam em `.artifacts/`, fora do código fonte.

Ao alterar uma API, atualize o guia, o exemplo e os testes relevantes juntos. Registre separadamente implementação, teste próprio e comparação com a referência. Planos e recursos não exercitados devem estar identificados como tais. Evite mover registros históricos: há links para eles no catálogo e em outras pesquisas.
