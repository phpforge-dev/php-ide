> Continuação e estado atual: [recorte 04](implementation-slice-04.md). As limitações abaixo descrevem a entrega histórica do recorte 03.

# Recorte 03 — Git: revisão e commit local

21/10/2026. Implementação independente a partir do [roteiro Git](phpstorm-git.md), da observação pública dos painéis e de requisitos próprios. Não há cópia de recursos ou código da referência. Comparação comportamental com o PhpStorm continua pendente; a família TOOL-GIT-001 está **Em desenvolvimento**.

## Fluxo entregue

Abrir a raiz de um repositório → Git → escolher arquivo → comparar versões lado a lado → preparar arquivo inteiro/retirar do commit → escrever mensagem → revisar lista e mensagem → criar commit local. Voltar à revisão ou Escape antes da execução não cria commit. O diálogo indica explicitamente que todo o index será incluído; arquivos já preparados externamente também aparecem na lista. Não há push automático.

A lista separa preparados, alterações no disco e não rastreados. Um arquivo com mudanças preparadas e locais aparece nos dois grupos, com comparações distintas: HEAD → index e index → disco. O diff é somente leitura e não inclui buffers não salvos. Retirar do commit preserva conteúdo no disco. Texto Unicode, remoção, rename preparado e arquivos com espaços/hífen têm testes com Git real.

A branch atual aparece no painel. Histórico mostra os últimos 100 commits da branch atual, com mensagem, autor, data e hash curto; ainda não tem grafo, seleção de commit → arquivos, filtros ou diff histórico. O painel anuncia esse limite.

## Arquitetura e consistência

- `electron/git.ts`: Git CLI com argumentos separados, pathspec literal, status porcelain delimitado por NUL, limite de saída de 2 MB e timeout de 30 segundos. Não usa diff externo/textconv. Opera na raiz explicitamente aberta, incluindo a validação de raiz; subpasta recebe orientação para abrir a raiz.
- `shared/contracts.ts`, main e preload: métodos específicos status/diff/stage/commit/log; renderer sem shell e sem Node.
- `src/git-panel.ts`: grupos selecionáveis, Monaco DiffEditor, confirmação local, erros e atualização a cada três segundos enquanto o painel está visível e a janela tem foco. Atualização mantém o diff revisado estável; reabrir arquivo obtém nova comparação. Não é watcher completo de Git.
- Stage/unstage confere token do conteúdo revisado e do index. Commit confere token HEAD+index. Mudança externa detectada exige nova revisão. Mutações deste serviço são serializadas; troca de projeto fica desabilitada durante a mutação pela UI. Isso não é uma transação global contra outro cliente Git: ainda existe janela entre conferência e comando, sujeita aos locks e comportamento do Git.
- Comandos commit respeitam identidade, configuração e hooks do repositório; erros são apresentados. As fixtures usam identidade fictícia e desabilitam hooks apenas no repositório temporário. Não houve commit em projeto pessoal ou push durante os testes.

## Evidência local

`npm test`: quatro testes aprovados, incluindo três cenários de Git real e a regressão de arquivos. Os cenários cobrem commit do conteúdo do index preservando conteúdo local, cancelamento implícito pela ausência de operação, stage/unstage, repositório sem primeiro commit, rename, exclusão, revisão desatualizada, index alterado externamente, conflitos, symlink, binário, escape, subpasta e ausência de repositório.

`npm run test:git-ui` (requer build): Electron real, diff HEAD/index/disco, stage de sample.php, diálogo cancelado com HEAD inalterado, commit local, conteúdo do commit/index/disco conferido via Git, histórico e retorno ao projeto. Screenshot próprio `.artifacts/git-review.png`. O teste não utiliza o PhpStorm e não constitui validação comparativa.

Build/typecheck aprovados. A regressão `test:ui` também passou com F12, referências e implementações, sem erros do renderer. O aviso preexistente de bundle grande permanece. Não há benchmark de repositórios grandes.

## Diferenças ainda abertas

O padrão observado no Storm agrupa Changes com seleção; nossa primeira versão oferece staging explícito e o identifica na interface. Ainda faltam changelists, seleção de trechos/linhas, amend, marcadores no editor, rollback, stash/shelve, checkout/criação de branches, grafo e detalhes do Log, merge/rebase, resolução de conflitos e operações remotas. O título da branch não simula um seletor funcional.

Diff de binário, submódulo, symlink ou texto inválido é recusado com mensagem; o primeiro recorte não permite preparar esses arquivos pela UI. Commit de conteúdo já preparado externamente segue Git e exige revisão da lista. Faltam ensaios de hooks/assinatura, timeout com resultado ambíguo, repositórios grandes, múltiplas raízes e Windows. Histórico não percorre todas as branches. Atalhos específicos do Git e foco completo por teclado ainda precisam de comparação; não há equivalência de keymap declarada.

## Próxima saída verificável

Repetir GIT-01/02/03/04 no perfil de staging do PhpStorm local e registrar oracle e diferenças. Depois ampliar um fluxo por vez: seleção parcial e changelists; Log com seleção de commit/arquivo/diff; branches; merge e remoto local. Não promover a família inteira por testes deste recorte.
