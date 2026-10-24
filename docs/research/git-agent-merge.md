# Merge orientado por agente — requisito próprio (24/10/2026)

Extensão da janela de resolução de conflitos no repositório `plugin-git`. Reutiliza a contribuição `agents.generate` e o hook `sdk.service` da integração de mensagem de commit; não amplia permissões IPC nem altera o backend Git. Implementação própria, sem observação comparativa com PhpStorm.

## Fluxo

Abra um arquivo em conflito e expanda “Resolver com IA”. Escreva a orientação para combinar os lados, por exemplo “preserve a validação de main e incorpore o novo retorno da feature”. “Gerar sugestão” envia a orientação, caminho, operação, nomes dos lados, base, esquerda, direita e o resultado atual do arquivo ao agente conectado. O resultado atual participa para preservar edições manuais. A geração pode ser interrompida e erros permitem tentar novamente sem alterar o resultado.

A resposta deve ser um objeto JSON com `result` textual. Respostas inválidas e sugestões com marcadores Git são rejeitadas. A prévia é editável; “Usar no resultado” confere novamente o token do conflito no disco e a versão do modelo antes de substituir o resultado como uma edição com suporte a desfazer. Isso impede sobrescrever edições feitas durante a geração. A sugestão não grava o arquivo. “Aplicar” solicita confirmação explícita para salvar o resultado revisado e marcar o conflito como resolvido, usando a validação de token já existente em `gitResolve`.

Após aceitar uma sugestão de arquivo inteiro, as antigas setas/navegação de chunks ficam desabilitadas e suas decorações são removidas, pois suas faixas não representam o novo texto. Os lados originais continuam visíveis e o resultado permanece editável. Trocar de projeto, fechar a ferramenta ou remover o plugin fecha os merges, descarta a prévia e invalida respostas atrasadas. Fechar durante a geração solicita interrupção. O gerador não cancela uma conversa alheia durante a leitura inicial do conflito.

## Evidências

- `plugin-git`: build e cinco testes aprovados. O teste novo cobre orientação/contexto, ausência do agente, rascunho preservado, prévia editável, edição concorrente, token alterado, cancelamento, resposta tardia, formato inválido, marcadores e limite de contexto.
- `npm run check`: typecheck, arquitetura, 189 unitários aprovados/um ignorado, 36 testes Rust, Clippy e locales aprovados. Catálogos PT/EN atualizados e revalidados separadamente após incluir as novas mensagens.
- WebKit headless + Monaco real, com Git/agente sintéticos: merge de três painéis, orientação enviada, prévia, uso explícito, confirmação de gravação, conteúdo/token enviados a `gitResolve`, fechamento e descarte de modelos aprovados. Layout inspecionado após estabilização do Monaco. Captura local: `/private/tmp/phpforge-merge-ai/preview.png`; roteiro: `/private/tmp/phpforge-merge-ai/preview.mjs`.

## Limites

Fluxo por arquivo textual em conflito; não planeja merges de branches inteiras, não trata binários nem exclui arquivos. Contexto mais orientação limitado a 60.000 caracteres, com erro explícito em vez de truncamento silencioso. Precisa de agente conectado, livre e sem alterações pendentes. Reutiliza a sessão existente; a orientação pede resposta textual sem ferramentas, mas não cria sessão isolada nem garante obediência de um provedor externo. As permissões e a revisão de alterações normais do agente continuam no painel Agente. Não houve inferência real nem validação deste fluxo na janela Tauri.

O bundle local Git foi reconstruído. Distribuição/publicação e atualização dos pins/hashes e dos plugins instalados não foram executadas. Requer a IDE e os plugins com a integração local de agentes/commit; as revisões fixadas no catálogo ainda não incluem as mudanças. A função legada `show` do merge continua grande; a nova UI de IA (118 linhas) e a construção/validação do pedido (27 linhas) foram separadas para não concentrar essas responsabilidades nela.
