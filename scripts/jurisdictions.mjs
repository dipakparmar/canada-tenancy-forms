// One jurisdiction per directory: data/<code>/forms.json is the catalog, maps/<code>/ the field
// maps, snapshots/<code>/latest.json the last fetch, scripts/sources/<code>.mjs the extractor,
// forms/<code>/ the gitignored PDFs. `code` is the directory name (bc, on, ...).
import { readdirSync, readFileSync, existsSync } from 'node:fs'
import { fileURLToPath } from 'node:url'

const ROOT = new URL('../', import.meta.url)
export const root = (p) => fileURLToPath(new URL(p, ROOT))

export function jurisdictions(codes = []) {
  const all = readdirSync(root('data/'), { withFileTypes: true })
    .filter((d) => d.isDirectory() && existsSync(root(`data/${d.name}/forms.json`)))
    .map((d) => d.name)
    .sort()
  for (const c of codes) if (!all.includes(c)) throw new Error(`unknown jurisdiction "${c}" (have: ${all.join(', ')})`)
  return (codes.length ? codes : all).map((code) => ({
    code,
    dataPath: root(`data/${code}/forms.json`),
    mapsDir: root(`maps/${code}/`),
    formsDir: root(`forms/${code}/`),
    snapshotPath: root(`snapshots/${code}/latest.json`),
    sourceModule: new URL(`./sources/${code}.mjs`, import.meta.url).href,
    catalog: JSON.parse(readFileSync(root(`data/${code}/forms.json`), 'utf8')),
  }))
}

// Args that name a jurisdiction directory select it, wherever they sit; the rest pass through.
export function splitArgs(argv) {
  const known = new Set(jurisdictions().map((j) => j.code))
  return { codes: argv.filter((a) => known.has(a)), rest: argv.filter((a) => !known.has(a)) }
}
