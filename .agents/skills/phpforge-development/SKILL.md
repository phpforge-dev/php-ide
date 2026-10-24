---
name: phpforge-development
description: Implementar, revisar e refatorar a PHP IDE (PHPForge) e seus repositórios phpforge-dev/plugin-* com Rust, Tauri 2, TypeScript e Monaco, preservando contratos de plugins, UX, design system e validação. Usar para mudanças nesse produto; não aplicar a projetos PHP ou Tauri sem relação com ele.
---

# PHPForge development

Use as regras do checkout atual como fonte de verdade. Esta skill registra decisões do produto, não autoriza publicação, mudanças em contas externas ou migrações fora da tarefa.

## Contexto e fontes

Localize a raiz pelo Git e pelo `package.json`; não presuma um caminho absoluto. Leia o `AGENTS.md` aplicável e os documentos relevantes antes de ampliar o escopo. No repositório da IDE, consulte `docs/development/project-structure.md`, `docs/research/implementation-slice-01.md` (histórico) e o catálogo `docs/research/phpstorm-feature-catalog.md`. Documentos históricos descrevem a época; confirme decisões atuais nos contratos, imports e manifestos. Não reproduza a antiga arquitetura Electron.

Para mudanças em pacotes, leia [plugins](references/plugins.md). Para fluxos e aparência, leia [UX e design system](references/ux.md). Use essas referências conforme a tarefa, sem carregar documentação de áreas alheias.

## Stack e limites

- Desktop: Rust + Tauri 2. Frontend: TypeScript, DOM/CSS e Monaco no WebView. Siga o estilo do módulo; não introduza um framework ou uma camada genérica sem uma necessidade concreta.
- Node é ferramenta de build/teste. `src/` e módulos ativos de `shared/` não podem depender de APIs Node, Electron ou backend Node.
- Operações privilegiadas passam pela API restrita `window.ide` → `src/native.ts` → despacho Rust em `src-tauri/src/main.rs`. Contratos compartilhados pertencem a `shared/`. Revalide autorização no host; ocultar um botão não protege uma operação.
- Núcleo: shell, documentos/buffers, arquivos, layout, tokens, atalhos e infraestrutura de plugins. Comportamento de uma funcionalidade opcional pertence ao seu pacote. Não recoloque implementações extraídas no núcleo para resolver uma integração.
- Código independente do sistema pode ficar em `shared/` quando for contrato ou infraestrutura comum. Parsers e regras específicos de uma funcionalidade ficam no pacote proprietário.
- Credenciais ficam no mecanismo seguro do host; não persistir senhas em arquivos nem enviá-las ao agente. Confinar caminhos e subprocessos nos limites existentes.
- Preserve alterações preexistentes. Não trate caches, artefatos e checkouts vizinhos como código de produção ou como autorização para apagá-los.

## Implementação e verificação

Resolva o fluxo inteiro com estado visível, resultado útil e recuperação de erro. Amplie um contrato existente apenas quando a tarefa exigir; mantenha callbacks, DTOs e nomes coerentes com o módulo.

Após mudanças de código da IDE, execute `npm run typecheck`, `npm test` (Rust) e os testes pertinentes. `npm run check` agrega typecheck, arquitetura, unitários, Rust, Clippy e locales; prefira esse comando para uma mudança que atravesse camadas. Leia os scripts atuais antes de escolher comandos. Uma skill apenas documental não exige executar a suíte da aplicação.

Para UI, valide o fluxo e foco com o teste pertinente e inspecione a apresentação quando houver mudança visual. Para comportamento nativo, `npm run test:native` compila e exercita a janela Tauri real; testes históricos Electron não validam Rust. Se o Mac estiver bloqueado, registre a validação da janela como pendente, sem tentar autenticar ou considerar headless equivalente.

Use bancos descartáveis e projetos sintéticos. Não use bancos reais, credenciais pessoais ou inferência real de agentes nos testes. Não adicione testes que só repitam a implementação; cubra falhas, estado e limites relevantes.

Registre comandos/resultados e limitações nos documentos de evidência pertinentes. Separe teste unitário, UI com backend sintético, janela nativa e distribuição assinada. Não promova compatibilidade com PhpStorm por um único exemplo. Diferencie requisito próprio, hipótese, documentação pública e observação autorizada; não inferir arquitetura proprietária nem copiar código/assets proprietários.
