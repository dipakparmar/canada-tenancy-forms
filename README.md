# bc-rtb-forms

A machine-readable catalog of the forms published by the British Columbia Residential
Tenancy Branch (RTB), plus a scheduled job that notices when the official forms page
changes and opens a pull request for a human to review. The repo is standalone: consume
[`data/bc-rtb-forms.json`](data/bc-rtb-forms.json) directly, or pin a release.

## Layout

```
data/bc-rtb-forms.json               the catalog
schema/bc-rtb-forms.schema.json      JSON Schema (draft-07) for the catalog
maps/<ID>.map.json                   field maps: semantic key -> AcroForm field
scripts/validate.mjs                 schema + id checks
scripts/check-links.mjs              link health checks
scripts/detect-source-changes.mjs    the updater
scripts/fetch-form.ts                downloads a form's PDF into the gitignored forms/
scripts/pdf/                         the PDF field tooling (inspect, automap, fill, serve)
tests/check-maps.test.ts             checks every map against its PDF
snapshots/latest.json                hash + extracted inventory from the last fetch (no HTML)
.github/workflows/                   CI and the weekly updater
```

## Commands

```sh
bun install              # install dependencies
bun run validate         # schema + unique ids + related_forms references
bun run check-links      # HEAD every official_url and the index url
bun run update:check     # print the source diff; exit 2 if anything changed
bun run update:sources   # apply source-owned changes and refresh the snapshot

bun run fetch-forms      # download the PDF for every form that has a map
bun test                 # check every map against its PDF
bun run inspect          # dump a PDF's fields, positions and text layout
bun run automap          # guess a map for an unmapped form
bun run automap:eval     # score that guess against the verified map
bun run markers          # fill every field with its own key, for a render review
bun run fill             # fill RTB-1 with sample data and check the round trip
bun run serve            # local test UI, one input per semantic key
```

## Field ownership

The record shape is defined in
[`schema/bc-rtb-forms.schema.json`](schema/bc-rtb-forms.schema.json).

| Owner | Fields |
|---|---|
| Source (the updater may overwrite) | `form_name`, `official_url`, `current_version`, `last_verified`, and `status` only to bring a `historical_or_replaced` record back |
| Humans (the updater never touches) | `category`, `matter_type`, `initiating_party`, `parties`, `property_manager_role`, `use_when`, `do_not_use_when`, `related_forms`, `legal_effect`, `source_basis`, and every top-level block except `source` |

## Updater behaviour

- Runs weekly (Mondays 15:00 UTC) and on manual trigger.
- Opens or updates one PR on the fixed branch `chore/rtb-forms-update`.
- Only touches source-controlled fields, never human-maintained ones.
- Never retires a form on its own; a `historical_or_replaced` status change is a human edit.
- A catalogued form absent from the index page is reported as informational only, not
  removed or marked historical.

## Form field maps

The catalog says which forms exist. A field map says what is *inside* one: the RTB PDFs are
real AcroForms, but Acrobat auto-generated their field names from nearby text, so the names
are unreliable. On RTB-1 the checkbox named `landlord` is the landlord's *agent* box, the
rent amount lives in a field named `The tenant will pay the rent of`, and nine fields are
called `undefined` through `undefined_9`. A map in [`maps/`](maps) gives each of those a
stable semantic key:

```json
{
  "form": "RTB-1",
  "revision": "2023/06",
  "source": "https://www2.gov.bc.ca/assets/.../rtb1.pdf",
  "pdf_sha256": "0b7c46...",
  "fields": {
    "landlord.isLandlord": { "pdf": "ADDRESS FOR SERVICE of the", "type": "checkbox", "on": "On" },
    "rent.amount": { "pdf": "The tenant will pay the rent of", "type": "text" }
  }
}
```

`type` is `text`, `checkbox` or `signature`. Checkboxes carry `on`, the export value that
means checked (RTB-1 uses both `On` and `Yes` depending on the section). Two forms are
mapped so far: RTB-1 (122 fields) and RTB-27 (468 fields, mostly inspection grid cells keyed
`<room>.<item>.<moveIn|moveOut>.<comment|code>`).

