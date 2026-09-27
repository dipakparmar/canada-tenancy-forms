# AGENTS.md

Machine-readable catalog of Canadian residential tenancy forms, one directory
per jurisdiction (`data/<code>/forms.json`: `bc`, `on`, `ns`), plus a scheduled
updater that opens a PR per jurisdiction when an official forms page changes.

**The one rule:** never edit human-maintained fields (`category`, `matter_type`,
`initiating_party`, `parties`, `property_manager_role`, `use_when`,
`legal_effect`, `do_not_use_when`, `source_basis`, `related_forms`) or retire a
form, unless the user asks. The updater only touches source-controlled fields
(`form_name`, `official_url`, `current_version`, `last_verified`, and `status`
only to un-retire a record).

## Stack

Bun and the Node stdlib, no build step. The catalog scripts are ESM `.mjs`
files and stay that way. The PDF tooling under `scripts/pdf/` and
`scripts/fetch-form.ts` is TypeScript, run directly by bun, still with no
build step and no transpile. The dependencies are `ajv` (catalog schema) and
`@libpdf/core` (PDF forms). Do not add others, and do not add third-party
GitHub Actions.

## Commands

```sh
bun run validate         # schema + id pattern + unique ids + related_forms references
                         # every catalog script takes jurisdiction codes first (bun run validate bc)
bun run check-links      # HEAD every official_url and the index url
bun run update:check     # print the source diff; exit 2 if anything changed
bun run update:sources   # apply source-owned changes and refresh the snapshot

bun run fetch-forms      # download the PDF for every form that has a map
bun test                 # check every map in maps/<code>/ against its PDF
bun run inspect          # dump a PDF's fields, positions and text layout
bun run automap          # guess a map for an unmapped form
bun run automap:eval     # score that guess against the verified map
bun run markers          # fill every field with its own key, for a render review
bun run fill             # fill RTB-1 with sample data and check the round trip
bun run serve            # local test UI, one input per semantic key
```

Before any commit: `validate`, `check-links`, and `update:check` twice
(it must be idempotent, no diff on the second run) all exit 0. Touching
`maps/` or `scripts/pdf/` also means `fetch-forms` then `bun test`.

## Data rules

- `id` is the stable official form number (`RTB-1`, `RTB-12L-DR`), uppercase,
  never a PDF filename. Each catalog's `dataset.id_pattern` says what its ids
  look like and `validate` enforces it.
- `current_version` is ISO 8601 at the precision the source prints: `2026-07`
  when a page or footer gives month and year, `2022-04-01` when it gives a full
  date. Uniform format, never invented precision. A source whose page prints no
  version reads it from the PDF footer through the module's `version(bytes)`.
- Never delete a record. Retire it by setting `status: "historical_or_replaced"`.
- Manitoba numbers forms against two schedules that both start over at Form 2, 3, 4, 8
  and 9 (Parts 1 to 8 of the Residential Tenancies Regulation, and Part 9); a Part 9
  form's id keeps a `P9-` prefix (`P9-2`) to stay unique, while a Parts 1-8 form keeps
  its bare number.
- New Brunswick ids the small number of PDFs that print a regulation form number
  (`FORM 6 STANDARD FORM OF LEASE`) by that bare number even when the number never
  appears in the index page's own link text; every other form keeps the Service New
  Brunswick catalogue number pulled from its filename. Its `prefix` is an array of
  the two hosts its PDFs are split across (`pxw1.snb.ca` and `www2.snb.ca`);
  `detect-source-changes.mjs` accepts either a string or an array there.
- Quebec ids most forms from their own printed footer stamp (`TAL-072A`, `AV-041`),
  which also matches the PDF filename with underscores turned to hyphens; the
  lease-adjustment appendices print no stamp and keep a short slug id instead
  (`ADJ-LOGEMENT`). The mandatory lease itself is never published as a PDF and is
  catalogued by hand as `BAIL`, with an `official_url` outside the source `prefix`.
- `related_forms` must reference ids that already exist in the catalog.
- Schema is `additionalProperties: false`; a new field needs a schema change
  in `schema/forms.schema.json` first.
- A map's `form` must equal the catalog id and its file must be
  `maps/<code>/<ID>.map.json`.
- Adding a jurisdiction means a `data/<code>/forms.json`, a
  `scripts/sources/<code>.mjs` exporting `prefix` and `extract(html)`, and the
  code added to the matrix in `.github/workflows/update-forms.yml`; everything
  else picks the directory up by itself.
- A form the updater cannot see (Ontario's 2229E lives on a different site) is
  catalogued by hand with an `official_url` outside the source `prefix`; the
  updater then never touches it.
- A source module's `extract(html)` is normally synchronous, but a source
  whose index page links a landing page per form rather than the PDF directly
  (Nova Scotia) may make it `async` and fetch each landing page itself, with a
  short delay between requests; `detect-source-changes.mjs` always `await`s
  the call, so a synchronous module still works unchanged.
- A map entry may carry `readonly: true` for a field the PDF flags read-only at
  rest (2229E unlocks those with its own scripts); `fillFromMap` clears the flag
  when asked to write one.
- Map semantic keys are hand-verified against a rendered page, not derived from
  the PDF field names, which Acrobat auto-generated and which frequently name
  the label before the widget. Change a key only with a marker render check
  (`bun run markers`), never because a name looks wrong.
- A map's `revision` and `pdf_sha256` describe the one government PDF the map
  was verified against, so they are updated together, never one without the
  other, and only after re-verifying the form. A form whose PDF prints no
  revision anywhere may set `"revision_printed": false`: `revision` and
  `pdf_sha256` are still required, but the guard test skips searching the
  PDF's extracted text for the revision string.

## Where things live

- `data/<code>/` the catalog for one jurisdiction
- `schema/` JSON Schema shared by every catalog
- `maps/<code>/` `<ID>.map.json`: semantic key to AcroForm field name, per form
- `scripts/` validate, check-links, the updater, the form fetcher
- `scripts/sources/` one page extractor per jurisdiction
- `scripts/pdf/` the PDF field tooling: inspect, automap, markers, fill, serve
- `tests/` the guard test over `maps/<code>/`
- `forms/` and `out/` gitignored scratch: downloaded PDFs and generated dumps
- `snapshots/<code>/` `latest.json`: hash + extracted inventory from the last fetch, no HTML
- `.github/` CI and the weekly updater workflow

## Conventions

- Conventional Commits. No attribution trailers. No hard-wrapped commit
  bodies (wrap at sentence boundaries, not a fixed column). No em dashes in
  prose.
- Pin GitHub Actions to `vMAJOR.MINOR.PATCH`. Minimum release age is 3 days
  (see `bunfig.toml` and `.github/dependabot.yml` cooldown).
- No custom `User-Agent` on outbound requests.
- Never commit a copy of any government page or PDF; store only hashes and extracted facts.

## Legal caveat

Not legal advice. Any source change needs human review before merging.
