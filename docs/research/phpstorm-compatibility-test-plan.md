# Plano de testes de compatibilidade

Data: 21/10/2026. Roteiros prontos para observação; resultados semânticos ainda não aprovados. As expectativas abaixo são hipóteses/requisitos de teste, não resultados inventados do PhpStorm. [Fixture v1](fixtures/php-intelligence/README.md), [registro exploratório](phpstorm-observations.md), [estados](phpstorm-investigation-methodology.md).

## Perfil de execução

Usar cópia limpa por caso. Registrar versão/build via About, macOS ou Windows, keymap e layout de teclado, PHP level, plugins ativos, opções, confiança, estado da indexação e arquivos não salvos. Perfil inicial: PHP 8.2; referência local observada 2026.1.4. Desabilitar recursos generativos no perfil de ensaio apenas por configuração pública, se interferirem, e registrar a alteração. Não modificar preferências globais silenciosamente.

Executar pelo menu/ação nomeada antes do atalho. Os atalhos da documentação pública consultada são os apresentados pela página, não uma medição do keymap macOS local: completion `Ctrl+Space`, declaração `Ctrl+B`, usages `Alt+F7`, rename `Shift+F6`. Confirmar os bindings reais em Settings → Keymap; registrar conflitos com SO e teclas Fn. Não converter Ctrl em Cmd automaticamente.

Capturar, por execução: estado inicial, entrada, saída textual/destino, UI/foco, cancelamento, artefatos próprios antes/depois e diferenças. Três repetições limpas para estabilizar os casos funcionais; medir performance separadamente. Nenhuma suíte da nossa IDE existe ainda: esta entrega define contratos e dados para ela.

## Seis primeiros roteiros

### C01 — completion contextual (PHP-COMP-001)

1. Em `probe.php`, primeira chamada de `label`, remover `label()` deixando `$user->;`, com cursor após `->`.
2. Invocar Code → Code Completion → Basic; registrar candidatos, ordem, assinatura, visibilidade e item selecionado.
3. Verificar presença de `label` e `id`; registrar se `secret` aparece na primeira ou segunda invocação. A documentação prevê ampliação na segunda chamada; não condenar essa ampliação como bug.
4. Selecionar `label`, aceitar com Enter e registrar texto/range/cursor. Repetir com Tab sobre prefixo/sufixo existente, com configuração anotada.
5. Cancelar com Esc; confirmar texto preservado. Editar método em buffer não salvo e repetir; não aceitar resultados de uma revisão anterior.

Oracle: lista completa ordenada, texto inserido e posição. Comparação: conjunto obrigatório/proibido, ranking separado, snippet/edit/posição. Um popup com palavras por busca textual não passa.

### C02 — declaração, alias e trait (PHP-DEF-001 / PHP-TRAIT-001)

1. Restaurar fixture. Posicionar cursor em `label` da primeira chamada.
2. Acionar Navigate → Declaration or Usages, nome observado na versão local. Registrar arquivo, token/range, foco e estado anterior.
3. Hipótese: destino `src/User.php`, declaração `label`; verificar, não preencher antecipadamente.
4. Navigate → Back; confirmar retorno à posição original.
5. Repetir em `id`, esperando caracterizar destino no trait; repetir no alias `Person` para distinguir alias/import/classe. Símbolo inexistente deve produzir estado identificável, não salto arbitrário.

Oracle: destinos e histórico. Teste futuro LSP: `textDocument/definition` com URI/range; UI: ativação, navegação e retorno. Considerar múltiplos destinos e diferenças entre Definition e Declaration.

### C03 — usos semânticos (PHP-USE-001)

1. Selecionar declaração `User::label`, invocar Find Usages e registrar todas as opções e scope.
2. Capturar referências encontradas; observar tratamento de override Admin e chamada pela interface. Não pressupor que declaração/override conte como uso.
3. Confrontar com `Unrelated::label`, a string `'label'` e comentários: devem ser distinguidos das referências semânticas, conforme opção.
4. Abrir resultado e voltar; restringir scope ao arquivo e depois projeto; cancelar busca e verificar que resultados parciais são identificáveis.

Oracle: conjunto por URI/range e categoria, opções e contagem. Teste futuro `textDocument/references` mais UI de escopo/agrupamento. Comparar conjuntos, não apenas número de linhas.

### C04 — implementações (PHP-IMP-001 / PHP-INHERIT-001)

1. No método de `Named`, invocar Navigate → Implementation(s).
2. Registrar se há popup/lista/salto direto e quais declarações aparecem. Explorar User e Admin separadamente.
3. Repetir na chamada `describe(Named $value)` e em classe concreta; verificar distinção entre destino declarado e implementação possível.
4. Em variante da fixture, acrescentar segunda implementação e remover uma; observar atualização após análise.

Oracle: conjunto de destinos, multiplicidade e interação. Teste futuro `textDocument/implementation`; Unrelated não deve ser incluído só pelo nome.

