import { PdfNumber } from "@libpdf/core";

// "signature" appears in RTB-27; libpdf exposes such fields but cannot set a value on them,
// so nothing in this POC writes to them. "button" covers the add/remove/print buttons an XFA
// form leaves behind. `readonly` marks a field the PDF flags read-only at rest: on 2229E the
// form's own scripts unlock those when a sibling box is ticked, so fill clears the flag when
// asked to write one.
// A "radio" entry lists its export values in `options` and is filled with one of them as a string.
// A "signature" entry may carry `page` (0-based) and `rect` ([x1, y1, x2, y2] in PDF points, origin
// bottom-left): the placement box a consumer stamps a signature image into, since libpdf cannot sign.
export type MapEntry = {
  pdf: string;
  type: "text" | "checkbox" | "radio" | "signature" | "button";
  readonly?: boolean;
  on?: string;
  options?: string[];
  page?: number;
  rect?: [number, number, number, number];
};
export type FormMap = {
  form: string;
  revision: string;
  source?: string;
  pdf_sha256?: string;
  fields: Record<string, MapEntry>;
};

const READ_ONLY = 1; // /Ff bit 1

// Resolves semantic keys through the map into raw PDF field names and fills them.
export function fillFromMap(form: any, map: FormMap, data: Record<string, string | boolean>) {
  const raw: Record<string, string | boolean> = {};
  for (const [key, value] of Object.entries(data)) {
    const entry = map.fields[key];
    if (!entry) throw new Error(`no map entry for semantic key "${key}"`);
    raw[entry.pdf] = value;
    const f = form.getField(entry.pdf);
    if (f?.isReadOnly()) f.acroField().set("Ff", PdfNumber.of(f.flags & ~READ_ONLY));
  }
  return form.fill(raw);
}
