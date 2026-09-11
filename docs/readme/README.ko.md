# geoptimize

[English](../../README.md) | [繁體中文](README.zh-TW.md) | [简体中文](README.zh-CN.md) | [日本語](README.ja.md) | [한국어](README.ko.md) | [Español](README.es.md) | [Français](README.fr.md) | [Deutsch](README.de.md) | [Português do Brasil](README.pt-BR.md)

**이전 이름은 aeoptimize입니다.** 버전 `0.8.0`부터 `geoptimize`라는 이름으로 같은 프로젝트의 개발 이력을 이어갑니다. 기존 사용자는 [마이그레이션 안내](../migrating-from-aeoptimize.md)를 참고하세요.

`geoptimize`는 정적 웹사이트와 기술 문서를 위한 결정론적 콘텐츠 준비 상태 린터입니다. 문서 구조, 수치 주장에 대한 출처 신호, 구조화 데이터, 색인 제어, metadata 품질, 반복 표현을 로컬 환경과 CI, pre-commit 단계에서 검사합니다.

## 설치와 빠른 시작

Node.js 22.12 이상이 필요합니다.

```bash
npm install --save-dev geoptimize
```

```bash
npx geoptimize scan https://example.com
npx geoptimize scan ./dist --dir --json
npx geoptimize audit https://example.com --json
npx geoptimize audit-site https://example.com --max-pages 20 --json
```

`scan`은 버전이 지정된 콘텐츠 준비 상태 점수를 제공합니다. 이 점수는 같은 프로젝트의 회귀를 추적하는 용도이며 검색 순위, 색인 등록, rich result, AI 인용 가능성을 뜻하지 않습니다.

## 증거 기반 사이트 감사

`audit`은 공개 URL 하나 또는 로컬 HTML, Markdown 파일 하나를 검사합니다. `audit-site`는 명시된 페이지 한도 안에서 동일 출처 링크, robots, sitemap, canonical, 리디렉션, 중복 제목을 검사합니다. `audit-build`는 배포 전 빌드된 HTML을 검사합니다.

```bash
npx geoptimize audit-build ./dist \
  --base-url https://example.com/ \
  --expect-indexable \
  --fail-on-error \
  --json
```

각 결과에는 관찰된 증거와 `PASS`, `WARNING`, `FAIL`, `N/A` 상태가 포함됩니다. 감사 범위는 실제로 읽은 파일, URL, 페이지 수로 제한됩니다.

## SEO Experiment Ledger

SEO 실험 원장은 콘텐츠 준비 상태 점수와 독립적으로 동작합니다. 검색어, 측정 조건, 페이지 변경, 검토 결과를 저장하며 하나의 repository에서 동시에 모니터링하는 실험을 한 건으로 제한합니다.

```bash
geo seo init .
geo seo add . --keyword "energy management system integration" --page /services/ems/ --priority high
geo seo status .
```

원장 데이터는 `data/seo/queries.json`, `observations.json`, `experiments.json`에 저장됩니다. 모니터링 기간을 시작하기 전에 페이지를 배포하고 공개 결과를 다시 확인하세요. 전체 절차는 [SEO experiment ledger](../seo-experiment-ledger.md)를 참고하세요.

## CI와 GitHub Action

GitHub Action은 기본적으로 권고 결과만 제공합니다. 팀에서 기준값을 승인한 뒤 최소 점수로 회귀를 차단할 수 있습니다.

```yaml
- uses: cucuwang/geoptimize@v0.10.0
  with:
    path: dist
```

JSON은 안정적인 자동화 인터페이스입니다. 규칙, 증거 분류, 알려진 제한은 [방법론 문서](../methodology.md)에 정리되어 있습니다.

## Agent Skills

```bash
claude plugin marketplace add cucuwang/geoptimize
npx skills add cucuwang/geoptimize
```

패키지에는 `/geo-scan`, `/geo-generate`, `/geo-transform`, `/seo-experiment-ledger`가 포함됩니다.

## 라이선스와 전체 문서

MIT License로 배포됩니다. 모든 명령, 보고서, plugin, Action contract, 방법상 제한, release integrity 설명은 영어 [README](../../README.md)에 있습니다.
