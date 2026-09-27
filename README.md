# canada-tenancy-forms

A machine-readable catalog of the residential tenancy forms published by Canadian
provinces, plus a scheduled job that notices when an official forms page changes and opens
a pull request for a human to review. The repo is standalone: consume
`data/<code>/forms.json` directly, or pin a release.

| Code | Jurisdiction | Authority | Forms | Field maps |
|---|---|---|---|---|
| `bc` | British Columbia | Residential Tenancy Branch | 72, classified | RTB-1, RTB-27 |
| `on` | Ontario | Landlord and Tenant Board, plus the Ministry's standard lease | 35, classified | 2229E |
| `ns` | Nova Scotia | Residential Tenancies Program, Service Nova Scotia | 25, classified | P |
| `mb` | Manitoba | Residential Tenancies Branch | 37, classified | none (Word documents; Form 1's PDF is flattened) |
| `nb` | New Brunswick | Tenant and Landlord Relations Office, Service New Brunswick | 22, classified | 6 |
| `nl` | Newfoundland and Labrador | Residential Tenancies Office, Government Services | 22, classified | RT-2018-00044 |
| `sk` | Saskatchewan | Office of Residential Tenancies | 18, classified | none (no lease or agreement PDF; Schedule 1 is unfillable statutory text) |
| `nt` | Northwest Territories | NWT Rental Office, Department of Justice | 9, classified | none (Tenancy Agreement's PDF is flattened) |
| `ab` | Alberta | Residential Tenancy Dispute Resolution Service | 17, classified | none (no standard tenancy agreement form; RTDRS forms are XFA or non-agreement AcroForm PDFs) |
| `qc` | Quebec | Tribunal administratif du logement (TAL) | 56, classified | ADJ-LOGEMENT |

One directory code selects a jurisdiction's catalog, field maps, snapshot and page
extractor. Scripts take jurisdiction codes as arguments and default to all of them.

## Layout

```
data/<code>/forms.json               the catalog, one per jurisdiction (bc, on, ns, mb, nb, nl, sk, nt, ab, qc)
schema/forms.schema.json             JSON Schema (draft-07) shared by every catalog
maps/<code>/<ID>.map.json            field maps: semantic key -> AcroForm field
scripts/jurisdictions.mjs            lists the jurisdiction directories for the other scripts
scripts/sources/<code>.mjs           per-jurisdiction page extractor used by the updater
scripts/validate.mjs                 schema + id checks
scripts/check-links.mjs              link health checks
scripts/detect-source-changes.mjs    the updater
scripts/fetch-form.ts                downloads a form's PDF into the gitignored forms/<code>/
scripts/pdf/                         the PDF field tooling (inspect, automap, fill, serve)
tests/check-maps.test.ts             checks every map against its PDF
snapshots/<code>/latest.json         hash + extracted inventory from the last fetch (no HTML)
.github/workflows/                   CI and the weekly updater
```

## Commands

```sh
bun install              # install dependencies
bun run validate         # schema + id pattern + unique ids + related_forms references
bun run check-links      # HEAD every official_url and the index url
bun run update:check     # print the source diff; exit 2 if anything changed
bun run update:sources   # apply source-owned changes and refresh the snapshot
                         # each takes jurisdiction codes first: bun run validate bc

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
[`schema/forms.schema.json`](schema/forms.schema.json).

| Owner | Fields |
|---|---|
| Source (the updater may overwrite) | `form_name`, `official_url`, `current_version`, `last_verified`, and `status` only to bring a `historical_or_replaced` record back |

`current_version` is ISO 8601 at whatever precision the source prints: `2026-07` for BC's
"July 2026", `2026-09` for an Ontario footer reading "N4 (2026/09)", `2022-04-01` for one
reading "v. 01/04/2022". The format is uniform so versions sort and compare; the precision
is never more than the source gave. Ontario's page prints no dates, so its updater run
downloads each PDF and reads the footer.
| Humans (the updater never touches) | `category`, `matter_type`, `initiating_party`, `parties`, `property_manager_role`, `use_when`, `do_not_use_when`, `related_forms`, `legal_effect`, `source_basis`, and every top-level block except `source` |

## Updater behaviour

- Runs weekly (Mondays 15:00 UTC) and on manual trigger.
- Runs once per jurisdiction and opens or updates one PR each, on the fixed branch
  `chore/forms-update-<code>`.
- Only touches source-controlled fields, never human-maintained ones.
- Never retires a form on its own; a `historical_or_replaced` status change is a human edit.
- A catalogued form absent from the index page is reported as informational only, not
  removed or marked historical.

## Form field maps

The catalog says which forms exist. A field map says what is *inside* one: the RTB PDFs are
real AcroForms, but Acrobat auto-generated their field names from nearby text, so the names
are unreliable. On RTB-1 the checkbox named `landlord` is the landlord's *agent* box, the
rent amount lives in a field named `The tenant will pay the rent of`, and nine fields are
called `undefined` through `undefined_9`. A map in [`maps/bc/`](maps/bc) gives each of those a
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
bun run inspect forms/bc/RTB-12L.pdf           # fields, rects and text layout into out/
bun run automap forms/bc/RTB-12L.pdf           # out/RTB-12L.map.candidate.json
bun run markers out/RTB-12L.map.candidate.json forms/bc/RTB-12L.pdf
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
| RTB-27 | 468 | 409 (87%) | 410 (88%) |

RTB-1 is the optimistic number: the label dictionary was mined from that form, and all 22 of
its high-confidence guesses were exactly right. RTB-27 is the generalisation number, and
almost all of it is the inspection grid: 437 of its 468 fields are grid cells, and automap
names 409 of them exactly as the verified map does. What it still gets wrong there is naming
taste, not structure - it reads `T.Garage or Parking Area` as `garageOrParkingArea` where the
map says `garageOrParking` - plus the eleven key-issue rows, whose own column headers it
takes literally instead of reusing the grid's. The 56 fields on the identification and
signature pages are the weak spot: 12 come out right and the rest are the ordinary human
corrections a render review catches. Treat automap as a first draft, never as a map.

### Grid support

A form that is mostly a table needs more than the nearest label, so automap looks for the
table itself:

- **Columns.** When several widgets share an x position down a page, the text above the
  topmost one is a column header and qualifies every key in that column.
- **Group headers.** A wider heading that sits above the column headers and covers more than
  one of them is a level of its own, so a cell is keyed
  `<section>.<row>.<group>.<column>` - `kitchen.fridge.moveIn.comment` under "Condition at
  Beginning of Tenancy" over "Comment".
- **Row labels** are matched by vertical centre against the widget's rect, not by nearest
  text, and are read from a narrow band at the row-label indent so a section heading in the
  margin cannot leak into them.
- **Section headings carry down.** A numbered, capitalised or larger line in the left margin
  sets the prefix for every row below it until the next heading, and a heading that wraps
  onto a second line is joined back up ("N.Stairwell" / "and Hall").
- **Page breaks.** A grid prints its headers once, at its start; a later page whose columns
  line up with an earlier grouped page keeps the same group.
- **Split spans.** `extractText()` breaks a printed word into several spans wherever the
  styling changes ("L" + "ighting Fixtures/", "Condition at Begin" + "n" + "ing of Tenancy").
  `layout.ts` joins spans that sit on one baseline, are set at one size, touch, and meet
  inside a word. A visible gap is left alone, because that is the form putting two columns
  side by side.

### Filling a form

`bun run serve [ID]` starts a local page with one input per semantic key, built from the map
at request time, and posts them back as a filled PDF. RTB-1 is pre-filled with sample data;
`bun run fill` fills all 122 of its fields and checks that every value reads back identically
after a save and reload.

**Signature fields cannot be filled.** `@libpdf/core` lists them and reports their type, but
has nothing to set on them, so RTB-27's five signature fields are skipped (463 of 468 filled).
Anything that needs a real signature needs a different mechanism.

## Legal and data quality

This is not legal advice. A form URL that responds does not mean the form is current or
valid for your situation. A source change always needs human review before it is merged.

## Copyright and licence

Form numbers, names, and PDF links in this catalog are drawn from forms published by the
Government of British Columbia's Residential Tenancy Branch and by the Government of
Ontario (the Landlord and Tenant Board and the Ministry of Municipal Affairs and Housing).
We link to the governments' PDFs; we never redistribute them, and we do not store a copy of
any government forms page (`scripts/detect-source-changes.mjs` keeps only a hash of the
fetched page plus our own extracted inventory in `snapshots/<code>/latest.json`, for change
detection). That government content remains copyright of the respective Crown. This
repository's own code and human-written metadata (categorization, `use_when`,
`related_forms`, and similar fields) are MIT licensed, as below. The Open Government
Licence - British Columbia does not apply here, since none of this data is published in the
BC Data Catalogue.

## License

MIT, see [LICENSE](LICENSE). The forms themselves belong to the respective provinces.
