// Ontario: the Landlord and Tenant Board forms page on tribunalsontario.ca. Same export
// shape as bc.mjs: `prefix` and `extract(html)`. The standard lease (2229E) is published by
// the Ministry on forms.mgcs.gov.on.ca, not on this page, so the updater leaves it alone.
export const prefix = 'https://tribunalsontario.ca/documents/ltb/'

const ENTITIES = { nbsp: ' ', amp: '&', ndash: '-', mdash: '-', rsquo: "'", lsquo: "'", quot: '"', '#39': "'", '#038': '&', '#8211': '-', '#8217': "'" }
const text = (html) => html
  .replace(/<[^>]*>/g, ' ')
  .replace(/&(#\d+|\w+);/g, (m, e) => ENTITIES[e] ?? (e[0] === '#' ? String.fromCharCode(+e.slice(1)) : m))
  .replace(/\s+/g, ' ').trim()

// N4.pdf -> N4, L10.pdf -> L10, T2.pdf -> T2. Anything with a longer filename is an
// instruction sheet, a statement or an unnumbered form and is skipped.
export const idFromFile = (file) => {
  const m = decodeURIComponent(file).match(/^([A-Z]{1,2}\d{1,2})\.pdf$/i)
  return m && m[1].toUpperCase()
}

// ponytail: one table row per form; the first cell reads "N4 – Notice to End your Tenancy ...",
// the last cell links the PDF. The page prints no version dates, so version stays null.
export function extract(html) {
  const forms = new Map()
  for (const [, row] of html.matchAll(/<tr\b[^>]*>([\s\S]*?)<\/tr>/g)) {
    // a row may link an instruction sheet before the form itself, so take the first numbered PDF
    let path, id
    for (const [, href] of row.matchAll(/href="(\/documents\/ltb\/[^"]+\.pdf)"/gi)) {
      path = href.replace(/&#0?38;|&amp;/g, '&')
      if ((id = idFromFile(path.split('/').pop()))) break
    }
    if (!id || forms.has(id)) continue
    const cell = row.match(/<td\b[^>]*>([\s\S]*?)<\/td>/)
    const name = text(cell?.[1] ?? '').replace(new RegExp(`^${id}\\s*[-:]\\s*`, 'i'), '').trim() || id
    forms.set(id, { id, form_name: name, official_url: prefix + encodeURI(path.slice('/documents/ltb/'.length)), version: null })
  }
  return [...forms.values()]
}
