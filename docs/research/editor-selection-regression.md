# Seleção e coloração do editor — 2026-10-22

Relato: seleção e cores estranhas em todos os arquivos. Arraste comum e Shift+setas funcionavam no navegador (Chrome/WebKit), mas o problema visual foi reproduzido no aplicativo Tauri empacotado. O controle da janela nativa do usuário não está disponível nesta sessão; a investigação usa instâncias isoladas e fixtures.

A investigação posterior reproduziu **ausência de cores no pacote Tauri**: tokens PHP e classes `mtk*` estavam presentes, mas todas tinham a mesma cor computada. A versão dev em Tauri passava. Causa identificada: o `<style>` inline do splash recebia nonce/hash na CSP gerada pelo Tauri, fazendo o navegador ignorar `unsafe-inline` de `style-src`. Os estilos dinâmicos do Monaco, incluindo tokens e fundo de seleção, não tinham esse nonce. O splash passou para `src/startup.css`, carregado por link; não foi desabilitada a CSP nem alterada sua configuração. O HTML de entrada não deve reintroduzir CSS inline sem compatibilizar esse mecanismo.

Pontos adicionais corrigidos a partir da inspeção do código:

- Navegação Cmd/Ctrl+mouse executava no mousedown e cancelava o evento antes de distinguir clique de seleção. Agora aguarda mouseup no mesmo editor/modelo, sem deslocamento superior a 4 px; arraste, Shift/Alt e perda de foco cancelam o gesto. A navegação de um clique permanece coberta pela suíte nativa.
- Modelos novos recuperavam a configuração padrão de coloração de brackets, apesar da opção desligada no editor principal. A opção agora também é aplicada ao criar modelos, incluindo diffs. O diff Git não impõe um tema escuro global; Aparência continua responsável pelo tema.

`scripts/check-editor-selection.mjs` executa ponteiro/teclado reais via Playwright no frontend, com transporte simulado: seleção comum, teclado, cores PHP, Cmd+arraste e preservação depois de painéis/temas. Opção `--webkit` cobre WebKit. Relatórios e capturas ficam em `.artifacts/editor-selection-{chromium,webkit}.{json,png}`. Não equivalem a controlar a janela com o problema relatado.

O roteiro Tauri recebeu verificação de seleção pelo comando do editor, cores PHP e preservação da seleção ao trocar tema; os testes de navegação passaram a completar down/up em vez de representar um clique apenas com down. Isso complementa o teste de gestos reais no navegador, sem afirmar que eventos sintéticos validam todo comportamento físico do macOS.

Compatibilidade PhpStorm permanece **Em desenvolvimento**; esta é uma correção própria, sem observação comparativa. O teste de pacote falhou antes da externalização do CSS (tokens presentes, todas as cores iguais) e passou imediatamente depois. A seleção existia no modelo antes da correção, mas seu estilo dinâmico também era bloqueado. O teste final verifica adicionalmente fundo visível da seleção, além do range. `--editor-only` no runner nativo permite executar esse recorte isoladamente.

## Resultado final

Build/typecheck e 22 testes Rust aprovados. A suíte completa `node scripts/check-native.mjs --packaged --no-db` aprovou os 22 grupos, incluindo cores, seleção com fundo visível, alternância de tema e navegação por clique completo. Os cinco cenários de gestos/cores passaram em Chrome e WebKit com transporte simulado. Os 8 grupos de inicialização também passaram após externalizar o CSS do splash. A assinatura do pacote foi verificada com codesign.
