# Documentação do PHP IDE

Aqui você encontra como rodar a IDE, contribuir com o código e criar plugins. A seção de pesquisa guarda as decisões do projeto, os testes feitos e as limitações conhecidas.

## Começar

| Objetivo | Guia |
|---|---|
| Executar ou compilar a IDE | [README do projeto](../README.md) |
| Se localizar no código | [Estrutura e arquitetura](development/project-structure.md) |
| Ver o que mudou na limpeza do código | [Limpeza do fonte](development/source-cleanup.md) |
| Contribuir, testar e preparar uma entrega | [Desenvolvimento](development/contributing.md) |
| Gerar e verificar o instalador macOS | [Build e instalador](development/contributing.md#build-e-instalador-macos) |
| Gerar instaladores Windows e Linux | [Builds no GitHub Actions](development/windows-linux-builds.md) |
| Publicar a página e disponibilizar downloads | [GitHub Pages e releases](development/github-pages.md) |
| Instalar e gerenciar plugins | [Plugins](plugins/README.md) |
| Criar o primeiro plugin | [Tutorial](plugins/getting-started.md) |
| Consultar a API de plugins | [Referência da API](plugins/api.md) |
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

Ao alterar uma API, atualize o guia, o exemplo e os testes relevantes juntos. Deixe claro o que foi implementado, o que foi testado na nossa IDE e o que foi comparado com o PhpStorm. Se algo ainda é um plano ou não foi testado, diga isso no texto. Evite mover registros históricos: há links para eles no catálogo e em outras pesquisas.
