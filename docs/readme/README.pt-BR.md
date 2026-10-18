# geoptimize

[English](../../README.md) | [繁體中文](README.zh-TW.md) | [简体中文](README.zh-CN.md) | [日本語](README.ja.md) | [한국어](README.ko.md) | [Español](README.es.md) | [Français](README.fr.md) | [Deutsch](README.de.md) | [Português do Brasil](README.pt-BR.md)

**Anteriormente chamado aeoptimize.** A partir da versão `0.8.0`, o mesmo projeto continua com o nome `geoptimize`. Usuários existentes podem consultar o [guia de migração](../migrating-from-aeoptimize.md).

`geoptimize` é um linter de qualidade de conteúdo executado na CI ou em pre-commit para detectar regressões na documentação e em sites estáticos antes da publicação. Suas regras determinísticas verificam a estrutura do documento, sinais de fontes para afirmações quantitativas, qualidade dos metadados, estrutura JSON-LD, controles de indexação como noindex e canonical e texto repetitivo. Equipes de documentação e desenvolvedores frontend podem revisar problemas nos PRs, auditar o HTML gerado e definir um limite de bloqueio após validar a referência do projeto; GEO e busca com IA são usos secundários.

## Instalação e início rápido

Requer Node.js 22.12 ou uma versão mais recente.

```bash
npm install --save-dev geoptimize
```

```bash
npx geoptimize scan https://example.com
npx geoptimize scan ./dist --dir --json
npx geoptimize audit https://example.com --json
npx geoptimize audit-site https://example.com --max-pages 20 --json
```

`scan` gera uma pontuação versionada de preparação do conteúdo. Ela serve para detectar regressões no mesmo projeto. Não representa a probabilidade de ranking, indexação, rich results ou citações por sistemas de IA.

## Auditorias baseadas em evidências

`audit` inspeciona uma URL pública ou um arquivo HTML ou Markdown local. `audit-site` verifica links da mesma origem, robots, sitemap, canonical, redirecionamentos e títulos duplicados dentro de um limite explícito de páginas. `audit-build` verifica o HTML gerado antes do deploy.

```bash
npx geoptimize audit-build ./dist \
  --base-url https://example.com/ \
  --expect-indexable \
  --fail-on-error \
  --json
```

Cada verificação inclui a evidência observada e um estado `PASS`, `WARNING`, `FAIL` ou `N/A`. O escopo permanece limitado aos arquivos, URLs e páginas realmente lidos.

## SEO Experiment Ledger

O registro de experimentos de SEO funciona de forma independente da pontuação de preparação. Ele preserva consultas, condições de medição, mudanças de página e revisões. Apenas um experimento pode ficar em monitoramento por vez em cada repository.

```bash
geo seo init .
geo seo add . --keyword "energy management system integration" --page /services/ems/ --priority high
geo seo status .
```

Os dados ficam em `data/seo/queries.json`, `observations.json` e `experiments.json`. Faça o deploy da página e releia o conteúdo público antes de iniciar o período de monitoramento. Consulte [SEO experiment ledger](../seo-experiment-ledger.md) para ver o fluxo completo.

## CI e GitHub Action

A GitHub Action fornece resultados consultivos por padrão. Depois que a equipe aceitar uma linha de base, ela pode definir uma pontuação mínima para bloquear regressões.

```yaml
- uses: cucuwang/geoptimize@v0.12.0
  with:
    path: dist
```

JSON é a interface estável de automação. As regras, classes de evidência e limitações conhecidas estão descritas na [metodologia](../methodology.md).

## Agent Skills

Claude Code

```bash
claude plugin marketplace add cucuwang/geoptimize
claude plugin install geoptimize@geoptimize
```

skills.sh

```bash
npx skills add cucuwang/geoptimize
```

O pacote inclui `/geo-scan`, `/geo-generate`, `/geo-transform` e `/seo-experiment-ledger`.

## Licença e documentação completa

O projeto usa a MIT License. O [README em inglês](../../README.md) contém todos os comandos, relatórios, plugins, Action contracts, limites metodológicos e detalhes de release integrity.
