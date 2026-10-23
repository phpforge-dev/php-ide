# Migração para Rust + Tauri 2

22/10/2026. Correção da base tecnológica solicitada pelo usuário. A implementação anterior havia adotado Electron/Node; a aplicação ativa agora usa Tauri 2, Rust e o WebView do sistema. Fonte anterior preservada para revisão, fora do build/runtime ativo.

## Arquitetura efetiva

Interface TypeScript/Monaco/xterm → API `src/native.ts` → comando Tauri `ide`, com roteamento e validação por operação → serviços Rust em `src-tauri/src`.

Não há sidecar Node implementando o backend. Node/npm permanecem ferramentas de build/testes; CLIs externos (por exemplo o adaptador Claude ACP) podem ter seus próprios requisitos. O pacote contém binário Rust, interface e recursos Phpactor/fixtures. Na compilação macOS inicial o bundle gerado foi de 24,68 MiB; não é uma medição de memória ou desempenho.

| Serviço | Implementação ativa |
|---|---|
| Arquivos | workspace.rs: UTF-8/2 MB, confinamento, hash/etag e escrita atômica |
| Git e contas | git.rs + process.rs: argv explícito, timeout, saída limitada, serialização de mutações e configuração local com lock |
| Terminal | terminal.rs: portable-pty, sessões independentes, resize, ACK/backpressure e encerramento |
| Bancos | database.rs: SQLx Postgres/MySQL, TLS validado quando solicitado, sessões em memória, console e cancelamento; prévias em transação read-only |
| PHP | language.rs + rpc.rs: framing LSP, initialize, progresso de índice, didOpen/didChange e consultas; watcher Rust |
| Extensões PHP | shared/language: parsers/autoimport/plugins puros reaproveitados, usando apenas arquivos confinados expostos pelo Rust |
| Agentes | agents.rs + rpc.rs: ACP/JSON-RPC e Codex, permissões, alterações pendentes, keep/discard e cancelamento |

## Validação registrada

- Compilação/check Rust e TypeScript aprovados.
- Quatro testes Rust: confinamento/conflito de arquivo; staging/commit preservando disco e rejeição de token antigo; contas locais isoladas; trechos de staging.
- Janela real Tauri/WKWebView: identificação do runtime Rust/Tauri e ausência de Node no frontend; editor/árvore; salvar/conflito/escape; diff/staging/commit/histórico; contas/remoto de leitura; PTY, dimensões e encerramento; painel terminal; declaração/completion PHP via Phpactor; PostgreSQL e MySQL com console/NULL/metadados/prévia/DDL; ACP sintético com permissão, preview, keep e rejeição de escrita externa. Onze grupos aprovados, zero falhas no relatório `.artifacts/native-smoke.json`.
- Aplicação macOS `.app` gerada com Tauri. O mesmo roteiro de onze grupos passou no pacote final, sem Vite/servidor Node; relatório `.artifacts/native-packaged.json`. Isso não equivale a certificação de distribuição assinada/notarizada.

Os testes são casos próprios; não validam compatibilidade com PhpStorm. Testes Electron históricos não são contados como testes da implementação Rust. Cobertura detalhada de todos os casos antigos, incluindo plugins avançados, merge/rebase, mudanças concorrentes de projetos, perfis SSH/HTTPS externos e versões de bancos, ainda precisa ser ampliada no novo harness.

## Limites e continuidade

Windows/Linux não executados. Nenhuma afirmação de indexação perfeita, equivalência visual, completude de PHPDoc/generics ou stubs externos. Oracle, SQL Server e Redis foram implementados depois da migração ([recortes 18](implementation-slice-18.md) e [26](implementation-slice-26.md)); a cobertura Git/remotos/versões de banco foi ampliada no [recorte 27](implementation-slice-27.md). Sem benchmarks comparáveis de memória/latência. A integração de agentes foi exercitada com agente sintético; não foi consumida inferência real durante a migração.

Fontes públicas: [Tauri 2](https://v2.tauri.app/start/create-project/), [IPC Rust](https://v2.tauri.app/develop/calling-rust/). Código proprietário e recursos do PhpStorm não foram usados.

O modo de autoteste é opt-in pela variável `PHP_IDE_NATIVE_SMOKE`; o caminho do relatório vem do ambiente de lançamento. Sem essa variável, a aplicação inicia normalmente e não executa o roteiro.
