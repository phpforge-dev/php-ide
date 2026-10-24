> Para guias atuais de desenvolvimento e plugins, veja o [índice geral](../README.md). Os documentos abaixo preservam pesquisa, decisões e evidências; recortes Electron são históricos.

> Base ativa: [Rust + Tauri 2](tauri-migration.md). Recortes anteriores descrevem a implementação histórica e seus limites.

> Continuação executável em `~/Projects/php-ide`: [recorte 01](implementation-slice-01.md). Abaixo permanece a pesquisa inicial, com seus limites de observação.

# Pesquisa da IDE PHP independente

Primeira entrega em 21/10/2026: metodologia e escopo reproduzíveis antes da implementação. Os ensaios semânticos ainda precisam de conclusão; a matriz não declara compatibilidade.

1. [Metodologia Craft e evidências](craft-methodology.md).
2. [Avaliação do REA](rea-assessment.md).
3. [Método, estados e milestones](phpstorm-investigation-methodology.md).
4. [Catálogo inicial](phpstorm-feature-catalog.md).
5. [Arquitetura e dependências propostas](phpstorm-architecture-proposal.md).
6. [Seis roteiros e plano de compatibilidade](phpstorm-compatibility-test-plan.md).
7. [Fixture PHP sintética](fixtures/php-intelligence/README.md).
8. [Observações e limitações reais](phpstorm-observations.md).
9. [Matriz de compatibilidade](../compatibility/phpstorm.md).

Próxima entrega: concluir o oracle dos seis casos na referência licenciada antes de escolher/implementar o motor. Não há alteração de código do produto Meu Hinário nesta pesquisa.

Verificações desta entrega: links locais conferidos, 36 IDs únicos correspondentes entre catálogo/matriz, JSON da fixture válido, hashes conferidos e seis arquivos PHP sem erros de sintaxe em PHP 8.3 via container local isolado. Esses checks verificam os artefatos da pesquisa; não são testes de compatibilidade da futura IDE.

Continuação Git: [observações e contrato](phpstorm-git.md), [recorte 03 implementado](implementation-slice-03.md).

[Git ampliado: recorte 04](implementation-slice-04.md).

[Bancos, navegação e aparência: recorte 05](implementation-slice-05.md).

[Revisão da organização visual: recorte 06](implementation-slice-06.md).

[Autocomplete, índice de classes e Ctrl+clique em strings: recorte 09](implementation-slice-09.md).

[Plugins Laravel (rotas, views, config) e .env: recorte 10](implementation-slice-10.md).

[Blade: componentes, variáveis da view e traduções: recorte 11](implementation-slice-11.md).

[Resolução de conflitos em três painéis: recorte 12](implementation-slice-12.md).

[Console SQL e SQL em strings PHP: recorte 13](implementation-slice-13.md).

[Plugin Markdown — prévia, links e âncoras: recorte 14](implementation-slice-14.md).
[Testes Pest e PHPUnit — descobrir, executar e painel de resultados: recorte 15](implementation-slice-15.md).
[Menu de contexto da árvore e histórico local: recorte 16](implementation-slice-16.md).
[Agentes de IA via ACP com alterações pendentes: recorte 17](implementation-slice-17.md).
[Fontes de dados no estilo Data Sources and Drivers e novos drivers: recorte 18](implementation-slice-18.md).
[Rename Symbol, Autoimport, Inspeções e Extract/Inline: recorte 19](implementation-slice-19.md).
[Tipos, PHPDoc, generics, traits, herança, vendor e stubs nativos: recorte 20](implementation-slice-20.md).
[Depurador Xdebug (DBGp): recorte 21](implementation-slice-21.md).
[Composer e Symfony: recorte 22](implementation-slice-22.md).
[Keymap central e tela de atalhos: recorte 23](implementation-slice-23.md).
[Plugins de terceiros com manifesto e permissões: recorte 24](implementation-slice-24.md).
[Laravel: Eloquent e inspeções: recorte 25](implementation-slice-25.md).
[Driver Oracle e edição/paginação Redis: recorte 26](implementation-slice-26.md).
[Cobertura Rust/Tauri de Git avançado, remotos e versões de banco: recorte 27](implementation-slice-27.md).
[Fundação visual Islands Dark/Light: recorte 28](implementation-slice-28.md).
[Comparação C01–C06 na janela Tauri real: recorte 29](implementation-slice-29.md) — casos com referência × IDE listados como “compatível neste perfil” só neste recorte.
[Regressão do resize de Services no smoke nativo: recorte 30](implementation-slice-30.md).
[Conferência da fundação Islands vs 03/05/40: recorte 31a](implementation-slice-31-foundation-check.md).
[Popups Islands: recorte 31](implementation-slice-31.md).
[Tool windows Islands: recorte 32](implementation-slice-32.md).
[Diálogos/config + tema claro Islands: recorte 33](implementation-slice-33.md).
[Editor / Markdown Islands: recorte 34](implementation-slice-34.md).
[Search Everywhere fechado cobria o editor (Cmd+clique): recorte 35](implementation-slice-35.md).
[Referência visual PhpStorm 2026.1 (23/10/2026)](phpstorm-reference-2026-10-23.md).
[Passagem de trabalho de 23/10/2026: estado e próximos passos](handoff-2026-10-23.md).
[Connection-aware SQL intelligence — SPEC-14: implementation, native acceptance and limits](sql-intelligence.md).

- [Markdown como plugin independente](markdown-plugin.md): extração e validação de implementação, sem promoção comparativa.
