# geoptimize

[English](../../README.md) | [繁體中文](README.zh-TW.md) | [简体中文](README.zh-CN.md) | [日本語](README.ja.md) | [한국어](README.ko.md) | [Español](README.es.md) | [Français](README.fr.md) | [Deutsch](README.de.md) | [Português do Brasil](README.pt-BR.md)

**Antes se llamaba aeoptimize.** Desde la versión `0.8.0`, el mismo proyecto continúa como `geoptimize`. Los usuarios existentes pueden consultar la [guía de migración](../migrating-from-aeoptimize.md).

`geoptimize` es un linter determinista de preparación de contenido para sitios estáticos y documentación técnica. Comprueba la estructura del documento, las señales de fuentes para afirmaciones cuantitativas, los datos estructurados, los controles de indexación, la calidad de los metadata y el texto repetitivo. Se ejecuta en local, CI o pre-commit.

## Instalación e inicio rápido

Requiere Node.js 22.12 o una versión posterior.

```bash
npm install --save-dev geoptimize
```

```bash
npx geoptimize scan https://example.com
npx geoptimize scan ./dist --dir --json
npx geoptimize audit https://example.com --json
npx geoptimize audit-site https://example.com --max-pages 20 --json
```

`scan` produce una puntuación versionada de preparación del contenido. Sirve para detectar regresiones dentro del mismo proyecto. No representa la probabilidad de posicionamiento, indexación, rich results ni citas de sistemas de IA.

## Auditorías con evidencia

`audit` inspecciona una URL pública o un archivo HTML o Markdown local. `audit-site` comprueba enlaces del mismo origen, robots, sitemap, canonical, redirecciones y títulos duplicados dentro de un límite explícito de páginas. `audit-build` revisa el HTML generado antes del despliegue.

```bash
npx geoptimize audit-build ./dist \
  --base-url https://example.com/ \
  --expect-indexable \
  --fail-on-error \
  --json
```

Cada comprobación incluye la evidencia observada y un estado `PASS`, `WARNING`, `FAIL` o `N/A`. El alcance queda limitado a los archivos, las URL y las páginas que se hayan leído.

## SEO Experiment Ledger

El registro de experimentos SEO funciona de forma independiente de la puntuación de preparación. Conserva las consultas, las condiciones de medición, los cambios de página y las revisiones. Solo permite un experimento en seguimiento a la vez por repository.

```bash
geo seo init .
geo seo add . --keyword "energy management system integration" --page /services/ems/ --priority high
geo seo status .
```

Los datos se guardan en `data/seo/queries.json`, `observations.json` y `experiments.json`. Despliega la página y comprueba el contenido público antes de iniciar el periodo de seguimiento. Consulta [SEO experiment ledger](../seo-experiment-ledger.md) para ver el flujo completo.

## CI y GitHub Action

La GitHub Action es informativa de forma predeterminada. Después de aceptar una línea base, el equipo puede configurar una puntuación mínima para bloquear regresiones.

```yaml
- uses: cucuwang/geoptimize@v0.10.0
  with:
    path: dist
```

JSON es la interfaz estable para automatización. Las reglas, las clases de evidencia y las limitaciones conocidas se describen en la [metodología](../methodology.md).

## Agent Skills

```bash
claude plugin marketplace add cucuwang/geoptimize
npx skills add cucuwang/geoptimize
```

El paquete incluye `/geo-scan`, `/geo-generate`, `/geo-transform` y `/seo-experiment-ledger`.

## Licencia y documentación completa

El proyecto usa la licencia MIT. El [README en inglés](../../README.md) contiene todos los comandos, informes, plugins, Action contracts, límites metodológicos y detalles de release integrity.
