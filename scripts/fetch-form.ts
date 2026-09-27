// Usage: bun scripts/fetch-form.ts [bc on ...] [RTB-1 RTB-27 ...]
// Downloads the official PDF for each requested form id into forms/<code>/<ID>.pdf, which is
// gitignored: the government's PDFs are never committed to this repository. With no ids it
// fetches every form that has a map in maps/<code>/, for the named jurisdictions or all.
import { createHash } from "node:crypto";
import { mkdir, readdir, writeFile } from "node:fs/promises";
import { jurisdictions, splitArgs } from "./jurisdictions.mjs";

const { codes, rest: wanted } = splitArgs(process.argv.slice(2));

let failed = 0;
let fetched = 0;
for (const { code, catalog, mapsDir, formsDir } of jurisdictions(codes)) {
  const urlById = new Map<string, string>(catalog.forms.map((f: any) => [f.id, f.official_url]));
  const mapped = (await readdir(mapsDir).catch(() => [] as string[]))
    .filter((f) => f.endsWith(".map.json"))
    .map((f) => f.replace(/\.map\.json$/, ""));
  const ids = wanted.length ? wanted.filter((id) => urlById.has(id)) : mapped.sort();
  if (!ids.length) continue;
  await mkdir(formsDir, { recursive: true });
  for (const id of ids) {
    fetched++;
    const url = urlById.get(id)!;
    const res = await fetch(url);
    if (!res.ok) {
      console.error(`${code}/${id}: ${res.status} ${res.statusText} for ${url}`);
      failed++;
      continue;
    }
    const bytes = new Uint8Array(await res.arrayBuffer());
    // a redirect to an HTML error page still answers 200, so check the file magic
    if (String.fromCharCode(...bytes.slice(0, 5)) !== "%PDF-") {
      console.error(`${code}/${id}: response is not a PDF (no %PDF- magic) from ${url}`);
      failed++;
      continue;
    }
    const path = `${formsDir}${id}.pdf`;
    await writeFile(path, bytes);
    const sha256 = createHash("sha256").update(bytes).digest("hex");
    console.log(`${code}/${id}  ${bytes.length} bytes  sha256=${sha256}  -> ${path}`);
  }
}
if (!fetched) {
  console.error(wanted.length ? `no catalog has ${wanted.join(", ")}` : "no maps found");
  process.exit(1);
}
if (failed) process.exit(1);
