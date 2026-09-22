// Usage: bun scripts/pdf/automap-eval.ts [RTB-1]
// Compares out/<ID>.map.candidate.json against the hand-verified maps/<ID>.map.json
// and prints the hit rate by confidence bucket.
import { readFile } from "node:fs/promises";

const base = process.argv[2] ?? "RTB-1";
const truth = JSON.parse(await readFile(`maps/${base}.map.json`, "utf8"));
const cand = JSON.parse(await readFile(`out/${base}.map.candidate.json`, "utf8"));

const truthByPdf = new Map<string, string>();
for (const [k, e] of Object.entries(truth.fields) as [string, any][]) truthByPdf.set(e.pdf, k);

// "same key ignoring row suffix": drop trailing digits from every dotted segment
const loose = (k: string) => k.split(".").map((s) => s.replace(/\d+$/, "")).join(".");

// first two dotted segments: the section and the item, ignoring any deeper naming level
const head2 = (k: string) => loose(k).split(".").slice(0, 2).join(".");

const buckets: Record<string, { n: number; exact: number; suffix: number; head: number }> = {
  high: { n: 0, exact: 0, suffix: 0, head: 0 },
  medium: { n: 0, exact: 0, suffix: 0, head: 0 },
  low: { n: 0, exact: 0, suffix: 0, head: 0 },
};
const misses: string[] = [];
for (const [key, e] of Object.entries(cand.fields) as [string, any][]) {
  const want = truthByPdf.get(e.pdf);
  const b = buckets[e.confidence]!;
  b.n++;
  if (want === key) b.exact++;
  if (want && loose(want) === loose(key)) b.suffix++;
  if (want && head2(want) === head2(key)) b.head++;
  else misses.push(`${e.confidence.padEnd(6)} ${String(want).padEnd(38)} got ${key.padEnd(38)} label=${JSON.stringify(e.label)} pdf=${JSON.stringify(e.pdf)}`);
}

const tot = { n: 0, exact: 0, suffix: 0, head: 0 };
for (const b of Object.values(buckets)) { tot.n += b.n; tot.exact += b.exact; tot.suffix += b.suffix; tot.head += b.head; }
const pct = (a: number, b: number) => (b ? ((100 * a) / b).toFixed(0) + "%" : "-");

console.log(`\nautomap vs maps/${base}.map.json\n`);
console.log("confidence  fields   exact         ignoring row suffix   section+item");
for (const [name, b] of Object.entries(buckets))
  console.log(`${name.padEnd(11)} ${String(b.n).padStart(5)}   ${String(b.exact).padStart(3)} ${pct(b.exact, b.n).padStart(5)}   ${String(b.suffix).padStart(3)} ${pct(b.suffix, b.n).padStart(5)}        ${String(b.head).padStart(3)} ${pct(b.head, b.n).padStart(5)}`);
console.log(`${"TOTAL".padEnd(11)} ${String(tot.n).padStart(5)}   ${String(tot.exact).padStart(3)} ${pct(tot.exact, tot.n).padStart(5)}   ${String(tot.suffix).padStart(3)} ${pct(tot.suffix, tot.n).padStart(5)}        ${String(tot.head).padStart(3)} ${pct(tot.head, tot.n).padStart(5)}`);

if (process.env.MISSES) console.log("\n" + misses.join("\n"));
