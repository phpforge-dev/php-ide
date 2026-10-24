# Pacotes e contratos

## Escolher a fronteira

Consulte no checkout da IDE `docs/plugins/api.md`, `docs/plugins/extraction-contracts.md`, `docs/plugins/permissions.md`, `shared/language/plugins/api.ts` e `shared/language/plugins/workbench-api.ts`. No pacote, confira `plugin.json`, entrypoints e testes existentes. Nomes e versões desses arquivos são a fonte de verdade; esta skill não fixa revisões de lançamento.

Há três formas distintas:

- Linguagem: hooks `IdePlugin` em Web Worker, com `ProjectFiles` e serviços autorizados. Retorne `null` quando o pedido não pertencer ao provedor. Não use globals Node. Texto não salvo e posições UTF-16 devem continuar corretos.
- Workbench confiável: `activate(sdk)` integra UI e contribuições opcionais. Não é sandbox; exige confiança e permissões explícitas. Use `sdk.provide`, `sdk.own` e os métodos declarados/permitidos no host.
- Ferramenta nativa executável: protocolo Rust JSONL com inicialização, requisições e eventos; requer `native.tool` e autorização por método. Não confundir com as seis bibliotecas Rust externas fixadas por Git, que são estaticamente ligadas ao host e exigem rebuild da IDE para atualizar o backend.

## Integração e ciclo de vida

O host mantém autorização, integridade do pacote, confinamento, armazenamento seguro e ciclo de vida dos recursos. Protocolos específicos, construção de comandos e UI da funcionalidade pertencem ao pacote.

A ausência de um plugin deve gerar um estado recuperável. Use as contribuições de `src/plugin-services.ts` e a ponte de `src/tool-plugins.ts`; não importe fontes de um checkout vizinho ou de `.tools/plugin-packages` em produção. Esse cache existe para testes de fontes fixadas, não como mecanismo de instalação de runtime.

Ao desabilitar/remover um plugin ou trocar de projeto: descarte providers, listeners, observers, workers, UI e processos sob sua responsabilidade. Respostas atrasadas não podem alterar o novo documento ou a nova geração. Declare e confira permissões também no backend. Não execute scripts de instalação/build de um repositório baixado como parte da instalação de pacotes.

Ao publicar um pacote dentro do escopo autorizado, valide o build e os testes do pacote antes de atualizar pins, hashes, versão mínima da IDE e catálogo correspondentes. Descreva separadamente extração de UI e extração de backend. Não considere publicação ou merge autorizados só porque esta skill foi carregada.

## Instalação e atualização

Leia `docs/specs/first-run-and-updates.md` ao tocar esse fluxo. O usuário escolhe plugins no primeiro uso; não baixar todos ao abrir projetos. A fila Rust mantém progresso, falha e retry enquanto a interface segue utilizável. Somente o roteiro nativo sintético prepara todos os pacotes para testes.

Auto-update de plugins e da IDE começa desligado. Com a automação desligada, a checagem informa disponibilidade sem baixar/instalar. Preserve permissões negadas, estado desabilitado, revisão de permissões novas e proteção de buffers não salvos. Atualização de UI não substitui bibliotecas Rust estáticas. Não gerar chaves, alterar secrets ou publicar releases por efeito colateral de uma mudança de código.
