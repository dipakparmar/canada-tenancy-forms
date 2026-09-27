// Saskatchewan: the Office of Residential Tenancies (ORT) forms published through the
// Government of Saskatchewan's Queen's Printer publications catalogue, publications.saskatchewan.ca.
// The human-facing category page (https://publications.saskatchewan.ca/#/categories/5415) renders
// client-side and links nothing directly, so `catalog.source.index_url` is the catalogue's own
// JSON API instead: https://publications.saskatchewan.ca/api/v1/categories/5415/products?limit=100
// It returns a plain JSON array of product objects, each carrying one or more `productFormats`;
// `extract` parses that JSON (there is no HTML to strip) rather than the response text of an HTML page.
import { PDF } from '@libpdf/core'

export const prefix = 'https://publications.saskatchewan.ca/api/v1/products/'

// Almost every PDF prints "<Month> <Year> <Form name>" as the last line of its last page; that
// stamp is the version. Schedule 1 (the statutory standard conditions, id SCHEDULE-1) prints no
// such stamp anywhere in its nine pages (checked by hand across the full extracted text) and is
// given a version straight from the catalogue's own `productPublicationDate` in extract() below,
// since that field is presented as the publication date of the document rather than of a format.
const MONTHS = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December']
export async function version(bytes) {
  const pdf = await PDF.load(bytes)
  let text = ''
  for (const p of pdf.getPages()) text += (await p.extractText()).text + '\n'
  const matches = [...text.matchAll(new RegExp(`\\b(${MONTHS.join('|')})\\s+(\\d{4})\\b`, 'g'))]
  if (!matches.length) return null
  const [, month, year] = matches[matches.length - 1]
  return `${year}-${String(MONTHS.indexOf(month) + 1).padStart(2, '0')}`
}

// A product whose name carries the ORT's own regulation form number ("Form 11 - Request to
// Correct...") gets that bare number as its id; every other product gets a short uppercase slug
// hand-derived from its name, since none of the other seventeen names carry a second,
// machine-parseable form number the way New Brunswick's do.
const ID_BY_PRODUCT = {
  23744: '11',
  119951: 'CERTIFICATE-OF-SERVICE',
  23732: 'IMMEDIATE-NOTICE-VACATE-ARREARS',
  24003: 'NOTICE-OF-ENTRY',
  120571: 'NOTICE-CLAIM-SECURITY-DEPOSIT',
  23730: 'NOTICE-RENT-INCREASE',
  73472: 'NOTICE-RENT-INCREASE-ASSOCIATION',
  24004: 'NOTICE-UTILITY-ARREARS',
  23731: 'NOTICE-TERMINATE-PERIODIC-TENANCY',
  73766: 'NOTICE-VACATE-EARLY-CAUSE',
  23733: 'NOTICE-VACATE-CAUSE',
  24005: 'NOTICE-VACATE-EMPLOYEE',
  73763: 'NOTICE-VACATE-HOUSING-PROGRAM',
  23734: 'NOTICE-VACATE-OWNER-OCCUPY',
  73761: 'NOTICE-VACATE-PURCHASER-OCCUPY',
  73762: 'NOTICE-VACATE-SPECIFIED-USES',
  23727: 'SCHEDULE-1',
  73221: 'TERM-LEASE-NOTICE-INTENTION',
}

// ponytail: extract() takes the JSON response body as a string (the "index" here is an API
// response, not an HTML page) and parses it directly. Every product in this category carries a
// downloadable English PDF format, so none needs a portal_generated fallback.
export function extract(json) {
  const products = JSON.parse(json)
  const forms = []
  for (const p of products) {
    const id = ID_BY_PRODUCT[p.productId]
    if (!id) continue
    const fmt = (p.productFormats || []).find((f) => f.language === 'English' || f.language == null)
    if (!fmt) continue
    const official_url = `${prefix}${p.productId}/formats/${fmt.productFormatId}/download`
    const form_name = p.name.replace(/^Form\s+\d+\s*[-–:]\s*/i, '').trim()
    const version = id === 'SCHEDULE-1' && p.productPublicationDate ? p.productPublicationDate : null
    forms.push({ id, form_name, official_url, version })
  }
  return forms
}
