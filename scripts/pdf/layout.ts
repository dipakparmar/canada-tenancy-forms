// Shared PDF layout extraction: every form field with its widget rect/page, and
// every text span with its bbox. Used by inspect.ts, automap.ts and markers.ts.
import { readFile } from "node:fs/promises";
import { PDF } from "@libpdf/core";

export const r1 = (n: number) => Math.round(n * 10) / 10;

export type FieldPos = {
  name: string;
  type: string;
  page: number;
  x: number;
  y: number;
  w: number;
  h: number;
  on?: string[];
};
export type Span = { page: number; text: string; x: number; y: number; w: number; h: number };
export type Layout = { pdf: any; pageCount: number; fields: FieldPos[]; spans: Span[] };

export async function loadLayout(path: string): Promise<Layout> {
  const pdf = await PDF.load(new Uint8Array(await readFile(path)));
  const pages = pdf.getPages();
  const form = pdf.getForm()!;

  const fields: FieldPos[] = form.getFields().map((f: any) => {
    const w = f.getWidgets()[0];
    const page = pages.findIndex((p: any) => p.ref === w?.pageRef);
    const [x, y, x2, y2] = (w?.rect ?? [0, 0, 0, 0]) as number[];
    return {
      name: f.name,
      type: f.type,
      page,
      x: r1(x!),
      y: r1(y!),
      w: r1(x2! - x!),
      h: r1(y2! - y!),
      on: typeof f.getOnValues === "function" ? f.getOnValues() : undefined,
    };
  });

  const spans: Span[] = [];
  for (let i = 0; i < pages.length; i++) {
    const t: any = await pages[i]!.extractText();
    for (const l of t.lines ?? [])
      for (const s of l.spans ?? []) {
        if (!s.text.trim()) continue;
        spans.push({
          page: i,
          text: s.text,
          x: r1(s.bbox.x),
          y: r1(s.bbox.y),
          w: r1(s.bbox.width),
          h: r1(s.bbox.height),
        });
      }
  }
  return { pdf, pageCount: pages.length, fields, spans };
}

export async function pdfText(pdf: any): Promise<string> {
  let text = "";
  for (const p of pdf.getPages()) text += (await p.extractText()).text;
  return text;
}
