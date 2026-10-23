# Recorte 16 — menu de contexto da árvore do projeto e histórico local

22/10/2026. Pedido: ações do botão direito sobre pastas e arquivos — novo, recortar, copiar (vários tipos de caminho), colar, encontrar usos, abrir em, refatorar (mover, renomear etc.) e histórico local.

## Separação de fontes

- **DOC:** a ajuda pública do PhpStorm descreve o menu de contexto da janela Project, Copy Path/Reference, Refactor › Rename/Move/Copy, Safe Delete e Local History ([Project tool window](https://www.jetbrains.com/help/phpstorm/project-tool-window.html), [Copy and paste](https://www.jetbrains.com/help/phpstorm/working-with-source-code.html), [Local History](https://www.jetbrains.com/help/phpstorm/local-history.html)). Usada só para escopo e atalhos padrão (Shift+F6, F6, F5, Alt+F7, ⇧⌘C / Ctrl+Shift+C).
- **OBS:** nenhuma observação nova da referência neste recorte. Ordem dos itens, rótulos, diálogos e aparência da referência **não** foram comparados.
- **REQ (próprio):** tudo abaixo.

## Implementação

- `src-tauri/src/files.rs` (comandos IPC `file*`): criar arquivo/diretório (pais criados), renomear (inclusive só a caixa do nome), mover, copiar recursivamente, excluir, mostrar no gerenciador de arquivos/abrir no aplicativo padrão (`open`, `explorer`, `xdg-open`, sem shell), busca textual e histórico local. Caminhos relativos confinados à raiz; nomes com separador, `..`, symlink para fora do projeto e mover diretório para dentro de si são recusados. Destino existente nunca é sobrescrito.
- Histórico local: fora do projeto (cache do app, ou `PHP_IDE_STATE_DIR` nos testes), índice JSON + blobs por SHA-256. Grava o conteúdo **antes** de salvar, renomear, mover, excluir e restaurar pela IDE; revisões acompanham renomeações e movimentações; até 3000 revisões (as mais antigas e blobs órfãos são podados). Arquivos acima de 5 MB não entram: excluir um diretório com eles pede confirmação extra.
- `terminalCreate` aceita diretório inicial opcional (confinado) para *Abrir em › Terminal*.
- `src/project-actions.ts`: menu próprio (teclado: setas, → abre submenu, ← volta, Enter, Esc; Shift+F10/tecla Menu abrem), com:
  - **Novo** › Arquivo, Diretório (aceitam `a/b/c`), Classe PHP (classe/interface/trait/enum; namespace sugerido pelo PSR-4 de `autoload`/`autoload-dev` do `composer.json`).
  - **Recortar / Copiar / Colar** (área interna da IDE; item recortado fica esmaecido). Colar cópia com conflito sugere `Nome_1.ext`; recortar com conflito é recusado.
  - **Copiar caminho/referência** › absoluto, relativo à raiz, nome, URI `file://`, FQN PHP (namespace + primeira classe/interface/trait/enum do arquivo).
  - **Encontrar usos**: arquivo PHP com declaração → usos do símbolo pelo Phpactor (mesmo popup do editor); demais arquivos e diretórios → busca textual do nome/caminho no projeto (sem `vendor`, até 500 ocorrências), com filtro e abertura na linha.
  - **Refatorar** › Renomear, Mover (lista de diretórios), Copiar (nome + destino), Excluir; **Excluir** também no primeiro nível.
  - **Abrir em** › Finder/Explorer/gerenciador de arquivos, aplicativo padrão (arquivos), Terminal da IDE no diretório.
  - **Histórico local** › diálogo com revisões (data, motivo, caminho), diff revisão × atual em Monaco e *Restaurar esta versão* (recria arquivo excluído). No diretório ou na raiz, lista as revisões dos arquivos contidos, incluindo excluídos.
  - Atalhos com foco na árvore: ⌘/Ctrl+C, X, V; ⌘⌫/Delete; Shift+F6; F6; F5; Alt+F7; ⇧⌘C/Ctrl+Shift+C; ⌥⇧⌘C/Ctrl+Alt+Shift+C; ⌘N (macOS) ou Alt+Insert.
- `src/main.ts`: árvore recarrega preservando diretórios abertos; abas, histórico de navegação e foco acompanham renomear/mover; abas de excluídos fecham. Operações sobre arquivos com alterações não salvas são recusadas com mensagem.

## Verificação

- `npm test` (Rust, 21 aprovados no total): `files::tests` (3) cobre criar/renomear/mover/copiar, conflitos, nomes inválidos, mover para dentro de si, renomear só a caixa, histórico acompanhando renomear/mover, deduplicação, excluir e restaurar, persistência do índice, busca textual sem `vendor` e symlink para fora.
- `npm run typecheck` aprovado.
- `node scripts/check-native.mjs --no-db`, janela Tauri real, verificação "Árvore: menu de contexto…": botão direito → Novo › Classe PHP (namespace `Fixture`), Refatorar › Renomear com aba acompanhando, Copiar/Colar na raiz e com conflito, Recortar/Colar, FQN, Histórico local com restauração, Excluir com revisão gravada, Shift+F6 e Abrir em › Terminal — **aprovada** (22/10/2026, macOS), junto com as demais verificações da execução; bancos não exercitados (`--no-db`). Copiar para a área de transferência do sistema não é verificado (o teste confere a mensagem de status), nem Mostrar no Finder / aplicativo padrão, que abrem aplicativos externos.

## Limites

- Renomear/mover arquivo PHP **não** altera a declaração, o namespace nem as referências (Rename Symbol, PHP-RENAME-001, não implementado); o diálogo avisa.
- Safe Delete (busca de usos antes de excluir), seleção múltipla, arrastar e soltar, colar arquivos copiados no Finder/Explorer, desfazer (⌘Z) de operações de arquivo e rótulos manuais no histórico não implementados.
- O histórico local registra só alterações feitas pela IDE (não edições externas nem gravações do agente) e não guarda diretórios vazios.
- Abrir em Terminal externo e outros aplicativos não implementado; *Mostrar no gerenciador* no Linux abre o diretório pai sem selecionar.
- A árvore não se atualiza sozinha com mudanças externas (limite anterior a este recorte).
