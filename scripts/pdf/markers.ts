// Usage: bun scripts/pdf/markers.ts [maps/<code>/<ID>.map.json] [forms/<code>/<ID>.pdf]
// Fills every text field with its own semantic key (or a short tag) and ticks every box,
// so the rendered pages can be read back to confirm the map.
import { readFile, writeFile, mkdir } from "node:fs/promises";
import { PDF } from "@libpdf/core";
import { loadLayout } from "./layout";
import { fillFromMap, type FormMap } from "./fill-core";

const mapPath = process.argv[2] ?? "maps/bc/RTB-1.map.json";
// a map under maps/<code>/ finds its PDF under forms/<code>/; an out/ candidate has no code, so name the PDF
const pdfPath = process.argv[3] ?? (mapPath.startsWith("maps/") ? mapPath.replace(/\.map\.json$/, ".pdf").replace(/^maps\//, "forms/") : null);
if (!pdfPath) throw new Error("give the PDF path as the second argument for a candidate map");
const base = pdfPath.split("/").pop()!.replace(/\.pdf$/i, "");

const map: FormMap = JSON.parse(await readFile(mapPath, "utf8"));
const { fields } = await loadLayout(pdfPath);
const byName = new Map(fields.map((f) => [f.name, f]));

const pdf = await PDF.load(new Uint8Array(await readFile(pdfPath)));
const raw: Record<string, string | boolean> = {};
const legend: string[] = [];
let n = 0;
for (const [key, e] of Object.entries(map.fields)) {
  const f = byName.get(e.pdf);
  if (!f) continue;
  if (e.type === "checkbox" || e.type === "radio") { raw[e.pdf] = true; continue; }
  if (e.type !== "text") continue; // signature fields cannot be set
  n++;
  const tag = `T${String(n).padStart(3, "0")}`;
  raw[e.pdf] = f.w >= 110 ? `${tag} ${key}` : tag;
  legend.push(`p${f.page + 1} ${tag} x=${f.x} y=${f.y} w=${f.w}  ${key}   <- ${e.pdf}`);
}
const { filled, skipped } = fillFromMap(pdf.getForm()!, map, Object.fromEntries(Object.entries(map.fields).filter(([, e]) => e.pdf in raw).map(([k, e]) => [k, raw[e.pdf]!])));
console.log(`filled ${filled.length} skipped ${skipped.length}`, skipped.slice(0, 10));
await mkdir("out", { recursive: true });
await writeFile(`out/${base}-allfields.pdf`, await pdf.save());
await writeFile(`out/${base}-markers.txt`, legend.join("\n") + "\n");
