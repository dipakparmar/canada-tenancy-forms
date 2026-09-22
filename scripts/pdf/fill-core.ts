// "signature" appears in RTB-27; libpdf exposes such fields but cannot set a value on them,
// so nothing in this POC writes to them.
export type MapEntry = { pdf: string; type: "text" | "checkbox" | "signature"; on?: string };
export type FormMap = {
  form: string;
  revision: string;
  source?: string;
  pdf_sha256?: string;
  fields: Record<string, MapEntry>;
};

// Resolves semantic keys through the map into raw PDF field names and fills them.
export function fillFromMap(form: any, map: FormMap, data: Record<string, string | boolean>) {
  const raw: Record<string, string | boolean> = {};
  for (const [key, value] of Object.entries(data)) {
    const entry = map.fields[key];
    if (!entry) throw new Error(`no map entry for semantic key "${key}"`);
    raw[entry.pdf] = value;
  }
  return form.fill(raw);
}
