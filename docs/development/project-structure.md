# Estrutura e arquitetura atuais

A aplicação desktop usa Rust + Tauri 2. TypeScript, Monaco e xterm.js executam no WebView; Node é ferramenta de desenvolvimento, não backend da IDE.

| Caminho | Responsabilidade |
|---|---|
| `src/` | Interface, estado do editor, ferramentas, adaptação das respostas e workers |
| `src/main.ts` | Montagem da interface e integração do editor com os painéis |
| `src/native.ts` | API restrita da interface e transporte IPC Tauri |
| `src/native-language.ts` | Coordenação de linguagem e plugins internos/externos |
| `src-tauri/src/` | Backend Rust: arquivos, Git, PTY, bancos, depuração, agentes e plugins |
| `shared/` | Contratos e lógica TypeScript compartilhada; manter sem APIs Node nos módulos ativos |
| `shared/language/plugins/` | Contratos, host, sandbox e extensões integradas |
| `fixtures/` | Projetos reproduzíveis e exemplos testados, incluindo `plugins/todo-hints` |
| `tests/` | Testes TypeScript; alguns ainda importam o runtime histórico |
| `scripts/` | Setup, build e verificações; scripts podem usar Node |
| `docs/` | Guias atuais, pesquisa e evidências de compatibilidade |
| `licenses/`, `THIRD_PARTY_NOTICES.md` | Licenças e atribuições distribuídas |
| `electron/` | Implementação histórica, fora do runtime/build atual |
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
