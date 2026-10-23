# Avaliação do REA para a investigação do PhpStorm

> **Atualização 22/10/2026:** por decisão do usuário, o REA 6.7.0 passou a ser usado para observar a UI do PhpStorm (`observe_native_ui`), com o executável Mach-O do launcher aberto só como âncora exigida pela ferramenta. Limites mantidos: sem descompilação, leitura de JARs/bytecode/índices/plugins, instrumentação ou extração de assets. Acessibilidade foi concedida ao processo `claude.app` interno do Claude Code; gravação de tela continuou negada ao REA. Uso registrado no [recorte 09](implementation-slice-09.md). A recomendação abaixo é o registro histórico de 21/10.

Data: 21/10/2026. Revisão: [`421d527bfefa7c268ccb1e6aca68d59e45ebe643`](https://github.com/morluto/rea/tree/421d527bfefa7c268ccb1e6aca68d59e45ebe643). Análise documental e leitura de código público; REA não foi instalado ou executado sobre o PhpStorm.

## Arquitetura e integração

A [arquitetura publicada](https://github.com/morluto/rea/blob/421d527bfefa7c268ccb1e6aca68d59e45ebe643/docs/architecture.mermaid) separa domínio e contratos, workflows de aplicação, adaptadores de provedores e entradas CLI/MCP. `src/main` atende MCP; `src/cli` expõe operações pontuais. A composição seleciona provedores e mantém sessões, snapshots, evidências e incertezas. O servidor usa stdio por padrão e oferece HTTP opcional. Isso descreve o REA, não a arquitetura interna do PhpStorm.

O [registro do servidor](https://github.com/morluto/rea/blob/421d527bfefa7c268ccb1e6aca68d59e45ebe643/src/server/createServer.ts) contém famílias de ferramentas para navegador, artefatos, runtime, provedores nativos e outros alvos. Os [testes MCP de recursos de bundles](https://github.com/morluto/rea/blob/421d527bfefa7c268ccb1e6aca68d59e45ebe643/src/server/BundleResourcesMcp.test.ts) usam cliente/servidor MCP e verificam retenção de evidências. São testes lidos, não executados nesta pesquisa. “Recursos de bundle” não deve ser confundido com a interface protocolar MCP `resources/list`; não foi estabelecido aqui um catálogo de resource URIs.

A [instalação documentada](https://github.com/morluto/rea/blob/421d527bfefa7c268ccb1e6aca68d59e45ebe643/docs/installation.md) suporta Codex, configuração MCP e skill correspondente, com versão fixada, backup, prévia e reinício/reconexão. Há `setup --client codex --dry-run --json` e diagnóstico por cliente. Essas capacidades são documentadas pelo REA; não foram verificadas na configuração local. Nenhum arquivo de configuração do Codex foi alterado.

## Adequação das ferramentas

| Capacidade | Evidência pública | Utilidade neste projeto | Decisão |
|---|---|---|---|
| Retenção/exportação de Evidence; lacunas e cobertura | Arquitetura e AGENTS | Modelo útil para proveniência e resultados incompletos | Adotar o conceito no formato próprio de registros |
| `inspect_desktop_application` | [Desktop applications](https://github.com/morluto/rea/blob/421d527bfefa7c268ccb1e6aca68d59e45ebe643/docs/desktop-applications.md) | Inspeciona diretórios, cabeçalhos e metadados; não observa menus nem abre a aplicação | Não usar sobre o bundle do PhpStorm |
| `inspect_web_page`, `observe_web_session` | [Browser observation](https://github.com/morluto/rea/blob/421d527bfefa7c268ccb1e6aca68d59e45ebe643/docs/browser-observation.md) | DOM/acessibilidade e eventos de páginas via CDP; não estabelece suporte ao desktop PhpStorm | Opcional para uma futura interface web própria |
| `capture_web_screenshot`, `compare_web_screenshots`, `compare_web_captures` | Mesmo guia | Comparação local de PNG e capturas; comparação de PNG não faz OCR | Não substitui avaliação semântica de completion, referências ou tipos |
| Análise de JavaScript/Electron e fontes capturadas | Arquitetura e guia de navegador | Excede a observação externa pedida quando aplicada a produto proprietário | Fora do escopo |
| Provedores Hopper/Ghidra/IDA, inspeção gerenciada e instrumentação | Arquitetura e servidor | Não necessários à especificação comportamental | Não instalar, conectar ou usar nesta investigação |

O guia de navegador distingue observação passiva de controle geral da interface. Não encontramos evidência, nesta amostra, de um adaptador de acessibilidade desktop que permita executar os fluxos da IDE. Isso é uma limitação da evidência examinada; não é uma afirmação de impossibilidade permanente.

## Limites técnicos e de direitos

O [DISCLAIMER](https://github.com/morluto/rea/blob/421d527bfefa7c268ccb1e6aca68d59e45ebe643/DISCLAIMER.md) diferencia posse/acesso de autorização e exclui contorno de proteção e cópia proprietária. A licença MIT do REA não licencia o alvo nem ferramentas comerciais de terceiros. Análise local também não garante que artefatos enviados ao agente permaneçam locais.

O [acordo público JetBrains](https://www.jetbrains.com/legal/docs/toolbox/user/) descreve uso no período de avaliação sob seus termos. O usuário informou trial ativado em 21/10/2026. Isso permite prosseguir com o escopo solicitado de uso da UI; não autoriza ampliar para extração, descompilação ou inspeção interna. Não emitimos conclusão jurídica sobre todas as formas de engenharia reversa. A política concreta deste trabalho é observar a interface pública com fixtures próprias e não redistribuir assets ou screenshots da referência.

## Recomendação

REA é opcional e não é requisito da primeira entrega. UI pública, documentação, projetos sintéticos e um registro próprio de evidências bastam para os primeiros fluxos. Instalar uma cadeia de análise binária acrescentaria dependências sem resolver o principal problema: observar resultados semânticos e interações do editor.

Reavaliar somente se houver uma necessidade concreta de comparação da nossa interface web ou gestão de evidências que o formato simples não atenda. Nesse caso, fixar versão, revisar ferramentas expostas e limitar entradas a materiais autorizados. Não assumir que desabilitar um provedor impede automaticamente todas as operações fora do escopo.
