# Idiomas da interface — UI-LANGUAGE-001

Requisito próprio implementado em 2026-10-22. Não houve observação comparativa do PhpStorm nesta entrega; a equivalência permanece **Em desenvolvimento**.

## Comportamento e aceitação

Português (Brasil) é o padrão; English está disponível em Aparência → Idioma da interface e na barra lateral da tela inicial. Selecionar salva a preferência; Aplicar idioma agora recarrega a interface. A mesma escolha vale na próxima abertura. A recarga é bloqueada se houver buffers alterados, com orientação para salvá-los. A sessão restaura o projeto; restauração de todas as abas ainda não faz parte deste fluxo.

Critérios: alternar PT/EN, persistir a escolha, rejeitar idioma desconhecido com fallback PT, preservar nomes de arquivos/projetos e conteúdo de código, e impedir perda de buffers não salvos. O idioma é independente do tema.

## Arquitetura e extensão

`src/i18n.ts` descobre `src/locales/*.json` no build. Cada catálogo contém `id` BCP 47, `name` no próprio idioma e `messages`, um mapa de texto fonte para tradução. O português usa os próprios textos fonte. Entradas ausentes retornam o português. A preferência fica na chave local `php-ide-language`; nenhum serviço remoto participa.

Para adicionar idioma, criar outro JSON seguindo `en.json`, traduzir os valores mantendo os marcadores numerados `{0}`, `{1}` e executar `npm run test:locales`, `npm run typecheck` e o build. O novo idioma aparece automaticamente no seletor após compilar. Os marcadores podem ser reordenados.

`t` traduz textos, `msg` interpola valores e `html` traduz somente textos/atributos estáticos pertencentes à interface antes de inserir valores dinâmicos. Não há tradutor global de DOM: código, caminhos, resultados SQL e saída de ferramentas permanecem intactos. Os títulos dos seletores nativos de projeto possuem variantes PT/EN.

## Evidências e limites

- Catálogos: 2 idiomas, 575 entradas em inglês, metadados e marcadores verificados por `scripts/check-locales.mjs`.
- `scripts/check-languages.mjs`: 7 verificações aprovadas em navegador com transporte simulado, incluindo troca real por recarga, persistência, fallback e preservação de código/nomes. Evidência em `.artifacts/languages-browser.json` e `.artifacts/language-settings-en.png`.
- `scripts/check-startup.mjs`: 8 grupos aprovados no pacote Tauri, incluindo seleção persistente e bloqueio de recarga com buffer alterado.
- Build/typecheck e 21 testes Rust aprovados.
- `scripts/check-native.mjs --packaged --no-db`: 19 grupos aprovados no aplicativo Tauri; não inclui testes com bancos reais nesta execução.

O catálogo cobre projetos, editor, Aparência, Git, bancos, Docker, terminal, testes e agente. Alguns diagnósticos do backend e mensagens nativas ainda permanecem no idioma original. A interface interna padrão do Monaco e as saídas externas não têm cobertura completa pelo catálogo. Datas seguem a configuração do ambiente. Não se afirma tradução integral ou compatibilidade validada com o PhpStorm.
