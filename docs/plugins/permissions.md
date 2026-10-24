# Permissões e isolamento

Um plugin novo exige consentimento antes de carregar, mesmo com `permissions: []`. O usuário pode conceder parte das permissões declaradas. A API devolve `PermissionDenied: <permissão>` para operações não autorizadas; falhas aparecem na tela Plugins.

| Permissão | Operações | Limites e impacto |
|---|---|---|
| `project.read` | read, exists, list | Leitura confinada ao projeto; inclui .env e segredos. Não há filtro por arquivo |
| `project.write` | write | Grava texto dentro do projeto; recusa caminhos .git e .php-ide. Não equivale à gravação do editor com etag |
| `process` | process.run | Programas com privilégios do usuário; cwd no projeto não confina o processo àquela pasta |
| `network` | net.fetch | HTTP(S), inclusive endereços locais; depende de curl no PATH |

Não pedir project.read não impede receber o texto dos documentos encaminhados aos hooks: esse texto faz parte da API de linguagem. Solicite somente permissões necessárias e explique a finalidade no README do pacote. `ide.permissions` permite oferecer recursos parciais quando alguma concessão for recusada.

Consentimento e estado são locais. Plugins do projeto têm estado separado por raiz de projeto. Adicionar uma permissão ainda não revisada exige novo consentimento; aumentar apenas a versão não significa necessariamente mostrar novamente a decisão. Reinstalar com as mesmas permissões não representa revisão ou auditoria do novo código.

## Barreiras implementadas

O plugin roda em Web Worker, sem DOM e sem IPC Tauri entregue ao código. A inicialização remove APIs diretas de rede/armazenamento/subworkers/Node do escopo; a CSP da janela restringe conexões. Operações passam por uma ponte que verifica concessões. Escrita, processos e rede também verificam permissão e estado no Rust.

Caminhos de arquivo rejeitam travessia, absolutos e escapes da raiz. Resultados do plugin são convertidos em dados limitados, sem HTML ou comandos internos arbitrários. Tempo limite interrompe um worker travado.

Essas barreiras não são uma garantia de resistência a todo código hostil. A suíte usa o mesmo worker em worker_threads; esse harness Node não reproduz todas as restrições da WebView. Não há sandbox de sistema operacional para processos, assinatura de plugins ou auditoria automática dos pacotes. Ativar um plugin requer confiar na origem e nas capacidades concedidas.

## Limites operacionais

Main: 8 MiB a partir da IDE 0.2.10; manifesto: 64 KiB; instalação: 2.000 arquivos / 20 MiB. Ponte limita texto de escrita/entrada de processo a aproximadamente 2 Mi de unidades JavaScript, com validação adicional de tamanho no backend. Processos têm limite de 30 segundos; requisições curl, 20 segundos e 3 redirecionamentos; saída/resposta textual limitada. Load/hook usam limites de 5/4 segundos por padrão.

Nunca inclua credenciais reais em exemplos, pacotes, logs ou pedidos de teste. Não use permissões amplas como substituto de uma capacidade que a API ainda não oferece.

## Native tool packages (0.2.11+)

`native.tool` authorizes execution of a separately packaged executable with account privileges. `workbench` authorizes its UI module in the application window, including DOM and displayed content. These are explicit trust grants, not worker sandbox capabilities. Native/default packages are downloaded without automatically granting these permissions. The host requires both for a tool package and revalidates them before execution.

Native code may access files, processes and network independently of the mediated language APIs; denying `project.read` is not an OS restriction on a native executable. Install only trusted native/UI packages. The language-plugin worker restrictions above continue to apply to ordinary language packages. [Tool architecture and limits](../research/native-tool-plugins.md).

Standalone `workbench` packages (IDE 0.2.12) run reviewed code inside the IDE window and require explicit consent even when downloaded by default. They do not require `native.tool`. Disabling/removing them unloads their UI, providers and registered cleanup handlers. The permission represents trust in the entire UI module; this is not a security sandbox.
