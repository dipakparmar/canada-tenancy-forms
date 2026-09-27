// Usage: bun run fill [data.json] [out.pdf]
// Fills forms/bc/RTB-1.pdf from a JSON object keyed by semantic name (default: the built-in
// sample), writes the result, then reloads it and checks every value round-tripped.
import { readFile, writeFile, mkdir } from "node:fs/promises";
import { PDF } from "@libpdf/core";
import { fillFromMap, type FormMap } from "./fill-core";
import { sample } from "./sample";

const [dataPath, outPath = "out/RTB-1-filled.pdf"] = process.argv.slice(2);
const data: Record<string, string | boolean> = dataPath ? JSON.parse(await readFile(dataPath, "utf8")) : sample;
const ref = String(data._form ?? "bc/RTB-1");
for (const k of Object.keys(data)) if (k.startsWith("_")) delete data[k]; // "_form", "_note" and friends

const map: FormMap = JSON.parse(await readFile(`maps/${ref}.map.json`, "utf8"));

const pdf = await PDF.load(new Uint8Array(await readFile(`forms/${ref}.pdf`)));
const { filled, skipped } = fillFromMap(pdf.getForm()!, map, data);
console.log(`filled ${filled.length}, skipped ${skipped.length}`, skipped);
await mkdir(outPath.replace(/\/[^/]*$/, "") || ".", { recursive: true });
await writeFile(outPath, await pdf.save());

// round trip: reload and compare, keyed by semantic name
const back = (await PDF.load(new Uint8Array(await readFile(outPath)))).getForm()!;
let bad = 0;
for (const [key, want] of Object.entries(data)) {
  const entry = map.fields[key]!;
  const f: any = back.getField(entry.pdf);
  const got = f?.type === "checkbox" ? f.isChecked() : f?.getValue();
  const ok = got === want;
  if (!ok) bad++;
  console.log(ok ? "ok  " : "FAIL", key.padEnd(35), JSON.stringify(got));
}
console.log(bad ? `${bad} mismatches` : `all values round-tripped -> ${outPath}`);
if (bad) process.exit(1);
