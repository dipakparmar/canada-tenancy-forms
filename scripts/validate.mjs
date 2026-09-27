// Validate every data/<code>/forms.json against the schema, plus the dataset's own id pattern,
// id uniqueness and related_forms references. Usage: bun scripts/validate.mjs [bc on ...]
import { readFileSync } from 'node:fs'
import Ajv from 'ajv'
import { jurisdictions, root, splitArgs } from './jurisdictions.mjs'

const schema = JSON.parse(readFileSync(root('schema/forms.schema.json'), 'utf8'))
const ajv = new Ajv({ allErrors: true })
let failed = 0

for (const { code, catalog: data } of jurisdictions(splitArgs(process.argv.slice(2)).codes)) {
  const errors = ajv.validate(schema, data) ? [] : ajv.errors.map((e) => `${e.instancePath || '/'} ${e.message}`)
  const idRe = new RegExp(data.dataset?.id_pattern ?? '(?!)')
  const ids = new Set()
  for (const f of data.forms ?? []) {
    if (!idRe.test(f.id)) errors.push(`id ${f.id} does not match dataset.id_pattern ${idRe}`)
    if (ids.has(f.id)) errors.push(`duplicate id ${f.id}`)
    ids.add(f.id)
  }
  for (const f of data.forms ?? []) {
    for (const r of f.related_forms ?? []) if (!ids.has(r)) errors.push(`${f.id}: related_forms references unknown id ${r}`)
  }
  if (errors.length) {
    failed++
    console.error(`${code}: ${errors.length} error(s):\n` + errors.map((e) => `  - ${e}`).join('\n'))
  } else console.log(`${code}: ok, ${data.forms.length} forms valid`)
}
process.exit(failed ? 1 : 0)
