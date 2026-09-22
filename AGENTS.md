# AGENTS.md

Machine-readable catalog of BC Residential Tenancy Branch forms
(`data/bc-rtb-forms.json`) plus a scheduled updater that opens a PR when the
official forms page changes.

**The one rule:** never edit human-maintained fields (`category`, `matter_type`,
`initiating_party`, `parties`, `property_manager_role`, `use_when`,
`legal_effect`, `do_not_use_when`, `source_basis`, `related_forms`) or retire a
form, unless the user asks. The updater only touches source-controlled fields
(`form_name`, `official_url`, `current_version`, `last_verified`, and `status`
only to un-retire a record).

## Stack

Bun, Node stdlib, ESM `.mjs` files. `ajv` is the only dependency. No build
step, no TypeScript. Do not add dependencies or third-party GitHub Actions.

## Commands

```sh
bun run validate         # schema + unique ids + related_forms references
bun run check-links      # HEAD every official_url and the index url
bun run update:check     # print the source diff; exit 2 if anything changed
bun run update:sources   # apply source-owned changes and refresh the snapshot
```

Before any commit: `validate`, `check-links`, and `update:check` twice
(it must be idempotent, no diff on the second run) all exit 0.

## Data rules

- `id` is the stable RTB form number (`RTB-1`, `RTB-12L-DR`), uppercase, never
  a PDF filename.
- Never delete a record. Retire it by setting `status: "historical_or_replaced"`.
- `related_forms` must reference ids that already exist in the catalog.
- Schema is `additionalProperties: false`; a new field needs a schema change
  in `schema/bc-rtb-forms.schema.json` first.

## Where things live

- `data/` the catalog
- `schema/` JSON Schema for the catalog
- `scripts/` validate, check-links, the updater
- `snapshots/` `latest.json`: hash + extracted inventory from the last fetch, no HTML
- `.github/` CI and the weekly updater workflow

## Conventions

- Conventional Commits. No attribution trailers. No hard-wrapped commit
  bodies (wrap at sentence boundaries, not a fixed column). No em dashes in
  prose.
- Pin GitHub Actions to `vMAJOR.MINOR.PATCH`. Minimum release age is 3 days
  (see `bunfig.toml` and `.github/dependabot.yml` cooldown).
- No custom `User-Agent` on outbound requests.
- Never commit a copy of any gov.bc.ca page or PDF; store only hashes and extracted facts.

## Legal caveat

Not legal advice. Any source change needs human review before merging.
