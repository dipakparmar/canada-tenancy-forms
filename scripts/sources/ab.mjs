// Alberta: the RTDRS forms and documents page on alberta.ca. The page links each form at
// https://cfr.forms.gov.ab.ca/Form/<CODE>, a Central Forms Repository ("LC Forms") URL that
// answers with `content-type: text/html` but serves the PDF bytes directly for a static form;
// `extract` treats those links as the official_url. One link on the page is protocol-relative
// (`//cfr.forms.gov.ab.ca/...`) and one uses a lowercase `/form/`; both are normalized to
// `https://cfr.forms.gov.ab.ca/Form/<CODE>` here so `prefix` matches every catalogued url.
export const prefix = 'https://cfr.forms.gov.ab.ca/Form/'

import { PDF } from '@libpdf/core'

const ENTITIES = { nbsp: ' ', amp: '&', ndash: '-', mdash: '-', rsquo: "'", lsquo: "'", quot: '"', '#39': "'", '#038': '&', '#8211': '-', '#8217': "'" }
const decode = (s) => s.replace(/&(#\d+|\w+);/g, (m, e) => ENTITIES[e] ?? (e[0] === '#' ? String.fromCharCode(+e.slice(1)) : m))

// Every catalogued PDF prints its own "<ID>  Rev. YYYY-MM" stamp, but most of these are XFA
// dynamic forms (an AcroForm dictionary with zero static fields; the real content, including
// the stamp, lives in the XFA template packet, which @libpdf/core does not parse). Only the
// forms with real AcroForm fields (e.g. RTDR11149) expose the stamp to extractText(); for the
// rest this returns null and current_version stays at whatever was read by hand from the XFA
// template (see dataset.notes). One catalogued link (RTDR12112) is not a PDF at all: it opens
// an in-browser LC Forms viewer, so PDF.load throws and the caller's .catch(() => null) covers it.
export async function version(bytes) {
  const pdf = await PDF.load(bytes)
  let text = ''
  for (const p of pdf.getPages()) text += (await p.extractText()).text + '\n'
  const m = text.match(/\b[A-Z]+\d+\s+Rev\.\s*(\d{4})-(\d{2})\b/)
  return m ? `${m[1]}-${m[2]}` : null
}

// One <a> per form, its link text the form's name; href is either the canonical
// "https://cfr.forms.gov.ab.ca/Form/<CODE>" or one of the two variants described above.
export function extract(html) {
  const forms = new Map()
  for (const [, href, inner] of html.matchAll(/<a\b[^>]*href="((?:https:)?\/\/cfr\.forms\.gov\.ab\.ca\/[Ff]orm\/[A-Za-z0-9]+)"[^>]*>([^<]*)<\/a>/g)) {
    const code = href.split('/').pop()
    const id = code.toUpperCase()
    if (forms.has(id)) continue
    const name = decode(inner).replace(/\s+/g, ' ').trim()
    if (!name) continue
    forms.set(id, { id, form_name: name, official_url: prefix + code, version: null })
  }
  return [...forms.values()]
}
