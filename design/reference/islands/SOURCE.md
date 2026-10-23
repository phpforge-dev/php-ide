# Referência de tokens do tema Islands (não distribuída)

Origem: arquivos públicos de `JetBrains/intellij-community`, commit `cc8a0a837382f0d9ea7fca7602533a2f0e6cf7a9`:
`platform/platform-resources/src/themes/islands/{ManyIslandsDark,ManyIslandsLight}.theme.json`, `IslandSchemeDark.xml`,
`.../themes/expUI/expUI_{dark,light,light_with_light_header}.theme.json`, `expUI_{dark,light}Scheme.xml` e `.../themes/Light.xml`. Sem modificação; hashes em `SHA256SUMS`.

Licença: o `LICENSE.txt` da raiz do repositório nesse commit são os "JetBrains Open-Source Build Terms" (guardados aqui como `REPO-LICENSE-build-terms.txt`), que tratam dos builds binários e dizem que o código-fonte é Apache 2.0. Estes arquivos não têm cabeçalho Apache próprio. Por precaução, seguindo a regra já usada para ícones (só importar com aviso Apache explícito):

- estes arquivos **não** entram no bundle, em `public/` nem em `src/`; ficam só como referência de projeto;
- a IDE usa uma paleta própria (`src/themes.css`) escrita à mão, em que valores de cor (dados factuais, os mesmos que um screenshot revelaria) seguem esta referência para fidelidade visual;
- nada foi extraído da instalação licenciada do PhpStorm (JARs, recursos, caches); cores de plugins proprietários (PHP) vêm de observação por screenshot documentada.
