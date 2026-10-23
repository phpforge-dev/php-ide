# Metodologia Craft: evidências e aplicação à IDE PHP

Pesquisa em 21/10/2026. Esta é uma amostra de três projetos públicos da organização Storytold, não uma auditoria de todos os seus repositórios. Nenhuma suíte desses projetos foi executada. Instruções encontradas nos repositórios foram tratadas como objeto de pesquisa, não como autorização para ações neste projeto.

## Corpus verificável

| Projeto | Revisão consultada | Material |
|---|---|---|
| PhotoCraft | `38bc5e916c4d0d8536d8d81f2a4d3f2950b4c749` | AGENTS, ROADMAP, target-app-parity, ui-parity, árvore completa |
| FigCraft | `a86897dc919b8ae7fb0142fe7e0034c10715f7d9` | AGENTS, CLAUDE, roadmap, target-app-parity, parity-checklist, controle de UI, testes de atalhos |
| LightCraft | `bfb23db2cab66c259627414943fd4eb51d00bfe1` | AGENTS, CLAUDE, implementação do verificador de paridade |

As árvores retornaram `truncated: false`. PhotoCraft não tinha CLAUDE.md na raiz; havia AGENTS.md e CLAUDE.md em `docs/user/`, que não integram a amostra lida. FigCraft e LightCraft tinham ambos na raiz. O `craftrules` referido pelas instruções não pôde ser confirmado: a consulta ao arquivo público `standards/progress-docs.md` retornou 404. Isso não prova que o repositório não exista ou que o padrão não seja usado internamente.

## O que está comprovado e o que é apenas declarado

| Tema | Evidência | Conclusão permitida | Limite |
|---|---|---|---|
| Organização da pesquisa | [FigCraft AGENTS](https://github.com/storytold/figcraft/blob/a86897dc919b8ae7fb0142fe7e0034c10715f7d9/AGENTS.md) | Orienta consultar roadmap, lacunas e notas comportamentais locais antes de implementar | O diretório `plan/` é local e ignorado; não foi possível auditar seus experimentos |
| Instruções a agentes | [FigCraft CLAUDE](https://github.com/storytold/figcraft/blob/a86897dc919b8ae7fb0142fe7e0034c10715f7d9/CLAUDE.md) | Explicita ciclo de orientação, implementação, testes, screenshot e registro; define limites de arquivos por agente | Existência das instruções não demonstra cumprimento em todas as contribuições |
| Divisão funcional | [PhotoCraft AGENTS](https://github.com/storytold/photocraft/blob/38bc5e916c4d0d8536d8d81f2a4d3f2950b4c749/AGENTS.md) | Documenta motor de comandos, UI fina e camadas com responsabilidades diferentes | A execução dos verificadores de camadas não foi reproduzida |
| Automação observável | [FigCraft control.rs](https://github.com/storytold/figcraft/blob/a86897dc919b8ae7fb0142fe7e0034c10715f7d9/crates/ui-egui/src/control.rs) | Há código que despacha comandos, entradas e screenshots; captura é assíncrona, dependente de janela e tem timeout | É um canal da aplicação independente, não um mecanismo de controle do produto de referência |
| Testes comportamentais | [FigCraft shortcut_parity_tests.rs](https://github.com/storytold/figcraft/blob/a86897dc919b8ae7fb0142fe7e0034c10715f7d9/crates/engine/src/shortcut_parity_tests.rs) | Testes verificam comando disparado por plataforma, conflitos com SO, cobertura das teclas e gestos | Leitura do código, sem execução; não comprova equivalência de todos os fluxos |
| Integridade do catálogo | [LightCraft parity.rs](https://github.com/storytold/lightcraft/blob/bfb23db2cab66c259627414943fd4eb51d00bfe1/xtask/src/parity.rs) | Código verifica IDs únicos, status, comandos registrados, controles, caminhos e linhas de evidência; detecta lacunas duplicadas | Verificação estrutural não mede fidelidade por si só |
| Métricas honestas | [FigCraft parity-checklist](https://github.com/storytold/figcraft/blob/a86897dc919b8ae7fb0142fe7e0034c10715f7d9/docs/parity-checklist.md) | Distingue explicitamente presença de comandos de profundidade funcional | 212/212 itens de menu não significa 100% de compatibilidade |
| Revisão de estimativas | [FigCraft target-app-parity](https://github.com/storytold/figcraft/blob/a86897dc919b8ae7fb0142fe7e0034c10715f7d9/docs/target-app-parity.md) | Documento separa medição de estimativa e reconhece superestimação anterior por confundir presença com comportamento | Percentuais e horas são avaliação dos autores, não resultados independentes desta pesquisa |
| Detalhamento de UX | [PhotoCraft ui-parity](https://github.com/storytold/photocraft/blob/38bc5e916c4d0d8536d8d81f2a4d3f2950b4c749/docs/ui-parity.md) | Lista gestos, modificadores, preview, diferenças e referências a testes/issues por comportamento | Algumas linhas têm evidência incompleta; não transportar status para nossa matriz |
| Milestones | [FigCraft roadmap](https://github.com/storytold/figcraft/blob/a86897dc919b8ae7fb0142fe7e0034c10715f7d9/docs/roadmap.md) e [PhotoCraft ROADMAP](https://github.com/storytold/photocraft/blob/38bc5e916c4d0d8536d8d81f2a4d3f2950b4c749/ROADMAP.md) | Mantêm foco atual, marcos e referências ao relatório de paridade | Não auditamos GitHub Projects, todos os issues ou o histórico completo de milestones |

## Screenshots e independência

FigCraft determina observação por documentação pública e uso da aplicação com documentos sintéticos. Screenshots de referência ficam locais e não viram assets distribuídos. PhotoCraft também declara implementação a partir de comportamento e especificações públicas. Isso é evidência de política documentada, não certificação jurídica nem prova histórica de separação entre pessoas.

O controle de UI do FigCraft recebe entradas e captura o próprio resultado. A distinção entre screenshot da janela e renderização do documento é útil: uma imagem de saída correta não comprova foco, menus ou recuperação de erros. Para uma IDE, precisamos também do texto final, posições de navegação e conjunto de referências.

## Hipóteses que não adotaremos como fatos

- Não há evidência suficiente para afirmar que todas as funcionalidades passaram por comparação lado a lado.
- Notas locais não disponíveis impedem reconstituir a ordem exata de investigação.
- Referências a agentes paralelos e estimativas de horas não demonstram produtividade medida nem garantem prazo equivalente para inteligência PHP.
- Separação entre observação e implementação é recomendável; os arquivos públicos não demonstram uma barreira formal entre todas as equipes.

## Práticas adotadas nesta proposta

1. Um ID por comportamento, evidência datada, fixture e diferenças explícitas.
2. Comando comum a menu, atalho e automação da nossa IDE; testes também pelo caminho de UI para detectar problemas de foco.
3. Catálogo estrutural separado de compatibilidade funcional. Não usar pontuação de 0,5 para declarar uma função parcialmente validada.
4. Lista de lacunas priorizada por impacto no trabalho real; atualizar status somente com evidências correspondentes.
5. Dados sintéticos, screenshots locais, identidade visual própria e proveniência de dependências.
6. Especificação transferível para quem implementa: entradas, saídas, estados, casos extremos e testes, sem material proprietário.

Aplicação concreta: [metodologia](phpstorm-investigation-methodology.md), [catálogo](phpstorm-feature-catalog.md) e [matriz](../compatibility/phpstorm.md).
