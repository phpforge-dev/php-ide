# Distribuição desktop — 23/10/2026

Evidência própria de build e testes, sem comparação com PhpStorm. A base continua Rust + Tauri 2, sem backend Node/Electron em execução.

## Origem e verificações

A versão 0.2.8 inclui correções para caminhos verbatim do Windows em `git clone`, gravação de configuração local do Git e leitura dos stubs PHAR. Caminhos relativos do runner PHP usam `/` no contrato com o frontend. Fixtures que continham caracteres proibidos pelo Windows usam nomes válidos nesse sistema; os casos com newline/glob continuam presentes em Unix. O script Cargo resolve `cargo.exe` no Windows.

O primeiro teste de abertura Windows encerrou com `0xC00000FD`, identificado como stack overflow na [documentação Microsoft](https://learn.microsoft.com/en-us/windows-hardware/drivers/debugger/debugging-a-stack-overflow). O build MSVC passou a reservar 8 MiB de pilha para o binário principal; o [padrão do linker é 1 MiB](https://learn.microsoft.com/en-us/cpp/build/reference/stack-stack-allocations). A reserva virtual não equivale a comprometer toda essa memória imediatamente.

| Sistema | Evidência própria | Limite |
|---|---|---|
| Linux x64 / Ubuntu 22.04 | 72 testes Rust aprovados, 5 ignorados; `.deb` e `.AppImage` gerados; `.deb` instalado e processo aberto por 15 s em Xvfb; SHA-256 verificado após download | Não valida todas as distribuições, nem instalação/execução do AppImage |
| macOS Apple Silicon | 72 testes Rust aprovados, 5 ignorados; DMG verificado com hdiutil; smoke Vue/React no aplicativo Tauri empacotado aprovado | Não notarizado; recorte não cobre todas as funções |
| Windows x64 | Testes Rust em release aprovados; NSIS `.exe` gerado; processo aberto por 15 s após o ajuste de pilha; SHA-256 verificado após download | Sem assinatura de distribuição; não foi testado o fluxo completo do instalador nem de todos os recursos da interface |

Código compilado nos runners e no macOS: revisão `8b45c40`. [Execução final de distribuição](https://github.com/phpforge-dev/php-ide/actions/runs/40035428534). O modo `publish=false` permitiu inspecionar artifacts antes da publicação. [Release 0.2.8](https://github.com/phpforge-dev/php-ide/releases/tag/v0.2.8) e tag apontam para a mesma revisão compilada; os SHA-256 dos quatro pacotes foram conferidos após geração/download e antes do upload.

Sem acesso a bancos reais, inferência de agente ou credenciais pessoais nos testes. ARM64 de Windows/Linux e macOS Intel não foram compilados neste recorte. A verificação sintática Bash pelo shell Unix permanece indisponível no Windows quando o shell esperado não existe. Os limites funcionais anteriores continuam aplicáveis.

Operação e reprodução: [Windows e Linux](../development/windows-linux-builds.md), [macOS](../development/contributing.md#build-e-instalador-macos).
