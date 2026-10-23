# Fixture Symfony v1

Projeto sintético, sem código do Symfony: só `composer.json`/`composer.lock` fictícios, um controller com `#[Route]`, rotas YAML, `config/services.yaml`, templates Twig e `.env` com valores fictícios. `vendor/symfony/console/composer.json` existe apenas para testar a navegação pacote → vendor. Usado por `tests/symfony.test.ts` e `tests/composer.test.ts`.
