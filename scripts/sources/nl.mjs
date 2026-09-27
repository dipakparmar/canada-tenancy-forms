// Newfoundland and Labrador: the Residential Tenancies Office "Applications and Forms" page on
// gov.nl.ca. Same export shape as bc.mjs: `prefix` and `extract(html)`. The page links every PDF
// directly under gs/files/, mixed into one `entry-content` div alongside an unrelated "Pay
// Online" link and the "Complaint Form Instructions" instruction sheet (skipped: not a form
// itself). Every catalogued PDF prints a "RT-2018-NNNNN" number tied to the Residential
// Tenancies Act, 2018; that printed number is the id (see nl's `dataset.notes` and
// `dataset.id_pattern`). Two PDFs (the condition report and the witness affidavit) print no
// such number and keep a short uppercase slug instead.
export const prefix = 'https://www.gov.nl.ca/gs/files/'

const ENTITIES = { nbsp: ' ', amp: '&', ndash: '-', mdash: '-', rsquo: "'", lsquo: "'", quot: '"', '#39': "'", '#038': '&', '#8211': '-', '#8217': "'" }
// Tags are stripped bare (not replaced with a space): the page's only inline markup is a
// <span> splitting a single word for styling ("D<span>ispute Resolution</span>", "S<span>pe</span>cial"),
// and a space there would wedge itself into the middle of a word.
const text = (html) => html
  .replace(/<[^>]*>/g, '')
  .replace(/&(#\d+|\w+);/g, (m, e) => ENTITIES[e] ?? (e[0] === '#' ? String.fromCharCode(+e.slice(1)) : m))
  .replace(/\s+/g, ' ').trim()

// The PDF filename does not carry the printed RT-2018-NNNNN number, so id assignment cannot be
// parsed from the HTML; each PDF was read by hand (see the nl report) and is keyed here by its
// filename. The two PDFs with no printed form number keep a short uppercase slug instead.
const FORM_ID = {
  'landlord-dispute-resolution.pdf': 'RT-2018-00053',
  'landlord-application-for-substituted-service-dec2013.pdf': 'RT-2018-00055',
  'landlord-application-to-dispose-of-abandoned-property.pdf': 'RT-2018-00046',
  'landlord-application-to-sell-abandoned-property.pdf': 'RT-2018-00048',
  'landlord-application-for-certification.pdf': 'RT-2018-00058',
  'landlord-tenants-application-to-terminate.pdf': 'RT-2018-00056',
  'Complaint-Form.pdf': 'RT-2018-00099',
  'landlord-affidavit-of-service.pdf': 'RT-2018-00057',
  'landlord-authorized-representative.pdf': 'RT-2018-00059',
  'landlord-landlords-notice-of-abandonment.pdf': 'RT-2018-00054',
  'landlord-notice-to-increase-rent-fillable.pdf': 'RT-2018-00050',
  'landlord-landlords-notice-to-terminate-standard.pdf': 'RT-2018-00039',
  'landlord-landlords-notice-to-terminate-early-cause.pdf': 'RT-2018-00040',
  'landlord-notice-tentant-repairs.pdf': 'RT-2018-00051',
  'Landlords-Notice-to-Enter-Premises00063.pdf': 'RT-2018-00063',
  'landlord-condition-report.pdf': 'CONDITION-REPORT',
  'landlord-rental-agreement.pdf': 'RT-2018-00044',
  '5Tenants-Notice-to-Terminate-Standard00045.pdf': 'RT-2018-00045',
  '8Tentants-Notice-to-Terminate-Early-Cause00041.pdf': 'RT-2018-00041',
  'landlord-tenants-notice-to-terminate-early-special.pdf': 'RT-2018-00042',
  'landlord-request-for-repairs.pdf': 'RT-2018-00052',
  'landlord-witness-affidavit.pdf': 'WITNESS-AFFIDAVIT',
}

// Skipped entirely: it is an instruction sheet for the Complaint Form, not a form itself.
const SKIP = new Set(['Complaint-Form-Instructions.pdf'])

// ponytail: the forms live in the page's `entry-content` div under two headed <ul> lists
// ("Applications", "Forms"); everything before that div (menu links to the fee schedule,
// selection criteria, a medical audit) is unrelated site-template content and is excluded by
// only scanning the entry-content div's own markup.
export function extract(html) {
  const body = html.match(/<div class="entry-content">([\s\S]*?)<\/article>/)?.[1] ?? html
  const forms = new Map()
  for (const [, href, inner] of body.matchAll(/<a\b[^>]*href="(https:\/\/www\.gov\.nl\.ca\/gs\/files\/[^"]+\.pdf)"[^>]*>([\s\S]*?)<\/a>/gi)) {
    const file = decodeURIComponent(href.split('/').pop())
    if (SKIP.has(file)) continue
    const id = FORM_ID[file]
    if (!id || forms.has(id)) continue
    const name = text(inner).trim()
    forms.set(id, { id, form_name: name || id, official_url: href, version: null })
  }
  return [...forms.values()]
}
