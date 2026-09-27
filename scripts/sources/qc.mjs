// Quebec: the Tribunal administratif du logement (TAL) forms page on tal.gouv.qc.ca. Unlike
// bc.mjs and on.mjs, the index page (/en/forms) does not link the PDFs directly: each
// application form sits behind its own landing page under /en/application-forms-to-court/,
// and the notices sit three hops away (/en/forms-and-notices -> /en/models-of-notices ->
// /en/models-of-notices/find-a-notice-model). `extract` is therefore async, like ns.mjs, and
// fetches every landing page in turn with a short delay between requests; the one call site
// in detect-source-changes.mjs awaits it.
import { PDF } from '@libpdf/core'

export const prefix = 'https://www.tal.gouv.qc.ca/sites/default/files/'

const BASE = 'https://www.tal.gouv.qc.ca'
const sleep = (ms) => new Promise((r) => setTimeout(r, ms))
const ENTITIES = { nbsp: ' ', amp: '&', ndash: '-', mdash: '-', rsquo: "'", lsquo: "'", quot: '"', '#39': "'", '#038': '&', '#8211': '-', '#8217': "'" }
const decode = (s) => s.replace(/&(#\d+|\w+);/g, (m, e) => ENTITIES[e] ?? (e[0] === '#' ? String.fromCharCode(+e.slice(1)) : m))

// Every printed form carries a footer stamp read as "Tribunal administratif du logement
// TAL-NNNA-E (YYYY-MM) / DAJ" (the notice forms) or a bare "TAL-NNNA-E (YYYY-MM) / DAJ" line
// (the application forms); the co-ownership notices print "AV-NNN (YYYY-MM) / DAJ" instead.
// The lease-adjustment appendices and the RN (rent-fixing) form print no such stamp.
export async function version(bytes) {
  const pdf = await PDF.load(bytes)
  let text = ''
  for (const p of pdf.getPages()) text += (await p.extractText()).text + '\n'
  const m = text.match(/\b(?:TAL|AV)-\d{3}A?(?:-[A-Z])?\s*\((\d{4})-(\d{2})\)/)
  return m ? `${m[1]}-${m[2]}` : null
}

// Most PDFs are named "TAL_NNNA_E.pdf" or "AV_NNN.pdf"; the id drops the language/variant
// suffix letter to match the footer stamp with its own hyphens ("TAL-072A", "AV-041"). The
// lease-adjustment appendices keep their own descriptive filenames and have no such stamp, so
// they are matched by name instead and given a short slug id (documented in dataset.notes).
const ADJUSTMENT_IDS = {
  'adjustment-lease-logement': 'ADJ-LOGEMENT',
  'adjustment-lease-loyer-modique': 'ADJ-LOYER-MODIQUE',
  'adjustment-lease-coop': 'ADJ-COOP',
  'adjustment-lease-études': 'ADJ-ETUDES',
  'adjustment-lease-maison-mobile': 'ADJ-MAISON-MOBILE',
  'adjustment-lease-verbal': 'ADJ-VERBAL',
}
const idFromFile = (file) => {
  const base = decodeURIComponent(file).replace(/\.(pdf|docx?)$/i, '')
  if (ADJUSTMENT_IDS[base]) return ADJUSTMENT_IDS[base]
  const m = base.match(/^(TAL|AV)[_-](\d{3}A?)(?:[_-][A-Z])?$/i)
  return m ? `${m[1].toUpperCase()}-${m[2].toUpperCase()}` : null
}

// A landing page's primary download is the one link styled as an <h2> heading with the
// icon-pdf span, e.g. "<h2><a href=\"...\"><span class=icon-pdf></span>Label</a></h2>"; a
// page that also cross-references another form's PDF in its body text (the appendix for
// additional information links back to the Application form) keeps only this first one.
const LANDING_PDF = /<h2><a[^>]*href="(\/sites\/default\/files\/[^"]+\.(?:pdf|docx?))"[^>]*>\s*<span aria-hidden="true" class="icon icon-pdf">[^<]*<\/span>\s*([^<]+)<\/a><\/h2>/

async function fetchLandingPdf(href) {
  const res = await fetch(BASE + href)
  if (!res.ok) return null
  const page = await res.text()
  const m = page.match(LANDING_PDF)
  if (!m) return null
  return { path: m[1], label: decode(m[2]).replace(/\s+/g, ' ').trim() }
}

// The notices list groups its PDFs under <h3 class="title -third"> headings ("Notice of
// termination of a lease", ...); four of its entries print only the reason as their own link
// text ("because of spousal violence...", "due to a disability", ...) with the rest of the
// name living in the group heading, so a label starting with one of those words is prefixed
// with the last heading seen.
const NOTICE_TOKEN = /(<h3 class="title -third">([^<]*)<\/h3>|<a href="(\/sites\/default\/files\/[^"]+\.pdf)"[^>]*>\s*<span class="-visually-hidden">[^<]*<\/span>\s*([^<]+)<\/a>)/g

async function fetchNotices(found) {
  const res = await fetch(BASE + '/en/models-of-notices/find-a-notice-model')
  if (!res.ok) return
  const page = await res.text()
  let heading = ''
  for (const [, , h, path, rawLabel] of page.matchAll(NOTICE_TOKEN)) {
    if (h !== undefined) { heading = decode(h).trim(); continue }
    const id = idFromFile(path.split('/').pop())
    if (!id || found.has(id)) continue
    let label = decode(rawLabel).replace(/\s+/g, ' ').trim()
    if (/^(because|due to)\b/i.test(label)) label = `${heading} ${label}`
    found.set(id, { id, form_name: label, official_url: BASE + path, version: null })
  }
}

export async function extract(html) {
  const found = new Map()
  const landingHrefs = new Set(
    [...html.matchAll(/href="(\/en\/application-forms-to-court\/[^"]+)"/g)].map((m) => m[1]),
  )
  for (const href of landingHrefs) {
    const landing = await fetchLandingPdf(href)
    await sleep(150)
    if (!landing) continue
    const id = idFromFile(landing.path.split('/').pop())
    if (!id || found.has(id)) continue
    found.set(id, { id, form_name: landing.label, official_url: BASE + landing.path, version: null })
  }
  await fetchNotices(found)
  return [...found.values()]
}
