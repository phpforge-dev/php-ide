Configuração inicial e atualizações (24/10/2026): [requisito próprio e implementação](../specs/first-run-and-updates.md). Seleção opcional na primeira abertura, fila em Rust e auto update desligado por padrão. Testes unitários e WebKit sintético são evidências próprias; janela Tauri e distribuição assinada seguem pendentes. Nenhuma promoção de compatibilidade.

Extração paralela (24/10/2026): [12 repositórios próprios, contratos e limites de vinculação nativa](parallel-plugin-extraction.md). Contribuições de UI/semântica são opcionais; seis bibliotecas Rust externas são vinculadas estaticamente ao host. Aceitação Tauri completa em andamento; nenhuma família promovida por esta mudança arquitetural.

Standalone PHP tools (23/10/2026): [Xdebug, Composer and PHPUnit/Pest extracted into separate plugin packages](native-tool-plugins.md). Native-tool lifecycle validation is separate from engine/version coverage; no compatibility family is promoted.

# Catálogo inicial de funcionalidades — referência PhpStorm

Plugins separados (23/10/2026): [instalação automática de pacotes fixados por commit/hash](../plugins/marketplace.md), sem cópias no fonte ou instalador da IDE. Cinco plugins padrão, download em segundo plano, erros recuperáveis e preservação de remoções/permissões. Requisito próprio; sem promoção comparativa.


Splash nativa macOS (23/10/2026): [imagem AppKit embutida antes do WebView e handoff de prontidão](startup-welcome.md). Requisito próprio; Windows/Linux permanecem com splash HTML, sem nova evidência comparativa.

Marketplace próprio (23/10/2026): [catálogo estático, instalação Git e pacotes independentes](../plugins/marketplace.md). Laravel, .env, Docker e Bash passam pelo gerenciador de plugins. Sem nova evidência comparativa com PhpStorm.

Manutenção do fonte (23/10/2026): [remoção do runtime legado e verificações atuais](../development/source-cleanup.md). Os testes migrados usam os módulos ativos; esta limpeza não promove estados de compatibilidade.

Distribuição própria (23/10/2026): [builds Windows/Linux e macOS](desktop-distribution.md). Compilação, testes e inicialização são evidências distintas; não promovem compatibilidade funcional com PhpStorm.

Data: 21/10/2026. Prioridades: P0 inteligência PHP, P1 interface, P2 ferramentas. Complexidade é estimativa relativa, sem prazo. A baseline documental precedeu o código; agora há um primeiro recorte experimental descrito em [implementação](implementation-slice-01.md). Os critérios abaixo são REQ preliminares; devem ser refinados pelas observações antes do estado Especificada.

**A investigação comparativa permanece incompleta.** Há pesquisa documental e ensaios exploratórios em andamento, mas nenhum comportamento completo fechou o ciclo de investigação. Veja [observações](phpstorm-observations.md) para o recorte efetivamente observado; presença de menus não promove uma feature.

Estados permitidos: Não investigada → Investigada → Especificada → Em desenvolvimento → Implementada → Validada. Condições em [metodologia](phpstorm-investigation-methodology.md).

## PHP-COMP-001 — Autocomplete contextual

- **Extração arquitetural (24/10/2026):** PHP intelligence; [propriedade, contratos e evidências](parallel-plugin-extraction.md). Estados e limitações comparativas desta família permanecem inalterados.

