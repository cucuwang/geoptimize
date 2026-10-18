export type RuleFixtureKind = 'positive' | 'negative' | 'boundary';

export interface FixtureDocument {
  url: string;
  title: string;
  html: string;
  markdown: string;
  headings: Array<{ level: number; text: string }>;
  paragraphs: string[];
  jsonLd: Array<{ '@type'?: string; '@context'?: string; [key: string]: unknown }>;
  metaTags: Record<string, string>;
  links: Array<{ href: string; text: string; rel?: string }>;
  rawText: string;
}

export interface RuleFixtureCase {
  purpose: string;
  sourceHtml?: string;
  document: Partial<FixtureDocument>;
  expected: {
    score: number;
    issues: number;
    suggestions: number;
  };
}

export interface RuleFixtureSet {
  additional?: Array<RuleFixtureCase & { kind: RuleFixtureKind }>;
  positive: RuleFixtureCase;
  negative: RuleFixtureCase;
  boundary: RuleFixtureCase;
}

const words = (count: number, prefix = 'word') =>
  Array.from({ length: count }, (_, index) => `${prefix}${index}`).join(' ');

const repeatedWords = (count: number, word = 'word') =>
  Array.from({ length: count }, () => word).join(' ');

const stuffedText = (
  'Buy cheap widgets now. Cheap widgets are the best widgets. ' +
  'Our widgets are cheap widgets for sale. Get cheap widgets today. ' +
  'Cheap widgets online cheap widgets store cheap widgets deals. ' +
  'Best cheap widgets cheap widgets review cheap widgets comparison. ' +
  'Order cheap widgets cheap widgets shipping cheap widgets discount. '
).repeat(3);

export const ruleFixtureCorpusVersion = '0.6.0';

