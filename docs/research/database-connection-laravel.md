# Conexão de banco e importação Laravel — 23/10/2026

## Evidência e requisito

Requisito do usuário: melhorar a aparência do diálogo de conexão, tomando PhpStorm como referência, sem exigir todas as opções; importar conexão do `.env` Laravel. O recurso do plugin Laravel foi relatado pelo usuário, sem observação comparativa nesta entrega.

Referências documentais: [Data Sources and Drivers](https://www.jetbrains.com/help/phpstorm/data-sources-and-drivers-dialog.html) e [Laravel Database](https://laravel.com/framework/docs/12.x/database). A organização em lista de fontes, campos e abas orientou uma implementação independente. Não foram extraídos componentes ou assets proprietários.

## Implementação própria

Diálogo com lista compacta, identificação do driver, campos alinhados e ações de testar/aplicar/conectar no rodapé. Importar do Laravel .env permite escolher um arquivo da raiz do projeto reconhecido pelo composer.json. A importação cria um rascunho para revisão; não salva, testa ou conecta automaticamente. Cancelar descarta o rascunho e a senha digitada/importada.

Suporta campos DB_* para MySQL/MariaDB, PostgreSQL, SQL Server e SQLite; DB_URL/DATABASE_URL para conexões de rede. Senha mascarada, ausente da URL exibida e da fonte persistida; permanece apenas na memória do fluxo existente. Leitura confinada ao projeto, até 64 KiB; não executa PHP nem consulta ambiente do processo.

Limites: configuração PHP personalizada/cache, interpolação de variáveis, parâmetros de URL como SSL, SQLite em memória e SQLite via URL exigem configuração manual. Hosts internos de Docker podem precisar de host/porta publicados. A importação não promete reproduzir a resolução completa da configuração Laravel.

## Validação própria

- Typecheck e locales passaram.
- Rust: 66 testes passaram, 5 ignorados; inclui 3 testes do importador (campos/URLs, rejeições, confinamento e ausência de escrita).
- Preview WebKit: importação de fixture, senha mascarada/ausente do texto e URL, erro preservando rascunho e cancelamento passaram. Captura: `.artifacts/database-dialog-laravel.png`.
- Tauri: `npm run test:native -- --no-db --database-only` passou nos dois checks de banco, incluindo importação/cancelamento via IPC real.
- Apenas arquivos sintéticos; nenhum banco real foi acessado. Teste de conexão real e equivalência visual/comportamental com PhpStorm não são evidências desta entrega.

Estado comparativo: Em desenvolvimento / não validada.