### C05 — tipos, PHPDoc e generics (PHP-TYPE-001 / PHP-DOC-001 / PHP-GEN-001)

1. No marcador TYPE-01, invocar completion após `$inferred->`, cuja origem é `identity(new User())`.
2. Registrar candidatos e informação de tipo pela ação pública de documentação/tipo. Não inferir o algoritmo interno pelo resultado.
3. Repetir com retorno PHPDoc simples sem template; remover PHPDoc e comparar.
4. No TYPE-02, comparar antes e dentro do `instanceof`, com a opção de nullable anotada.
5. Próximo lote: bounds, `class-string<T>`, coleção de T, herança genérica e templates aninhados em fixtures separadas. A fixture v1 não cobre esses casos.

Oracle: tipos exibidos e seus efeitos em completion/navegação. Teste futuro compara `hover` quando disponível e obrigatoriamente candidatos/destinos. Sucesso em template identidade não valida generics como um todo.

### C06 — rename e integridade (PHP-RENAME-001)

1. Cópia limpa; selecionar `User::label`, Refactor → Rename, propor `displayName`.
2. Registrar oferta de renomear supermétodo/hierarquia, caso exista. Abrir opções/Preview; anotar busca em strings/comentários/texto e scope.
3. Salvar conjunto proposto por arquivo/range antes de aplicar. Cancelar e comparar hashes do texto com baseline.
4. Repetir, aplicar e comparar diff completo. `Unrelated::label` deve continuar distinto; string depende da opção explicitamente escolhida.
5. Undo e confirmar restauração completa. Variantes posteriores: colisão com método existente, arquivo read-only, alteração concorrente e falha de escrita, sem deixar metade do rename aplicado.

Oracle: preview, escolhas e diff; não estabelecer resultado da hierarquia antes de observar. Testes futuros `prepareRename`/`rename` e aplicação transacional; conjunto de edições deve coincidir com preview, sem alterações extras.

## Próximo lote obrigatório de P0

| Caso | Fixture adicional | Critério |
|---|---|---|
| Indexação fria/quente | 1k e 10k arquivos gerados com seed | Criar/editar/remover/renomear e excluir pasta; índice sem referências obsoletas, UI editável e progress report |
| Vendor | Pacote Composer local fixado, instalado de fonte própria | PSR-4, classmap e dependência ausente; navegação correta sem executar pacote |
| Nativos | PHP levels e extensões controlados | strlen/DateTime e função de extensão habilitada/desabilitada; navegação à assinatura |
| Autoimport | Duas classes de mesmo short name e alias existente | Import único, escolha em ambiguidade, nenhuma duplicação, undo |
| Traits/herança | `as`, `insteadof`, parent/self/static e conflito | Resolução e renomeação semanticamente consistentes |

## Testes da nossa IDE e comparação

Separar quatro camadas: (1) parsing/resolução/tipos com fixtures; (2) protocolo LSP com buffers e versões; (3) ações reais de UI, foco, teclado e recuperação; (4) diferencial contra observações aprovadas. Um teste unitário com resultado escrito pelo implementador não substitui o oracle externo.

Snapshots futuros guardam URI relativa, ranges em convenção declarada, candidatos, tipos, diagnósticos, texto antes/depois e revisão. O adapter LSP deve converter UTF-16/UTF-8 corretamente, incluindo acentos e emoji antes do cursor. Não ordenar candidatos antes de comparar ranking. Não normalizar away diferenças de alias, namespace ou edits.

Condições para validar um recorte: todos os casos obrigatórios executados em referência e IDE, resultado semântico correspondente, negativos e cancelamento aprovados, evidência ligada ao caso e perfil completo. Bug conhecido da referência pode ter comportamento diferente deliberado, mas deve aparecer como diferença e não “compatível” naquele caso.

macOS e Windows são perfis separados. Não transferir aprovação de um SO ao outro. Linux fica previsto, sem alegação de suporte validado. Repetir UI sob teclado US/PT-BR, escala diferente e fonte ampliada quando o shell existir.

Performance: medir índice frio/quente e completion p50/p95 em hardware e corpus fixados; sugestão inicial de alvo de UX é completion quente p95 ≤ 150 ms e feedback de operação ≤ 100 ms, **metas próprias não medições do PhpStorm**. Usar pelo menos 30 amostras após aquecimento definido e registrar memória/pico. Não publicar regressão percentual comparando corpus ou máquinas diferentes.

## Relatório de diferença

Cada divergência informa ID/caso, perfil, resultado esperado com origem, resultado real, reprodução, severidade, impacto no usuário e decisão (corrigir, aceitar diferença explícita ou investigar). Falha de automação é `blocked`, não falha funcional da IDE. Ausência de screenshot não invalida evidência textual suficiente para um destino; impede alegações sobre fidelidade visual que dependam dela.
