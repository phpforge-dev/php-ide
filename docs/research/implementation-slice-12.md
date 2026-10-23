# Recorte 12 — resolução de conflitos em três painéis

22/10/2026. Próximo recorte escolhido pela prioridade do usuário (integração Git e resolução de conflitos), depois dos plugins.

## Observação da referência (OBS)

PhpStorm 2026.1.4, macOS. Repositório descartável criado por script próprio: `sample.php` com uma alteração só em `main` (`a`), uma só em `feature` (`b`), uma igual nos dois lados (`d`) e um conflito real (`c`); `config.txt` com conflito de linha única. `git merge feature` deixou `UU` nos dois arquivos.

Automação sem teclado: menus por AXPress; botões Java (que não expõem ação AX) por clique de mouse no centro do elemento, **somente** se a janela no topo daquele ponto pertencer ao PhpStorm, restaurando o ponteiro. O projeto foi aberto em "This Window" e marcado como confiável por ser a fixture sintética. Uma execução por caso.

| ID | Ação | Saída observada |
|---|---|---|
| OBS-MRG-01 | Abrir o projeto com merge pendente | Notificação com **Resolve Conflicts…** e **Abort Merge** |
| OBS-MRG-02 | Git → Resolve Conflicts… | Janela **Conflicts**: "Merging branch feature into branch main"; tabela Name / Yours (main) / Theirs (feature) com "Modified"; botões Accept Yours, Accept Theirs, Merge…, "Group files by directory", Close |
| OBS-MRG-03 | Merge… em sample.php | **Merge Revisions for …/sample.php**: "Changes from main" / **Result** / "Changes from feature"; Result **inicia com a base**, não com marcadores |
| OBS-MRG-04 | Barra | Previous/Next Difference, Compare Contents, Left/All/Right, Resolve Simple Conflicts, modo de espaços, Highlight words, Collapse Unchanged Fragments, Synchronize Scrolling, Settings; rodapé Accept Left, Accept Right, Cancel, Apply |
| OBS-MRG-05 | Contador inicial | "3 changes. 1 conflict." (lado único, lado único, mesma alteração nos dois; conflito separado) |
| OBS-MRG-06 | All | Result recebe a, b e d; c continua com a base; "No changes. 1 conflict." |
| OBS-MRG-07 | Resolve Simple Conflicts com conflito real | Nada muda; contador igual |
| OBS-MRG-08 | Apply com conflito pendente | "There is one conflict left unprocessed. Save changes and mark the conflict resolved anyway?" — Continue Merge / Apply Changes and Mark Resolved |
| OBS-MRG-09 | Resultado aplicado | Arquivo gravado com o Result (c na base) e preparado (`M `); sai da lista. O acionamento da confirmação não foi verificado: o diálogo fechou antes do clique em Continue Merge |
| OBS-MRG-10 | Accept Theirs em config.txt | Versão de feature gravada e preparada; janela Conflicts fecha sozinha quando não restam conflitos; merge continua aguardando commit |

Não observado: setas e ícones de margem por chunk (não expostos pela acessibilidade), comportamento de aplicar um lado de um conflito, desfazer, Cancel com alterações, conflitos de exclusão/rename/binário e rebase.

## Implementação

- `shared/merge.ts`: diff de Myers por linhas, merge de três vias em chunks `left`/`right`/`both`/`conflict` com faixas na base e em cada lado, texto do contador e "conflito simples" por caracteres (edições sem sobreposição). Sem dependências e testável no Node.
- `electron/git.ts`: `GitConflict` informa operação (merge, cherry-pick, revert, rebase) e nomes dos lados (branch atual × branch de `MERGE_MSG`/hash). Leituras passam a usar `GIT_OPTIONAL_LOCKS=0`: `git status` da IDE não toma o lock opcional do index e não provoca "index.lock exists" em comandos do terminal (falha intermitente encontrada no teste de UI de Git).
- `src/merge-editor.ts`: janela **Mesclar revisões** com três editores Monaco (esquerda e direita somente leitura, Resultado editável iniciado pela base), cores por tipo de chunk, `»`/`«` nas margens laterais e `×` (ignorar) no resultado; Esquerda/Todas/Direita, Resolver conflitos simples, ↑/↓ e F7/⇧F7, rolagem sincronizada pelo mapeamento de chunks, Aceitar esquerda/direita, Cancelar (confirma descarte se o resultado mudou) e Aplicar (confirma quando há pendências). Faixas dos chunks no resultado são decorações rastreadas, então edições manuais não deslocam as ações.
- Lista **Conflitos**: "Mesclando branch feature em main", colunas Minha/Deles com o estado de cada lado, Aceitar a minha/a deles, Mesclar… (duplo clique também), fecha sozinha sem conflitos. O painel Git ganhou **Resolver conflitos…** e **Abortar merge** no grupo de conflitos; clicar em um arquivo abre o merge direto.

HIP/REQ: aplicar um lado de um conflito o marca como resolvido e mantém o outro lado disponível para **acrescentar** (`+`), em vez de exigir ação nos dois lados; chunk igual nos dois lados é aplicado pela esquerda; `×` fica no resultado e não na margem esquerda.

## Verificação

- `tests/merge.test.ts`: caso observado (3 alterações, 1 conflito), inserção/exclusão e faixas projetadas, add/add, última linha sem terminador, propriedade do diff com 500 sequências, conflitos simples, rótulos e operação do serviço em merge e cherry-pick reais.
- `npm run test:merge-ui` (Electron, repositório idêntico ao observado): lista e cabeçalhos, Aceitar a deles, Mesclar…, "3 alterações. 1 conflito.", Todas → "Nenhuma alteração. 1 conflito.", conflito não simples, confirmação ao aplicar com pendência, `»` no conflito, aplicação, lista fechando sozinha, conteúdo final e index (`M` nos dois arquivos). Screenshots `.artifacts/merge-initial.png` e `merge-resolved.png`.
- `test:git-workflows-ui` atualizado para o novo editor (aplicar esquerda e acrescentar direita) e com seletor restrito ao painel Git; 3 execuções seguidas aprovadas após a correção do lock.
- Regressão: typecheck, `npm test` (28), `test:php` (3), `test:git-ui`, `test:ui`, `test:intelligence-ui`, `test:plugins-ui`.

## Limites

Desfazer no resultado não reverte o estado dos chunks; conflitos de exclusão/rename/symlink/submódulo/binário continuam recusados pelo serviço; sem destaque por palavra, colapso de trechos inalterados, modo de espaços, comparação par a par nem seleção múltipla na lista. Rebase usa rótulos genéricos ("base …", hash). Windows não validado. TOOL-GIT-001 permanece Em desenvolvimento.
