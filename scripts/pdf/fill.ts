import { readFile, writeFile, mkdir } from "node:fs/promises";
import { PDF } from "@libpdf/core";
import { fillFromMap, type FormMap } from "./fill-core";
import { sample as data } from "./sample";

const map: FormMap = JSON.parse(await readFile("maps/RTB-1.map.json", "utf8"));

const pdf = await PDF.load(new Uint8Array(await readFile("forms/RTB-1.pdf")));
const { filled, skipped } = fillFromMap(pdf.getForm()!, map, data);
console.log(`filled ${filled.length}, skipped ${skipped.length}`, skipped);
await mkdir("out", { recursive: true });
await writeFile("out/RTB-1-filled.pdf", await pdf.save());

// round trip: reload and compare, keyed by semantic name
const back = (await PDF.load(new Uint8Array(await readFile("out/RTB-1-filled.pdf")))).getForm()!;
let bad = 0;
for (const [key, want] of Object.entries(data)) {
  const entry = map.fields[key]!;
  const f: any = back.getField(entry.pdf);
  const got = f?.type === "checkbox" ? f.isChecked() : f?.getValue();
  const ok = got === want;
  if (!ok) bad++;
  console.log(ok ? "ok  " : "FAIL", key.padEnd(35), JSON.stringify(got));
}
console.log(bad ? `${bad} mismatches` : "all values round-tripped");
if (bad) process.exit(1);
