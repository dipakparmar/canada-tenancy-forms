// Fetch the RTB forms index, diff it against data/, optionally write source-controlled fields.
// Usage: node scripts/detect-source-changes.mjs [--write] [--summary <path>]
// Exit: 0 no changes (or written), 2 changes found without --write, 1 error.
import { createHash } from 'node:crypto'
import { readFileSync, writeFileSync, appendFileSync } from 'node:fs'

const DATA = new URL('../data/bc-rtb-forms.json', import.meta.url)
const SNAPS = new URL('../snapshots/', import.meta.url)
const PREFIX = 'https://www2.gov.bc.ca/assets/gov/housing-and-tenancy/residential-tenancies/forms/'
const MONTHS = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December']
const NEW_RECORD = {
  category: 'unclassified', matter_type: 'unclassified', initiating_party: 'other', parties: [],
  property_manager_role: 'unreviewed', use_when: 'Needs human classification.', related_forms: [],
}

const args = process.argv.slice(2)
const write = args.includes('--write')
const summaryPath = args.includes('--summary') ? args[args.indexOf('--summary') + 1] : null
const today = new Date().toISOString().slice(0, 10)

const ENTITIES = { nbsp: ' ', amp: '&', ndash: '-', mdash: '-', rsquo: "'", lsquo: "'", quot: '"', '#39': "'" }
const text = (html) => html
  .replace(/<[^>]*>/g, ' ')
  .replace(/&(#\d+|\w+);/g, (m, e) => ENTITIES[e] ?? (e[0] === '#' ? String.fromCharCode(+e.slice(1)) : m))
  .replace(/[\s​]+/g, ' ').trim()

// rtb12lct.pdf -> RTB-12L-CT, rtb53-p1d.pdf -> RTB-53-P1D, rtb-53-p3.pdf -> RTB-53-P3, rtb11a.pdf -> RTB-11A
export const idFromFile = (file) => {
  const m = file.toLowerCase().match(/^rtb-?(\d+)([a-z]?)(?:-?([a-z0-9-]+))?\.pdf$/)
  return m && `RTB-${m[1]}${m[2]}${m[3] ? '-' + m[3] : ''}`.toUpperCase()
}

// ponytail: regex over the rendered HTML, not a DOM parser; breaks if the page stops using absolute hrefs.
// Version is the latest "Month YYYY" printed right after any link to the form (the page lists some forms twice with different dates).
export function extract(html) {
  const forms = new Map()
  const re = /<a\b[^>]*href="([^"]+)"[^>]*>([\s\S]*?)<\/a>(?=([\s\S]{0,400}))/g
  for (const [, href, inner, tail] of html.matchAll(re)) {
    if (!href.startsWith(PREFIX)) continue
    const id = idFromFile(href.slice(PREFIX.length))
    if (!id) continue
    const f = forms.get(id) ?? { id, official_url: href, form_name: null, version: null }
    forms.set(id, f)
    const name = text(inner).replace(/\(PDF[^)]*\)/gi, '').replace(/\bRTB-[\w-]+\s*$/, '').replace(/[\s.,:;-]+$/, '').trim()
    if (name.length <= 3 || /^RTB-/i.test(name)) continue // inline "RTB-53-P1D" mentions and "(PDF, 1MB)" fragments
    // The named listing link wins: inline mentions sometimes point at a dead variant filename (seen: rtb53-p3d vs rtb-53-p3d).
    if (!f.form_name) Object.assign(f, { form_name: name, official_url: href })
    const d = text(tail.split('</p>')[0]).match(new RegExp(`(${MONTHS.join('|')})\\s+(\\d{4})`))
    if (d && (!f.version || +d[2] * 12 + MONTHS.indexOf(d[1]) > f.version.n)) f.version = { s: `${d[1]} ${d[2]}`, n: +d[2] * 12 + MONTHS.indexOf(d[1]) }
  }
  return [...forms.values()].map((f) => ({ ...f, form_name: f.form_name ?? f.id, version: f.version?.s ?? null }))
}

