// Guard test over every maps/<code>/*.map.json: the map must still describe the government PDF
// it was hand-verified against. Run `bun run fetch-forms` first; the PDFs are never
// committed, so a map whose PDF is missing is skipped rather than failed.
import { test, expect } from "bun:test";
import { createHash } from "node:crypto";
import { readdir, readFile } from "node:fs/promises";
import { existsSync } from "node:fs";
import { PDF } from "@libpdf/core";
import { jurisdictions } from "../scripts/jurisdictions.mjs";

const maps: { code: string; mapsDir: string; formsDir: string; mapFile: string }[] = [];
for (const { code, mapsDir, formsDir } of jurisdictions())
  for (const mapFile of (await readdir(mapsDir).catch(() => [] as string[])).filter((f) => f.endsWith(".map.json")).sort())
    maps.push({ code, mapsDir, formsDir, mapFile });
expect(maps.length).toBeGreaterThan(0);

for (const { code, mapsDir, formsDir, mapFile } of maps) {
  const id = `${code}/${mapFile.replace(/\.map\.json$/, "")}`;
  const map = JSON.parse(await readFile(`${mapsDir}${mapFile}`, "utf8"));
  const pdfPath = `${formsDir}${mapFile.replace(/\.map\.json$/, ".pdf")}`;

  test(`${id}: map header names the form and its source`, () => {
    expect(map.form).toBe(id.split("/")[1]);
    // revision is the stamp the PDF prints; null only when revision_printed is false and no dated statement exists
    if (map.revision === null) expect(map.revision_printed).toBe(false);
    else expect(map.revision).toMatch(/^\d{4}\/\d{2}$/);
    expect(map.source).toMatch(/^https:\/\//);
    expect(map.pdf_sha256).toMatch(/^[0-9a-f]{64}$/);
  });

  if (!existsSync(pdfPath)) {
    test.skip(`${id}: PDF checks (${pdfPath} not downloaded, run \`bun run fetch-forms\`)`, () => {});
    continue;
  }

  const bytes = new Uint8Array(await readFile(pdfPath));
  const pdf = await PDF.load(bytes);
  const form = pdf.getForm()!;
  const fieldsByName = new Map(form.getFields().map((f: any) => [f.name, f]));
  const entries = Object.entries(map.fields) as [string, any][];

  test(`${id}: PDF sha256 matches map.pdf_sha256`, () => {
    expect(createHash("sha256").update(bytes).digest("hex")).toBe(map.pdf_sha256);
  });

  // A map may set `revision_printed: false` when the government PDF itself prints no dated
  // stamp anywhere (seen on NS Form P): `revision` and `pdf_sha256` are still required, but
  // this test skips the text search rather than failing on a date that was never on the page.
  if (map.revision_printed === false) {
    test.skip(`${id}: PDF revision matches map.revision (revision_printed: false, not checked)`, () => {});
  } else {
    test(`${id}: PDF revision matches map.revision`, async () => {
      let text = "";
      for (const p of pdf.getPages()) text += (await p.extractText()).text;
      // the revision is printed in the page footer as "#RTB-1 (2023/06)"; the extractor
      // sometimes splits it across spans, so whitespace is stripped before matching
      expect(text.replace(/\s+/g, "")).toContain(map.revision);
    });
  }

  test(`${id}: every mapped pdf field exists`, () => {
    for (const [, entry] of entries) expect(fieldsByName.has(entry.pdf)).toBe(true);
  });

  test(`${id}: mapped field types match the PDF`, () => {
    for (const [, entry] of entries) expect((fieldsByName.get(entry.pdf) as any)?.type).toBe(entry.type);
  });

  test(`${id}: checkbox on-values are valid export values`, () => {
    for (const [, entry] of entries) {
      if (entry.type !== "checkbox") continue;
      const f: any = fieldsByName.get(entry.pdf);
      if (typeof f?.getOnValues !== "function") continue;
      expect(f.getOnValues()).toContain(entry.on);
    }
  });

  test(`${id}: radio options and signature placement rects match the PDF`, () => {
    for (const [, entry] of entries) {
      const f: any = fieldsByName.get(entry.pdf);
      if (entry.type === "radio" && entry.options) expect(f.getOptions()).toEqual(entry.options);
      if (entry.type === "signature" && entry.rect) {
        // the placement rect is where a consumer stamps a signature image: it must be the widget's own box
        const pages = pdf.getPages();
        const widget = f.getWidgets()[0];
        const [x1, y1, x2, y2] = widget.rect ?? widget.getRect();
        expect(entry.rect.map(Math.round)).toEqual([x1, y1, x2, y2].map(Math.round));
        expect(entry.page).toBeLessThan(pages.length);
      }
    }
  });

  test(`${id}: no two semantic keys share a pdf field`, () => {
    const seen = new Map<string, string>();
    for (const [key, entry] of entries) {
      expect(seen.get(entry.pdf)).toBeUndefined();
      seen.set(entry.pdf, key);
    }
  });

  test(`${id}: the map covers every field in the PDF exactly once`, () => {
    const pdfNames = form.getFields().map((f: any) => f.name);
    const mapped = entries.map(([, e]) => e.pdf);
    expect(mapped.length).toBe(pdfNames.length);
    expect(new Set(mapped).size).toBe(mapped.length);
    expect([...mapped].sort()).toEqual([...pdfNames].sort());
  });
}
