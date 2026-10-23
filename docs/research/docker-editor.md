# Plugin de linguagem Docker — 23/10/2026

## Requisito e referências

Requisito próprio do usuário: entender Dockerfile e arquivos Compose, incluindo nomes alternativos como `composer.yml`.

Referências documentais públicas: [Dockerfile](https://docs.docker.com/reference/dockerfile/), [Compose](https://docs.docker.com/reference/compose-file/) e [serviços](https://docs.docker.com/reference/compose-file/services/). Implementação independente; nenhuma observação comparativa local do PhpStorm nesta entrega.

## Uso

O plugin Docker é incluído na IDE e aparece entre os plugins ativos quando encontra documentos aplicáveis no projeto. Abra um arquivo: realce, completion (Ctrl+Espaço), documentação por hover e diagnósticos funcionam sem daemon Docker. F12/⌘ ou Ctrl+clique navega nas referências suportadas.

Reconhece Dockerfile, Dockerfile.dev, Dockerfile-prod e app.dockerfile; Compose/compose, docker-compose e composer com `.yml`/`.yaml` e variantes como `docker-compose.override.yml`. Arquivos com outro nome são detectados por `services` no nível principal e propriedades de serviço características (por exemplo image/build/ports). A assinatura evita tomar o `services.yaml` usual do Symfony por Compose. Para detecção por conteúdo, usam-se até 1 MiB e YAML de bloco com propriedades de serviço indentadas por pelo menos quatro espaços; nomes convencionais não exigem essa assinatura.

## Implementação

- Plugin interno DockerPlugin no host existente, sem backend Node ou novo comando IPC.
- Reutiliza linguagens Dockerfile/YAML do Monaco; melhora contraste das chaves YAML nos temas existentes.
- Dockerfile: completion das instruções, hover, completion/navegação para estágios anteriores em FROM e COPY --from; diagnósticos de instrução desconhecida, argumentos ausentes e instrução antes de FROM (ARG permitido). Continuações e corpos heredoc não são tratados como instruções independentes.
- Compose: completion de chaves no nível principal, serviços, build e healthcheck; completion/navegação de depends_on no documento atual; completion de nomes de variáveis do .env dentro de `${...}`, sem expor valores nas sugestões.
- Parser YAML 2.9.1 (ISC), compatível com browser, para sintaxe, chaves duplicadas, mapas de serviços e tipos de propriedades selecionadas. Avisos não incluem conteúdo dos valores. Sem execução de PHP, Docker ou comandos do documento.
- Buffer não salvo é analisado; corrigir o texto remove o marcador. Override parcial não exige image/build nem serviços locais para dependências externas.
- activationChanged permite reavaliar detecção quando documentos Docker/YAML aparecem, mudam ou são removidos.

## Limites

Não é implementação integral do schema Compose ou do frontend Dockerfile/BuildKit. Não resolve merges entre arquivos, include/extends, recursos remotos, shell embutido, imagens/tags do registry, contexto de build ou expressões de ambiente em tempo de execução. Âncoras YAML são aceitas, mas completion/navegação não expandem todo o conteúdo herdado. Completion de propriedades é orientada a YAML de bloco e não cobre todos os níveis/opções. Análise limitada a 1 MiB; a descoberta por conteúdo examina até 100 candidatos YAML quando não há nome reconhecido. O painel Services mantém sua seleção e execução de Compose anteriores; os nomes alternativos desta entrega são associações do editor, não ampliação automática das ações CLI.

## Validação própria

- `node --import tsx --test tests/docker-language.test.ts tests/dotenv-editor.test.ts`: 13 testes passaram (10 Docker e 3 DotEnv de regressão).
- `npm run typecheck`: passou. `npm test`: 66 passaram e 5 ignorados.
- `npm run test:native -- --no-db --docker-language-only`: passou em janela Tauri real com fixture sintética. Verifica ativação, realce de Dockerfile.dev/Compose, completion em widgets, F12 entre estágios/serviços, diagnóstico e remoção após correção, além de nome personalizado.
- Nenhum container, banco, registry ou projeto real foi necessário.

TOOL-DOCKER-LANGUAGE-001 permanece Em desenvolvimento / não validada comparativamente. Testes próprios não comprovam equivalência integral com PhpStorm.

Entrega 0.2.3: aplicativo e DMG gerados; `npm run test:packaged -- --no-db --docker-language-only` passou no release. DMG verificado com hdiutil e SHA-256 gerado.
