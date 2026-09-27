// Usage: bun scripts/pdf/inspect.ts [forms/bc/RTB-1.pdf]
// Dumps everything a map author needs about one form: the summary line, every field with
// its type, value, options and rect, and an interleaved layout of text spans and widgets
// sorted top to bottom. Writes out/<ID>-fields.json, out/<ID>-positions.json,
// out/<ID>-text.json and out/<ID>-layout.txt.
import { readFile, writeFile, mkdir } from "node:fs/promises";
import { PDF } from "@libpdf/core";
import { loadLayout } from "./layout";

const pdfPath = process.argv[2] ?? "forms/bc/RTB-1.pdf";
const base = pdfPath.split("/").pop()!.replace(/\.pdf$/i, "");

const pdf = await PDF.load(new Uint8Array(await readFile(pdfPath)));
const pages = pdf.getPages();
const form = pdf.getForm();
console.log({
  pages: pdf.getPageCount(),
  title: pdf.getTitle(),
  hasForm: pdf.hasForm(),
  fieldCount: form?.fieldCount ?? 0,
});
if (!form || form.isEmpty) throw new Error("no AcroForm fields, flattened form");
console.log("form properties:", form.properties);

const fields = form.getFields().map((f: any) => {
  const widgets = f.getWidgets();
  const pageIdx = [...new Set(widgets.map((w: any) => pages.findIndex((p) => p.ref === w.pageRef)))];
  return {
    name: f.name,
    type: f.type,
    value: f.getValue(),
    options:
      f.type === "checkbox"
        ? f.getOnValues()
        : f.type === "radio" || f.type === "dropdown"
          ? f.getOptions()
          : undefined,
    maxLength: f.type === "text" && f.maxLength ? f.maxLength : undefined,
    comb: f.type === "text" && f.isComb ? true : undefined,
    multiline: f.type === "text" && f.isMultiline ? true : undefined,
    readOnly: f.isReadOnly() || undefined,
    alt: f.alternateName ?? undefined,
    pages: pageIdx,
    widgets: widgets.length,
    rect: widgets[0]?.rect.map((n: number) => Math.round(n)),
  };
});
for (const f of fields)
  console.log(
    f.pages.join(","),
    f.type.padEnd(8),
    f.name,
    JSON.stringify(f.value),
    f.options ? `options=${JSON.stringify(f.options)}` : "",
  );

await mkdir("out", { recursive: true });
await writeFile(`out/${base}-fields.json`, JSON.stringify(fields, null, 2));

// positions: widget rects and text span bboxes, the raw material for mapping by position
const { pageCount, fields: positions, spans } = await loadLayout(pdfPath);
await writeFile(`out/${base}-positions.json`, JSON.stringify(positions, null, 2));
await writeFile(`out/${base}-text.json`, JSON.stringify(spans, null, 2));

const lines: string[] = [];
for (let p = 0; p < pageCount; p++) {
  const items = [
    ...spans
      .filter((s) => s.page === p)
      .map((s) => ({ y: s.y, x: s.x, s: `    TEXT  x=${s.x} y=${s.y} w=${s.w} | ${JSON.stringify(s.text)}` })),
    ...positions
      .filter((f) => f.page === p)
      .map((f) => ({
        y: f.y,
        x: f.x,
        s: `>>> ${f.type.toUpperCase().padEnd(8)} x=${f.x} y=${f.y} w=${f.w} h=${f.h} on=${JSON.stringify(f.on ?? "")} | ${f.name}`,
      })),
  ].sort((a, b) => b.y - a.y || a.x - b.x);
  if (!items.length) continue;
  lines.push(`\n========== PAGE ${p} ==========`);
  for (const it of items) lines.push(it.s);
}
await writeFile(`out/${base}-layout.txt`, lines.join("\n"));
console.log(`fields ${fields.length} spans ${spans.length} -> out/${base}-fields.json, out/${base}-layout.txt`);
