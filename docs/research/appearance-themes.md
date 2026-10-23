# Aparência: claro, escuro e sistema — 2026-10-22

ID UI-THEME-002. Prioridade alta; complexidade média. Recorte implementado, equivalência global ao PhpStorm **Em desenvolvimento**. São requisitos próprios de UX e implementação independente, sem nova observação do PhpStorm local.

## Problema e resultado

As variáveis de cores estavam duplicadas entre folhas CSS e várias superfícies mantinham cores fixas escuras, inclusive Welcome. O diálogo modal escurecia o editor durante o ajuste. A preferência tinha apenas claro/escuro e não acompanhava o sistema.

- Paleta semântica única em `src/themes.css`, aplicada por `src/theme.ts`. Superfícies antes fixas usam tokens em `src/theme-surfaces.css`.
- Claro, Escuro ou Seguir o sistema; novos perfis usam Sistema, escolhas existentes são preservadas. `matchMedia` acompanha mudanças apenas na opção Sistema. Modo explícito prevalece sobre o SO.
- Painel de Aparência não modal, à direita, com amostras clicáveis e estado selecionado, tema efetivo, densidade e tamanho da fonte. Prévia no workbench sem backdrop. Fecha por botão, Escape ou clique fora. Salvamento automático.
- Botão sol/lua ao lado da engrenagem alterna imediatamente para modo explícito. Welcome também oferece seletor de tema.
- Monaco usa cores próprias para seleção, cursor, linhas, sugestões, hover e widgets. Comentários têm contraste melhor. As categorias sintáticas continuam em `editor-theme.ts`.
- Terminal acompanha tema e possui cores ANSI próprias para fundo claro/escuro, sem recriar sessões.
- Welcome, diálogos, árvore, abas, popups, diffs de linha, mensagens de erro/sucesso, agente, Docker e testes receberam ajustes por paleta. Mermaid continua respondendo ao tema pelo observer existente.
- Bootstrap aplica preferência antes de carregar o workbench. Splash usa a paleta quando o bootstrap carrega; o HTML estático anterior à execução JavaScript ainda tem apresentação inicial própria.
- `native.ts` sincroniza a preferência com `Window.setTheme`, incluindo `null` para Sistema. A capability concede apenas a permissão adicional `core:window:allow-set-theme`. A aparência exata da moldura depende do sistema operacional.

## Aceitação e evidências

`preview-workbench.mjs`: seleção pelas amostras, painel não modal, light/dark, emulação de mudança do SO, preservação do modo explícito, botão rápido e persistência após reload. Resultado em `.artifacts/appearance-checks.json`. Screenshots `.artifacts/appearance-dark.png`, `appearance-light.png`, `welcome-dark.png` e `welcome-light.png` são fixtures visuais no Chrome, revisadas; não screenshots do PhpStorm.

Contraste calculado para pares centrais de tokens:

| Tema | Texto / superfície | Texto secundário / painel | Destaque / painel |
|---|---:|---:|---:|
| Escuro | 12,59:1 | 6,25:1 | 6,81:1 |
| Claro | 14,72:1 | 5,58:1 | 5,37:1 |

Esses pares excedem 4,5:1. Não constituem auditoria completa de acessibilidade de todos os componentes, cores de terminal, sintaxe ou conteúdo de plugins.

Typecheck e 21 testes Rust aprovados. O roteiro nativo de inicialização foi ampliado para verificar troca claro/escuro no tema efetivo do Monaco, alternância rápida e preferência persistida. Não houve nova execução da suíte geral de navegação PHP nesta entrega; as duas falhas registradas no recorte anterior de ícones continuam abertas, sem relação causal presumida com temas.

Dependências existentes: DOM/WebKit, localStorage opcional, media query do sistema, Monaco, xterm e API Window do Tauri. Nenhuma biblioteca nova. Limites: sem importação de temas externos, paletas personalizadas, agenda de troca ou certificação completa de contraste; ensaio nativo realizado no macOS, Windows ainda sem validação específica.

Verificação final: build assinado aprovado; os sete cenários de `scripts/check-startup.mjs` passaram no Tauri, incluindo tema efetivo claro/escuro do Monaco, alternância rápida e persistência em localStorage (`.artifacts/startup-native.json`). A consulta inicial do teste ao fundo de um wrapper transparente foi substituída pela observação do tema efetivo do editor; não se tratava de falha de aplicação da paleta.
