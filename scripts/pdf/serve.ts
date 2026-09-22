// Usage: bun scripts/pdf/serve.ts [RTB-1]
// A local test UI, one file, no framework: it builds an input per semantic key straight
// from maps/<ID>.map.json and posts them back through fillFromMap. RTB-1 is pre-filled
// with the sample data fill.ts uses; every other form starts empty.
import { readFile } from "node:fs/promises";
import { PDF } from "@libpdf/core";
import { fillFromMap, type FormMap } from "./fill-core";
import { sample } from "./sample";

const formId = process.argv[2] ?? "RTB-1";
const map: FormMap = JSON.parse(await readFile(`maps/${formId}.map.json`, "utf8"));
const pdfPath = `forms/${formId}.pdf`;
const defaults: Record<string, string | boolean> = formId === "RTB-1" ? sample : {};

function groupOf(key: string) {
  return key.split(".")[0]!;
}

function escapeHtml(s: string) {
  return s.replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]!);
}

function renderPage() {
  const groups = new Map<string, string[]>();
  for (const key of Object.keys(map.fields)) {
    const g = groupOf(key);
    (groups.get(g) ?? groups.set(g, []).get(g)!).push(key);
  }

  let fields = "";
  for (const [group, keys] of groups) {
    fields += `<h2>${escapeHtml(group)}</h2>\n`;
    for (const key of keys) {
      const entry = map.fields[key]!;
      if (entry.type === "signature") continue; // libpdf cannot set a signature field
      const value = defaults[key];
      const id = key.replace(/[^a-zA-Z0-9]/g, "_");
      const labelHtml = `<label for="${id}">${escapeHtml(key)} <span class="pdfname">${escapeHtml(entry.pdf)}</span></label>`;
      if (entry.type === "checkbox") {
        fields += `<div class="field checkbox-field"><input type="checkbox" id="${id}" name="${escapeHtml(key)}" ${value ? "checked" : ""}> ${labelHtml}</div>\n`;
      } else {
        fields += `<div class="field"><input type="text" id="${id}" name="${escapeHtml(key)}" value="${escapeHtml(String(value ?? ""))}">${labelHtml}</div>\n`;
      }
    }
  }

  return `<!doctype html>
<html>
<head>
<meta charset="utf-8">
<title>${escapeHtml(map.form)} form filler</title>
<style>
  body { font-family: system-ui, sans-serif; margin: 2rem; color: #111; }
  h1 { margin-bottom: 0.25rem; }
  h2 { text-transform: capitalize; border-bottom: 1px solid #ccc; margin-top: 2rem; }
  .field { display: flex; flex-direction: column-reverse; align-items: flex-start; margin: 0.6rem 0; }
  .checkbox-field { flex-direction: row; align-items: center; gap: 0.5rem; }
  label { font-size: 0.85rem; }
  .pdfname { color: #888; font-size: 0.75rem; margin-left: 0.5rem; }
  input[type=text] { font-size: 1rem; padding: 0.3rem; margin-bottom: 0.15rem; }
  button { font-size: 1rem; padding: 0.5rem 1rem; margin-top: 2rem; margin-right: 1rem; }
</style>
</head>
<body>
<h1>${escapeHtml(map.form)} test filler</h1>
<p>${escapeHtml(map.form)} rev ${escapeHtml(map.revision)}, ${Object.keys(map.fields).length} mapped fields.</p>
<form method="POST" action="/fill" target="_blank">
${fields}
<button type="submit">Fill PDF</button>
</form>
</body>
</html>`;
}

function buildDataFromForm(form: URLSearchParams): Record<string, string | boolean> {
  const data: Record<string, string | boolean> = {};
  for (const key of Object.keys(map.fields)) {
    const entry = map.fields[key]!;
    if (entry.type === "signature") continue;
    if (entry.type === "checkbox") {
      data[key] = form.has(key); // unchecked boxes are simply absent from the POST body
    } else {
      const value = form.get(key);
      if (value) data[key] = value; // empty text fields are skipped
    }
  }
  return data;
}

const port = Number(process.env.PORT) || 3456;

Bun.serve({
  port,
  async fetch(req) {
    const url = new URL(req.url);
    if (url.pathname === "/" && req.method === "GET") {
      return new Response(renderPage(), { headers: { "content-type": "text/html; charset=utf-8" } });
    }
    if (url.pathname === "/fill" && req.method === "POST") {
      const body = new URLSearchParams(await req.text());
      const data = buildDataFromForm(body);
      const pdf = await PDF.load(new Uint8Array(await readFile(pdfPath)));
      fillFromMap(pdf.getForm()!, map, data);
      const bytes = await pdf.save();
      return new Response(bytes, {
        headers: {
          "content-type": "application/pdf",
          "content-disposition": `inline; filename="${formId}-filled.pdf"`,
        },
      });
    }
    return new Response("not found", { status: 404 });
  },
});

console.log(`${formId}: http://localhost:${port}`);