export const ruleFixtureCorpus: Record<string, RuleFixtureSet> = {
  'heading-hierarchy': {
    positive: {
      purpose: 'A descriptive H1 followed by nested sections receives the full structure score.',
      document: {
        headings: [
          { level: 1, text: 'Release guide' },
          { level: 2, text: 'Verification' },
          { level: 3, text: 'CLI checks' },
        ],
        rawText: 'A short release guide with a clear outline.',
      },
      expected: { score: 10, issues: 0, suggestions: 0 },
    },
    negative: {
      purpose: 'A document with no headings triggers the deterministic missing-outline finding.',
      document: { headings: [], rawText: 'Unstructured content.' },
      expected: { score: 0, issues: 1, suggestions: 0 },
    },
    boundary: {
      purpose: 'Multiple H1 elements are not treated as an automatic error when the outline does not skip levels.',
      document: {
        headings: [
          { level: 1, text: 'Primary title' },
          { level: 1, text: 'Secondary region title' },
          { level: 2, text: 'Details' },
        ],
        rawText: 'Readable content.',
      },
      expected: { score: 10, issues: 0, suggestions: 0 },
    },
  },
  'paragraph-length': {
    positive: {
      purpose: 'Short focused paragraphs remain below the configured readability heuristic.',
      document: { paragraphs: ['A concise paragraph.', 'Another concise paragraph.'] },
      expected: { score: 8, issues: 0, suggestions: 0 },
    },
    negative: {
      purpose: 'A majority of paragraphs above 150 words triggers the configured long-paragraph finding.',
      document: { paragraphs: [repeatedWords(151), repeatedWords(151), 'A short paragraph.'] },
      expected: { score: 3, issues: 1, suggestions: 1 },
    },
    boundary: {
      purpose: 'Exactly 150 words is the non-penalized threshold boundary.',
      document: { paragraphs: [repeatedWords(150)] },
      expected: { score: 8, issues: 0, suggestions: 0 },
    },
  },
  'list-usage': {
    positive: {
      purpose: 'Long content containing a genuine list receives the full scannability score.',
      document: { html: `<ul><li>First</li><li>Second</li></ul>${words(301)}`, rawText: words(301) },
      expected: { score: 7, issues: 0, suggestions: 0 },
    },
    negative: {
      purpose: 'Long content with no list receives a low-impact review suggestion.',
      document: { html: `<p>${words(301)}</p>`, rawText: words(301) },
      expected: { score: 4, issues: 0, suggestions: 1 },
    },
    boundary: {
      purpose: 'Content at exactly 300 words is not forced into a list merely to satisfy the heuristic.',
      document: { html: `<p>${words(300)}</p>`, rawText: words(300) },
      expected: { score: 7, issues: 0, suggestions: 0 },
    },
  },
  'self-contained-statements': {
    positive: {
      purpose: 'Paragraphs that name their subject remain independently understandable.',
      document: {
        paragraphs: [
          'Geoptimize reports deterministic content-readiness findings.',
          'The GitHub Action is advisory by default.',
          'Project owners choose whether a threshold should block CI.',
        ],
      },
      expected: { score: 8, issues: 0, suggestions: 0 },
    },
    negative: {
      purpose: 'A majority of dangling pronoun or transition openings triggers a review finding.',
      document: {
        paragraphs: [
          'This is important for the release.',
          'They require additional context.',
          'However, it varies by project.',
          'The release is versioned for users.',
          'The report is publicly available.',
        ],
      },
      expected: { score: 3, issues: 1, suggestions: 1 },
    },
    boundary: {
      purpose: 'Exactly twenty percent dangling openings is the non-penalized ratio boundary.',
      document: {
        paragraphs: [
          'This needs context for the reader.',
          'The package is explicitly versioned.',
          'The Action is advisory by default.',
          'The report remains stable for automation.',
          'The fixture is publicly reviewable.',
        ],
      },
      expected: { score: 8, issues: 0, suggestions: 1 },
    },
  },
  'data-stats-presence': {
    positive: {
      purpose: 'A quantitative claim with explicit source language is not flagged as unsourced.',
      document: { rawText: 'According to the linked release report, 20 users completed the test.' },
      expected: { score: 7, issues: 0, suggestions: 0 },
    },
    negative: {
      purpose: 'A quantitative claim without a detectable source receives an evidence warning.',
      document: { rawText: 'The package serves 20 users.' },
      expected: { score: 3, issues: 1, suggestions: 1 },
    },
    boundary: {
      purpose: 'Content without quantitative claims is not penalized or encouraged to invent numbers.',
      document: { rawText: 'The package exposes a deterministic local lint.' },
      expected: { score: 7, issues: 0, suggestions: 0 },
    },
  },
  'clear-definitions': {
    additional: [
      {
        kind: 'positive',
        purpose: 'Traditional Chinese technical definitions use copulas, explicit terms and introductory definitions.',
        document: { rawText: 'API 是系統提供給其他程式使用的介面。所謂 RAG，結合檢索資料與生成回答的技術。Modbus 指設備之間交換資料的通訊協定。' },
        expected: { score: 5, issues: 0, suggestions: 0 },
      },
      {
        kind: 'positive',
        purpose: 'Simplified Chinese definitions retain the same clarity thresholds as Traditional Chinese.',
        document: { rawText: 'API 是系统提供给其他程序使用的接口。所谓 RAG，结合检索资料与生成回答的技术。Modbus 指设备之间交换数据的通信协议。' },
        expected: { score: 5, issues: 0, suggestions: 0 },
      },
      {
        kind: 'negative',
        purpose: 'Ordinary Chinese statements and transitions do not supply term definitions.',
        document: { rawText: '這是我們的做法。目前是第一階段。但是需要確認。於是開始工作。還是先回報。就是這個方式。Modbus 以功能碼與位址指定讀寫內容。建立工單或送出指令時，重試方式尤其重要。这是我们的做法。于是开始工作。还是先汇报。' },
        expected: { score: 1, issues: 0, suggestions: 1 },
      },
      {
        kind: 'boundary',
        purpose: 'Pronouns, questions, and overlong sentences stay outside the bounded Chinese definition heuristic.',
        document: { rawText: `它是系統提供給其他程式使用的介面。我們是系統維護人員。此介面是系統提供的功能。API 是否需要驗證。API 是${'設備資料傳輸流程'.repeat(24)}。` },
        expected: { score: 1, issues: 0, suggestions: 1 },
      },
    ],
    positive: {
      purpose: 'Several explicit definitions receive the full clarity score.',
      document: { rawText: 'A lint is a repeatable check. A fixture means a controlled input. A release refers to a published version.' },
      expected: { score: 5, issues: 0, suggestions: 0 },
    },
    negative: {
      purpose: 'Content without definitions receives a clarity suggestion.',
      document: { rawText: 'Install the package and run the command.' },
      expected: { score: 1, issues: 0, suggestions: 1 },
    },
    boundary: {
      purpose: 'A semantic definition list is accepted without requiring a prose pattern.',
      document: { html: '<dl><dt>Fixture</dt><dd>A controlled input.</dd></dl>', rawText: 'Fixture: a controlled input.' },
      expected: { score: 5, issues: 0, suggestions: 0 },
    },
  },
  attribution: {
    additional: [
      {
        kind: 'positive',
        purpose: 'Author and publication date inside an Article graph node supply attribution signals.',
        document: {},
        sourceHtml: '<script type="application/ld+json">{"@context": "https://schema.org", "@graph": [{"@type": "Article", "author": {"name": "Fixture Author"}, "datePublished": "2026-10-18"}]}</script>',
        expected: { score: 4, issues: 0, suggestions: 0 },
      },
      {
        kind: 'negative',
        purpose: 'A graph with no author or publication date retains the attribution suggestion.',
        document: {},
        sourceHtml: '<script type="application/ld+json">{"@context": "https://schema.org", "@graph": [{"@type": "Article"}]}</script>',
        expected: { score: 0, issues: 0, suggestions: 1 },
      },
      {
        kind: 'boundary',
        purpose: 'An author name alone inside a Person graph node does not imply Article authorship.',
        document: {},
        sourceHtml: '<script type="application/ld+json">{"@context": "https://schema.org", "@graph": [{"@type": "Person", "name": "Fixture Author"}]}</script>',
        expected: { score: 0, issues: 0, suggestions: 1 },
      },
    ],
    positive: {
      purpose: 'Accurate author, date, and source language receive the full attribution score.',
      document: {
        metaTags: { author: 'Fixture Author', date: '2026-08-22' },
        rawText: 'According to the release evidence, the focused checks passed.',
      },
      expected: { score: 5, issues: 0, suggestions: 0 },
    },
    negative: {
      purpose: 'Authored or time-sensitive content with no attribution signals receives a suggestion.',
      document: { metaTags: {}, rawText: 'A time-sensitive release note.' },
      expected: { score: 0, issues: 0, suggestions: 1 },
    },
    boundary: {
      purpose: 'Author plus source language reaches the no-suggestion threshold without inventing a date.',
      document: { metaTags: { author: 'Fixture Author' }, rawText: 'Source: local release verification.' },
      expected: { score: 3, issues: 0, suggestions: 0 },
    },
  },
  'json-ld-presence': {
    positive: {
      purpose: 'Present JSON-LD is detected without awarding extra points for schema count.',
      document: { jsonLd: [{ '@context': 'https://schema.org', '@type': 'SoftwareApplication' }] },
      expected: { score: 8, issues: 0, suggestions: 0 },
    },
    negative: {
      purpose: 'Missing JSON-LD produces an informational finding but no score penalty because schema is optional.',
      document: { jsonLd: [] },
      expected: { score: 8, issues: 1, suggestions: 0 },
    },
    boundary: {
      purpose: 'Presence and completeness are separate rules, preventing a duplicate penalty in the presence rule.',
      document: { jsonLd: [{}] },
      expected: { score: 8, issues: 0, suggestions: 0 },
    },
  },
  'json-ld-completeness': {
    additional: [
      {
        kind: 'positive',
        purpose: 'Graph nodes inherit the envelope context and expose complete Article metadata.',
        document: {},
        sourceHtml: '<script type="application/ld+json">{"@context": "https://schema.org", "@graph": [{"@type": "Article", "author": {"name": "Fixture Author"}, "datePublished": "2026-10-18"}, {"@type": "WebPage"}]}</script>',
        expected: { score: 12, issues: 0, suggestions: 0 },
      },
      {
        kind: 'negative',
        purpose: 'An untyped graph child is flagged despite inheriting its envelope context.',
        document: {},
        sourceHtml: '<script type="application/ld+json">{"@context": "https://schema.org", "@graph": [{"name": "Untyped entity"}]}</script>',
        expected: { score: 6, issues: 1, suggestions: 0 },
      },
      {
        kind: 'boundary',
        purpose: 'A typed Article graph node still receives author and date review hints when absent.',
        document: {},
        sourceHtml: '<script type="application/ld+json">{"@context": "https://schema.org", "@graph": [{"@type": "Article"}]}</script>',
        expected: { score: 12, issues: 0, suggestions: 2 },
      },
    ],
    positive: {
      purpose: 'JSON-LD with context and type receives the full completeness score.',
      document: { jsonLd: [{ '@context': 'https://schema.org', '@type': 'SoftwareApplication' }] },
      expected: { score: 12, issues: 0, suggestions: 0 },
    },
    negative: {
      purpose: 'A JSON-LD object missing both required fields receives the deterministic completeness warning.',
      document: { jsonLd: [{}] },
      expected: { score: 0, issues: 1, suggestions: 0 },
    },
    boundary: {
      purpose: 'No structured data receives no completeness penalty because optional absence belongs to the presence rule.',
      document: { jsonLd: [] },
      expected: { score: 12, issues: 0, suggestions: 0 },
    },
  },
  'robots-txt-ai-config': {
    positive: {
      purpose: 'An indexable page receives the full page-level crawler score.',
      document: { metaTags: { robots: 'index,follow' } },
      expected: { score: 8, issues: 0, suggestions: 1 },
    },
    negative: {
      purpose: 'A noindex directive triggers the deterministic critical finding.',
      document: { metaTags: { robots: 'noindex,nofollow' } },
      expected: { score: 0, issues: 1, suggestions: 0 },
    },
    boundary: {
      purpose: 'A nofollow-only directive is not confused with noindex; site-level crawler access remains a separate check.',
      document: { metaTags: { robots: 'nofollow,noarchive' } },
      expected: { score: 8, issues: 0, suggestions: 1 },
    },
  },
  'meta-description-quality': {
    additional: [
      {
        kind: 'positive',
        purpose: 'A complete Chinese summary without spaces is descriptive content rather than a one-word label.',
        document: { metaTags: { description: '串接多廠牌設備與既有系統，建置監測、告警與報表，支援能源管理及現場作業。' } },
        expected: { score: 7, issues: 0, suggestions: 0 },
      },
      {
        kind: 'negative',
        purpose: 'A short Chinese generic label still receives the metadata clarity suggestion.',
        document: { metaTags: { description: '官方網站' } },
        expected: { score: 3, issues: 0, suggestions: 1 },
      },
      {
        kind: 'boundary',
        purpose: 'Chinese commas in a keyword list without sentence punctuation still trigger review.',
        document: { metaTags: { description: '設備串接，監測告警，資料報表，能源管理，現場作業' } },
        expected: { score: 3, issues: 0, suggestions: 1 },
      },
      {
        kind: 'boundary',
        purpose: 'Chinese commas followed by a sentence terminator are accepted as a descriptive summary.',
        document: { metaTags: { description: '設備串接，監測告警，資料報表，能源管理，現場作業。' } },
        expected: { score: 7, issues: 0, suggestions: 0 },
      },
    ],
    positive: {
      purpose: 'A page-specific readable summary receives the full metadata score.',
      document: { metaTags: { description: 'A deterministic release guide covering package, Action, and rollback verification.' } },
      expected: { score: 7, issues: 0, suggestions: 0 },
    },
    negative: {
      purpose: 'A missing description receives a warning without claiming a ranking outcome.',
      document: { metaTags: {} },
      expected: { score: 0, issues: 1, suggestions: 0 },
    },
    boundary: {
      purpose: 'A long but page-specific description is not penalized by a fabricated fixed-length limit.',
      document: { metaTags: { description: `A page-specific release explanation ${repeatedWords(180, 'context')}.` } },
      expected: { score: 7, issues: 0, suggestions: 0 },
    },
  },
  'content-boilerplate-ratio': {
    positive: {
      purpose: 'Paragraph content at sixty percent of extracted text receives the full heuristic score.',
      document: { paragraphs: [words(60, 'content')], rawText: `${words(60, 'content')} ${words(40, 'navigation')}` },
      expected: { score: 5, issues: 0, suggestions: 0 },
    },
    negative: {
      purpose: 'Very little paragraph content relative to total text receives a review suggestion.',
      document: { paragraphs: [words(20, 'content')], rawText: `${words(20, 'content')} ${words(80, 'navigation')}` },
      expected: { score: 1, issues: 0, suggestions: 1 },
    },
    boundary: {
      purpose: 'Exactly forty percent paragraph content stays at the documented middle threshold instead of the low band.',
      document: { paragraphs: [words(40, 'content')], rawText: `${words(40, 'content')} ${words(60, 'navigation')}` },
      expected: { score: 3, issues: 0, suggestions: 0 },
    },
  },
  'keyword-stuffing-detection': {
    additional: [
      {
        kind: 'positive',
        purpose: 'CJK sentence terminators separate natural technical prose and preserve decimal versions.',
        document: { rawText: '設備使用 Modbus 讀取資料，整合 MQTT gateway client broker publish subscribe topic payload sensor meter register coil。傳輸採用 MQTT 5.0，Modbus 與 MQTT 核對 endian offset address function timeout retry polling serial ethernet。監測畫面顯示告警 voltage current power frequency temperature humidity pressure flow level status！軟體服務以 API 提供資料 authentication authorization pagination limits headers response request query filter cache？驗收留下測試紀錄 mapping units precision timestamps history export retention backups validation documentation。' },
        expected: { score: 5, issues: 0, suggestions: 0 },
      },
      {
        kind: 'negative',
        purpose: 'Repeated technical keywords across Chinese sentences still trigger repetition findings.',
        document: { rawText: 'MQTT Modbus MQTT Modbus repeated keyword content。MQTT Modbus MQTT Modbus repeated keyword content。MQTT Modbus MQTT Modbus repeated keyword content。MQTT Modbus MQTT Modbus repeated keyword content。MQTT Modbus MQTT Modbus repeated keyword content。MQTT Modbus MQTT Modbus repeated keyword content。MQTT Modbus MQTT Modbus repeated keyword content。MQTT Modbus MQTT Modbus repeated keyword content。MQTT Modbus MQTT Modbus repeated keyword content。MQTT Modbus MQTT Modbus repeated keyword content。MQTT Modbus MQTT Modbus repeated keyword content。MQTT Modbus MQTT Modbus repeated keyword content。MQTT Modbus MQTT Modbus repeated keyword content。MQTT Modbus MQTT Modbus repeated keyword content。MQTT Modbus MQTT Modbus repeated keyword content。MQTT Modbus MQTT Modbus repeated keyword content。MQTT Modbus MQTT Modbus repeated keyword content。MQTT Modbus MQTT Modbus repeated keyword content。MQTT Modbus MQTT Modbus repeated keyword content。MQTT Modbus MQTT Modbus repeated keyword content' },
        expected: { score: 0, issues: 1, suggestions: 1 },
      },
      {
        kind: 'boundary',
        purpose: 'Decimal versions in one sentence do not fabricate adjacent-sentence repetition evidence.',
        document: { rawText: 'MQTT Modbus 0.0 value0 field0 MQTT Modbus 1.0 value1 field1 MQTT Modbus 2.0 value2 field2 MQTT Modbus 3.0 value3 field3 MQTT Modbus 4.0 value4 field4 MQTT Modbus 5.0 value5 field5 MQTT Modbus 6.0 value6 field6 MQTT Modbus 7.0 value7 field7 MQTT Modbus 8.0 value8 field8 MQTT Modbus 9.0 value9 field9 MQTT Modbus 10.0 value10 field10 MQTT Modbus 11.0 value11 field11 MQTT Modbus 12.0 value12 field12 MQTT Modbus 13.0 value13 field13 MQTT Modbus 14.0 value14 field14 MQTT Modbus 15.0 value15 field15 MQTT Modbus 16.0 value16 field16 MQTT Modbus 17.0 value17 field17 MQTT Modbus 18.0 value18 field18 MQTT Modbus 19.0 value19 field19' },
        expected: { score: 5, issues: 0, suggestions: 0 },
      },
    ],
    positive: {
      purpose: 'Long content with diverse vocabulary receives the full repetition score.',
      document: { rawText: words(80, 'term') },
      expected: { score: 5, issues: 0, suggestions: 0 },
    },
    negative: {
      purpose: 'Low-diversity language repeated across sentences triggers the stuffing heuristic.',
      document: { rawText: stuffedText },
      expected: { score: 0, issues: 1, suggestions: 1 },
    },
    boundary: {
      purpose: 'A short sample below fifty words is not classified from insufficient repetition evidence.',
      document: { rawText: repeatedWords(49, 'widget') },
      expected: { score: 5, issues: 0, suggestions: 0 },
    },
  },
  'content-uniqueness-signals': {
    positive: {
      purpose: 'A verifiable original measurement plus a code example receives the full heuristic score.',
      document: { rawText: 'Our research measured the documented fixture under controlled inputs.', html: '<pre><code>npm run check</code></pre>' },
      expected: { score: 5, issues: 0, suggestions: 0 },
    },
    negative: {
      purpose: 'Generic prose with no original evidence or example remains at the base score.',
      document: { rawText: 'The package checks content.', html: '<p>The package checks content.</p>' },
      expected: { score: 2, issues: 0, suggestions: 1 },
    },
    boundary: {
      purpose: 'A code sample alone adds one point but cannot masquerade as original research.',
      document: { rawText: 'Run the documented command.', html: '<pre><code>geoptimize --version</code></pre>' },
      expected: { score: 3, issues: 0, suggestions: 1 },
    },
  },
};
