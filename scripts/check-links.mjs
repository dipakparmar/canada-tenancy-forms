// HEAD every official_url plus each index url (GET with Range when HEAD is rejected). Exit 1 on any non-2xx/3xx.
// Usage: bun scripts/check-links.mjs [bc on ...]
import { setTimeout as sleep } from 'node:timers/promises'
import { jurisdictions, splitArgs } from './jurisdictions.mjs'

const CONCURRENCY = 4
const DELAY_MS = 250 // per worker, between requests
const targets = jurisdictions(splitArgs(process.argv.slice(2)).codes).flatMap(({ code, catalog }) => [
  { id: `${code}:index`, url: catalog.source.index_url },
  ...catalog.forms.map((f) => ({ id: `${code}:${f.id}`, url: f.official_url })),
])

async function check(url) {
  try {
    let res = await fetch(url, { method: 'HEAD', redirect: 'manual' })
    if (res.status === 405 || res.status === 403 || res.status === 501) {
      res = await fetch(url, { headers: { Range: 'bytes=0-0' }, redirect: 'manual' })
      await res.body?.cancel()
    }
    return res.status
  } catch (err) {
    return `error: ${err.cause?.code ?? err.message}`
  }
}

const results = []
const queue = [...targets]
await Promise.all(Array.from({ length: CONCURRENCY }, async () => {
  for (let t; (t = queue.shift()); await sleep(DELAY_MS)) results.push({ ...t, status: await check(t.url) })
}))

const ok = (s) => typeof s === 'number' && s >= 200 && s < 400
const order = new Map(targets.map((t, i) => [t.id, i]))
results.sort((a, b) => order.get(a.id) - order.get(b.id))
for (const r of results) console.log(`${r.id.padEnd(16)} ${r.status}${ok(r.status) ? '' : `  ${r.url}`}`)
const bad = results.filter((r) => !ok(r.status))
console.log(`\n${results.length - bad.length}/${results.length} ok`)
process.exit(bad.length ? 1 : 0)
