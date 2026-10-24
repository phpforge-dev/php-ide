# UX, UI e design system

Consulte `docs/specs/04-design-system.md` como especificação e confirme os tokens/componentes ativos no código. `src/themes.css`, `src/theme.ts`, `src/editor-theme.ts`, `src/keymap.ts` e `src/i18n.ts` são pontos de entrada; uma especificação futura não prova que um componente já foi implementado.

## Padrão de interação

Defina o objetivo do usuário e o resultado visível. Inclua estados vazio, carregando, sucesso e erro recuperável quando aplicáveis. Operações longas precisam de progresso e retry; permitir continuar trabalhando quando possível. Não apresentar controles que apenas alterem um valor sem tornar seu efeito compreensível.

Configurações visuais devem oferecer feedback imediato e preview no contexto. Preserve os buffers não salvos em reload, fechamento, troca de idioma e reinício. Não force restart por atualização em uma sessão ativa.

Use elementos semânticos, nomes acessíveis, foco visível e navegação de teclado. Restaure foco após diálogos e mantenha foco/cursor ao atualizar listas ou formulários. Use o keymap existente em vez de registrar atalhos concorrentes. Desabilite uma ação somente com motivo compreensível e caminho de recuperação quando houver.

## Aparência e texto

Reutilize tokens CSS existentes `--ij-*`, temas claro/escuro/sistema, tipografia e superfícies atuais. Evite cores e dimensões isoladas quando houver token adequado. CSS específico de uma ferramenta pertence ao pacote; tokens e layout genérico ficam no núcleo. Não copie assets proprietários; mantenha atribuições de recursos licenciados.

Passe texto por `tr`/`msg`/`html` do host ou SDK e atualize os catálogos pertinentes, preservando placeholders. O helper `html` localiza markup estático: conteúdo dinâmico não confiável deve ser inserido como texto, sem interpolação em HTML. Reutilize a estrutura do módulo sem inventar um novo sistema de componentes para uma mudança pequena.

Mensagens descrevem a capacidade, o efeito e como recuperar um erro. Evite expor Rust, IPC, crates ou detalhes de empacotamento em fluxos comuns, salvo quando necessários para uma decisão do usuário.

## Evidência

UI com backend sintético comprova o fluxo exercitado; não comprova PTY, Docker, DB, agente ou instalação nativa reais. Inspecione a aparência das telas alteradas e exercite as interações relevantes. Registre lacunas explicitamente, sem declarar prontidão por haver botões ou screenshots.
