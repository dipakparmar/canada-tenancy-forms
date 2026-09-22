# bc-rtb-forms

A machine-readable catalog of the forms published by the British Columbia Residential
Tenancy Branch (RTB), plus a scheduled job that notices when the official forms page
changes and opens a pull request for a human to review. The repo is standalone: consume
[`data/bc-rtb-forms.json`](data/bc-rtb-forms.json) directly, or pin a release.

## Layout

```
data/bc-rtb-forms.json               the catalog
schema/bc-rtb-forms.schema.json      JSON Schema (draft-07) for the catalog
scripts/validate.mjs                 schema + id checks
scripts/check-links.mjs              link health checks
scripts/detect-source-changes.mjs    the updater
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
