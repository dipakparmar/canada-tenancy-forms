// Validate data/bc-rtb-forms.json against the schema, plus id uniqueness and related_forms references.
import { readFileSync } from 'node:fs'
import Ajv from 'ajv'

const read = (p) => JSON.parse(readFileSync(new URL(p, import.meta.url), 'utf8'))
const schema = read('../schema/bc-rtb-forms.schema.json')
const data = read('../data/bc-rtb-forms.json')

const ajv = new Ajv({ allErrors: true })
const errors = ajv.validate(schema, data) ? [] : ajv.errors.map((e) => `${e.instancePath || '/'} ${e.message}`)

const ids = new Set()
for (const f of data.forms ?? []) {
  if (ids.has(f.id)) errors.push(`duplicate id ${f.id}`)
  ids.add(f.id)
}
for (const f of data.forms ?? []) {
  for (const r of f.related_forms ?? []) if (!ids.has(r)) errors.push(`${f.id}: related_forms references unknown id ${r}`)
}

if (errors.length) {
  console.error(`${errors.length} error(s):\n` + errors.map((e) => `  - ${e}`).join('\n'))
  process.exit(1)
}
console.log(`ok: ${data.forms.length} forms valid`)
