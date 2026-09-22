```
Status:        in-progress
Last verified: 2026-09-22 — merged user catalog, scripts run against the live index page
```

# bc-rtb-forms

A machine-readable catalog of the forms published by the British Columbia Residential Tenancy Branch (RTB), plus a scheduled job that notices when the official forms page changes and opens a pull request for a human to review.

The official source is the RTB [tenancy forms page](https://www2.gov.bc.ca/gov/content/housing-tenancy/residential-tenancies/calculators-and-resources/tenancy-forms). This repo does not host any PDFs; every record points at the government copy.

> **Not legal advice.** A form URL that responds does not mean the form is current, valid for your situation, or the version the RTB expects. Classifications such as `use_when` and `initiating_party` are a best-effort summary written by people, not by the RTB. Always open the official page before relying on a form.

## Data contract

Everything lives in [`data/bc-rtb-forms.json`](data/bc-rtb-forms.json), validated by [`schema/bc-rtb-forms.schema.json`](schema/bc-rtb-forms.schema.json) (JSON Schema draft-07).

```json
{
  "schema_version": 1,
  "generated_at": "2026-09-22",
  "source": {
    "publisher": "Province of British Columbia — Residential Tenancy Branch",
    "index_url": "https://www2.gov.bc.ca/gov/content/housing-tenancy/residential-tenancies/calculators-and-resources/tenancy-forms",
    "snapshot_sha256": "<sha256 of the snapshot in snapshots/>"
  },
  "dataset": { "id": "bc-rtb-forms-catalog", "jurisdiction": "British Columbia, Canada", "authority": "Residential Tenancy Branch", "last_verified": "2026-09-20", "official_forms_index_url": "...", "official_forms_numbered_url": "...", "notes": ["..."] },
  "enums": { "party_roles": ["..."], "matter_types": ["..."], "availability": ["..."] },
  "operational_rules": { "landlord_vs_property_manager": { "landlord": "..." }, "document_controls": ["..."] },
  "source_records": [{ "source_id": "web:20", "title": "Tenancy forms - Province of British Columbia", "url": "...", "last_updated_as_found": "2026-09-03", "coverage": "..." }],
  "forms": [
    {
      "id": "RTB-1",
      "form_name": "Residential Tenancy Agreement",
      "status": "active",
      "category": "general",
      "matter_type": "agreement",
      "current_version": "July 2026",
      "official_url": "https://www2.gov.bc.ca/assets/gov/housing-and-tenancy/residential-tenancies/forms/rtb1.pdf",
      "official_index_url": "https://www2.gov.bc.ca/gov/content/housing-tenancy/residential-tenancies/calculators-and-resources/tenancy-forms",
      "initiating_party": "landlord",
      "parties": ["landlord", "tenant"],
      "property_manager_role": "may_prepare_and_sign_as_authorized_agent",
      "use_when": "Starting a residential tenancy or documenting the main written tenancy agreement.",
      "do_not_use_when": ["The arrangement is a manufactured-home site tenancy; use RTB-5 instead."],
      "related_forms": ["RTB-22", "RTB-27", "RTB-26"],
      "legal_effect": "Contractual tenancy agreement containing prescribed standard terms and agreed additional terms.",
      "source_basis": ["Official RTB forms index"],
      "last_verified": "2026-09-22"
    }
  ]
}
```

`dataset`, `enums`, `operational_rules` and `source_records` are the curated top-level blocks: the jurisdiction and both official index URLs, the vocabularies the records draw on, the landlord versus property-manager rules and document controls, and the sources the classifications were written from. Nothing in the repo generates them; they are human-maintained.

Rules worth knowing:

- `id` is the RTB form number (`RTB-1`, `RTB-12L-DR`, `RTB-53-P1D`), never a PDF filename. Filenames change; ids do not. Ids are uppercase.
- `status` is `active`, `portal_generated` (the RTB web portal generates the notice, there is no published PDF), `specialized` (published but only for a narrow process) or `historical_or_replaced`. Records are never deleted.
- `current_version` is the "Month YYYY" date printed next to the link on the index page, or a short description of the applicable process for portal-generated forms, or `null` when none is shown.
- `category`, `matter_type`, `initiating_party` and the entries of `parties` are lowercase slugs; the vocabularies are listed in the top-level `enums` block, which is descriptive rather than enforced, because the curated values are finer-grained than the enums.
- `property_manager_role` is free text describing what an authorized agent may do on that form.
- `use_when` is required free text. `legal_effect` (string), `do_not_use_when` (string array) and `source_basis` (string array) are optional human notes.
- `related_forms` must reference ids that exist in the catalog, matching `^RTB-[0-9]+[A-Z0-9-]*$`.

### Who owns which field

| Owner | Fields |
|---|---|
| Source (the updater may overwrite) | `form_name`, `official_url`, `current_version`, `last_verified`, and `status` only to bring a `historical_or_replaced` record back |
| Humans (the updater never touches) | `category`, `matter_type`, `initiating_party`, `parties`, `property_manager_role`, `use_when`, `do_not_use_when`, `related_forms`, `legal_effect`, `source_basis`, and every top-level block except `source` |

A form that shows up on the page for the first time is added with placeholder human fields (`category: "unclassified"`, `property_manager_role: "unreviewed"`, `use_when: "Needs human classification."`). Fill them in on the PR before merging.

## How updates work

`scripts/detect-source-changes.mjs` fetches the index page, pulls out every link under `https://www2.gov.bc.ca/assets/gov/housing-and-tenancy/residential-tenancies/forms/`, derives the id from the filename (`rtb12lct.pdf` becomes `RTB-12L-CT`), and compares the result with the catalog. It reports added, renamed, re-appeared, URL-changed and version-changed forms as a markdown list.

- It only manages records whose `official_url` is a PDF under that forms directory and whose status is not `historical_or_replaced`. A `portal_generated` or `specialized` record, or one pointing anywhere else, is invisible to it in both directions.
- A managed record that is not linked from the index page is listed as informational and its status is left alone. Several catalogued forms have live forms-directory PDFs but no link on the page (`RTB-10`, `RTB-28`, `RTB-44`, `RTB-56`), so absence from the page is not evidence a form is gone. `bun run check-links` is what catches a URL that actually died; retiring a form is a human edit.

- Without `--write` it only prints the diff. Exit code 0 means nothing changed, 2 means something did. The informational "not linked from the index page" note never affects the exit code.
- With `--write` it applies the source-owned fields, saves the page to `snapshots/tenancy-forms.<date>.html` (replacing the previous snapshot), and records its sha256.
- It writes nothing when the forms are unchanged. The page HTML differs byte-for-byte on every fetch, so a snapshot-only commit would open a pointless PR every week.
- It refuses to run the diff if it finds fewer than half as many forms as the catalog has managed, so a broken page or a markup change cannot mark the whole catalog historical.

The weekly workflow (`.github/workflows/update-rtb-forms.yml`, Mondays 15:00 UTC, also runnable by hand) runs the updater, validates, and if anything changed force-pushes a commit to the fixed branch `chore/rtb-forms-update` and opens or updates one PR titled `chore(data): sync RTB forms from official source`, with the diff summary as its body.

**A source change always needs human review.** The updater can tell you a link moved or a date changed. It cannot tell you whether the new PDF changed its legal meaning, whether a replaced form has a successor, or whether a related-forms list is still right. Open the PDFs before merging.

## Recommended repository settings

- Protect `main`: require a pull request, at least one approving review, and the `CI / check` status check.
- Allow GitHub Actions to create pull requests (Settings, Actions, General, Workflow permissions). The updater needs this.
- PRs opened with the built-in `GITHUB_TOKEN` do not trigger other workflows, so CI will not start on the updater PR by itself. Close and reopen it, or push an empty commit to the branch, to get the required check to run.
- Keep the fixed updater branch unprotected so the workflow can force-push it.

## Local commands

Bun is the package manager, pinned in `package.json` and `.bun-version`. The only dependency is `ajv` for schema validation.

```sh
bun install
bun run validate        # schema + unique ids + related_forms references
bun run check-links     # HEAD every official_url and the index page (GET with Range if HEAD is refused)
bun run update:check    # print the source diff; exit 2 if anything changed
bun run update:sources  # apply source-owned changes and refresh the snapshot
```

Pass `--summary <path>` to the detect script (for example `bun run update:check -- --summary out.md`) to also append the markdown summary to a file.

## Known limits

- Extraction is a regular expression over the rendered HTML, not a DOM parser. If the page stops using absolute `https://www2.gov.bc.ca/assets/...` links, the updater will find nothing and refuse to run.
- The page sometimes lists the same form twice with different dates. The updater takes the latest date.
- A few forms mentioned on the page are generated through the RTB web portal instead of being published as PDFs under the forms path (RTB-32L and RTB-32P). They are in the catalog with `status: "portal_generated"` and an `official_url` pointing at the portal, and the updater ignores them.

## License

MIT, see [LICENSE](LICENSE). The forms themselves belong to the Province of British Columbia.
