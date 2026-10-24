---
name: phpforge-code-quality
description: Orientar engenharia, escrita, revisão e refatoração de código da PHP IDE (PHPForge) e dos repositórios phpforge-dev/plugin-*, com limites de tamanho de arquivos/componentes, coesão, clean code e comentários úteis. Usar em mudanças de código desse produto; não impor estas convenções a projetos sem relação com PHPForge.
---

# PHPForge code quality

Escreva código que permita entender e alterar um comportamento sem percorrer responsabilidades alheias. Aplique estas convenções ao código novo e às partes alteradas. Preserve o escopo da tarefa: um arquivo legado acima do limite não autoriza reescrevê-lo inteiro. Siga o `AGENTS.md` e os contratos atuais do checkout.

## Tamanho e divisão

Conte linhas físicas, incluindo imports, espaços e comentários. Os limites abaixo são convenções de engenharia do projeto, não restrições de compilação.

| Unidade | Alvo | Limite para código novo |
| --- | --- | --- |
| Arquivo de implementação TypeScript/Rust | Até 300 linhas | 400 linhas |
| Componente visual ou controller de UI | Até 150 linhas | 200 linhas por componente/controller |
| Função ou método | Até 40 linhas | 60 linhas |
| Folha CSS de uma funcionalidade | Até 250 linhas | 350 linhas |

Um arquivo pode conter mais de um componente pequeno e coeso, respeitando também o limite do arquivo. Não comprima linhas, remova espaçamento útil ou distribua código arbitrariamente para caber na tabela. Complexidade e número de responsabilidades podem justificar divisão antes do limite.

Se a implementação nova exceder um limite, divida por responsabilidade antes de concluir. Uma exceção localizada é aceitável quando a divisão pioraria a compreensão, como um algoritmo contínuo ou despacho declarativo coeso; explique o motivo no relato da entrega. Isso não exige aprovação adicional por si só.

Arquivos gerados, lockfiles, catálogos de tradução, dados/fixtures e declarações de protocolo geradas não entram nesses limites. Nos testes, prefira arquivos por comportamento ou domínio; não fragmente um cenário coeso só pela contagem. Em arquivos legados grandes, extraia a responsabilidade afetada quando isso reduzir o risco; evite aumentar o problema e informe a dívida restante.

## Coesão e componentes

- Cada módulo deve ter uma responsabilidade que possa ser nomeada com clareza. Separe renderização, regras de domínio, persistência e transporte quando evoluírem independentemente.
- Componentes recebem dados e callbacks explícitos. Evite componentes que concentrem carregamento, autorização, parsing, persistência e várias telas.
- Mantenha estado próximo de quem o usa; não promova estado local a singleton global por conveniência. Declare claramente quem cria, altera e descarta recursos.
- Extraia um componente quando houver uma interação própria, um ciclo de vida independente ou reutilização real. Não crie um arquivo para cada fragmento de markup.
- Prefira composição e funções simples. Introduza abstrações por necessidade demonstrável; não crie factories, repositories, classes-base ou wrappers que apenas renomeiem uma chamada.
- Não coloque regras específicas de plugins no núcleo. Contratos compartilhados não devem importar implementações de funcionalidades.

## Escrita de código

Use nomes que expressem domínio e intenção. Evite abreviações ambíguas, booleanos posicionais pouco claros e nomes genéricos como `data`, `manager` ou `helper` quando houver um conceito mais preciso. Siga os termos já usados no contrato.

Uma instrução por linha e blocos legíveis são o padrão para código novo. Evite funções inteiras em uma linha, ternários aninhados e cadeias densas de efeitos colaterais. Não reformate módulos inteiros apenas para aplicar estilo.

Mantenha o caminho principal fácil de seguir, com guard clauses quando reduzirem aninhamento. Prefira dados derivados a cópias sincronizadas manualmente. Use constantes com nomes quando explicarem uma política; não transforme literais triviais em indireções desnecessárias.

Use tipos explícitos nas fronteiras. Evite `any`, casts e non-null assertions para esconder uma dúvida de modelagem. Quando uma API externa exigir adaptação, valide `unknown` no limite e mantenha a exceção localizada. Modele estados incompatíveis com uniões discriminadas quando isso impedir combinações inválidas.

No Rust, prefira `Result` e propagação com contexto útil. Não use `unwrap`/`expect` em caminhos normais de entrada do usuário ou I/O. Preserve cancelamento e liberação de recursos. Não mantenha locks durante operações demoradas sem uma necessidade comprovada.

Trate erros onde houver uma recuperação ou uma tradução útil para o usuário. Não engula falhas, devolva sucesso falso nem use fallbacks silenciosos que ocultem perda de dados. Um tratamento best-effort deve ser intencional e não comprometer o resultado principal.

Remova código morto e imports/dependências que a própria alteração tornou desnecessários. Não mantenha implementações antigas comentadas. Evite duplicar uma regra; extraia a regra comum quando os casos realmente compartilharem a mesma semântica, não apenas uma aparência parecida.

## Comentários

Não adicione comentários desnecessários. O padrão é código claro sem comentários; acrescente um somente quando trouxer informação necessária que nomes, tipos e estrutura não comunicam. Não preencha código novo com explicações por hábito.

Não adicione comentários óbvios que narrem o código: “cria botão”, “incrementa contador”, “salva arquivo” ou “percorre lista”. Melhore nomes e estrutura antes de acrescentar explicações.

Comente apenas o que não fica evidente na implementação: motivo de uma decisão, invariante, limite de segurança, ordem exigida por uma API, unidade/formato inesperado ou workaround com sua causa. Documente contratos públicos quando houver semântica não óbvia, incluindo ownership e efeitos relevantes.

Mantenha comentários curtos, próximos da decisão e atualizados. Use TODO apenas para uma pendência concreta, com contexto suficiente para agir. Não adicione banners de seção ou JSDoc que apenas repita nomes e tipos.

## Entrega e revisão

Antes de concluir, confira se a divisão facilita a próxima alteração, se estados de erro e descarte estão cobertos e se os limites foram respeitados sem fragmentação artificial. Registre exceções reais de tamanho e limitações, sem transformar a entrega em uma lista genérica de boas práticas.

Execute as verificações exigidas pelo projeto e testes pertinentes ao comportamento alterado. Para a IDE, `npm run check` agrega typecheck, arquitetura, unitários, Rust, Clippy e locales; valide UI/nativo quando a mudança exigir. Para um pacote, use seus scripts reais. Teste contratos, falhas e transições relevantes; evite testes que só reproduzam detalhes internos.

Estas convenções complementam a stack e os contratos do produto. Não autorizam refatorações em massa, publicação ou mudanças externas por iniciativa própria.