**The PDFs are never committed.** `bun run fetch-forms` downloads them from the government
site into `forms/`, which is gitignored, verifies the `%PDF` magic bytes and prints each
file's sha256. Everything below assumes you have run it.

### Checking a map still fits its form

```sh
bun run fetch-forms
bun test
```

For every map this checks that the PDF's sha256 and printed revision string still match what
the map records, that every mapped field exists with the mapped type, that checkbox on-values
are real export values, that no two keys point at the same field, and that the map covers
every field in the PDF exactly once. If the government republishes a form, this fails loudly
instead of silently filling the wrong version. A map whose PDF has not been fetched is
skipped with a message rather than failed.

### Mapping a new form

```sh
bun run fetch-forms RTB-12L                    # download it
bun run inspect forms/RTB-12L.pdf              # fields, rects and text layout into out/
bun run automap forms/RTB-12L.pdf              # out/RTB-12L.map.candidate.json
bun run markers out/RTB-12L.map.candidate.json forms/RTB-12L.pdf
```

`automap` guesses a key per field from the labels near each widget, tagging every guess
`high`, `medium` or `low` confidence. `markers` then fills every text field with its own key
and ticks every box, so the rendered pages can be read back to confirm, or correct, each
guess. That render review is the step that catches everything; nothing is trusted without it.

### How good is automap

`bun run automap:eval <ID>` scores a candidate against the verified map. "Exact" is the whole
key; "section+item" compares only the first two segments, which is roughly what a human
reviewer has to correct.

| Form | fields | exact | section+item |
|---|---|---|---|
| RTB-1 | 122 | 57 (47%) | 67 (55%) |
| RTB-27 | 468 | 12 (3%) | 291 (62%) |

RTB-1 is the optimistic number: the label dictionary was mined from that form, and all 22 of
its high-confidence guesses were exactly right. RTB-27 is the honest generalisation number,
and the gap between 3% and 62% is one naming level: 456 of its fields are grid cells that
automap names `kitchen.fridge.comment` where the verified map says
`kitchen.fridge.moveIn.comment`. The room and the item are right; the group header above the
column ("Condition at Beginning of Tenancy") is what `extractText()` returns broken across
spans. Treat automap as a first draft, never as a map.

### Filling a form

`bun run serve [ID]` starts a local page with one input per semantic key, built from the map
at request time, and posts them back as a filled PDF. RTB-1 is pre-filled with sample data;
`bun run fill` fills all 122 of its fields and checks that every value reads back identically
after a save and reload.

**Signature fields cannot be filled.** `@libpdf/core` lists them and reports their type, but
has nothing to set on them, so RTB-27's five signature fields are skipped (463 of 468 filled).
Anything that needs a real signature needs a different mechanism.

## GitHub setup

- Protect `main`: require a pull request, at least one approving review, and the CI
  status check.
- Enable "Allow GitHub Actions to create pull requests" (Settings, Actions, General,
  Workflow permissions). The updater needs this.
- PRs opened with the built-in `GITHUB_TOKEN` do not trigger other workflows on their own,
  so CI will not start on the updater PR by itself; close and reopen it, or push an empty
  commit, to get the required check to run.
- Keep the fixed updater branch unprotected so the workflow can force-push it.

## Legal and data quality

This is not legal advice. A form URL that responds does not mean the form is current or
valid for your situation. A source change always needs human review before it is merged.

## Copyright and licence

Form numbers, names, and PDF links in this catalog are drawn from forms published by the
Government of British Columbia's Residential Tenancy Branch. We link to the government's
PDFs; we never redistribute them, and we do not store a copy of the government's forms
page (`scripts/detect-source-changes.mjs` keeps only a hash of the fetched page plus our
own extracted inventory in `snapshots/latest.json`, for change detection). That government
content remains copyright Government of British Columbia. This repository's own code and
human-written metadata (categorization, `use_when`, `related_forms`, and similar fields)
are MIT licensed, as below. The Open Government Licence - British Columbia does not apply
here, since none of this data is published in the BC Data Catalogue.

## License

MIT, see [LICENSE](LICENSE). The forms themselves belong to the Province of British Columbia.
