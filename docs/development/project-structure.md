# Estrutura e arquitetura atuais

A aplicação desktop usa Rust + Tauri 2. TypeScript, Monaco e xterm.js executam no WebView; Node é ferramenta de desenvolvimento, não backend da IDE.

| Caminho | Responsabilidade |
|---|---|
| `src/` | Interface, estado do editor, ferramentas, adaptação das respostas e workers |
| `src/main.ts` | Montagem da interface e integração do editor com os painéis |
| `src/native.ts` | API restrita da interface e transporte IPC Tauri |
| `src/native-language.ts` | Coordenação de linguagem e plugins internos/externos |
| `src-tauri/src/` | Host Rust: arquivos, autorização, ciclo de vida, IPC e integração das bibliotecas nativas externas |
| `shared/` | Contratos e lógica TypeScript compartilhada; manter sem APIs Node nos módulos ativos |
| `shared/language/plugins/` | Contratos, host, sandbox e extensões integradas |
| `tests/fixtures/projects/` | Projetos sintéticos reproduzíveis usados pelos testes e scripts de validação |
| `tests/` | Testes TypeScript dos módulos ativos e do host/sandbox compartilhado |
| `scripts/` | Setup, build e verificações; scripts podem usar Node |
| `docs/` | Guias atuais, pesquisa e evidências de compatibilidade |
| `licenses/`, `THIRD_PARTY_NOTICES.md` | Licenças e atribuições distribuídas |
| `.tools/`, `.artifacts/`, `dist/`, `src-tauri/target/`, `graphify-out/` | Ferramentas e saídas geradas; não são o código fonte de funcionalidades |

## Fluxos principais

Interface → `window.ide`/`src/native.ts` → comando IPC `ide` → despacho em `src-tauri/src/main.rs` → serviço Rust. O backend confina acesso a arquivos e controla subprocessos. A interface não recebe Node nem um shell genérico.

PHP combina o LSP do Phpactor com lógica própria em `shared/language/` e o host de plugins. JavaScript/TypeScript e Vue têm workers próprios ([escopo web](../research/web-language-services.md)). Os diferentes provedores não devem ser tratados como um único índice universal.

Plugins de terceiros: descoberta/consentimento Rust → gerenciador da interface → Web Worker → ponte de serviços autorizados → backend. Os resultados de linguagem passam pelo host compartilhado. [Contrato e limites](../plugins/api.md).

## Onde colocar uma mudança

- Componente visual e seu comportamento: `src/`, perto da ferramenta existente.
- Operação privilegiada, acesso ao sistema ou recurso persistente: serviço em `src-tauri/src/`, exposto por contrato restrito.
- Parser ou regra independente do sistema: `shared/`, com testes direcionados.
- Plugin instalável: pacote com `plugin.json` e JavaScript; não importá-lo diretamente no renderer.
- Extensão integrada: `shared/language/plugins/`, registrada em `src/native-language.ts`; ela é código confiável do produto, diferente de um pacote de terceiros.

A organização descrita é a existente. Não há migração de diretórios ou conversão para monorepo nesta entrega; mudanças físicas devem considerar os caminhos usados pelo build, fixtures e testes.

## Limpeza do legado

O backend Electron e seus scripts/testes exclusivos foram removidos. Consulte [limpeza e verificações](source-cleanup.md). As implementações anteriores continuam recuperáveis no histórico do Git, sem participar do fonte ou dos comandos atuais.

## Separately packaged native PHP tools

`src-tauri/src/tool_plugins.rs` owns generic native-plugin authorization, process lifecycle and routing; `src/tool-plugins.ts` owns the explicit trusted-workbench SDK. PHP DBGp, Composer/test execution and their UI/semantic code live in separate `phpforge-dev/plugin-php-debugger`, `plugin-composer` and `plugin-php-tests` repositories. They are not runtime imports from sibling checkouts. [Details](../research/native-tool-plugins.md).

## Standalone Markdown plugin

Markdown rendering, outline, link diagnostics/navigation and Mermaid belong to [plugin-markdown](https://github.com/phpforge-dev/plugin-markdown), requiring IDE 0.2.12. The core keeps file association and generic editor/provider bridges. Its standalone `workbench` entry requires explicit UI trust but no Rust subprocess or `native.tool`. [Extraction and validation](../research/markdown-plugin.md).

## Optional feature packages (0.2.13)

Twelve further features are provided by separate repositories. `src/plugin-services.ts` coordinates optional contributions; `src/tool-plugins.ts` owns the trusted SDK and cleanup. Native feature source is supplied by six pinned Git crates; it is statically linked rather than loaded as Marketplace machine code. Core keeps DTOs/interfaces in `shared/sql-types.ts`, `shared/database-contracts.ts` and `shared/language/plugins/workbench-api.ts`. Runtime plugin assets are not imported from sibling checkouts or test caches. [Repositories, ownership and validation](../research/parallel-plugin-extraction.md).
