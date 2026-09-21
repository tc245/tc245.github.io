# Community Evidence Hub — concept demonstrator

A working, static prototype of an evidence hub concept. Eighteen fictional records connect
a searchable library, an evidence map, detailed summaries and local example
source sheets. The themes, organisations, assessments and findings are illustrative.

**Iteration 2:** `/learning/food-access/` adds a complete worked question, six
synthetic trials, a reproducible meta-analysis with a predefined sensitivity
variant, context/equity and confidence views, and an interactive 200-household
food-access scenario. See [ANALYTICAL_DEMO.md](ANALYTICAL_DEMO.md) for the walkthrough,
statistical method, scenario assumptions and reproduction commands.

## Run locally

Use **Node 22.19 or later**, preferably the latest Node 22 LTS. With nvm, run
`nvm install` and `nvm use` in this directory. Then:

```sh
npm ci
npm run dev
```

Open **http://localhost:4321**. The development server binds to localhost. Under an
agent harness Astro may run it in the background; `npx astro dev status`,
`npx astro dev logs`, and `npx astro dev stop` manage that instance.

For a local production build:

```sh
npm run build
npm run preview
```

## What to explore

- **Homepage:** learning themes, a coverage preview and featured perspectives.
- **Library:** search, combined theme/type/population/place filters, removable
  filter chips, reset, newest/oldest/title sorting and meaningful empty states.
- **Map:** native table of theme × knowledge type, including deliberate gaps.
  Selecting a count opens exactly those records in the library. Multi-theme
  records count in each relevant cell but only once in overall results.
- **Record pages:** findings, reviewer-supplied example assessment and reason,
  limitations, methods, provenance and related records. Returning to the library
  retains your filters; query URLs can be bookmarked or shared.
- **Source pages:** explicitly fictional source sheets with working local links.
- **About:** interpretation, limitations, accessibility and publishing workflow.
- **Public JSON:** `/data/evidence.json` downloads only approved demonstration records.

The library's filters require JavaScript; record pages and unfiltered content
remain readable without it. No AI runs in the website. The synthetic fixture
text was prepared with AI assistance for interface demonstration; it is not
real evidence content or evidence synthesis.

## Edit the register

Edit `src/data/records.json`. Required fields include a stable kebab-case ID,
title, year, summary, classifications, assessment and reason, methods, sample
context, findings, limitations, use notes, producer, funder, programme and
`releaseApproved`.

Taxonomies live in `src/lib/catalogue.ts`. `src/lib/evidence.ts` validates every
entry at build time, including unreleased entries. Missing fields, duplicate IDs,
unknown vocabulary and duplicate classifications fail the build.

Only release-approved records generate routes and browser data. The unreleased
fixture is an intentional test: it must not appear in `dist/`. Never put the raw
register in `public/`, and never import the build-only `evidence.ts` module in a
browser script. Keep all demo content fictional.

After an edit, rebuild/redeploy to publish it. A production container serves a
snapshot, not a live connection to the source file. See [DEMO.md](DEMO.md) for a
three-minute walkthrough and a small update to rehearse.

## Checks

```sh
npx playwright install chromium
npm run verify
```

Checks cover TypeScript/Astro diagnostics, static generation, data validity,
publication boundaries, search/filter combinations, every map cell, URL state,
record/source navigation, malicious input, keyboard focus, desktop/mobile layouts
and automated WCAG 2.2 AA rules. Automated checks are not an independent audit.
If browser system libraries are missing on Linux, install Playwright's documented
browser dependencies for that host.

`npm run test:unit` includes checks of **built** files, so run `npm run build`
first if invoking it separately. Baseline fixtures contain 18 approved records;
update fixture expectations intentionally when changing that dataset.

## Azure VM deployment

The multi-stage Dockerfile builds with Node 22 and serves `dist/` with Caddy.
Compose includes configurable ports/hostname and persistent certificate storage.
**[DEPLOYMENT.md](DEPLOYMENT.md)** covers local HTTP preview, Azure DNS/HTTPS,
optional reviewer authentication, updates and rollback. No VM credentials or
cloud resources are required to build the prototype locally.

## Structure

```text
src/data/records.json      fictional source register
src/lib/catalogue.ts      shared, browser-safe filters and taxonomies
src/lib/evidence.ts        build-only validation and public projection
src/components/           reusable library/map/cards
src/layouts/              shared navigation and fictional-content notices
src/pages/                statically generated pages and public data export
src/scripts/              browser interactions
src/styles/               responsive visual design
tests/                    domain, release-boundary and browser checks
```

SharePoint publishing, client content, approved brand assets and production hosting
integration are future project work. The Azure demo uses static files; it does
not claim to implement those integrations or provide a reviewed evidence base.
