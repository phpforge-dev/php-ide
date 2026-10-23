# PHP IDE — trabalho independente

- Priorizar experiência útil: fluxo completo, estado visível, erros recuperáveis e atalhos coerentes. Botões não comprovam funcionamento.
- Ler docs/research/implementation-slice-01.md e o catálogo antes de ampliar o escopo.
- Separar evidência documental, observação autorizada do PhpStorm, requisito próprio e hipótese. Não inferir arquitetura interna a partir do comportamento.
- Não extrair código, assets, componentes proprietários ou contornar proteções. Implementar a partir de especificações, testes e interfaces públicas/open source licenciadas.
- Manter pesquisa, implementação e validação comparativa explicitamente separadas. Teste da nossa IDE não promove compatibilidade automaticamente.
- Preservar alterações existentes. Não acessar bancos reais para testes: scripts criam containers próprios e descartáveis.
- Base obrigatória: Rust + Tauri 2; não reintroduzir Electron ou backend Node. Manter frontend sem Node e comandos IPC restritos. Não persistir senhas em arquivos nem enviar credenciais ao agente.
- Após mudanças: npm run typecheck, npm test (Rust) e testes pertinentes. npm run test:native compila e testa a janela Tauri real; usa fixtures e bancos descartáveis. Testes antigos Electron são históricos, não validam Rust. Chamadas reais de agente podem consumir inferência.
- Atualizar catálogo/matriz com limitações e evidências. Não promover famílias inteiras por um único exemplo.
