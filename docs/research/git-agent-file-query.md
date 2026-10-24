# Consulta ao agente sobre arquivos do commit — requisito próprio (24/10/2026)

Implementação em fontes locais de `plugin-git`, reutilizando a contribuição `agents.generate` e o hook `sdk.service`. Não amplia permissões IPC nem altera o backend Git. Sem observação comparativa ou alegação de compatibilidade com PhpStorm.

Na lista de alterações da janela Commit, a seleção para consulta é independente das caixas que preparam o commit. Clique abre o diff e seleciona o arquivo. Ctrl/⌘+clique, Shift+clique e Espaço alteram a seleção sem preparar arquivos nem abrir outro diff. “Selecionar visíveis” inclui somente os arquivos dos grupos abertos; “Limpar seleção” zera a consulta. Arquivos que saem da lista deixam de estar selecionados.

“Perguntar ao agente” abre um diálogo com a lista exata e um texto livre. “Revisar alterações” e “Analisar impacto” apenas preenchem a orientação. O envio lê somente os snapshots daqueles caminhos: versão preparada e do disco, ou base/lados/resultado quando o arquivo está em conflito. Buffers não salvos ficam de fora, com aviso. A resposta aparece no diálogo e não grava, prepara nem cria commit. Fechar ou trocar de projeto interrompe a consulta e descarta uma resposta atrasada. Se os arquivos mudarem durante a leitura, o envio é recusado; se mudarem depois da resposta, o texto permanece e o status avisa que ele se refere às versões enviadas.

O contexto e a orientação ficam limitados a 60.000 e 10.000 caracteres, com erro explícito. A orientação pede análise somente do JSON enviado, sem ferramentas, edições ou outros arquivos. A sessão é a do painel Agente; não há sessão isolada nem garantia de que um provedor externo obedecerá à instrução. A consulta exige agente conectado e é bloqueada enquanto uma operação Git estiver em andamento.

## Evidências

- `plugin-git`: build e seis testes aprovados. O teste da consulta cobre seleção independente do stage, atalhos de revisão e impacto, ausência dos arquivos não escolhidos, conflito, arquivo ausente, limite de contexto, resposta sem HTML, mudança durante a análise, cancelamento, resposta tardia e descarte.
- `npm run check` da IDE, executado na mesma sessão antes do encerramento por limite de uso: typecheck, arquitetura, unitários, 36 testes Rust, Clippy e locales aprovados naquele momento.
- Catálogos PT/EN atualizados depois, com `node scripts/check-locales.mjs`: 2 locales, 1550 traduções, placeholders válidos.
- WebKit headless com CSS atual e agente simulado: dois arquivos selecionados, README excluído, orientação de impacto enviada só com esses caminhos e resposta exibida. Captura local em `/private/tmp/phpforge-file-agent/preview.png`.

## Limitações

Sem inferência real e sem este fluxo na janela Tauri. O bundle local do Git foi reconstruído; publicação e atualização dos pins/hashes e dos plugins instalados não foram executadas. O recurso depende da IDE com `sdk.service` e do pacote Git local. A montagem do diálogo ficou em uma função de 137 linhas, abaixo do limite do componente e acima da meta de 60 linhas por função; dividi-la agora separaria um único ciclo de abertura, envio e cancelamento.
