---
name: SEO
slug: seo
version: 1.0.1
description: Optimize pages for search rankings with on-page rules, technical audits, content strategy, and structured data.
---

## Quick Reference

| Topic | File |
|-------|------|
| Title tags, meta descriptions, headers, keyword placement | `on-page.md` |
| Core Web Vitals, crawlability, mobile, indexing | `technical.md` |
| Search intent, E-E-A-T, content freshness | `content.md` |
| Google Business, NAP consistency, local keywords | `local.md` |
| JSON-LD, Article, LocalBusiness, FAQ, Product schema | `schema.md` |
| Internal linking, anchor text, backlink principles | `links.md` |

## Critical Rules

### On-Page Fundamentals
- Title: 50-60 chars, primary keyword in first 30 chars, unique per page
- Meta description: 150-160 chars, benefit-focused, call-to-action
- Only one H1 per page — must differ from title but include primary keyword
- H1 → H2 → H3 strict hierarchy — never skip levels
- Primary keyword in: title, H1, first 100 words, URL
- Keyword density under 3% — stuffing triggers penalties

### Technical Essentials
- Core Web Vitals: LCP < 2.5s, INP < 200ms, CLS < 0.1
- Mobile-first indexing: Google indexes mobile version — test mobile rendering
- Canonical URL on every page — prevents duplicate content penalties
- robots.txt: don't block CSS/JS, Google needs them to render
- XML sitemap: max 50K URLs per file, submit in Search Console
- HTTPS required — mixed content breaks security indicators

### Content Signals
- Search intent match: informational, navigational, transactional, commercial
- E-E-A-T for YMYL: Experience, Expertise, Authoritativeness, Trustworthiness
- Thin content penalty: pages under 300 words with no unique value
- Content freshness: update dates matter for time-sensitive queries

### Penalties to Avoid
- Hidden text with CSS or font-size:0 — immediate penalty
- Duplicate title tags across pages — wastes crawl budget
- Keyword stuffing in alt text — unnatural patterns detected
- Cloaking: showing different content to users vs bots
- Link schemes: buying links, excessive link exchanges
