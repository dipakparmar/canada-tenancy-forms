// Manitoba: the Residential Tenancies Branch landlord forms page on gov.mb.ca. Same export
// shape as bc.mjs and on.mjs: `prefix` and `extract(html)`. The landlord page links more forms
// than the tenant page, including several that also appear (identically) on the tenant page, so
// it is the one catalog.source.index_url points at. Three documents live only on the tenant page
// (part1to8 Form 7, the military relocation certificate, and the deposit information sheet); their
// official_url still sits under `prefix`, so the updater reports them "not linked from the index
// page" rather than touching them, the same pattern documented in detect-source-changes.mjs for a
// few BC forms.
//
// The forms are Word documents (.doc/.docx) and a couple of flattened PDFs under
// https://www.gov.mb.ca/cca/rtb/forms/. Two schedules to the Residential Tenancies Regulation each
// number their own forms: Parts 1 to 8 (the general schedule, `../forms/part1to8/formN.doc`) and
// Part 9 (the rent regulation schedule, `../forms/part9/formN.doc`). Both schedules have a Form 2,
// 3, 4, 8 and 9, so a Part 9 form's catalog id is prefixed `P9-`; a Parts 1-8 form keeps the bare
// official number. A handful of documents on the page carry no form number at all (the habitually
// late letter, the substitutional service application, the request to correct or amend an order,
// the military relocation certificate, the deposit information sheet); each gets a short uppercase
// slug id instead, since it still has a stable file URL worth tracking.
export const prefix = 'https://www.gov.mb.ca/cca/rtb/forms/'

const ENTITIES = { nbsp: ' ', amp: '&', ndash: '-', mdash: '-', rsquo: "'", lsquo: "'", quot: '"', '#39': "'", '#8211': '-', '#8217': "'" }
const text = (html) => html
  .replace(/<[^>]*>/g, ' ')
  .replace(/&(#\d+|\w+);/g, (m, e) => ENTITIES[e] ?? (e[0] === '#' ? String.fromCharCode(+e.slice(1)) : m))
  .replace(/\s+/g, ' ').trim()

// part1to8/form1.doc -> 1, part1to8/form1.1.doc -> 1.1, part1to8/form11a.doc -> 11A,
// part9/form1a.doc -> P9-1A, part9/form5a.docx -> P9-5A. The handful of unnumbered documents are named explicitly.
const SLUGS = {
  'requesttocorrectoramendanorder.doc': 'CORRECT-ORDER',
  'deposit_information_sheet.pdf': 'DEPOSIT-INFO',
  'part1to8/hablate.doc': 'HABLATE',
  'part1to8/appforsub_svc_wpg.doc': 'SUBSVC',
  'part1to8/military_termination_certificate.pdf': 'MIL-CERT',
}
export const idFromFile = (relPath) => {
  const path = relPath.toLowerCase()
  if (SLUGS[path]) return SLUGS[path]
  const m = path.match(/^(part1to8|part9)\/form(\d+)(?:\.(\d+))?([a-z]?)\.docx?$/)
  if (!m) return null
  const [, part, num, sub, letter] = m
  const id = `${num}${sub ? '.' + sub : ''}${letter.toUpperCase()}`
  return part === 'part9' ? `P9-${id}` : id
}

// ponytail: regex over the rendered HTML, not a DOM parser. Every form link on this page names the
// form and its number inside the anchor text itself ("Standard Residential Tenancy Agreement (Form
// 1)"), unlike BC where the number sits outside the link, so there is no separate name-vs-number pass.
// The page prints no version dates for these forms; version stays null (some documents print their
// own revision date in the body text, which is read by hand, not by this extractor).
export function extract(html) {
  const forms = new Map()
  for (const [, href, inner] of html.matchAll(/<a\b[^>]*href="([^"]*\/forms\/[^"]+\.(?:docx?|pdf))"[^>]*>([\s\S]*?)<\/a>/gi)) {
    const relPath = decodeURIComponent(href.split('/forms/').pop())
    const id = idFromFile(relPath)
    if (!id || forms.has(id)) continue
    const name = text(inner).replace(/\s*\(Form\s+[\w.]+\)?\s*$/i, '').replace(/[\s.,:;-]+$/, '').trim()
    forms.set(id, { id, form_name: name || id, official_url: prefix + relPath, version: null })
  }
  return [...forms.values()]
}
