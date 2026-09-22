// Usage: bun scripts/fetch-form.ts [RTB-1 RTB-27 ...]
// Downloads the official PDF for each requested form id into forms/<ID>.pdf, which is
// gitignored: the government's PDFs are never committed to this repository. With no
// arguments it fetches every form that has a map in maps/.
import { createHash } from "node:crypto";
import { mkdir, readdir, readFile, writeFile } from "node:fs/promises";

const catalog = JSON.parse(await readFile("data/bc-rtb-forms.json", "utf8"));
const urlById = new Map<string, string>(
  catalog.forms.map((f: any) => [f.id, f.official_url]),
);

async function mappedIds(): Promise<string[]> {
  const entries = await readdir("maps").catch(() => [] as string[]);
  return entries
    .filter((f) => f.endsWith(".map.json"))
    .map((f) => f.replace(/\.map\.json$/, ""))
    .sort();
}

const ids = process.argv.slice(2).length ? process.argv.slice(2) : await mappedIds();
if (!ids.length) {
  console.error("no form ids given and no maps found in maps/");
  process.exit(1);
}

await mkdir("forms", { recursive: true });

let failed = 0;
for (const id of ids) {
  const url = urlById.get(id);
  if (!url) {
    console.error(`${id}: not in data/bc-rtb-forms.json`);
    failed++;
    continue;
  }
  const res = await fetch(url);
  if (!res.ok) {
    console.error(`${id}: ${res.status} ${res.statusText} for ${url}`);
    failed++;
    continue;
  }
  const bytes = new Uint8Array(await res.arrayBuffer());
  // a redirect to an HTML error page still answers 200, so check the file magic
  if (String.fromCharCode(...bytes.slice(0, 5)) !== "%PDF-") {
    console.error(`${id}: response is not a PDF (no %PDF- magic) from ${url}`);
    failed++;
    continue;
  }
  const path = `forms/${id}.pdf`;
  await writeFile(path, bytes);
  const sha256 = createHash("sha256").update(bytes).digest("hex");
  console.log(`${id}  ${bytes.length} bytes  sha256=${sha256}  -> ${path}`);
}

if (failed) process.exit(1);