- **Descrição/propósito:** Completar membros alcançáveis no cursor.
- **Prioridade / complexidade estimada:** P0 / Muito alta.
- **Dependências:** Índice, tipos, visibilidade.
- **Comportamento observado:** ainda não caracterizado integralmente; ensaios exploratórios não constituem oracle aprovado.
- **Evidência da implementação:** [recorte e testes](implementation-slice-01.md); [recorte 09: tipos na lista, classes e imports](implementation-slice-09.md).
- **Evidências da referência:** [fonte DOC](https://www.jetbrains.com/help/phpstorm/auto-completing-code.html); OBS-COMP-01…05 no [recorte 09](implementation-slice-09.md) (uma execução, sem screenshots).
- **Critérios de aceitação preliminares:** Primeira chamada separa membros públicos/privados; segunda chamada e Enter/Tab documentados; overlay atualizado.
- **Estado de implementação:** Em desenvolvimento — recorte independente; investigação comparativa pendente.
- **Diferenças conhecidas:** equivalência não medida; a cobertura atual não satisfaz ainda o contrato completo desta família. Limitações da referência e plugins dependem de ensaio versionado.

## PHP-DEF-001 — Go to Definition

- **Extração arquitetural (24/10/2026):** PHP intelligence; [propriedade, contratos e evidências](parallel-plugin-extraction.md). Estados e limitações comparativas desta família permanecem inalterados.

- **Descrição/propósito:** Localizar declaração do símbolo.
- **Prioridade / complexidade estimada:** P0 / Alta.
- **Dependências:** Resolver, ranges, aliases.
- **Comportamento observado:** ainda não caracterizado integralmente; ensaios exploratórios não constituem oracle aprovado.
- **Evidência da implementação:** [recorte e testes](implementation-slice-05.md).
- **Evidências da referência:** [fonte DOC](https://www.jetbrains.com/help/phpstorm/navigating-through-the-source-code.html); OBS-NAV-02 e OBS-STR-01…05 (strings: caminho com `__DIR__`, FQN, callable) no [recorte 09](implementation-slice-09.md).
- **Critérios de aceitação preliminares:** Alias leva a User::label; trait leva a HasId::id; retorno preserva cursor; homônimo não interfere.
- **Estado de implementação:** Em desenvolvimento — recorte independente; investigação comparativa pendente.
- **Diferenças conhecidas:** equivalência não medida; a cobertura atual não satisfaz ainda o contrato completo desta família. Limitações da referência e plugins dependem de ensaio versionado.

## PHP-USE-001 — Find Usages

- **Extração arquitetural (24/10/2026):** PHP intelligence; [propriedade, contratos e evidências](parallel-plugin-extraction.md). Estados e limitações comparativas desta família permanecem inalterados.

- **Descrição/propósito:** Encontrar referências semânticas.
- **Prioridade / complexidade estimada:** P0 / Muito alta.
- **Dependências:** Índice reverso, scopes.
- **Comportamento observado:** ainda não caracterizado integralmente; ensaios exploratórios não constituem oracle aprovado.
- **Evidência da implementação:** [recorte e testes](implementation-slice-01.md).
- **Evidências da referência:** [fonte DOC](https://www.jetbrains.com/help/phpstorm/find-highlight-usages.html).
- **Critérios de aceitação preliminares:** Conjunto de usos por arquivo/range confere; Unrelated e string ficam separados; busca cancelável.
- **Estado de implementação:** Em desenvolvimento — recorte independente; investigação comparativa pendente.
- **Diferenças conhecidas:** equivalência não medida; a cobertura atual não satisfaz ainda o contrato completo desta família. Limitações da referência e plugins dependem de ensaio versionado.

- **Recorte 02:** [testes locais, atualização com cache e limitações](implementation-slice-02.md); comparação com referência ainda pendente.
- **Recorte 09:** [índice próprio de classes atualizado pelo watcher](implementation-slice-09.md); léxico, sem PSR-4 nem medição em projetos grandes.

## PHP-IMP-001 — Go to Implementation

- **Extração arquitetural (24/10/2026):** PHP intelligence; [propriedade, contratos e evidências](parallel-plugin-extraction.md). Estados e limitações comparativas desta família permanecem inalterados.

- **Descrição/propósito:** Navegar da abstração às implementações.
- **Prioridade / complexidade estimada:** P0 / Alta.
- **Dependências:** Hierarquia e dispatch.
- **Comportamento observado:** ainda não caracterizado integralmente; ensaios exploratórios não constituem oracle aprovado.
- **Evidência da implementação:** [recorte e testes](implementation-slice-01.md).
- **Evidências da referência:** [fonte DOC](https://www.jetbrains.com/help/phpstorm/navigating-through-the-source-code.html).
- **Critérios de aceitação preliminares:** Named::label distingue User/Admin; ambiguidade apresenta escolha; alvo inexistente é explícito.
- **Estado de implementação:** Em desenvolvimento — recorte independente; investigação comparativa pendente.
- **Diferenças conhecidas:** equivalência não medida; a cobertura atual não satisfaz ainda o contrato completo desta família. Limitações da referência e plugins dependem de ensaio versionado.

- **Recorte 02:** [testes locais, atualização com cache e limitações](implementation-slice-02.md); comparação com referência ainda pendente.

## PHP-TYPE-001 — Inferência de tipos

- **Extração arquitetural (24/10/2026):** PHP intelligence; [propriedade, contratos e evidências](parallel-plugin-extraction.md). Estados e limitações comparativas desta família permanecem inalterados.

- **Descrição/propósito:** Propagar tipos por expressão e controle de fluxo.
- **Prioridade / complexidade estimada:** P0 / Muito alta.
- **Dependências:** AST, resolução, fluxo.
- **Comportamento observado:** ainda não caracterizado integralmente; ensaios exploratórios não constituem oracle aprovado.
- **Evidências:** [fonte DOC](https://www.jetbrains.com/help/phpstorm/php-type-checking.html).
- **Critérios de aceitação preliminares:** Alias, retorno, união/null e instanceof geram candidatos corretos; unknown não inventa tipo.
- **Estado de implementação:** Em desenvolvimento — [recorte 20](implementation-slice-20.md): alias, nullsafe, instanceof, `static` e unknown aprovados em fixture própria contra o Phpactor; sem OBS.
- **Diferenças conhecidas:** `match` não é inferido (lacuna do Phpactor); equivalência não medida.

## PHP-IDX-001 — Indexação

- **Extração arquitetural (24/10/2026):** PHP intelligence; [propriedade, contratos e evidências](parallel-plugin-extraction.md). Estados e limitações comparativas desta família permanecem inalterados.

- **Descrição/propósito:** Descobrir e atualizar símbolos.
- **Prioridade / complexidade estimada:** P0 / Muito alta.
- **Dependências:** Watcher, parser, cache.
- **Comportamento observado:** ainda não caracterizado integralmente; ensaios exploratórios não constituem oracle aprovado.
- **Evidência da implementação:** [recorte e testes](implementation-slice-01.md).
- **Evidências da referência:** [fonte DOC da plataforma, não OBS do PhpStorm](https://plugins.jetbrains.com/docs/intellij/indexing-and-psi-stubs.html).
- **Critérios de aceitação preliminares:** Adicionar/editar/remover arquivo altera resultados; reinício reaproveita cache válido; análise visível e UI editável.
- **Estado de implementação:** Em desenvolvimento — recorte independente; investigação comparativa pendente.
- **Diferenças conhecidas:** equivalência não medida; a cobertura atual não satisfaz ainda o contrato completo desta família. Limitações da referência e plugins dependem de ensaio versionado.

- **Recorte 02:** [testes locais, atualização com cache e limitações](implementation-slice-02.md); comparação com referência ainda pendente.

## PHP-DOC-001 — PHPDoc

- **Extração arquitetural (24/10/2026):** PHP intelligence; [propriedade, contratos e evidências](parallel-plugin-extraction.md). Estados e limitações comparativas desta família permanecem inalterados.

- **Descrição/propósito:** Interpretar contratos documentados.
- **Prioridade / complexidade estimada:** P0 / Alta.
- **Dependências:** Parser PHPDoc, tipos.
- **Comportamento observado:** ainda não caracterizado integralmente; ensaios exploratórios não constituem oracle aprovado.
- **Evidências:** [fonte DOC](https://www.jetbrains.com/help/phpstorm/php-type-checking.html).
- **Critérios de aceitação preliminares:** @param/@return/@var resolvem namespaces e arrays; conflito com tipo nativo é registrado; doc inválido não derruba análise.
- **Estado de implementação:** Em desenvolvimento — [recorte 20](implementation-slice-20.md): `@param`/`@return`/`@var` com namespaces e arrays, `@property-read`, `@method` e PHPDoc inválido aprovados; sem OBS.
- **Diferenças conhecidas:** `@property` homônimo de método falha; conflito PHPDoc × tipo nativo não testado; equivalência não medida.

## PHP-GEN-001 — Generics

- **Extração arquitetural (24/10/2026):** PHP intelligence; [propriedade, contratos e evidências](parallel-plugin-extraction.md). Estados e limitações comparativas desta família permanecem inalterados.

- **Descrição/propósito:** Relacionar parâmetros de tipo e resultados.
- **Prioridade / complexidade estimada:** P0 / Muito alta.
- **Dependências:** PHPDoc e substituição.
- **Comportamento observado:** ainda não caracterizado integralmente; ensaios exploratórios não constituem oracle aprovado.
- **Evidências:** [fonte DOC](https://www.jetbrains.com/help/phpstorm/php-type-checking.html).
- **Critérios de aceitação preliminares:** identity(User) preserva User; investigar bounds, aninhamento e herança separadamente sem assumir cobertura.
- **Estado de implementação:** Em desenvolvimento — [recorte 20](implementation-slice-20.md): coleções com `@template`/`@extends`/`@implements` e `class-string` em método aprovados; sem OBS.
- **Diferenças conhecidas:** `@template` em função (`identity(User)`) falha (lacuna do motor); equivalência não medida.

## PHP-TRAIT-001 — Traits

- **Extração arquitetural (24/10/2026):** PHP intelligence; [propriedade, contratos e evidências](parallel-plugin-extraction.md). Estados e limitações comparativas desta família permanecem inalterados.

- **Descrição/propósito:** Resolver métodos e adaptações.
- **Prioridade / complexidade estimada:** P0 / Alta.
- **Dependências:** Composição de símbolos.
- **Comportamento observado:** ainda não caracterizado integralmente; ensaios exploratórios não constituem oracle aprovado.
- **Evidências:** [fonte DOC](https://www.jetbrains.com/help/phpstorm/navigating-through-the-source-code.html).
- **Critérios de aceitação preliminares:** Navega a HasId::id; casos futuros as/insteadof e conflitos têm resultado explícito.
- **Estado de implementação:** Em desenvolvimento — [recorte 20](implementation-slice-20.md): `insteadof` e `as alias` corrigidos pela camada própria (definição, completion, hover); sem OBS.
- **Diferenças conhecidas:** Mudança de visibilidade por `as` só parcial; equivalência não medida.

## PHP-INHERIT-001 — Herança

- **Extração arquitetural (24/10/2026):** PHP intelligence; [propriedade, contratos e evidências](parallel-plugin-extraction.md). Estados e limitações comparativas desta família permanecem inalterados.

- **Descrição/propósito:** Resolver membros herdados/sobrescritos.
- **Prioridade / complexidade estimada:** P0 / Alta.
- **Dependências:** Hierarquia e visibilidade.
- **Comportamento observado:** ainda não caracterizado integralmente; ensaios exploratórios não constituem oracle aprovado.
- **Evidências:** [fonte DOC](https://www.jetbrains.com/help/phpstorm/navigating-through-the-source-code.html).
- **Critérios de aceitação preliminares:** Admin herda id e sobrescreve label; parent/self/static e visibilidade testados em casos próprios.
- **Estado de implementação:** Em desenvolvimento — [recorte 20](implementation-slice-20.md): navegação na hierarquia aprovada; marcadores na margem (override/implement/overridden/implemented/subclassed) com navegação; sem OBS.
- **Diferenças conhecidas:** Equivalência visual dos marcadores não medida; sem teste nativo dos marcadores.

## PHP-IMPORT-001 — Autoimport

- **Extração arquitetural (24/10/2026):** PHP intelligence; [propriedade, contratos e evidências](parallel-plugin-extraction.md). Estados e limitações comparativas desta família permanecem inalterados.

- **Descrição/propósito:** Inserir imports válidos.
- **Prioridade / complexidade estimada:** P0 / Alta.
- **Dependências:** Resolver, edições e estilo.
- **Comportamento observado:** ainda não caracterizado integralmente; ensaios exploratórios não constituem oracle aprovado.
- **Evidências:** [fonte DOC](https://www.jetbrains.com/help/phpstorm/settings-auto-import.html).
- **Critérios de aceitação preliminares:** Inserção não duplica use; conflito oferece alias; preview/undo e paste conforme configuração.
- **Estado de implementação:** Em desenvolvimento — [recorte 19](implementation-slice-19.md): completion de classe insere `use` sem duplicar; conflito gera alias e alternativa FQN; quick fix de classe não resolvida (importar/alias/qualificar); sem OBS.
- **Diferenças conhecidas:** Sem autoimport ao colar e sem configuração de estilo; equivalência não medida.

## PHP-RENAME-001 — Rename Symbol

- **Extração arquitetural (24/10/2026):** PHP intelligence; [propriedade, contratos e evidências](parallel-plugin-extraction.md). Estados e limitações comparativas desta família permanecem inalterados.

- **Descrição/propósito:** Renomear símbolo e referências.
- **Prioridade / complexidade estimada:** P0 / Muito alta.
- **Dependências:** Referências, transação.
- **Comportamento observado:** ainda não caracterizado integralmente; ensaios exploratórios não constituem oracle aprovado.
- **Evidências:** [fonte DOC](https://www.jetbrains.com/help/phpstorm/rename-refactorings.html).
- **Critérios de aceitação preliminares:** Preview exato; homônimos preservados; opções de texto explícitas; cancelar não altera; undo restaura hashes.
- **Estado de implementação:** Em desenvolvimento — [recorte 19](implementation-slice-19.md): Shift+F6 com prévia por ocorrência, opção explícita para comentários/strings, homônimos preservados por namespace/imports, transação com hash e histórico local, cancelar sem alterar e desfazer; classes por motor próprio, membros/variáveis pelo Phpactor; renomear/mover arquivo pela árvore atualiza classe/namespace. Smoke nativo aprovado; sem OBS.
- **Diferenças conhecidas:** Sem rename in-place e sem redo; conflitos de membros homônimos na hierarquia delegados ao Phpactor; equivalência não medida.

## PHP-VENDOR-001 — Navegação em vendor

- **Extração arquitetural (24/10/2026):** PHP intelligence; [propriedade, contratos e evidências](parallel-plugin-extraction.md). Estados e limitações comparativas desta família permanecem inalterados.

- **Descrição/propósito:** Explorar dependências Composer.
- **Prioridade / complexidade estimada:** P0 / Alta.
- **Dependências:** Roots, autoload, índice.
- **Comportamento observado:** ainda não caracterizado integralmente; ensaios exploratórios não constituem oracle aprovado.
- **Evidências:** [fonte DOC](https://www.jetbrains.com/help/phpstorm/using-the-composer-dependency-manager.html).
- **Critérios de aceitação preliminares:** Ir e voltar em pacote local instalado; exclusão e dependência ausente tratadas; rename não altera vendor por acidente.
- **Estado de implementação:** Em desenvolvimento — [recorte 20](implementation-slice-20.md): pacote local em `vendor` navegável e dependência ausente tratada; rename de classes recusa vendor ([recorte 19](implementation-slice-19.md)); sem OBS.
- **Diferenças conhecidas:** Exclusão configurável de vendor não implementada; equivalência não medida.

## PHP-NATIVE-001 — Funções/classes nativas

- **Extração arquitetural (24/10/2026):** PHP intelligence; [propriedade, contratos e evidências](parallel-plugin-extraction.md). Estados e limitações comparativas desta família permanecem inalterados.

- **Descrição/propósito:** Completar e documentar runtime PHP.
- **Prioridade / complexidade estimada:** P0 / Alta.
- **Dependências:** Stubs, PHP level, extensões.
- **Comportamento observado:** ainda não caracterizado integralmente; ensaios exploratórios não constituem oracle aprovado.
- **Evidências:** [fonte SRC](https://github.com/JetBrains/phpstorm-stubs/tree/912ae721089fc48534d3a5795997ee8a2802b8cd).
- **Critérios de aceitação preliminares:** strlen/DateTime navegam a assinatura pública; versão/extensão condiciona disponibilidade; stubs somente leitura.
- **Estado de implementação:** Em desenvolvimento — [recorte 20](implementation-slice-20.md): completion, hover e definição em stubs nativos, abertos somente leitura a partir do PHAR; sem OBS.
- **Diferenças conhecidas:** Disponibilidade por versão do PHP/extensão não filtrada; hover/definição dentro do stub não funcionam; equivalência não medida.

## UI-PROJECT-001 — Gerenciamento de projetos

- **Descrição/propósito:** Abrir, fechar e reabrir pastas.
- **Prioridade / complexidade estimada:** P1 / Média.
- **Dependências:** Workspace, persistência.
- **Comportamento observado:** ainda não caracterizado integralmente; ensaios exploratórios não constituem oracle aprovado.
- **Evidência da implementação:** [recorte e testes](implementation-slice-01.md).
- **Evidências da referência:** [fonte DOC](https://www.jetbrains.com/help/phpstorm/creating-and-managing-projects.html).
- **Critérios de aceitação preliminares:** Abrir fixture isolada, listar arquivos, restaurar buffers e tratar caminho ausente.
- **Estado de implementação:** Em desenvolvimento — recorte independente; investigação comparativa pendente.
- **Diferenças conhecidas:** equivalência não medida; a cobertura atual não satisfaz ainda o contrato completo desta família. Limitações da referência e plugins dependem de ensaio versionado.

## UI-EDITOR-001 — Editor de código

- **Descrição/propósito:** Editar e salvar com confiança.
- **Prioridade / complexidade estimada:** P1 / Alta.
- **Dependências:** Modelo de texto, host.
- **Comportamento observado:** ainda não caracterizado integralmente; ensaios exploratórios não constituem oracle aprovado.
- **Evidência da implementação:** [recorte e testes](implementation-slice-01.md).
- **Evidências da referência:** REQ do escopo solicitado; sem evidência comportamental coletada.
- **Critérios de aceitação preliminares:** Undo/redo, UTF-8, CRLF, seleção e arquivo externo alterado preservam conteúdo; recuperação de buffer.
- **Estado de implementação:** Em desenvolvimento — recorte independente; investigação comparativa pendente.
- **Diferenças conhecidas:** equivalência não medida; a cobertura atual não satisfaz ainda o contrato completo desta família. Limitações da referência e plugins dependem de ensaio versionado.

## UI-LAYOUT-001 — Layout da IDE

- **Descrição/propósito:** Organizar editor e ferramentas.
- **Prioridade / complexidade estimada:** P1 / Média.
- **Dependências:** Shell, foco.
- **Comportamento observado:** ainda não caracterizado integralmente; ensaios exploratórios não constituem oracle aprovado.
- **Evidência da implementação:** [recorte e testes](implementation-slice-05.md).
- **Evidências da referência:** REQ do escopo solicitado; sem evidência comportamental coletada.
- **Critérios de aceitação preliminares:** Editor legível com painéis; redimensionar e restaurar layout; navegação por teclado.
- **Estado de implementação:** Em desenvolvimento — recorte independente; investigação comparativa pendente.
- **Diferenças conhecidas:** equivalência não medida; a cobertura atual não satisfaz ainda o contrato completo desta família. Limitações da referência e plugins dependem de ensaio versionado.

- **Organização visual atual:** [recorte 06](implementation-slice-06.md), sem equivalência comparativa declarada.

## UI-PANELS-001 — Painéis

- **Descrição/propósito:** Mostrar/ocultar ferramentas.
- **Prioridade / complexidade estimada:** P1 / Média.
- **Dependências:** Shell e comandos.
- **Comportamento observado:** ainda não caracterizado integralmente; ensaios exploratórios não constituem oracle aprovado.
- **Evidência da implementação:** [recorte e testes](implementation-slice-05.md).
- **Evidências da referência:** REQ do escopo solicitado; sem evidência comportamental coletada.
- **Critérios de aceitação preliminares:** Foco retorna ao editor ao fechar; painel não encobre controles em janela pequena.
- **Estado de implementação:** Em desenvolvimento — recorte independente; investigação comparativa pendente.
- **Diferenças conhecidas:** equivalência não medida; a cobertura atual não satisfaz ainda o contrato completo desta família. Limitações da referência e plugins dependem de ensaio versionado.

- **Organização visual atual:** [recorte 06](implementation-slice-06.md), sem equivalência comparativa declarada.

## UI-TABS-001 — Abas

- **Descrição/propósito:** Alternar documentos.
- **Prioridade / complexidade estimada:** P1 / Média.
- **Dependências:** Buffers e histórico.
- **Comportamento observado:** ainda não caracterizado integralmente; ensaios exploratórios não constituem oracle aprovado.
- **Evidência da implementação:** [recorte e testes](implementation-slice-05.md).
- **Evidências da referência:** REQ do escopo solicitado; sem evidência comportamental coletada.
- **Critérios de aceitação preliminares:** Fechar arquivo alterado não perde texto; alternar/reordenar preserva posição.
- **Estado de implementação:** Em desenvolvimento — recorte independente; investigação comparativa pendente.
- **Diferenças conhecidas:** equivalência não medida; a cobertura atual não satisfaz ainda o contrato completo desta família. Limitações da referência e plugins dependem de ensaio versionado.

- **Organização visual atual:** [recorte 06](implementation-slice-06.md), sem equivalência comparativa declarada.

## UI-TREE-001 — Explorador de projetos

- **Descrição/propósito:** Exibir e manipular árvore.
- **Prioridade / complexidade estimada:** P1 / Média.
- **Dependências:** Watcher e workspace.
- **Comportamento observado:** ainda não caracterizado integralmente; ensaios exploratórios não constituem oracle aprovado.
- **Evidência da implementação:** [recorte e testes](implementation-slice-01.md); criar, renomear, mover, copiar, excluir e histórico local pelo menu de contexto no [recorte 16](implementation-slice-16.md).
- **Evidências da referência:** [fonte DOC](https://www.jetbrains.com/help/phpstorm/creating-and-managing-projects.html).
- **Critérios de aceitação preliminares:** Expandir, buscar, criar/renomear arquivo e sincronizar seleção; erro de acesso visível.
- **Estado de implementação:** Em desenvolvimento — recorte independente; investigação comparativa pendente.
- **Diferenças conhecidas:** equivalência não medida; a cobertura atual não satisfaz ainda o contrato completo desta família. Limitações da referência e plugins dependem de ensaio versionado.

- **Organização visual atual:** [recorte 06](implementation-slice-06.md), sem equivalência comparativa declarada.

## UI-NAV-001 — Navegação

- **Descrição/propósito:** Manter histórico e localizar posição.
- **Prioridade / complexidade estimada:** P1 / Média.
- **Dependências:** Ranges e histórico.
- **Comportamento observado:** ainda não caracterizado integralmente; ensaios exploratórios não constituem oracle aprovado.
- **Evidência da implementação:** [recorte e testes](implementation-slice-05.md).
- **Evidências da referência:** [fonte DOC](https://www.jetbrains.com/help/phpstorm/navigating-through-the-source-code.html).
- **Critérios de aceitação preliminares:** Voltar/avançar restaura arquivo, seleção e scroll após saltos.
- **Estado de implementação:** Em desenvolvimento — recorte independente; investigação comparativa pendente.
- **Diferenças conhecidas:** equivalência não medida; a cobertura atual não satisfaz ainda o contrato completo desta família. Limitações da referência e plugins dependem de ensaio versionado.

- **Organização visual atual:** [recorte 06](implementation-slice-06.md), sem equivalência comparativa declarada.

## UI-SEARCH-001 — Search Everywhere

- **Descrição/propósito:** Encontrar arquivos, classes, símbolos PHP, ações e texto numa janela comum.
- **Prioridade / complexidade:** P1 / Alta.
- **Dependências:** Listagem/busca Rust, workspace/symbol do Phpactor, ações registradas no editor e na IDE.
- **Referência:** relato do usuário sobre Shift duplo e documentação pública JetBrains; sem ensaio comparativo controlado nesta entrega.
- **Aceitação:** Shift duplo isolado abre a busca; combinações de seleção não abrem; categorias filtram resultados; Enter abre arquivo/posição ou executa ação; Escape restaura foco; falha de índice fica visível sem virar ausência silenciosa de resultado.
- **Estado:** Implementada. Ensaios próprios em docs/research/search-everywhere.md; compatibilidade comparativa pendente.
- **Diferenças:** busca nominal por substring, sem ranking equivalente ou linguagem natural; símbolos limitados à cobertura workspace/symbol do Phpactor, membros também localizáveis por busca textual; texto literal sensível à caixa e sem vendor; não pesquisa histórico de commits ou metadados de bancos.

## UI-TERM-001 — Terminal

- **Extração arquitetural (24/10/2026):** Terminal; [propriedade, contratos e evidências](parallel-plugin-extraction.md). Estados e limitações comparativas desta família permanecem inalterados.

- **Descrição/propósito:** Executar comandos no projeto.
- **Prioridade / complexidade estimada:** P1 / Alta.
- **Dependências:** PTY e processos.
- **Comportamento observado:** ainda não caracterizado integralmente; ensaios exploratórios não constituem oracle aprovado.
- **Evidências:** REQ do escopo solicitado; sem evidência comportamental coletada.
- **Critérios de aceitação preliminares:** cwd correto, Unicode, resize, Ctrl-C e encerramento de sessão testados nos dois SOs.
- **Estado de implementação:** Em desenvolvimento; sem implementação específica validada.
- **Diferenças conhecidas:** equivalência não medida; a cobertura atual não satisfaz ainda o contrato completo desta família. Limitações da referência e plugins dependem de ensaio versionado.

- **Implementação independente:** [recorte 08](implementation-slice-08.md), PTY real e abas; comparação pendente.

## UI-THEME-001 — Temas

- **Descrição/propósito:** Ajustar aparência legível.
- **Prioridade / complexidade estimada:** P1 / Média.
- **Dependências:** Tokens visuais.
- **Comportamento observado:** ainda não caracterizado integralmente; ensaios exploratórios não constituem oracle aprovado.
- **Evidências:** REQ do escopo solicitado; sem evidência comportamental coletada.
- **Critérios de aceitação preliminares:** Preview imediato, contraste e cancelamento/restauração; identidade própria.
- **Estado de implementação:** Em desenvolvimento; ver recorte 05, sem comparação validada.
- **Diferenças conhecidas:** equivalência não medida; a cobertura atual não satisfaz ainda o contrato completo desta família. Limitações da referência e plugins dependem de ensaio versionado.

- **Evidência da implementação:** [recorte 05](implementation-slice-05.md); validação comparativa pendente.

## UI-SETTINGS-001 — Configurações

- **Descrição/propósito:** Modificar preferências com feedback.
- **Prioridade / complexidade estimada:** P1 / Média.
- **Dependências:** Escopos e persistência.
- **Comportamento observado:** ainda não caracterizado integralmente; ensaios exploratórios não constituem oracle aprovado.
- **Evidências:** REQ do escopo solicitado; sem evidência comportamental coletada.
- **Critérios de aceitação preliminares:** Distingue global/projeto; aplica efeito visível e persiste; erro não simula sucesso.
- **Estado de implementação:** Em desenvolvimento; ver recorte 05, sem comparação validada.
- **Diferenças conhecidas:** equivalência não medida; a cobertura atual não satisfaz ainda o contrato completo desta família. Limitações da referência e plugins dependem de ensaio versionado.

- **Evidência da implementação:** [recorte 05](implementation-slice-05.md); validação comparativa pendente.

## UI-KEYMAP-001 — Atalhos

- **Descrição/propósito:** Acionar comandos por teclado.
- **Prioridade / complexidade estimada:** P1 / Alta.
- **Dependências:** Comandos e foco.
- **Comportamento observado:** ainda não caracterizado integralmente; ensaios exploratórios não constituem oracle aprovado.
- **Evidências:** REQ do escopo solicitado; sem evidência comportamental coletada.
- **Critérios de aceitação preliminares:** Mesmo efeito do menu; conflito de SO e layout PT-BR/US documentados; bindings configuráveis.
- **Estado de implementação:** Em desenvolvimento — [recorte 23](implementation-slice-23.md): registro central de ações, perfis Padrão macOS / Padrão Windows-Linux / inspirado em JetBrains (DOC pública), personalização persistida por perfil, tela Keymap com busca por nome e por atalho, conflitos com "remover dos outros", teclas reservadas, despacho único por contexto e integração com Search Everywhere; sem OBS.
- **Diferenças conhecidas:** Sem chords, sem seletor de conflito no despacho, sem importar/exportar perfis; equivalência não medida.

## UI-CONTEXT-001 — Menus contextuais

- **Descrição/propósito:** Expor ações adequadas ao alvo.
- **Prioridade / complexidade estimada:** P1 / Média.
- **Dependências:** Seleção e comandos.
- **Comportamento observado:** ainda não caracterizado integralmente; ensaios exploratórios não constituem oracle aprovado.
- **Evidências:** REQ do escopo solicitado; DOC da janela Project, Copy Path/Reference, Refactor e Local History (links no [recorte 16](implementation-slice-16.md)); sem observação comportamental da referência.
- **Evidência da implementação:** [recorte 16](implementation-slice-16.md) — menu da árvore (Novo, Recortar/Copiar/Colar, Copiar caminho, Encontrar usos, Refatorar, Abrir em, Histórico local) com teclado; menu do editor continua o do Monaco.
- **Critérios de aceitação preliminares:** Editor/árvore exibem ações pertinentes, habilitação correta e execução pelo teclado.
- **Estado de implementação:** Em desenvolvimento — árvore do projeto apenas; ordem, rótulos e diálogos não comparados com a referência.
- **Diferenças conhecidas:** equivalência não medida; a cobertura atual não satisfaz ainda o contrato completo desta família. Limitações da referência e plugins dependem de ensaio versionado.

## TOOL-COMPOSER-001 — Composer

- **Descrição/propósito:** Gerenciar dependências.
- **Prioridade / complexidade estimada:** P2 / Alta.
- **Dependências:** PHP CLI, Composer, processos.
- **Comportamento observado:** ainda não caracterizado integralmente; ensaios exploratórios não constituem oracle aprovado.
- **Evidências:** [fonte DOC](https://www.jetbrains.com/help/phpstorm/using-the-composer-dependency-manager.html).
- **Critérios de aceitação preliminares:** Instalar por lockfile em fixture própria; falha/rede e output visíveis; indexar após conclusão.
- **Estado de implementação:** Em desenvolvimento — [recorte 22](implementation-slice-22.md): completion, navegação, diagnósticos e CodeLens em `composer.json`; janela Composer com install/update/require/remove/dump-autoload/validate/scripts, busca no Packagist e executável por PATH/caminho/Docker; sem OBS.
- **Diferenças conhecidas:** Sem outdated/audit/why e quick fixes; janela sem teste na janela Tauri real; equivalência não medida.

## TOOL-GIT-001 — Git

- **Extração arquitetural (24/10/2026):** Git; [propriedade, contratos e evidências](parallel-plugin-extraction.md). Estados e limitações comparativas desta família permanecem inalterados.

- **Descrição/propósito:** Revisar, selecionar e versionar mudanças com equivalência de fluxo ao PhpStorm: Commit, diff, changelists/staging, Log, branches, conflitos e remoto.
- **Prioridade / complexidade estimada:** P1 / Alta; promovida por solicitação explícita do usuário, mantendo PHP como P0.
- **Dependências:** Git CLI, diff Monaco, serviço principal/IPC, watcher de repositório e fixtures isoladas.
- **Comportamento observado:** painel Commit agrupa três arquivos rastreados marcados e um não rastreado desmarcado; Log expõe branches/filtros/tabela; popup Branches com busca. Mutações e diff ainda não confirmados.
- **Evidências:** [registro OBS/DOC e roteiro](phpstorm-git.md); menus e árvore pública de acessibilidade da referência local.
- **Critérios de aceitação:** GIT-01 a GIT-11 no roteiro; verificar HEAD/index/disco e preservação do conteúdo não selecionado; keyboard-only, erros recuperáveis e atualização externa.
- **Estado de implementação:** Em desenvolvimento; [recorte 04](implementation-slice-04.md) amplia staging por trecho, histórico/diff, branches, merge/rebase, conflitos, stash e remoto, com testes próprios. [Recorte 27](implementation-slice-27.md): testes Rust de merge/rebase/cherry-pick/revert/stash com conflito, push/pull/fetch SSH e HTTPS contra servidores descartáveis e recarga de arquivo aberto alterado fora da IDE; quatro correções (abort de cherry-pick/revert, aceitar lado em exclusão/binário novo, arquivo externo).
- **Diferenças conhecidas:** faltam changelists, seleção por linha, grafo/filtros do Log, perfis avançados de branches/conflitos/remoto, tags, reset, blame e worktrees. Staging versus changelists e divergência entre páginas oficiais precisam de ensaio na versão local. Nenhuma compatibilidade validada.

- **Contas por repositório:** [recorte 07](implementation-slice-07.md): identidade local, usuário HTTPS/chave SSH e teste de leitura; OAuth e comparação pendentes.
- **Recorte 12:** [Resolve Conflicts e Merge Revisions observados e reproduzidos](implementation-slice-12.md): resultado inicia pela base, contador de alterações/conflitos, aplicar não conflitantes, conflitos simples, confirmação ao aplicar com pendências, lista que fecha sozinha. Ações por chunk sem oracle.

## TOOL-PHPUNIT-001 — PHPUnit

- **Descrição/propósito:** Executar e navegar em testes.
- **Prioridade / complexidade estimada:** P2 / Alta.
- **Dependências:** Runtime, runner, parser.
- **Comportamento observado:** ainda não caracterizado integralmente; ensaios exploratórios não constituem oracle aprovado.
- **Evidências:** [fonte DOC](https://www.jetbrains.com/help/phpstorm/php-test-frameworks.html).
- **Critérios de aceitação preliminares:** Pass/fail/skip e data provider; navegar à falha; rerun e cancelamento com exit code.
- **Estado de implementação:** Em desenvolvimento ([recorte 15](implementation-slice-15.md)): plugin `php-tests` descobre classes `*Test` e métodos `test*`/`#[Test]`/`@test`; CodeLens executa classe ou método (com todos os data sets) via `php vendor/bin/phpunit --filter … --log-junit` no backend Rust confinado; painel Testes com passou/falhou/erro/ignorado, mensagem, link para a linha da falha, saída bruta, rerun e interrupção. Implementado a partir da documentação pública do PHPUnit (o suporte do PhpStorm é proprietário e não foi consultado).
- **Diferenças conhecidas:** equivalência não medida; sem comparação com a referência. Faltam run configurations, gutter de resultado, saída em tempo real, rerun de falhas, cobertura, debug, navegação teste↔classe, `#[TestDox]` e métodos herdados. JUnit observado só no PHPUnit 11.5.

## TOOL-PEST-001 — Pest

- **Descrição/propósito:** Executar testes Pest.
- **Prioridade / complexidade estimada:** P2 / Alta.
- **Dependências:** Runtime, runner.
- **Comportamento observado:** ainda não caracterizado integralmente; ensaios exploratórios não constituem oracle aprovado.
- **Evidências:** [fonte DOC](https://www.jetbrains.com/help/phpstorm/php-test-frameworks.html).
- **Critérios de aceitação preliminares:** Datasets, teste único, suíte, falha e navegação distinguem casos e resultados.
- **Estado de implementação:** Em desenvolvimento ([recorte 15](implementation-slice-15.md)): detecção pelo `composer.json`/`vendor/bin/pest` com versão do `composer.lock`; `it()`/`test()`/`describe()` (inclusive aninhados) descobertos; CodeLens executa arquivo, describe ou teste (com datasets) e o painel Testes mostra resultados, linha da falha e linha do teste. Escopo inspirado nas funcionalidades públicas do plugin MIT `JetBrains/pest-intellij` (CHANGELOG), sem uso do código.
- **Diferenças conhecidas:** equivalência não medida; sem comparação com a referência. Faltam completion/goto/inspeção de datasets, tipos de `expect()` e expectativas customizadas, snapshots, `uses()->in()`, criação de arquivo, descrições não literais, cobertura e gutter de resultado. Comportamento observado só no Pest 3.8.

## TOOL-XDEBUG-001 — Xdebug

- **Descrição/propósito:** Depurar programa próprio.
- **Prioridade / complexidade estimada:** P2 / Muito alta.
- **Dependências:** Runtime, protocolo, mappings.
- **Comportamento observado:** ainda não caracterizado integralmente; ensaios exploratórios não constituem oracle aprovado.
- **Evidências:** REQ do escopo solicitado; sem evidência comportamental coletada.
- **Critérios de aceitação preliminares:** Breakpoint, step, stack e variável; desconexão e paths remotos registrados; sem depurar a IDE.
- **Estado de implementação:** Em desenvolvimento — [recorte 21](implementation-slice-21.md): escuta DBGp, breakpoints de linha e condicionais na margem, passos, pilha, variáveis paginadas, watches/avaliação, console, mapeamento servidor ↔ local (Docker) e "Debug script" local; testado contra Xdebug 3.4.5 real (`scripts/check-xdebug.mjs`) e UI em Chrome headless (`scripts/check-debug-ui.mjs`); sem OBS.
- **Diferenças conhecidas:** Sem pausa assíncrona e breakpoints de exceção; painel não exercitado na janela Tauri real; equivalência não medida.

## TOOL-LARAVEL-001 — Laravel

- **Descrição/propósito:** Assistência a convenções do framework.
- **Prioridade / complexidade estimada:** P2 / Muito alta.
- **Dependências:** Plugin/adapter, versão, PHP.
- **Comportamento observado:** strings de `route()`, `view()` e `config()` ([recorte 10](implementation-slice-10.md)); componentes `<x-…>`, atributos e variáveis da view em Blade ([recorte 11](implementation-slice-11.md)); traduções inconclusivas na referência. Uma execução por caso. Eloquent e inspeções não caracterizados.
- **Evidência da implementação:** [recorte 10](implementation-slice-10.md) e [recorte 11](implementation-slice-11.md), plugin `laravel`.
- **Evidências:** [fonte DOC](https://www.jetbrains.com/help/phpstorm/laravel.html).
- **Critérios de aceitação preliminares:** Rota, Blade e Eloquent em projeto mínimo; recursos/plugins da referência identificados.
- **Estado de implementação:** Em desenvolvimento — strings de rotas/views/config, Blade (componentes, props, variáveis) e traduções; Eloquent (colunas de migrations, casts, accessors, relações, scopes, Builder/coleção, where dinâmico) e inspeções de rota/view/config/tradução/coluna/relação com correções ([recorte 25](implementation-slice-25.md)); sem OBS para Eloquent/inspeções.
- **Diferenças conhecidas:** Análise léxica, sem banco real; correções que criam arquivo (ex. criar view) não são oferecidas no editor; equivalência não medida.

## TOOL-DOTENV-001 — Arquivos .env

- **Descrição/propósito:** Completar e navegar variáveis de ambiente usadas em `env()`/`getenv()`.
- **Prioridade / complexidade estimada:** P2 / Baixa.
- **Dependências:** PLUGIN-API-001.
- **Comportamento observado:** completion com ` = valor` e precedência de `.env` sobre `.env.example`; navegação para a linha da chave ([recorte 10](implementation-slice-10.md)).
- **Evidências:** OBS-LV-NAV-08/09 e OBS-LV-COMP-04.
- **Critérios de aceitação preliminares:** Chaves de todos os `.env*` da raiz; destino na primeira definição; valores sensíveis não expostos na lista (REQ).
- **Estado de implementação:** Em desenvolvimento.
- **Diferenças conhecidas:** máscara de segredos é escolha própria; arquivos `.env` fora da raiz e destaque de sintaxe de `.env` não implementados.

## TOOL-MARKDOWN-001 — Markdown

- **Descrição/propósito:** Ler e interpretar documentos Markdown do projeto: prévia, navegação por links e títulos.
- **Prioridade / complexidade estimada:** P2 / Média.
- **Dependências:** PLUGIN-API-001, UI-NAV-001.
- **Comportamento observado:** layout padrão editor e prévia com três ícones na faixa das abas, destinos de links dobrados, ações e inspeções (OBS-MD-01…09, [recorte 14](implementation-slice-14.md)). Mermaid não é embutido: a referência oferece instalar o plugin JetBrains Mermaid. DOC: modos editor, dividido e prévia ([ajuda pública](https://www.jetbrains.com/help/phpstorm/markdown.html)).
- **Evidência da implementação:** [recorte 14](implementation-slice-14.md); [extração em plugin instalável](markdown-plugin.md), `phpforge.markdown` (IDE 0.2.12).
- **Critérios de aceitação preliminares (REQ):** prévia ao vivo sem executar HTML do documento; links relativos e âncoras navegáveis; completion de caminhos/âncoras; imagens locais confinadas ao projeto.
- **Estado de implementação:** Em desenvolvimento.
- **Diferenças conhecidas:** âncoras no formato GitHub; Mermaid incluído no plugin opcional Markdown; destinos de links não dobrados no editor; sem HTML bruto, notas de rodapé, imagens remotas, destaque de código na prévia, exportação nem inspeções de formatação.

## PLUGIN-API-001 — Sistema de plugins

- **Extração arquitetural (24/10/2026):** contratos de workers/workbench e contribuições opcionais; [propriedade, contratos e evidências](parallel-plugin-extraction.md). Estados e limitações comparativas desta família permanecem inalterados.

- **Descrição/propósito:** Extensões que acrescentam navegação, completion e status por framework.
- **Prioridade / complexidade estimada:** P1 / Alta.
- **Dependências:** Índice, watcher, LSP.
- **Comportamento observado:** a referência ativa suporte Laravel a partir de `composer.json` e mostra `Laravel: 12.0` na barra de status. A arquitetura interna dos plugins da referência não foi e não será inferida.
- **Evidência da implementação:** [recorte 10 histórico](implementation-slice-10.md), [recorte 24](implementation-slice-24.md), `shared/language/plugins/`, `src-tauri/src/plugins.rs`; [guia de autores e API atual](../plugins/README.md).
- **Critérios de aceitação preliminares:** Ativação por projeto; invalidação incremental; leitura confinada; falha de um plugin não derruba a IDE.
- **Estado de implementação:** Em desenvolvimento — plugins internos e de terceiros ([recorte 24](implementation-slice-24.md)): manifesto `plugin.json`, descoberta por usuário e por projeto (`.php-ide/plugins`), Web Worker sem IPC, ponte com permissões (`project.read`, `project.write`, `process`, `network`) conferidas também no backend, consentimento na primeira ativação, tela Plugins e instalação por pasta/.zip.
- **Diferenças conhecidas:** Sem marketplace, assinatura e atualização automática; sem hover/rename/format para terceiros; isolamento validado em worker_threads, não por ataque dirigido na WebView.

## TOOL-SYMFONY-001 — Symfony

- **Extração arquitetural (24/10/2026):** Symfony / Twig; [propriedade, contratos e evidências](parallel-plugin-extraction.md). Estados e limitações comparativas desta família permanecem inalterados.

- **Descrição/propósito:** Assistência a serviços e templates.
- **Prioridade / complexidade estimada:** P2 / Muito alta.
- **Dependências:** Plugin/adapter, versão, PHP.
- **Comportamento observado:** ainda não caracterizado integralmente; ensaios exploratórios não constituem oracle aprovado.
- **Evidências:** [fonte DOC](https://www.jetbrains.com/help/phpstorm/navigation-and-coding-assistance.html).
- **Critérios de aceitação preliminares:** Serviço, rota, Twig e console; cache ausente e plugin desativado testados.
- **Estado de implementação:** Em desenvolvimento — [recorte 22](implementation-slice-22.md): rotas (atributos e YAML), templates Twig, serviços/parâmetros YAML e `%env()%` com completion e navegação em PHP, Twig e YAML; sem OBS.
- **Diferenças conhecidas:** Sem rotas PHP/XML, bundles, container compilado, Doctrine/forms/traduções; equivalência não medida.

## TOOL-REFACTOR-001 — Refatorações adicionais

- **Extração arquitetural (24/10/2026):** PHP intelligence; [propriedade, contratos e evidências](parallel-plugin-extraction.md). Estados e limitações comparativas desta família permanecem inalterados.

- **Descrição/propósito:** Transformar código preservando comportamento.
- **Prioridade / complexidade estimada:** P2 / Muito alta.
- **Dependências:** AST, tipos, edição transacional.
- **Comportamento observado:** ainda não caracterizado integralmente; ensaios exploratórios não constituem oracle aprovado.
- **Evidências:** REQ do escopo solicitado; sem evidência comportamental coletada.
- **Critérios de aceitação preliminares:** Começar com Extract Method; variáveis/retornos/efeitos e undo verificados; uma especificação por transformação.
- **Estado de implementação:** Em desenvolvimento — [recorte 19](implementation-slice-19.md): Extract Method (entradas/saídas/retorno, recusas explícitas), Extract Variable e Inline Variable com prévia e desfazer; num único arquivo aberto a refatoração edita o buffer e o Ctrl+Z do editor desfaz. Smoke nativo aprovado; sem OBS.
- **Diferenças conhecidas:** Sem detecção de duplicados, Inline Method e Change Signature; equivalência não medida.

## TOOL-INSPECT-001 — Inspeções

- **Extração arquitetural (24/10/2026):** PHP intelligence; [propriedade, contratos e evidências](parallel-plugin-extraction.md). Estados e limitações comparativas desta família permanecem inalterados.

- **Descrição/propósito:** Detectar problemas e oferecer correções.
- **Prioridade / complexidade estimada:** P2 / Muito alta.
- **Dependências:** Tipos, diagnósticos, code actions.
- **Comportamento observado:** ainda não caracterizado integralmente; ensaios exploratórios não constituem oracle aprovado.
- **Evidências:** [fonte DOC](https://www.jetbrains.com/help/phpstorm/php-type-checking.html).
- **Critérios de aceitação preliminares:** Símbolo indefinido e tipo incompatível; range, severidade, suppress e quick fix com undo.
- **Estado de implementação:** Em desenvolvimento — [recorte 19](implementation-slice-19.md): classe indefinida (Phpactor) e tipo incompatível de retorno/argumento literal (própria) com intervalo, severidade, F2, quick fix e `@noinspection` por instrução/arquivo; diagnósticos e correções de plugins (Laravel) no editor PHP. Smoke nativo aprovado; sem OBS.
- **Diferenças conhecidas:** Sem inferência geral de tipos nas inspeções, sem painel de resultados/perfil; correções de plugin que criam arquivo ainda não são oferecidas; equivalência não medida.

## Cobertura e limites

As 36 entradas são famílias iniciais, não inventário completo do PhpStorm. Completar interfaces públicas, comportamento de exceção e casos extremos exige decompor cada família em casos menores. PHPDoc/generics/traits compartilham inferência, mas têm critérios próprios. A fonte de índices descreve a plataforma; não prova a estratégia privada do PHP. A fonte de autoimport consultada cobre sobretudo configuração/paste; completion com import ainda exige investigação própria. Frameworks precisam separar recursos nativos e plugins.

Roteiros iniciais e contrato de testes: [plano](phpstorm-compatibility-test-plan.md). Compatibilidade publicada: [matriz](../compatibility/phpstorm.md).


## DB-PG-001 — PostgreSQL

- **Extração arquitetural (24/10/2026):** Database / SQL; [propriedade, contratos e evidências](parallel-plugin-extraction.md). Estados e limitações comparativas desta família permanecem inalterados.

- **Descrição:** Integração PostgreSQL no painel de ferramentas.
- **Comportamento observado:** Sem oracle completo da referência.
- **Evidências:** [recorte e fontes](implementation-slice-05.md).
- **Dependências:** pg, TLS.
- **Complexidade / prioridade:** Alta / P2.
- **Critérios de aceitação:** Conectar, schemas/tabelas/colunas/PK, páginas de 50 linhas, NULL/truncamento explícitos, erro e desconexão.
- **Estado de implementação:** Em desenvolvimento.
- **Diferenças conhecidas:** Exploração e prévia somente leitura. Sem console SQL, escrita, DDL e oracle completo da referência.
- **Recorte 13:** [console SQL, completion de tabelas/colunas, SQL em strings PHP e DDL](implementation-slice-13.md); observado no PhpStorm só com PostgreSQL.
- **Recorte 18:** diálogo de fontes de dados (abas, URL, SSL por modo, túnel SSH, schemas visíveis, somente leitura, script de inicialização) e fontes persistidas sem senha; integração real aprovada, sem comparação com a referência ([recorte 18](implementation-slice-18.md)).

## DB-MYSQL-001 — MySQL

- **Extração arquitetural (24/10/2026):** Database / SQL; [propriedade, contratos e evidências](parallel-plugin-extraction.md). Estados e limitações comparativas desta família permanecem inalterados.

- **Descrição:** Integração MySQL no painel de ferramentas.
- **Comportamento observado:** Sem oracle completo da referência.
- **Evidências:** [recorte e fontes](implementation-slice-05.md).
- **Dependências:** mysql2, TLS.
- **Complexidade / prioridade:** Alta / P2.
- **Critérios de aceitação:** Conectar, schemas/tabelas/colunas/PK, páginas de 50 linhas, NULL/truncamento explícitos, erro e desconexão.
- **Estado de implementação:** Em desenvolvimento.
- **Diferenças conhecidas:** Exploração e prévia somente leitura. Sem console SQL, escrita, DDL e oracle completo da referência.
- **Recorte 13:** [console SQL, completion de tabelas/colunas, SQL em strings PHP e DDL](implementation-slice-13.md); observado no PhpStorm só com PostgreSQL.
- **Recorte 18:** mesmo diálogo e opções do PostgreSQL; integração real com MySQL 8.4 aprovada, sem comparação com a referência ([recorte 18](implementation-slice-18.md)).

## DB-MARIA-001 — MariaDB

- **Extração arquitetural (24/10/2026):** Database / SQL; [propriedade, contratos e evidências](parallel-plugin-extraction.md). Estados e limitações comparativas desta família permanecem inalterados.

- **Descrição:** Integração MariaDB no painel de ferramentas.
- **Comportamento observado:** Sem oracle completo da referência.
- **Evidências:** [recorte e fontes](implementation-slice-05.md).
- **Dependências:** mysql2, fixture MariaDB.
- **Complexidade / prioridade:** Alta / P2.
- **Critérios de aceitação:** Mesmo roteiro de exploração do MySQL, executado em MariaDB 11.4.
- **Estado de implementação:** Em desenvolvimento.
- **Diferenças conhecidas:** Exploração e prévia somente leitura. Sem console SQL, escrita, DDL e oracle completo da referência.
- **Recorte 18:** driver próprio no menu (protocolo MySQL); integração real com MariaDB 11.4 aprovada ([recorte 18](implementation-slice-18.md)).

## DB-ORACLE-001 — Oracle

- **Extração arquitetural (24/10/2026):** Database / SQL; [propriedade, contratos e evidências](parallel-plugin-extraction.md). Estados e limitações comparativas desta família permanecem inalterados.

- **Descrição:** Integração Oracle no painel de ferramentas.
- **Comportamento observado:** Sem oracle completo da referência.
- **Evidências:** [recorte e fontes](implementation-slice-01.md).
- **Dependências:** Driver Oracle, ambiente de teste autorizado.
- **Complexidade / prioridade:** Muito alta / P2.
- **Critérios de aceitação:** Conexão por service name, schemas, cancelamento e erros de autenticação.
- **Estado de implementação:** Em desenvolvimento — [recorte 26](implementation-slice-26.md): conexão por Service name/SID (crate `oracle-rs`, sem Instant Client), schemas, tabelas/views/colunas, prévia paginada, console com PL/SQL e DDL de metadados aprovados contra Oracle Free 23 descartável.
- **Diferenças conhecidas:** Sem TNS; TCPS não testado; sem somente leitura e cancelamento; `ALTER SESSION` não suportado pelo driver; erros podem chegar sem código ORA; sem oracle da referência.

## DB-MSSQL-001 — SQL Server

- **Extração arquitetural (24/10/2026):** Database / SQL; [propriedade, contratos e evidências](parallel-plugin-extraction.md). Estados e limitações comparativas desta família permanecem inalterados.

- **Descrição:** Integração SQL Server no painel de ferramentas.
- **Comportamento observado:** Sem oracle completo da referência.
- **Evidências:** [recorte e fontes](implementation-slice-01.md).
- **Dependências:** tiberius (TDS 7.3, rustls), fixture SQL Server 2022.
- **Complexidade / prioridade:** Alta / P2.
- **Critérios de aceitação:** Conexão, database/schema, TLS e erros de autenticação.
- **Estado de implementação:** Em desenvolvimento. Conexão, SSL, schemas, tabelas, prévia paginada, console e DDL de metadados aprovados contra SQL Server 2022 descartável (emulação amd64) ([recorte 18](implementation-slice-18.md)).
- **Diferenças conhecidas:** Sem cancelamento e sem somente leitura; DDL sem defaults, FKs e índices; sem oracle da referência.

## DB-REDIS-001 — Redis

- **Extração arquitetural (24/10/2026):** Database / SQL; [propriedade, contratos e evidências](parallel-plugin-extraction.md). Estados e limitações comparativas desta família permanecem inalterados.

- **Descrição:** Integração Redis no painel de ferramentas.
- **Comportamento observado:** Sem oracle completo da referência.
- **Evidências:** [recorte e fontes](implementation-slice-01.md).
- **Dependências:** redis-rs (tokio, rustls), fixture Redis 7.
- **Complexidade / prioridade:** Alta / P2.
- **Critérios de aceitação:** SCAN paginado, tipo e TTL; não bloquear com enumeração integral.
- **Estado de implementação:** Em desenvolvimento. SCAN limitado, tipo, TTL, prévia por tipo e console ([recorte 18](implementation-slice-18.md)); edição pela prévia (string, hash, list, set, zset, TTL, renomear/excluir com confirmação e checagem atômica), CA personalizado em TLS e paginação por cursor (HSCAN/SSCAN, XRANGE) ([recorte 26](implementation-slice-26.md)), aprovados contra Redis 7 descartável com e sem TLS.
- **Diferenças conhecidas:** Sem edição de stream, criação de chave pela prévia e valores binários; sem oracle da referência.

## DB-SQLITE-001 — SQLite

- **Extração arquitetural (24/10/2026):** Database / SQL; [propriedade, contratos e evidências](parallel-plugin-extraction.md). Estados e limitações comparativas desta família permanecem inalterados.

- **Descrição:** Arquivo SQLite local como fonte de dados.
- **Comportamento observado:** Sem oracle da referência.
- **Evidências:** [recorte 18](implementation-slice-18.md).
- **Dependências:** sqlx-sqlite com libsqlite3 embutida.
- **Complexidade / prioridade:** Média / P2.
- **Critérios de aceitação:** Abrir só arquivos existentes, listar tabelas/views, prévia paginada, console, DDL e somente leitura.
- **Estado de implementação:** Em desenvolvimento. Teste Rust ponta a ponta aprovado ([recorte 18](implementation-slice-18.md)).
- **Diferenças conhecidas:** Sem cancelamento; não cria arquivos novos; sem bancos anexados pela interface.

## AI-CODEX-001 — Agente Codex

- **Extração arquitetural (24/10/2026):** Agents; [propriedade, contratos e evidências](parallel-plugin-extraction.md). Estados e limitações comparativas desta família permanecem inalterados.

- **Descrição:** Integração Agente Codex no painel de ferramentas.
- **Comportamento observado:** Sem oracle completo da referência.
- **Evidências:** [recorte e fontes](implementation-slice-01.md).
- **Dependências:** Codex CLI autenticado e app-server.
- **Complexidade / prioridade:** Alta / P2.
- **Critérios de aceitação:** Conectar, transmitir resposta, interromper, contexto opt-in; não modificar projeto em consulta.
- **Estado de implementação:** Em desenvolvimento.
- **Diferenças conhecidas:** Apenas recorte descrito no relatório; sem equivalência declarada.
- **Recorte 17:** Codex passa a ser uma das opções do painel de agentes, em consulta somente leitura via app-server; CLI ausente nesta máquina, sem novo teste real ([recorte 17](implementation-slice-17.md)).

## AI-ACP-001 — Agentes de IA via ACP

- **Extração arquitetural (24/10/2026):** Agents; [propriedade, contratos e evidências](parallel-plugin-extraction.md). Estados e limitações comparativas desta família permanecem inalterados.

- **Descrição:** Hospedar agentes externos (Claude, Gemini, Cursor…) pelo Agent Client Protocol, com a IDE atendendo arquivos e permissões.
- **Comportamento observado:** AI Chat do PhpStorm lista agentes ACP (Claude Agent, Codex, Cursor, Gemini CLI, GitHub Copilot, Junie, registro ACP), contexto da IDE, anexos e alterações com Keep All/Discard All ([recorte 17](implementation-slice-17.md); sem enviar mensagens).
- **Evidência da implementação:** `src-tauri/src/agents.rs`, `rpc.rs`, `src/agent-panel.ts`; agente ACP falso em `scripts/fake-acp-agent.mjs`.
- **Dependências:** adaptador `claude-code-acp` (npm run setup:acp), Claude Code autenticado, Node.
- **Complexidade / prioridade:** Alta / P1.
- **Critérios de aceitação preliminares:** escritas do agente nunca gravam sem revisão; leitura/escrita confinadas; permissão decidida pelo usuário; interromper; motivo legível em falhas de inicialização.
- **Estado de implementação:** Em desenvolvimento — fluxo verificado com agente falso; conexão real com Claude Code não verificada neste ambiente.
- **Diferenças conhecidas:** sem histórico, menções @, comandos /, anexos de imagem/schema, registro ACP nem terminal para o agente.

Bancos/navegação/aparência: [recorte 05](implementation-slice-05.md) registra implementação, ensaios e limites sem promover compatibilidade automaticamente.


### Correções de editor e UX (2026-10-22)

Cmd/Ctrl+clique, sugestões no widget, runtime PHP local, ícones/paleta e diálogo de conexão receberam um novo recorte. Evidências e limites em [editor-ux-corrections.md](editor-ux-corrections.md). Permanecem em desenvolvimento; teste local não comprova equivalência com PhpStorm.


### Usos e alterações Git no editor — 2026-10-22

| ID | Recorte | Estado de equivalência | Evidência e diferenças |
|---|---|---|---|
| NAV-USAGES-POPUP | ⌘/Ctrl+clique na declaração, popup filtrável, abrir chamada | Em desenvolvimento | LSP e navegação na janela Tauri; sem Code Vision/hierarquia de chamadas |
| GIT-LINE-CHANGES | Marcas adicionadas/modificadas/removidas e popup de diff | Em desenvolvimento | HEAD versus buffer, incluindo não salvo; sem stage/revert no popup |
| GIT-LINE-AUTHOR | Autor/commit da linha no buffer | Em desenvolvimento | Git Blame por stdin; sem annotations permanentes/histórico de seleção |

Especificação, aceitação, dependências e limites em [editor-usages-git.md](editor-usages-git.md). Testes locais não promovem compatibilidade com a referência.


Correção NAV-USAGES-POPUP (2026-10-22): o reconhecimento de declarações agora inclui classes, interfaces, traits e enums. Casos de uso continuam navegando para a definição. Evidência detalhada em `docs/research/editor-usages-git.md`; equivalência permanece Em desenvolvimento.


### PROJECT-RECENT-001 — Projetos recentes (2026-10-22)

Popup no seletor de projeto: busca, caminho, indicação do atual/indisponível, reabertura, remoção e limpeza. Histórico Rust persistente com MRU, limite de 30 e retomada do último disponível. Prioridade alta; complexidade média; depende de configuração nativa, seleção de pastas e ciclo de troca de projeto. **Em desenvolvimento** na equivalência. Aceitação e evidências: [recent-projects.md](recent-projects.md). Diferenças: somente janela atual, sem grupos/favoritos; Welcome adicionado no recorte seguinte; nenhuma comparação lado a lado realizada.


### Docker integrado — 2026-10-22

Services inferior com contextos, containers, imagens, volumes, redes, logs, ações de ciclo de vida, PTY exec e Compose. Download/Compose têm progresso e cancelamento. IDs DOCKER-CONNECT/SERVICES/LOGS/EXEC/COMPOSE/IMAGES-001: **Em desenvolvimento**. Evidência nativa com CLI sintético; engine real inicialmente indisponível. Sem equivalência global ou validação de daemon presumida. Especificação, dependências, complexidade, critérios e diferenças: [docker-integration.md](docker-integration.md).


### Inicialização e Welcome — 2026-10-22

STARTUP-SPLASH-001, PROJECT-WELCOME/CREATE/CLONE/SESSION-001: **Em desenvolvimento** na equivalência. Splash em HTML, falha recuperável, Welcome com recentes, novo projeto PHP, abrir, clone Git e sessão persistente. Treze testes Rust e seis cenários no pacote nativo aprovados; clone local descartável real. Sem inspeção do PhpStorm local nesta sessão; sem equivalência visual presumida. Critérios, dependências, evidências e diferenças: [startup-welcome.md](startup-welcome.md).


### UI-FILE-ICONS-001 — Arquivos e pastas (2026-10-22)

SVGs oficiais open source da IntelliJ Platform, individualmente Apache 2.0, para árvore e abas; variantes clara/escura, pastas por convenção e fallback. Badge PHP próprio por não haver declaração explícita no SVG de logotipo consultado. Recorte implementado; equivalência global **Em desenvolvimento**. Sem extração da instalação ou comparação local. Licença, origem fixada, aceitação e evidências: [file-icons.md](file-icons.md).


### UI-THEME-002 — Aparência (2026-10-22)

Claro, escuro e sistema; painel não modal com prévia ao vivo, amostras e botão rápido; paleta compartilhada com Welcome, editor e ferramentas. Recorte implementado; equivalência **Em desenvolvimento**. Aceitação, dependências, contraste, evidências e limites em [appearance-themes.md](appearance-themes.md).

Fundação Islands (Dark/Light): [recorte 28](implementation-slice-28.md); checagem vs 03/05/40: [recorte 31a](implementation-slice-31-foundation-check.md). Fidelidade por área (tokens, sem promoção): popups [31](implementation-slice-31.md), tool windows [32](implementation-slice-32.md), diálogos/light [33](implementation-slice-33.md), editor/Markdown [34](implementation-slice-34.md). Regressão Search Everywhere/`display:flex` × Cmd+clique: [recorte 35](implementation-slice-35.md). Não marcar a família como “compatível neste perfil” só pela fundação ou por CSS. Smoke/Services resize: [recorte 30](implementation-slice-30.md). Oracle C01–C06 na janela real: [recorte 29](implementation-slice-29.md) (só os casos listados ali como compatíveis neste perfil).

### UI-LANGUAGE-001 — Idiomas da interface (2026-10-22)

Português e inglês selecionáveis em Aparência e Welcome; catálogo extensível, preferência persistida, aplicação por recarga protegida contra buffers não salvos. Recorte implementado; equivalência **Em desenvolvimento**. Critérios, evidências e limites: [interface-languages.md](interface-languages.md).

### GIT-BRANCH-POPUP/CREATE/SWITCH/DELETE/FETCH/PULL-002 — 2026-10-22

Recorte implementado: popup no topo com busca, branches locais/remotas, criar com checkout opcional, troca e tracking remoto, exclusão local confirmada, fetch de todos os remotos e pull fast-forward pelo upstream. Equivalência **Em desenvolvimento**, baseada em documentação pública; sem observação direta nesta sessão. Critérios, evidências e diferenças: [git-branches.md](git-branches.md).

### GIT-LOG/COMMIT-UI-002 · DOCKER-SERVICES/ACTIONS-UI-002 · UI-DOCK-002 — 2026-10-22

Recorte implementado: Git Log inferior com branches/tabela/detalhes e filtros reais; Commit lateral; Docker com árvore compacta, Dashboard, filtros de parados/logs e menu de contexto; dock compartilhado com terminal, altura persistida. Equivalência **Em desenvolvimento**. Imagens/documentação oficiais examinadas no navegador; sem inspeção nativa nesta sessão. Critérios, testes e diferenças: [git-docker-tool-windows.md](git-docker-tool-windows.md).

### EDITOR-SELECTION-002 — Correção própria (2026-10-22)

Gesto Cmd/Ctrl+clique confirmado ao soltar, sem cancelar seleção por arraste; cores de brackets consistentes entre modelos; diff segue tema global. Causa das cores e seleção invisível reproduzida no pacote: CSS inline do splash gerava nonce CSP que bloqueava estilos dinâmicos do Monaco. CSS externalizado sem alterar a política; teste de pacote passou após a correção. Evidências e limites: [editor-selection-regression.md](editor-selection-regression.md). Equivalência **Em desenvolvimento**.

### PHP-FUNCTION-REFERENCES-002 — 2026-10-22

Correção do crash de FunctionQuery no Phpactor quando o índice não contém registro da função; patch MIT reproduzível e manifesto de integridade incluído no pacote. Equivalência **Em desenvolvimento**; retorno vazio representa apenas ausência de referências conhecidas pelo índice. Reprodução, testes e limites: [php-function-references.md](php-function-references.md).


### EDITOR-TABS-MIDDLE-001 — Fechar aba pelo botão do meio
Implementada: clique na roda do mouse sobre a aba usa o mesmo fechamento do botão ×. Arquivos modificados permanecem abertos, com aviso para salvar. Teste de interface WebKit verifica fechamento, proteção de alterações e botão direito sem fechar. Requisito próprio; comparação com PhpStorm ainda não validada.


### EDITOR-TABS-CONTEXT-001 — Menu de fechamento de abas
Implementada: botão direito na aba oferece fechar esta, outras ou todas. Operações em lote preservam buffers alterados com aviso para salvar; alvo de fechar outras é a aba clicada, mesmo inativa. Menu aceita setas, Home/End e Escape. Teste WebKit cobre as três operações e proteção de alterações; equivalência com PhpStorm ainda não validada.


### PHP-TYPE-ICONS-001 — Ícones semânticos PHP
Implementada: classes (C azul), interfaces (I verde), traits (T âmbar) e enums (E violeta) têm badges SVG próprios nos temas claro/escuro. Árvore e abas identificam declarações pelo conteúdo usando o analisador léxico existente, ignorando comentários/strings/classes anônimas. Arquivos com múltiplas declarações usam a que corresponde ao nome do arquivo; sem correspondência inequívoca, mantêm PHP genérico. Blade permanece genérico. Abas e árvore acompanham alterações no buffer. A árvore lê apenas PHP do diretório exibido, com até quatro leituras simultâneas; não percorre vendor recursivamente para ícones. Sugestões do índice local preservam o tipo e usam badges equivalentes; trait usa Struct apenas na apresentação Monaco, conservando o tipo LSP original. Sugestões externas sem metadados continuam com ícones LSP. Não há variantes adicionais de classe abstrata/final, visibilidade ou validação comparativa com PhpStorm.
Evidências próprias: scripts/check-php-file-kind.ts e scripts/check-editor-selection.mjs --webkit. Critérios: quatro tipos distintos em árvore/abas, SVGs claro/escuro carregados, classificação por conteúdo e fallback seguro para ambiguidades; tipos preservados nas sugestões. Estado: Implementada; equivalência com a referência não validada.


### PHP-EDITOR-USAGES-001 — Cores PHP e contagem de usos
Estado: Implementada. Prioridade: máxima. Complexidade: média. Dependências: lexer PHP próprio, Monaco e referências do Phpactor via Rust. Funções/métodos exibem contagem clicável; zero referências no índice esmaece o nome de declarações elegíveis. Variáveis, métodos, funções e construtores recebem categorias visuais distintas. Erro, edição e análise pendente são estados separados. Evidência visual da referência: screenshots fornecidos pelo usuário em 22/10/2026; versão/configuração não registradas. Critérios, testes e limites em docs/research/php-editor-usages.md. Não valida equivalência integral: chamadas dinâmicas, consumers externos e indexação incremental podem limitar a contagem; não implementa as demais inspeções dos screenshots.


### EDITOR-MULTICURSOR-001 — Editar várias linhas/ocorrências
Estado: Implementada. Prioridade: alta. Complexidade: baixa/média; integração das ações Monaco. Dependências: editor Monaco e keymap por plataforma. Menu/paleta oferecem próxima/todas as ocorrências, remover último cursor, cursores acima/abaixo, cursores no fim das linhas selecionadas e alternância de coluna. Alt/Option+clique adiciona cursores; o rodapé mostra quantidade e modo. Critérios/evidências/atalhos em docs/research/editor-multicursor.md. Testes próprios de interface e Tauri não comprovam equivalência com todos os keymaps do PhpStorm; refatoração semântica entre arquivos e configuração livre de atalhos ficam fora deste recorte.

## WEB-JSTS-001 — Inteligência JavaScript e TypeScript

- **Extração arquitetural (24/10/2026):** Web Languages; [propriedade, contratos e evidências](parallel-plugin-extraction.md). Estados e limitações comparativas desta família permanecem inalterados.

- **Descrição:** Autocomplete, diagnósticos e navegação entre arquivos JS/TS.
- **Prioridade / complexidade:** P1 / Alta; React e Vue com a mesma prioridade por instrução explícita.
- **Comportamento observado na referência:** não ensaiado neste recorte.
- **Evidências / dependências:** [arquitetura e testes reais](web-language-services.md), Monaco/TypeScript, Volar para Vue, snapshots Rust.
- **Critérios de aceitação do recorte:** Propriedade importada sugerida, declaração abre no arquivo correto, erro de atribuição apontado.
- **Estado de implementação:** Em desenvolvimento — recorte funcional; cobertura completa e comparação pendentes.
- **Diferenças conhecidas:** opções TS fixas, limites de snapshots/dependências; sem marketplace de plugins ou equivalência validada. Ver limites no documento vinculado.

## WEB-REACT-001 — React JSX/TSX

- **Extração arquitetural (24/10/2026):** Web Languages; [propriedade, contratos e evidências](parallel-plugin-extraction.md). Estados e limitações comparativas desta família permanecem inalterados.

- **Descrição:** Props JSX e inferência de hooks via declarações oficiais.
- **Prioridade / complexidade:** P1 / Alta; React e Vue com a mesma prioridade por instrução explícita.
- **Comportamento observado na referência:** não ensaiado neste recorte.
- **Evidências / dependências:** [arquitetura e testes reais](web-language-services.md), Monaco/TypeScript, Volar para Vue, snapshots Rust.
- **Critérios de aceitação do recorte:** Prop tipada sugerida e setter de useState rejeita tipo incompatível.
- **Estado de implementação:** Em desenvolvimento — recorte funcional; cobertura completa e comparação pendentes.
- **Diferenças conhecidas:** opções TS fixas, limites de snapshots/dependências; sem marketplace de plugins ou equivalência validada. Ver limites no documento vinculado.

## WEB-VUE-001 — Vue SFC

- **Extração arquitetural (24/10/2026):** Web Languages; [propriedade, contratos e evidências](parallel-plugin-extraction.md). Estados e limitações comparativas desta família permanecem inalterados.

- **Descrição:** Serviço Vue 3 para template HTML e script setup.
- **Prioridade / complexidade:** P1 / Alta; React e Vue com a mesma prioridade por instrução explícita.
- **Comportamento observado na referência:** não ensaiado neste recorte.
- **Evidências / dependências:** [arquitetura e testes reais](web-language-services.md), Monaco/TypeScript, Volar para Vue, snapshots Rust.
- **Critérios de aceitação do recorte:** Completar expressão, navegar ao script, apontar erro de tipo e sugerir props de componente importado.
- **Estado de implementação:** Em desenvolvimento — recorte funcional; cobertura completa e comparação pendentes.
- **Diferenças conhecidas:** opções TS fixas, limites de snapshots/dependências; sem marketplace de plugins ou equivalência validada. Ver limites no documento vinculado.

### Welcome compacta — 23/10/2026

PROJECT-WELCOME/SESSION-001: janela menor centralizada sem projeto, restauração do tamanho anterior ao abrir projeto. Estado comparativo continua Em desenvolvimento/Não validada; requisito relatado pelo usuário, sem nova medição do PhpStorm. Detalhes em startup-welcome.md.

### Git — reprodução visual (23/10/2026)

Log com toolbar vertical, árvore Local/Remote pesquisável, grafo baseado em pais reais, referências, filtros de autor/data e arquivos/detalhes à direita; Commit com toolbar compacta e mensagem na base. Referência documental examinada; equivalência visual em desenvolvimento. [Evidências e limites](git-ui-2026-10-23.md).

Commit refinado a partir das duas capturas do usuário: toolbar, árvore com checkboxes, nomes/pastas e área Amend/mensagem/ações. Staging explícito, amend com revisão e Commit and Push ligado à revisão de envio. [Detalhes e limites](git-ui-2026-10-23.md). Sem validação integral de equivalência.

### Banco — diálogo e importação Laravel (23/10/2026)

Diálogo reorganizado e importação de `.env` para rascunho revisável, sem conexão automática nem persistência de senha. Fixtures WebKit, Rust e janela Tauri passaram. Configuração PHP/cache, interpolação e opções adicionais de URL ficam fora do recorte. Estado comparativo permanece **Em desenvolvimento / não validada**. [Evidências e limites](database-connection-laravel.md).

### DotEnv — editor (23/10/2026)

TOOL-DOTENV-001: corrigida a ausência de linguagem/providers para `.env`; realce, sugestões em `${...}` e navegação para declarações locais. Ativação Laravel/DotEnv e fluxo do editor confirmados em Tauri com fixture sintética. Estado comparativo **Em desenvolvimento / não validada**. [Evidências e limites](dotenv-editor.md).

### TOOL-DOCKER-LANGUAGE-001 — Dockerfile e Compose (23/10/2026)

P1, complexidade média. Plugin interno com detecção de variantes/nomes alternativos, realce Monaco, completion de instruções/propriedades, hover, navegação entre estágios/serviços e diagnósticos locais YAML/Dockerfile. Dependências: host TypeScript, Monaco e yaml (ISC), sem engine Docker. Critério exercitado: abrir fixture, completar, navegar e corrigir erro visível na janela Tauri. Estado **Em desenvolvimento / não validada comparativamente**; schema completo, merges entre arquivos e validação de build/daemon permanecem fora. [Escopo e evidências](docker-editor.md).

### TOOL-BASH-LANGUAGE-001 — Bash e scripts sh (23/10/2026)

P1, complexidade média. Plugin interno para extensões/dotfiles/shebang, realce, completion de builtins e símbolos locais, hover e F12. Verificação de sintaxe no buffer via shell do sistema em modo -n, sem executar script. Critério exercitado em Tauri: abrir, completar, navegar e corrigir diagnóstico visível; fixture também comprova ausência de execução. Estado **Em desenvolvimento / não validada comparativamente**. Dependências e limites (versão do shell, índice léxico, sem ShellCheck/semântica global): [evidências](bash-editor.md).

### Árvore — arquivos e pastas ignorados (23/10/2026)

TOOL-GIT-001: cor de ignorado aplicada a nomes na árvore usando estado Git real, incluindo herança, negação e exceção de rastreados. Dependências antes ocultas por nome ficam visíveis e expandem sob demanda. Atualização preserva expansão e foi exercitada nos dois temas em Tauri com fixture. Estado comparativo **Em desenvolvimento / não validada**. [Implementação, evidências e limites](git-ignored-tree.md).

### TOOL-SVG-PREVIEW-001 — Fonte e imagem SVG (23/10/2026)

P1, complexidade média. Fonte XML, visualização dividida/imagem, atualização do buffer, zoom/fundos e recuperação de erro. O ajuste amplia ícones pequenos até 800% depois que a área tem tamanho, para logos de 16 px não ficarem em um pixel. Roda, arraste, grade e imagens SVG vizinhas na pasta acompanham o visualizador. Dependências: Monaco e contexto de imagem do navegador; sem execução de scripts SVG na IDE. Critérios exercitados em Tauri antes deste ajuste: pixels mudam sem salvar, XML inválido recupera, modo/layout alternam e zoom 100% permanece correto no WebKit. Regressão Markdown passou. Estado **Em desenvolvimento / não validada comparativamente**. Não houve cópia de implementação do PhpStorm. [Evidências e limites](svg-preview.md).

### Vue.js e React — disponibilidade (23/10/2026)

WEB-VUE-001 e WEB-REACT-001: serviços já incluídos/habilitados agora aparecem em Aparência → Plugins. Tela e fluxo dos serviços reais verificados na janela Tauri. Não é instalação de extensão de terceiros nem nova cobertura de framework; estado comparativo continua Em desenvolvimento / não validada. [Disponibilidade, testes e limites](web-language-services.md).

## CODE-FORMAT-001 — Formatação (recorte 0.2.10)

- **Extração arquitetural (24/10/2026):** PHP Formatter para PHP; Prettier mantém seu pacote separado; [propriedade, contratos e evidências](parallel-plugin-extraction.md). Estados e limitações comparativas desta família permanecem inalterados.

- **Prioridade / complexidade:** P1 / Alta.
- **Propósito:** reformatar buffer/seleção com undo, estilo por projeto e falhas recuperáveis.
- **Estado:** Em desenvolvimento; recorte implementado, comparação pendente.
- **Evidência/contrato:** [formatação](../development/formatting.md), hook format e pacote Prettier offline; PHP com printer próprio e validação AST/tokens.
- **Aceitação do recorte:** preservar conteúdo significativo; respeitar indentação; seleção PHP não altera espaços fora do intervalo; uma ação de undo; descartar resposta obsoleta; erro deixa o buffer intacto.
- **Diferenças conhecidas:** sem paridade medida, sem Code Style completo, Blade/HTML misto PHP não suportado, sem format-on-save; Prettier incluído não usa versão/config executável do projeto.

PLUGIN-API-001 recebe hook format desde 0.2.10; main de plugin limitado a 8 MiB para pacotes com parsers offline. O estado comparativo da família não muda.


### Salvamento automático — requisito próprio (23/10/2026)

Implementado no frontend Tauri: ativado por padrão, preferência global persistida em Configurações → Aparência → Salvamento automático. Salva cada buffer de arquivo após 800 ms sem alterações, inclusive abas inativas; console, DDL e bibliotecas virtuais ficam excluídos. Desativar cancela os agendamentos pendentes; uma gravação já enviada pode terminar. Reativar agenda buffers alterados. Cmd/Ctrl+S continua disponível. Gravações do mesmo buffer são serializadas, mantendo alterações feitas durante a escrita como pendentes. Reutiliza o IPC restrito e o etag existente para detectar conflitos; erros preservam o buffer e aparecem no rodapé, com orientação para tentar Salvar. Fechar/trocar projeto mantém a proteção de buffers pendentes. Não garante gravação ao encerrar abruptamente durante os 800 ms. Sem validação comparativa com PhpStorm.

Validação específica: harness com as funções reais de agendamento/gravação e IPC simulado aprovou padrão ligado, cancelamento ao desativar, gravação ao reativar, serialização com etag atualizado, edição durante gravação, preservação do buffer em conflito e exclusão de buffers virtuais. Typecheck e validação dos idiomas aprovados. Esse harness não substitui validação na janela Tauri real.


### Visualizador de imagens — requisito próprio (23/10/2026)

Abrir PNG, JPEG, GIF, WebP, BMP, ICO e AVIF pela árvore/busca cria uma aba somente de visualização, sem leitura como texto ou autosave. O renderer usa a decodificação de imagem do sistema; disponibilidade de cada codec varia por plataforma. SVG mantém fonte/dividido/imagem existente. Ajuste à área espera o layout e amplia ícones pequenos até 800%, em vez de reduzi-los a um pixel quando a área ainda não tem tamanho. Zoom 5–800% com roda, arraste, grade, 100%, dimensões, tamanho do arquivo e formato; ‹/› e setas percorrem as outras imagens da mesma pasta. Fundos quadriculado/claro/escuro e recarregamento explícito do disco permanecem. Teclas +/−/0 funcionam com foco na imagem. Estados de carregamento e erro incluem recuperação; respostas de abas anteriores são descartadas. Abas participam do fechamento e do fluxo de mover/renomear/excluir da IDE. A leitura reutiliza IPC `readImage`, confinado à raiz real do projeto, limitado a 5 MiB; não aceita caminhos externos nem symlinks que escapem. Imagens não são editáveis e não são enviadas como contexto ao agente. Atualização externa exige Recarregar. As ações públicas de zoom, ajuste, tamanho original, grade e fundo quadriculado orientaram o comportamento; não houve cópia de implementação do PhpStorm e não há paridade medida.

Validação aprovada: `npm run typecheck`, `npm run test:locales`, `npm test -- preview_images` (MIME, limite de 5 MiB, caminho externo e escape por symlink) e `npm run test:images` no WebKit (dimensões, ajuste/100%, zoom, teclado, fundos, erro de decodificação com recuperação, erro de IPC, resposta atrasada e bytes novos ao recarregar). O teste WebKit usa IPC simulado e não promove compatibilidade nativa. A suíte Rust completa falhou em um caso de Git e foi interrompida ao não concluir outro cenário de Git. Roteiro Tauri `--image-only` disponível; a primeira execução esbarrou na porta 1420 ocupada por outro teste. Não declarar todos os codecs validados por um PNG.


Resultado nativo: build web e binário Rust compilados; o roteiro `node scripts/check-native.mjs --production-ui --no-db --image-only` passou na janela Tauri real, com PNG, tamanho original/zoom, fundo de transparência, recarga, erro de arquivo inválido e retorno ao texto editável. Relatório isolado: `.artifacts/image-preview-native.json`; o runner exige a presença do cenário `Imagem:` para evitar aprovação por relatório de outra suíte. `.artifacts/image-preview-webkit.json` registra os cenários isolados do frontend. Nenhuma chamada de inferência real ou banco real foi usada nesta validação. Os outros codecs têm transporte testado, sem validação visual nativa individual.

## Organização das fixtures — 23/10/2026

Os projetos sintéticos antes em `fixtures/` na raiz ficam em `tests/fixtures/projects/`. Scripts, testes e a origem dos recursos Tauri acompanham o novo caminho; o destino no pacote continua `fixtures/`. Caminhos antigos nos recortes históricos registram a localização da época. Esta reorganização não amplia evidência de compatibilidade.

Validação da reorganização: typecheck aprovado; testes TypeScript 169 aprovados e 1 ignorado; Rust 66 aprovados e 3 ignorados. `npm run test:native -- --no-db` compilou e abriu a janela com as fixtures no novo caminho, mas o roteiro completo falhou em branches (commit/stash), navegação/referências (`getModel`) e CodeLens de testes ausente. Esses resultados não comprovam aprovação integral da UI nem compatibilidade comparativa.

## SQL intelligence — SPEC-14

Independent implementation: `dt-sql-parser` 4.5.1 in a local worker, eagerly prepared active-session metadata, explicit file bindings, schema/search-path resolution, aliases, CTE/projection/derived scopes, correlation and bounded completion. PostgreSQL 16, MySQL 8.4 and MariaDB 11.4 passed native Tauri checks for real suggestions, first-character popup, Enter/Tab/undo, DDL refresh, connection isolation, PHP/Blade and project close. Large synthetic catalogs were measured separately. SQLite, SQL Server 2022 and Oracle Free 23 now have independent active-session catalogs and bounded dialect rules, with native Tauri checks for real tables/views/columns, quoting, CTEs, derived scopes, popup/keyboard and DDL refresh. SQLite also checks attached/temp namespaces and generated columns. SQL Server checks TOP/APPLY, actual case-sensitive collation and USE context switching; Oracle checks uppercase/exact quoted names and metadata beyond 100 columns. These three use GenericSQL plus explicit rules, not full vendor grammars; SQL Server temp tables/TVFs/synonyms and Oracle synonyms/PLSQL declarations remain outside this slice. Redis is outside SQL. Dynamic PHP SQL, general expression type inference, total application memory and cross-platform validation remain limited. No family is promoted to compatible. [Implementation, results and limits](sql-intelligence.md); [prospective specification](../specs/14-sql-intelligence.md).

## Mensagem de commit gerada por agente (requisito próprio, 24/10/2026)

Fontes locais: ação Gerar com IA no plugin Git, usando o agente conectado e somente conteúdo preparado, prévia editável e proteção de rascunho/index. Builds, testes dos plugins e prévia WebKit sintética aprovados. Distribuição dos pacotes e validação Tauri/inferência real pendentes; sem promoção comparativa. [Fluxo, limites e evidências](git-agent-commit-message.md).

## Merge orientado por agente (requisito próprio, 24/10/2026)

Fontes locais: seção Resolver com IA no editor de conflitos, com orientação por arquivo, base/dois lados/resultado atual, sugestão editável, proteção contra alterações concorrentes e confirmação antes de gravar. Build/testes do plugin, check da IDE e fluxo WebKit + Monaco sintético aprovados. Pacotes instalados, Tauri e agente real ainda não validados; sem promoção comparativa. [Fluxo, limites e evidências](git-agent-merge.md).

## Consulta ao agente sobre arquivos do commit (requisito próprio, 24/10/2026)

Fontes locais: na lista de alterações da janela Commit, a seleção para o agente é independente das caixas que preparam o commit. A consulta aceita um texto livre ou os atalhos de revisão e impacto, e envia somente os snapshots dos arquivos escolhidos. Testes do plugin e prévia WebKit sintética cobrem a seleção e o diálogo. Pacotes instalados, janela Tauri e agente real ainda não validados; sem promoção comparativa. [Fluxo, limites e evidências](git-agent-file-query.md).

## Revisão de diff no editor principal e ações em ícone — Commit (30/10/2026)

Evidência: captura do PhpStorm enviada pelo usuário (Commit + diff "Commit: arquivo"). Ela mostra o diff no editor principal com: setas de diferença anterior/próxima, lápis para ir ao código-fonte, arquivo anterior/próximo, "Side-by-side viewer", "Do not ignore", "Highlight words" e a contagem "1 difference, 0 included". As ações de IA/agente aparecem só como ícone com tooltip (estilo Copilot). Atalhos (F7/Shift+F7, F4) vêm da documentação pública do diff do IntelliJ, não da captura.

Implementado (host + `plugin-git` local, ainda não fixado em `default-plugins.json`):
- `.editor-split` vazio deixa de ocupar espaço, então a revisão do Git ocupa toda a área do editor em vez da metade de baixo.
- A barra do diff tem ícones de diferença anterior/próxima (desativados sem diferenças; F7/Shift+F7), lápis/F4/⌘↓ que fecha a revisão e abre o arquivo na linha do cursor do lado atual, e arquivo anterior/próximo. Também tem visualizador lado a lado/unificado, "Não ignorar"/"Ignorar espaços nas pontas" e destaque de caracteres/linhas/nenhum, com escolhas persistidas, além da contagem de diferenças. Preparar/Selecionar trechos/Voltar ficam na linha do caminho.
- "Perguntar ao agente", "Selecionar visíveis" e "Limpar seleção" viraram ícones na barra do Commit (contador em selo; a ajuda de seleção foi para o tooltip). "Gerar com IA" é um ícone ao lado de Amend.

Limitações (diferenças do PhpStorm): o Monaco não destaca por palavra (opções honestas: caracteres/linhas/nenhum); não há "Ignore whitespaces and empty lines", nem "included" por trecho no diff; o diff não é aberto como aba de editor ("Commit: arquivo"), ele substitui a área do editor e esconde as abas.

Validação: `npm run typecheck`, `npm test` (41 Rust), `npm run test:locales`, 6 testes do `plugin-git` (inclui contagem, F7, persistência do visualizador, lápis e ícones) e `scripts/check-git-review-layout.mjs --serve` com o build local do plugin no navegador embutido: revisão com 687/687 px da área, split oculto e restaurado ao fechar, lápis abrindo a linha 16. O WebKit do Playwright não está instalado, então a verificação foi pela página servida e não pelo modo headless do script. Falta validação comparativa lado a lado com o PhpStorm e no app empacotado.

## Plugins na barra de status (requisito próprio, 30/10/2026)

O PhpStorm não lista plugins na barra de status: mostra widgets de projeto/ferramenta e deixa os plugins em Settings › Plugins. A barra agora mostra só as versões detectadas pelos plugins (ex.: "Laravel: 12.0 · PHPUnit / Pest: 3.8.6"). A lista completa de plugins ativos fica no tooltip, e o clique continua abrindo o diálogo Plugins. Sem nenhuma versão detectada, aparece só um ícone de tomada, para a entrada continuar acessível. Validação: typecheck e a barra real do shell no navegador embutido com a lista de 16 plugins (de ~1.400 px para 225 px; ícone de 22 px sem versões). Falta conferir no app empacotado.

## Ícone Database após recarga de plugins — requisito próprio (30/10/2026)

Defeito observado na IDE 0.2.16 instalada (perfil do usuário, `phpforge.database` 1.0.3 ativo e com permissões): o ícone Bancos abria Plugins › Marketplace com "Ative o plugin Database em Plugins.". Causa reproduzida no binário de depuração com cópia do perfil e do projeto: a primeira ativação funciona, mas a recarga de plugins de ferramenta no início (`ide-plugins-changed`) reativa todos, e a segunda ativação do Database falha com `NotFoundError` porque um plugin de prévia (SVG/Markdown/Imagem) já tinha envolvido `#editor` em `.editor-split` de forma permanente, e o console SQL insere sua barra com `code.insertBefore(toolbar, #editor)`. Correções: o host desfaz `.editor-split` quando a última prévia sai (`src/editor-preview-layout.ts`), devolvendo ao plugin reativado o mesmo DOM da primeira carga; o ícone (e Agente/Imagem) abre Plugins › Instalados no cartão do plugin, com estado (desativado, aguardando consentimento, falha ao carregar) e ação de recuperação, e o Marketplace filtrado só quando o plugin não está instalado. No repositório `plugin-database` (1.0.4, commit `6a30048`, fixado em `default-plugins.json`; `main.js` e seu sha256 inalterados), a barra SQL passa a se ancorar no filho de `.code` que contém o editor. Validação: `npm run typecheck`, `npm test` (41 Rust) e `scripts/check-database-tool-activation.mjs` executado no navegador interno via `--serve` (WebKit do Playwright não instalado nesta máquina): reproduz a falha sem a correção do host, passa com a correção do host e, separadamente, só com o build local do plugin; com o pacote fixado 1.0.4 baixado por `npm run setup:plugins`, também aprovado; testes do plugin (45) aprovados. Não validados: janela Tauri com a correção, pacote distribuído e ativação ainda em andamento no instante do clique. Sem promoção comparativa.

## Banco — "Importar do Laravel .env…" sem efeito — requisito próprio (30/10/2026)

Requisito próprio (o PhpStorm não oferece essa importação nativamente; nada foi inferido dele). Defeito relatado na IDE 0.2.16 instalada com `phpforge.database` 1.0.4. Causa reproduzida em WebKit (motor da WebView Tauri no macOS) com o bundle e o CSS do plugin: `.ds-import-picker{display:flex}` anulava o atributo `hidden`, então "Arquivo de ambiente" com seleção vazia e "Importar conexão" ficavam sempre visíveis, e o clique retornava sem fazer nada. O leitor nativo funcionou num projeto Laravel 12 real do usuário (pgsql via `DATABASE_URL` + `DB_*`, host `db` com aviso de Docker/Sail), lido só em modo leitura, sem conectar e com a senha mascarada no log. Nenhum `window.alert/confirm/prompt` existe no plugin; o teste falha se algum for chamado.

Correção em `plugin-database` 1.0.5 (`d005d01`): o seletor fica oculto até os arquivos `.env` serem listados; erros do host aparecem sem prefixo `Error:`; o leitor nativo agora diz "Nenhuma chave DB_* encontrada", "não define DB_CONNECTION nem DB_URL" e cita o driver não suportado (ex.: `"mongodb"`), sem expor valores. A senha só preenche o campo mascarado do rascunho; cancelar a descarta.

Validação: `tests/laravel-import.mjs` (WebKit; falhou antes da correção: estado vazio → lista → importa; driver não suportado sem alterar o rascunho; `.env` ausente; projeto não Laravel; cancelar), `tests/lifecycle.mjs`, 45 testes do plugin, 4 testes Rust `laravel_database`, `npm run typecheck` e `npm test` (41 Rust). Limitações: a correção de interface chega ao app pelo catálogo; as mensagens nativas novas só chegam com uma nova versão do app, porque `src-tauri/Cargo.toml` fixa o `plugin-database` por revisão (hoje `b5e78bf`). Projetos sem `laravel/framework` no `composer.json` continuam recusados. Janela Tauri real ainda não reexecutada com a 1.0.5 (depende do push e da fixação).