async function main() {
  const catalog = JSON.parse(readFileSync(DATA, 'utf8'))
  const res = await fetch(catalog.source.index_url)
  if (!res.ok) throw new Error(`index fetch failed: HTTP ${res.status}`)
  const html = await res.text()
  const found = extract(html)
  // ponytail: the updater only owns records whose official_url is a PDF under the forms directory.
  // Portal-generated and specialized records (and anything pointing elsewhere) are left alone entirely:
  // they never appear on the index page, so diffing them would mark them historical every week.
  const managed = catalog.forms.filter((f) => f.official_url.startsWith(PREFIX) && f.status !== 'historical_or_replaced')
  // Guard against a broken page or parser marking the whole catalog historical.
  if (found.length < managed.length / 2) throw new Error(`only ${found.length} forms found vs ${managed.length} managed; refusing to diff`)

  const byId = new Map(catalog.forms.map((f) => [f.id, f]))
  const seen = new Set(found.map((f) => f.id))
  const lines = []
  for (const s of found) {
    const r = byId.get(s.id)
    if (!r) {
      lines.push(`- **added** \`${s.id}\` ${s.form_name} (human fields need classification)`)
      const { category, matter_type, ...rest } = NEW_RECORD
      catalog.forms.push({ id: s.id, form_name: s.form_name, status: 'active', category, matter_type, current_version: s.version,
        official_url: s.official_url, official_index_url: catalog.source.index_url, ...rest, last_verified: today })
      continue
    }
    // ponytail: only a retired record comes back; `specialized` and `portal_generated` are human calls the updater keeps.
    if (r.status === 'historical_or_replaced') { lines.push(`- **reappeared** \`${s.id}\` set back to active`); r.status = 'active' }
    if (r.form_name !== s.form_name) { lines.push(`- **renamed** \`${s.id}\`: "${r.form_name}" -> "${s.form_name}"`); r.form_name = s.form_name }
    if (r.official_url !== s.official_url) { lines.push(`- **url changed** \`${s.id}\`: ${r.official_url} -> ${s.official_url}`); r.official_url = s.official_url }
    if (s.version && r.current_version !== s.version) { lines.push(`- **version changed** \`${s.id}\`: ${r.current_version} -> ${s.version}`); r.current_version = s.version }
  }
  // ponytail: a managed record missing from the index page is reported, never auto-retired. Several
  // catalogued forms (RTB-10, RTB-28, RTB-44) have live forms-directory PDFs but no link on the index
  // page, so "absent" does not mean "gone"; check-links is what catches a URL that actually died.
  const absent = managed.filter((r) => !seen.has(r.id))
  const note = absent.length ? `\nNot linked from the index page (informational, status unchanged): ${absent.map((r) => `\`${r.id}\``).join(', ')}\n` : ''

  const summary = lines.length
    ? `## RTB forms source changes\n\nSource: ${catalog.source.index_url}\n\n${lines.join('\n')}\n${note}\nA source change needs human review before merge: check each form PDF and fix any human-maintained fields.\n`
    : `## RTB forms source changes\n\nNo changes (${found.length} forms on the index page).\n${note}`
  console.log(summary)
  if (summaryPath) appendFileSync(summaryPath, summary)
  if (!write) return lines.length ? 2 : 0

  // ponytail: no HTML snapshot on purpose, Province copyright forbids redistributing the page; hash plus our own extracted inventory is enough for change detection
  // latest.json and data/bc-rtb-forms.json (below) are only written when the extracted forms actually
  // changed, since the page bytes differ on every fetch regardless.
  const sha256 = createHash('sha256').update(html).digest('hex')
  if (!lines.length) return 0

  const inventory = found.map((f) => ({ id: f.id, form_name: f.form_name, official_url: f.official_url })).sort((a, b) => a.id.localeCompare(b.id, 'en', { numeric: true }))
  writeFileSync(new URL('latest.json', SNAPS), JSON.stringify({ fetched_at: today, index_url: catalog.source.index_url, sha256, forms: inventory }, null, 2) + '\n')

  for (const r of catalog.forms) if (seen.has(r.id)) r.last_verified = today
  catalog.forms.sort((a, b) => a.id.localeCompare(b.id, 'en', { numeric: true }))
  catalog.generated_at = today
  catalog.source.snapshot_sha256 = sha256
  writeFileSync(DATA, JSON.stringify(catalog, null, 2) + '\n')
  return 0
}

if (import.meta.url === `file://${process.argv[1]}`) {
  main().then((code) => process.exit(code), (err) => { console.error(err.message); process.exit(1) })
}
