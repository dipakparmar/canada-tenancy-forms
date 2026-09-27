// Nova Scotia: the residential tenancy forms index page on novascotia.ca. Unlike bc.mjs and
// on.mjs, the index page does not link the PDFs directly: each row links a landing page, and
// the landing page links the PDF. `extract` is therefore async (the only source module that
// needs to be) and fetches each landing page in turn, with a short delay between requests;
// the one call site in detect-source-changes.mjs awaits it. bc.mjs and on.mjs stay synchronous
// and still work under `await`.
export const prefix = 'https://www.novascotia.ca/sites/default/files/documents/'

const NS_BASE = 'https://www.novascotia.ca'
const ENTITIES = { nbsp: ' ', amp: '&', ndash: '-', mdash: '-', rsquo: "'", lsquo: "'", quot: '"', '#39': "'", '#038': '&', '#8211': '-', '#8217': "'" }
const decode = (s) => s.replace(/&(#\d+|\w+);/g, (m, e) => ENTITIES[e] ?? (e[0] === '#' ? String.fromCharCode(+e.slice(1)) : m))
const sleep = (ms) => new Promise((r) => setTimeout(r, ms))

// None of the landing pages or PDFs in this dataset print a "last updated" line or a footer
// revision stamp (checked by hand across every form, including a full text extraction of
// every PDF); there is no `version()` export here because there is nothing to read it from.

// The index page links a landing page per form (e.g. "/landlords-notice-quit-failure-pay-rent-form-d"),
// never the PDF. Each landing page's own download link usually reads "Form D: Landlord's
// Notice to Quit for Rental Arrears (PDF 377 kB)", or, for a page covering two forms in one
// PDF, "Form G: ... and Form H: ... (PDF 272 kB)". One page (Form R) links its PDF with no
// form letter at all ("Security Deposit Claim Form (PDF 202 kB)"); its id comes instead from
// the index page's own anchor text, which every row prints as "<name> (Form <ID>)". A page
// with no form letter in either place (the Rental Unit Condition Report, the email-service
// consent form) is skipped: it has no stable id to catalogue under.
export async function extract(html) {
  const found = new Map()
  const seen = new Set()
  for (const [, href, indexText] of html.matchAll(/<a href="(\/[a-z0-9-]+)" hreflang="en">([^<]*)<\/a>/g)) {
    if (seen.has(href)) continue
    seen.add(href)
    const res = await fetch(NS_BASE + href)
    if (!res.ok) continue
    const page = await res.text()
    const link = page.match(/<a href="(\/sites\/default\/files\/documents\/[^"]*\.pdf)"[^>]*>([\s\S]{0,400}?)<\/a>/)
    await sleep(150)
    if (!link) continue
    const [, path, rawText] = link
    const text = decode(rawText.replace(/\s+/g, ' ').trim()).replace(/\s*\(PDF[^)]*\)\s*$/i, '')
    // one or two "Form <ID>: <name>" segments joined by "and Form <ID>:"
    let forms = [...text.matchAll(/Form\s+([A-Z]{1,2}[0-9]{0,2}):\s*([\s\S]*?)(?=\s+and\s+Form\s+[A-Z]{1,2}[0-9]{0,2}:|$)/g)]
    if (!forms.length) {
      // fall back to the index page's own "<name> (Form <ID>)" anchor text
      const m = decode(indexText).match(/^([\s\S]*?)\s*\(Form\s+([A-Z]{1,2}[0-9]{0,2})\)\s*$/)
      if (m) forms = [[null, m[2], m[1]]]
    }
    if (!forms.length) continue // no form letter anywhere for this page: not catalogued
    const url = prefix + path.slice('/sites/default/files/documents/'.length).split('/').map(encodeURIComponent).join('/')
    for (const [, id, name] of forms) if (!found.has(id)) found.set(id, { id, form_name: name.trim(), official_url: url, version: null })
  }
  return [...found.values()]
}
