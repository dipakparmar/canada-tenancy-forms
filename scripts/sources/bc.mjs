// British Columbia: the RTB forms index page on gov.bc.ca. Exports the shape every
// jurisdiction's source module must provide: `prefix` (the URL prefix of PDFs the updater
// may manage) and `extract(html)` -> [{ id, form_name, official_url, version }].
export const prefix = 'https://www2.gov.bc.ca/assets/gov/housing-and-tenancy/residential-tenancies/forms/'

const MONTHS = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December']
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
    if (!href.startsWith(prefix)) continue
    const id = idFromFile(href.slice(prefix.length))
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
