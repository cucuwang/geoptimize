# geoptimize

[English](../../README.md) | [繁體中文](README.zh-TW.md) | [简体中文](README.zh-CN.md) | [日本語](README.ja.md) | [한국어](README.ko.md) | [Español](README.es.md) | [Français](README.fr.md) | [Deutsch](README.de.md) | [Português do Brasil](README.pt-BR.md)

**Anciennement aeoptimize.** Depuis la version `0.8.0`, le même projet continue sous le nom `geoptimize`. Les utilisateurs existants peuvent consulter le [guide de migration](../migrating-from-aeoptimize.md).

`geoptimize` est un linter déterministe de préparation du contenu pour les sites statiques et la documentation technique. Il vérifie la structure du document, les signaux de source des affirmations chiffrées, les données structurées, les contrôles d'indexation, la qualité des metadata et les formulations répétitives. Il fonctionne en local, en CI ou en pre-commit.

## Installation et démarrage rapide

Node.js 22.12 ou une version ultérieure est requis.

```bash
npm install --save-dev geoptimize
```

```bash
npx geoptimize scan https://example.com
npx geoptimize scan ./dist --dir --json
npx geoptimize audit https://example.com --json
npx geoptimize audit-site https://example.com --max-pages 20 --json
```

`scan` produit un score versionné de préparation du contenu. Ce score sert à détecter les régressions au sein d'un même projet. Il ne représente pas une probabilité de classement, d'indexation, de rich result ou de citation par un système d'IA.

## Audits fondés sur des preuves

`audit` inspecte une URL publique ou un fichier HTML ou Markdown local. `audit-site` vérifie les liens de même origine, robots, sitemap, canonical, redirections et titres dupliqués dans une limite explicite de pages. `audit-build` contrôle le HTML généré avant le déploiement.

```bash
npx geoptimize audit-build ./dist \
  --base-url https://example.com/ \
  --expect-indexable \
  --fail-on-error \
  --json
```

Chaque contrôle inclut les preuves observées et un état `PASS`, `WARNING`, `FAIL` ou `N/A`. La portée reste limitée aux fichiers, URL et pages effectivement lus.

## SEO Experiment Ledger

Le registre d'expériences SEO fonctionne indépendamment du score de préparation. Il conserve les requêtes, les conditions de mesure, les modifications de page et les revues. Un seul experiment peut être suivi à la fois dans un repository.

```bash
geo seo init .
geo seo add . --keyword "energy management system integration" --page /services/ems/ --priority high
geo seo status .
```

Les données sont enregistrées dans `data/seo/queries.json`, `observations.json` et `experiments.json`. Déployez la page et relisez son contenu public avant de commencer la période de suivi. Consultez [SEO experiment ledger](../seo-experiment-ledger.md) pour le processus complet.

## CI et GitHub Action

La GitHub Action fournit des résultats consultatifs par défaut. Après validation d'une référence, l'équipe peut définir un score minimal pour bloquer les régressions.

```yaml
- uses: cucuwang/geoptimize@v0.10.0
  with:
    path: dist
```

JSON est l'interface d'automatisation stable. Les règles, les classes de preuves et les limites connues sont décrites dans la [méthodologie](../methodology.md).

## Agent Skills

```bash
claude plugin marketplace add cucuwang/geoptimize
npx skills add cucuwang/geoptimize
```

Le package fournit `/geo-scan`, `/geo-generate`, `/geo-transform` et `/seo-experiment-ledger`.

## Licence et documentation complète

Le projet est distribué sous licence MIT. Le [README anglais](../../README.md) contient toutes les commandes, les rapports, les plugins, les Action contracts, les limites méthodologiques et les informations de release integrity.
