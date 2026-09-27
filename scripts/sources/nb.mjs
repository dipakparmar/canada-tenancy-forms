// New Brunswick: the Tenant and Landlord Relations Office forms page on gnb.ca, hosted by
// Service New Brunswick. The page links roughly two dozen PDFs directly, on two different
// hosts (`prefix` is an array here; every other jurisdiction's is a single string, and
// detect-source-changes.mjs accepts either). Same export shape otherwise: `prefix` and
// `extract(html)`.
export const prefix = ['https://www.pxw1.snb.ca/snb7001/', 'https://www2.snb.ca/content/dam/snb/']

const ENTITIES = { nbsp: ' ', amp: '&', ndash: '-', mdash: '-', rsquo: "'", lsquo: "'", quot: '"', '#39': "'", '#038': '&', '#8211': '-', '#8217': "'" }
const text = (html) => html
  .replace(/<[^>]*>/g, ' ')
  .replace(/&(#\d+|\w+);/g, (m, e) => ENTITIES[e] ?? (e[0] === '#' ? String.fromCharCode(+e.slice(1)) : m))
  .replace(/\s+/g, ' ').trim()

// Most of these PDFs are named "CSS-FOL-[SNB-]<catalogue-number><E|B>.pdf" (E English, B
// bilingual); the catalogue number (e.g. "45-0065", "SN-7021") is what the id becomes, unless
// the PDF itself prints a regulation form number, checked by hand against each PDF's own text
// (see FORM_NUMBER below). "Form10.pdf" and "RAForm_E.pdf" fall outside that naming scheme and
// are matched separately.
const idFromFile = (file) => {
  if (/^Form(\d+)\.pdf$/i.test(file)) return file.match(/^Form(\d+)\.pdf$/i)[1]
  if (/^RAForm_[A-Z]\.pdf$/i.test(file)) return 'RA'
  const m = file.match(/^CSS-FOL-(?:SNB-)?(.+)[EB]\.pdf$/i)
  return m ? m[1].toUpperCase() : null
}

// Five of the catalogued PDFs print a regulation form number ("FORM 6 STANDARD FORM OF
// LEASE", "FORM 3", "FORM 5", "FORM 7", "FORM 8") that does not appear anywhere in the page's
// link text and so cannot be parsed from the HTML; each was read by hand and is keyed here by
// its catalogue number. Every other form keeps its catalogue number as the id.
const FORM_NUMBER = { '45-0065': '6', '45-3628': '3', '45-3630': '5', '45-3631': '7', '45-3632': '8' }

// The two "Form N -" / "Form N –" link texts that do print a number are stripped the same way
// on.mjs strips "N4 - " from its own link text, so the catalogued name matches either way.
const stripFormPrefix = (name) => name.replace(/^Form\s+\d+\s*[-–:]\s*/i, '')

// ponytail: one <a> per form, its link text reading "<name> (PDF NNN KB)"; the page prints no
// version dates or footer stamps in the surrounding text, so version stays null (the standard
// lease's own footer stamp was read by hand into maps/nb/6.map.json instead: see its
// `revision_printed: false`).
export function extract(html) {
  const forms = new Map()
  for (const [, href, inner] of html.matchAll(/<a\b[^>]*href="(https:\/\/www\.pxw1\.snb\.ca\/[^"]+\.pdf|https:\/\/www2\.snb\.ca\/[^"]+\.pdf)"[^>]*>([^<]*)<\/a>/gi)) {
    const file = decodeURIComponent(href.split('/').pop())
    const catalogueId = idFromFile(file)
    if (!catalogueId) continue
    const id = FORM_NUMBER[catalogueId] ?? catalogueId
    if (forms.has(id)) continue
    const name = stripFormPrefix(text(inner)).replace(/\s*\(PDF[^)]*\)\s*$/i, '').trim()
    forms.set(id, { id, form_name: name || id, official_url: href, version: null })
  }
  return [...forms.values()]
}
