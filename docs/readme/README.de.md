# geoptimize

[English](../../README.md) | [繁體中文](README.zh-TW.md) | [简体中文](README.zh-CN.md) | [日本語](README.ja.md) | [한국어](README.ko.md) | [Español](README.es.md) | [Français](README.fr.md) | [Deutsch](README.de.md) | [Português do Brasil](README.pt-BR.md)

**Früher aeoptimize.** Seit Version `0.8.0` wird dasselbe Projekt unter dem Namen `geoptimize` weitergeführt. Bestehende Benutzer finden die nötigen Schritte im [Migrationsleitfaden](../migrating-from-aeoptimize.md).

`geoptimize` ist ein deterministischer Content-Readiness-Linter für statische Websites und technische Dokumentation. Er prüft Dokumentstruktur, Quellenhinweise für quantitative Aussagen, strukturierte Daten, Indexierungssteuerung, Qualität der metadata und wiederholte Formulierungen. Er läuft lokal, in CI oder als pre-commit-Prüfung.

## Installation und Schnellstart

Erforderlich ist Node.js 22.12 oder neuer.

```bash
npm install --save-dev geoptimize
```

```bash
npx geoptimize scan https://example.com
npx geoptimize scan ./dist --dir --json
npx geoptimize audit https://example.com --json
npx geoptimize audit-site https://example.com --max-pages 20 --json
```

`scan` erzeugt einen versionierten Content-Readiness-Wert. Er eignet sich zum Erkennen von Regressionen innerhalb desselben Projekts. Er ist keine Wahrscheinlichkeit für Ranking, Indexierung, rich results oder Zitate durch KI-Systeme.

## Nachweisgestützte Website-Audits

`audit` prüft eine öffentliche URL oder eine lokale HTML- oder Markdown-Datei. `audit-site` prüft Links desselben Ursprungs, robots, sitemap, canonical, Weiterleitungen und doppelte Titel innerhalb eines ausdrücklich gesetzten Seitenlimits. `audit-build` kontrolliert das erzeugte HTML vor dem Deployment.

```bash
npx geoptimize audit-build ./dist \
  --base-url https://example.com/ \
  --expect-indexable \
  --fail-on-error \
  --json
```

Jede Prüfung enthält die beobachteten Nachweise und einen Status `PASS`, `WARNING`, `FAIL` oder `N/A`. Der Umfang bleibt auf die tatsächlich gelesenen Dateien, URLs und Seiten begrenzt.

## SEO Experiment Ledger

Das SEO-Experimentprotokoll arbeitet unabhängig vom Content-Readiness-Wert. Es speichert Suchanfragen, Messbedingungen, Seitenänderungen und Reviews. Pro repository kann jeweils nur ein Experiment überwacht werden.

```bash
geo seo init .
geo seo add . --keyword "energy management system integration" --page /services/ems/ --priority high
geo seo status .
```

Die Daten liegen in `data/seo/queries.json`, `observations.json` und `experiments.json`. Stellen Sie die Seite bereit und lesen Sie den öffentlichen Inhalt zurück, bevor Sie den Beobachtungszeitraum starten. Der vollständige Ablauf steht unter [SEO experiment ledger](../seo-experiment-ledger.md).

## CI und GitHub Action

Die GitHub Action liefert standardmäßig Hinweise. Nachdem ein Team den Ausgangswert akzeptiert hat, kann es einen Mindestwert zum Blockieren von Regressionen setzen.

```yaml
- uses: cucuwang/geoptimize@v0.10.0
  with:
    path: dist
```

JSON ist die stabile Automatisierungsschnittstelle. Regeln, Nachweisklassen und bekannte Grenzen sind in der [Methodik](../methodology.md) dokumentiert.

## Agent Skills

```bash
claude plugin marketplace add cucuwang/geoptimize
npx skills add cucuwang/geoptimize
```

Das Paket enthält `/geo-scan`, `/geo-generate`, `/geo-transform` und `/seo-experiment-ledger`.

## Lizenz und vollständige Dokumentation

Das Projekt steht unter der MIT License. Die englische [README](../../README.md) enthält alle Befehle, Berichte, Plugins, Action contracts, methodischen Grenzen und Angaben zur release integrity.
