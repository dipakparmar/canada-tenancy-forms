```
Status:        in-progress
Last verified: 2026-09-21 — scripts run locally against the live index page
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
      "related_forms": ["RTB-22", "RTB-27", "RTB-26"],
      "last_verified": "2026-09-22"
    }
  ]
}
```

Rules worth knowing:

- `id` is the RTB form number (`RTB-1`, `RTB-12L-DR`, `RTB-53-P1D`), never a PDF filename. Filenames change; ids do not.
- `status` is `active` or `historical_or_replaced`. Records are never deleted. A form that disappears from the index page is marked `historical_or_replaced` so anything referencing its id keeps working.
- `current_version` is the "Month YYYY" date printed next to the link on the index page, or `null` when none is shown.
- `initiating_party` and `parties` use `landlord`, `tenant`, `either`, `rtb` or `other`.
- `related_forms` must reference ids that exist in the catalog.
- `category`, `matter_type` and `property_manager_role` are lowercase slugs. `property_manager_role` is one of `may_prepare_and_sign_as_authorized_agent`, `receives_as_landlord_agent`, `not_applicable` or `unreviewed` today.
- `legal_effect` is an optional free-text field for human notes.

### Who owns which field

| Owner | Fields |
|---|---|
| Source (the updater may overwrite) | `form_name`, `official_url`, `status`, `current_version`, `last_verified` |
| Humans (the updater never touches) | `category`, `matter_type`, `initiating_party`, `parties`, `property_manager_role`, `use_when`, `related_forms`, `legal_effect` |

A form that shows up on the page for the first time is added with placeholder human fields (`category: "unclassified"`, `property_manager_role: "unreviewed"`, `use_when: "Needs human classification."`). Fill them in on the PR before merging.

## How updates work

`scripts/detect-source-changes.mjs` fetches the index page, pulls out every link under `https://www2.gov.bc.ca/assets/gov/housing-and-tenancy/residential-tenancies/forms/`, derives the id from the filename (`rtb12lct.pdf` becomes `RTB-12L-CT`), and compares the result with the catalog. It reports added, removed, renamed, re-appeared, URL-changed and version-changed forms as a markdown list.

- Without `--write` it only prints the diff. Exit code 0 means nothing changed, 2 means something did.
- With `--write` it applies the source-owned fields, saves the page to `snapshots/tenancy-forms.<date>.html` (replacing the previous snapshot), and records its sha256.
- It writes nothing when the forms are unchanged. The page HTML differs byte-for-byte on every fetch, so a snapshot-only commit would open a pointless PR every week.
- It refuses to run the diff if it finds fewer than half as many forms as the catalog has active, so a broken page or a markup change cannot mark the whole catalog historical.

The weekly workflow (`.github/workflows/update-rtb-forms.yml`, Mondays 15:00 UTC, also runnable by hand) runs the updater, validates, and if anything changed force-pushes a commit to the fixed branch `chore/rtb-forms-update` and opens or updates one PR titled `chore(data): sync RTB forms from official source`, with the diff summary as its body.

**A source change always needs human review.** The updater can tell you a link moved or a date changed. It cannot tell you whether the new PDF changed its legal meaning, whether a replaced form has a successor, or whether a related-forms list is still right. Open the PDFs before merging.

## Recommended repository settings

- Protect `main`: require a pull request, at least one approving review, and the `CI / check` status check.
- Allow GitHub Actions to create pull requests (Settings, Actions, General, Workflow permissions). The updater needs this.
- PRs opened with the built-in `GITHUB_TOKEN` do not trigger other workflows, so CI will not start on the updater PR by itself. Close and reopen it, or push an empty commit to the branch, to get the required check to run.
- Keep the fixed updater branch unprotected so the workflow can force-push it.

## Local commands

Node 22 or newer. The only dependency is `ajv` for schema validation.

```sh
npm ci
npm run validate        # schema + unique ids + related_forms references
npm run check-links     # HEAD every official_url and the index page (GET with Range if HEAD is refused)
npm run update:check    # print the source diff; exit 2 if anything changed
npm run update:sources  # apply source-owned changes and refresh the snapshot
```

Pass `--summary <path>` to the detect script (for example `npm run update:check -- --summary out.md`) to also append the markdown summary to a file.

## Known limits

- Extraction is a regular expression over the rendered HTML, not a DOM parser. If the page stops using absolute `https://www2.gov.bc.ca/assets/...` links, the updater will find nothing and refuse to run.
- The page sometimes lists the same form twice with different dates. The updater takes the latest date.
- A few forms mentioned on the page are generated through the RTB web portal instead of being published as PDFs under the forms path (for example RTB-32L and RTB-32P). They are not in the catalog.

## License

MIT, see [LICENSE](LICENSE). The forms themselves belong to the Province of British Columbia.
