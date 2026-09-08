---
title: "Getting Started with llms.txt"
author: "Fixture Author"
date: "2026-08-15"
---

# Getting Started with llms.txt

llms.txt is a proposal for publishing a concise Markdown summary of a website. The proposal does not define a mandatory client behavior, and publishing the file does not prove that a search engine or assistant will use it.

## What is llms.txt?

The proposed file lives at a site root and can list important pages with short descriptions. Teams can evaluate it as an optional interoperability adapter while keeping established crawling, indexing, and content-quality work separate.

The proposed structure includes:

- An H1 heading with the site name
- A blockquote with a brief site description
- Sections with links to selected pages
- Optional explanatory notes

## What can be tested?

A reproducible experiment can confirm that the file is generated, deployed at the intended URL, contains accurate links, and changes only when its source content changes. Those tests do not measure ranking or citation.

Useful engineering checks include:

1. Stable output for an unchanged site
2. Valid links to public pages
3. No private URLs or secrets
4. A documented rollback path

## How to create a draft

Preview the generated file before writing it:

```bash
npx geoptimize generate ./dist --dry-run
```

Review the site name, description, page selection, and every URL. Publish the draft only when the team accepts its experimental status.

## Frequently Asked Questions

### Is llms.txt the same as robots.txt?

No. robots.txt communicates crawler access rules. The llms.txt proposal is a content summary and does not grant access or override indexing controls.

### Do all AI systems support llms.txt?

No universal support contract is established by the proposal. Verify each target system from current first-party documentation and record the observation date.
