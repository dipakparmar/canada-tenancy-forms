// Northwest Territories: the NWT Rental Office page on justice.gov.nt.ca. The page embeds a
// "Documents and Forms" file browser widget that lists every PDF directly (folder and file
// nodes share one markup shape, `<a class="gn-filebrowse-node-label" ...>`; only file nodes
// carry an `href`), so `extract` is synchronous like bc.mjs and on.mjs.
export const prefix = 'https://www.justice.gov.nt.ca/en/files/rental-agreements/'

const MONTHS = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December']

// None of these PDFs print a form number the way New Brunswick's or Ontario's do, except five
// (checked by hand against each PDF's own extracted text): "RTA Approved Form 2" (Report of
// Sale), "RTA Approved Form 3" (Inventory), "RTA Approved Form 4" (Assignment Agreement), "RTA
// Approved Form 5" (Subletting Agreement) and "RTA Approved Form 6" (Inspection Form). Those
// five keep that bare number as their id. Every other form here (the Tenancy Agreement, the
// Report of Return / Request to Dispose, and the two Application to a Rental Officer forms)
// prints no form number anywhere in its text, so its id is a short uppercase slug from the
// filename instead.
//
// "Abandoned Personal Property EN.pdf" and "Report of Sale of Abandoned Personal Property.pdf"
// are byte-identical (same sha256): the Abandoned Property folder lists Form 2 under both
// names. Both map to id "2"; PREFERRED_DUPLICATE below makes extract() keep the more
// descriptive filename's URL rather than whichever happens to be listed first.
const ID_BY_FILE = {
  'Abandoned Personal Property EN.pdf': '2',
  'Inventory - Abandoned Property EN.pdf': '3',
  'Report of Return or Request to Dispose.pdf': 'ABANDONED-PROPERTY-RETURN-OR-DISPOSE',
  'Report of Sale of Abandoned Personal Property.pdf': '2',
  'Tenancy Agreement - Residential Tenancies Act.pdf': 'TENANCY-AGREEMENT',
  'Assignment Agreement - June 2019.pdf': '4',
  'Subletting Agreement EN.pdf': '5',
  'Inspection Form EN.pdf': '6',
  'Form - Application to a Rental Officer - Landlord.pdf': 'APPLICATION-LANDLORD',
  'Form - Application to a Rental Officer - Tenant.pdf': 'APPLICATION-TENANT',
}
const PREFERRED_DUPLICATE = { 2: 'Report of Sale of Abandoned Personal Property.pdf' }

// "Abandoned Personal Property EN.pdf" -> "Abandoned Personal Property"; a leading "Form - "
// (the two Application PDFs) and a trailing "- <Month> <Year>" (the Assignment Agreement's own
// filename date, which becomes its `version` instead, see below) are both stripped.
const nameFromFile = (file) => file.replace(/\.pdf$/i, '')
  .replace(/^Form\s*-\s*/i, '')
  .replace(/\s+(EN|FR)$/i, '')
  .replace(new RegExp(`\\s*-\\s*(${MONTHS.join('|')})\\s+\\d{4}$`, 'i'), '')
  .trim()

// A date in the filename itself (not the file browser's "Modified Date", which is server
// metadata, not a print date) is a version at month precision. Only the Assignment Agreement
// carries one today; the pattern is generic so a future renamed file picks it up too.
const versionFromFile = (file) => {
  const m = file.match(new RegExp(`-\\s*(${MONTHS.join('|')})\\s+(\\d{4})\\.pdf$`, 'i'))
  if (!m) return null
  const mi = MONTHS.findIndex((x) => x.toLowerCase() === m[1].toLowerCase())
  return `${m[2]}-${String(mi + 1).padStart(2, '0')}`
}

// One <a> per file node; folder nodes use the same class but carry no href.
export function extract(html) {
  const forms = new Map()
  for (const [, href, label] of html.matchAll(/<a class="gn-filebrowse-node-label" href="([^"]+)" title="Title">\s*([^<]+?)\s*<\/a>/g)) {
    if (!href.startsWith(prefix)) continue
    const file = decodeURIComponent(href.split('/').pop())
    const id = ID_BY_FILE[file]
    if (!id) continue
    const preferred = PREFERRED_DUPLICATE[id]
    if (forms.has(id) && preferred && preferred !== file) continue
    forms.set(id, { id, form_name: nameFromFile(file) || label.trim(), official_url: href, version: versionFromFile(file) })
  }
  return [...forms.values()]
}
