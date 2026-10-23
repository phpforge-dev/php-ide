# Recorte 08 — terminal integrado

22/10/2026. Requisito: executar shell interativo dentro da IDE, na pasta do projeto.

## Entrega

Barra lateral → **Terminal**, ou **Alt+F12**. Painel inferior redimensionável por arraste ou setas quando o separador tem foco. Até oito abas, cada uma com PTY/shell independente. **Ocultar** preserva sessões; **Encerrar sessão** termina o processo da aba. Saída natural do shell mostra código de saída. Nova aba abre na raiz do projeto, não no diretório alterado em outra aba.

Renderer usa xterm.js e FitAddon; processo principal usa node-pty. Preload expõe apenas criar, escrever, redimensionar, encerrar e confirmar consumo da saída, com validação de origem IPC já existente. Renderer não recebe Node. Saída é escrita no emulador, não interpretada como HTML. Backpressure pausa o PTY após 256 KiB pendentes e retoma abaixo de 64 KiB; histórico visual limitado a 5.000 linhas. Entrada por mensagem limitada a 64 KiB.

Shell: `$SHELL` ou `/bin/sh` em Unix, com login; PowerShell em Windows. PATH e ambiente do usuário são herdados. Configurações de inicialização do shell podem mudar diretório ou ambiente. Terminal é um shell local com permissões do usuário, não uma sandbox limitada à pasta do projeto. Não é enviado automaticamente ao agente.

Troca de projeto e encerramento da aplicação encerram as sessões; queda do renderer também as encerra. Processos explicitamente destacados pelo usuário (`nohup`, daemons etc.) podem sobreviver ao shell; não há promessa de eliminar toda árvore de processos independente do sistema operacional.

## Instalação

Dependências MIT: node-pty 1.1.0, @xterm/xterm e @xterm/addon-fit (versões em package-lock.json). O pacote macOS instalado tinha spawn-helper sem permissão executável, causando `posix_spawnp failed`. `postinstall` corrige apenas o bit executável desse arquivo do pacote. Plataformas sem prebuild podem exigir ferramentas de compilação nativa. Empacotamento/distribuição ainda pendente.

## Verificação e limites

Teste de serviço real: entrada/saída, dimensões por `stty`, encerramento e recusa de escrita após encerrar. UI Electron/macOS: cwd, entrada de teclado, variáveis isoladas entre abas, Ctrl+C, resize, ocultar/reabrir, encerrar aba e saída com código 7. Screenshot `.artifacts/terminal.png` revisada. Troca de projeto aprovada: abas removidas, sessão antiga rejeita escrita e a nova sessão inicia no novo diretório. Typecheck/build aprovados; validação comparativa permanece pendente.

Sem terminal dividido, perfis configuráveis pela UI, restauração após reiniciar ou integração semântica de comandos. Windows e Linux não validados. Não houve comparação deste roteiro com PhpStorm; família UI-TERM-001 permanece Em desenvolvimento.

Fontes: [node-pty](https://github.com/microsoft/node-pty), [xterm.js e FitAddon](https://xtermjs.org/docs/guides/using-addons/). Trata-se de implementação independente.
