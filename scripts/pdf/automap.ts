// Usage: bun scripts/pdf/automap.ts forms/<ID>.pdf
// Writes out/<ID>.map.candidate.json: the same shape as maps/<ID>.map.json, with a
// per-field `confidence` and the raw `label` the heuristic used.
import { writeFile, mkdir } from "node:fs/promises";
import { loadLayout, pdfText, type FieldPos, type Span } from "./layout";
import { LABELS, SECTIONS, ADDRESS_STEMS, DATE_QUALIFIERS, SUBSECTIONS, norm, camel } from "./label-dict";

const pdfPath = process.argv[2] ?? "forms/RTB-1.pdf";
const base = pdfPath.split("/").pop()!.replace(/\.pdf$/i, "");

// ---------------------------------------------------------------- sub-labels
// One extracted span often carries a whole row of labels ("unit number  street number
// and street name  city  province  postal code"). Split on runs of 2+ spaces and spread
// the span's bbox over the parts proportionally to their character offsets.
type Sub = Span & { raw: string; src: number };

// Split one text part into consecutive dictionary phrases ("last name first and middle
// name(s)" -> "last name" + "first and middle name(s)") when the whole part is not itself
// a known label. Returns null when the text does not tile cleanly.
function tileByDict(text: string): { text: string; start: number; end: number }[] | null {
  const words = [...text.matchAll(/\S+/g)];
  const parts: { text: string; start: number; end: number }[] = [];
  let i = 0;
  let covered = 0;
  while (i < words.length) {
    let hit = 0;
    for (let n = Math.min(6, words.length - i); n >= 1; n--) {
      const chunk = words.slice(i, i + n);
      if (LABELS[norm(chunk.map((w) => w[0]).join(" "))]) { hit = n; break; }
    }
    if (hit) {
      const chunk = words.slice(i, i + hit);
      const start = chunk[0]!.index!;
      const end = chunk[hit - 1]!.index! + chunk[hit - 1]![0].length;
      parts.push({ text: text.slice(start, end), start, end });
      covered += end - start;
      i += hit;
    } else i++;
  }
  if (parts.length < 2 || covered / text.trim().length < 0.6) return null;
  return parts;
}

function subLabels(spans: Span[]): Sub[] {
  const out: Sub[] = [];
  spans.forEach((s, si) => {
    const cw = s.w / Math.max(s.text.length, 1);
    const push = (raw: string, start: number) => {
      if (!raw.trim()) return;
      out.push({ page: s.page, text: raw.trim(), raw: raw.trim(), src: si, x: s.x + start * cw, y: s.y, w: raw.length * cw, h: s.h });
    };
    const re = /[^\s](?:.*?[^\s])?(?=\s{2,}|\s*$)/g;
    let m: RegExpExecArray | null;
    let any = false;
    while ((m = re.exec(s.text))) {
      const raw = m[0];
      if (!raw.trim()) continue;
      any = true;
      if (LABELS[norm(raw)]) { push(raw, m.index); continue; }
      const tiled = tileByDict(raw);
      if (tiled) for (const t of tiled) push(t.text, m.index + t.start);
      else push(raw, m.index);
    }
    if (!any) out.push({ ...s, raw: s.text.trim(), src: si });
  });
  return out;
}

// --------------------------------------------------------------- label match
type Match = { label: string; dir: string; cost: number; sub: Sub };

function bestLabel(f: FieldPos, subs: Sub[]): Match | null {
  const isBox = f.type === "checkbox" || f.type === "radio";
  const fx1 = f.x, fx2 = f.x + f.w, fy1 = f.y, fy2 = f.y + f.h;
  const fcx = (fx1 + fx2) / 2, fcy = (fy1 + fy2) / 2;
  // a checkbox label sits to its right; a text-field label sits under (or left of) the box
  const pen = isBox
    ? { right: 0, left: 22, below: 34, above: 40 }
    : { below: 0, left: 6, above: 12, right: 34 };
  let best: Match | null = null;
  for (const s of subs) {
    if (s.page !== f.page) continue;
    const sx1 = s.x, sx2 = s.x + s.w, sy1 = s.y, sy2 = s.y + s.h;
    const scx = (sx1 + sx2) / 2, scy = (sy1 + sy2) / 2;
    const cands: { dir: keyof typeof pen; cost: number }[] = [];
    // vertical neighbours: judged on horizontal centre alignment
    const hMiss = Math.abs(scx - fcx);
    // a printed label often overlaps the bottom of the box it belongs to, so allow the
    // label's own height of overlap before calling it "inside" rather than "below"
    const slack = Math.max(4, s.h);
    if (sy2 <= fy1 + slack && fy1 - sy2 < 30 && hMiss < Math.max(f.w, 110))
      cands.push({ dir: "below", cost: Math.max(fy1 - sy2, 0) * 2 + hMiss * 0.55 });
    if (sy1 >= fy2 - slack && sy1 - fy2 < 26 && hMiss < Math.max(f.w, 110))
      cands.push({ dir: "above", cost: Math.max(sy1 - fy2, 0) * 2 + hMiss * 0.55 });
    // horizontal neighbours: judged on vertical centre alignment
    const vMiss = Math.abs(scy - fcy);
    if (sx2 <= fx1 + 3 && fx1 - sx2 < 80 && vMiss < f.h)
      cands.push({ dir: "left", cost: (fx1 - sx2) * 1.2 + vMiss * 3 });
    // sub-label x positions are estimated, so a box's own label can appear to start just
    // inside it; accept any label whose centre is right of the box's centre
    if (scx > fcx && sx1 - fx2 < 80 && vMiss < f.h)
      cands.push({ dir: "right", cost: Math.max(sx1 - fx2, 0) * 1.2 + vMiss * 3 });
    // "(optional)", "(due date, e.g. 1st ...)" are asides, not the field's label
    const aside = /^\(/.test(s.raw) ? 100 : 0;
    for (const c of cands) {
      const cost = c.cost + pen[c.dir] + aside;
      if (!best || cost < best.cost) best = { label: s.raw, dir: c.dir, cost, sub: s };
    }
  }
  return best;
}

// ------------------------------------------------------------------ headings
// A section heading sits in the left margin and is written in capitals ("the LANDLORD(S):",
// "2.BEGINNING AND TERM OF THE AGREEMENT"). Spans on the same baseline are joined first,
// because the number and the title are often separate spans ("3." + "RENT").
function headings(spans: Span[]): { page: number; y: number; prefix: string; text: string }[] {
  const out: { page: number; y: number; prefix: string; text: string }[] = [];
  const left = spans.filter((s) => s.x < 42).sort((a, b) => a.page - b.page || b.y - a.y);
  for (const s of left) {
    let text = s.text;
    let end = s.x + s.w;
    for (const o of spans) {
      if (o.page !== s.page || o === s) continue;
      if (Math.abs(o.y - s.y) > 2.5) continue;
      if (o.x >= end - 2 && o.x - end < 30 && o.x < 200) {
        text += " " + o.text;
        end = o.x + o.w;
      }
    }
    const caps = (text.match(/[A-Z][A-Z0-9 &()'’\/,.\-]*[A-Z)]/g) ?? []).sort((a, b) => b.length - a.length)[0];
    let head = caps && (caps.match(/[A-Z]/g) ?? []).length >= 4 ? caps : "";
    if (!head) {
      // letter- or number-enumerated heading: "J.Entry", "A.Legal name of landlord(s):"
      const m = text.match(/^\s*(?:\d{1,2}|[A-Z])\s*[.)]\s*(\S.*)$/);
      if (m && (m[1]!.match(/[A-Za-z]/g) ?? []).length >= 3) head = m[1]!.replace(/:\s*$/, "");
    }
    if (!head) continue;
    out.push({ page: s.page, y: s.y, prefix: sectionPrefix(head), text: head.trim() });
  }
  return out;
}

function sectionPrefix(text: string): string {
  const n = norm(text.replace(/^\d+\s*[.)]?\s*/, ""));
  if (SECTIONS[n]) return SECTIONS[n]!;
  for (const [k, v] of Object.entries(SECTIONS)) if (n.startsWith(k) || k.startsWith(n)) return v;
  return camel(n.split(" ").slice(0, 4).join(" ")).replace(/^(\d)/, "s$1");
}

// --------------------------------------------------------------------- build
const { pdf, fields, spans } = await loadLayout(pdfPath);
const subs = subLabels(spans);
const heads = headings(spans);
// sub-headings: short, left-indented, colon-terminated, and known to the dictionary
const subHeads = spans
  .filter((s) => s.x < 130 && s.text.trim().length < 60 && /:\s*$/.test(s.text))
  .map((s) => ({ page: s.page, y: s.y, level: SUBSECTIONS[norm(s.text)] }))
  .filter((s) => !!s.level) as { page: number; y: number; level: string }[];

type Row = {
  f: FieldPos;
  label: string;
  dir: string;
  cost: number;
  stem: string;
  known: boolean;
  prefix: string;
  sub?: Sub;
  headText?: string;
  column?: string;
  grid?: boolean;
};
const rows: Row[] = [];
for (const f of fields) {
  const m = bestLabel(f, subs);
  const label = m?.label ?? "";
  const n = norm(label);
  const known = !!LABELS[n];
  const stem = LABELS[n] ?? (n ? camel(n.split(" ").slice(0, 5).join(" ")) : camel(f.name));
  // nearest heading above the widget on the same page
  let prefix = "";
  let bestY = Infinity;
  let headText = "";
  for (const h of heads) {
    if (h.page !== f.page) continue;
    // a heading is often printed level with the first row it covers, so allow a little slack
    if (h.y < f.y - 8) continue;
    if (h.y < bestY) { bestY = h.y; prefix = h.prefix; headText = h.text; }
  }
  // inside an "ADDRESS FOR SERVICE of the landlord" block the address parts belong to the
  // party, not to the premises: street -> addressStreet, city -> addressCity ...
  let stem2 = stem;
  if (/address for service/i.test(headText) && ADDRESS_STEMS[stem]) stem2 = ADDRESS_STEMS[stem]!;
  // an extra key level from the nearest known sub-heading above, within the same section
  let level = "";
  let levelY = Infinity;
  for (const h of subHeads) {
    if (h.page !== f.page || h.y < f.y + f.h || h.y > bestY) continue;
    if (h.y < levelY) { levelY = h.y; level = h.level; }
  }
  if (level) prefix = prefix ? `${prefix}.${level}` : level;
  rows.push({ f, label, dir: m?.dir ?? "", cost: m?.cost ?? 1e9, stem: stem2, known, prefix, sub: m?.sub, headText });
}

// Cluster widget y positions into bands: boxes on one printed row are not pixel-aligned.
const bandTable = new Map<number, number[]>();
function bandKey(page: number, y: number): string {
  const list = bandTable.get(page) ?? bandTable.set(page, []).get(page)!;
  const hit = list.find((b) => Math.abs(b - y) < 7);
  if (hit !== undefined) return `${page}|${hit}`;
  list.push(y);
  return `${page}|${y}`;
}

// Table columns: when many widgets share an x position down a page, the label above the
// topmost one is a column header ("Comment", "Code"), and it qualifies every key in that
// column. Without this every cell in a row would collide on the row's own label.
{
  const byPage = new Map<number, Row[]>();
  for (const r of rows) (byPage.get(r.f.page) ?? byPage.set(r.f.page, []).get(r.f.page)!).push(r);
  for (const rs of byPage.values()) {
    const cols: Row[][] = [];
    for (const r of rs) {
      const c = cols.find((c) => Math.abs(c[0]!.f.x - r.f.x) < 9 && Math.abs(c[0]!.f.w - r.f.w) < 12);
      if (c) c.push(r); else cols.push([r]);
    }
    if (cols.length < 2) continue;
    for (const col of cols) {
      if (col.length < 5) continue;
      const top = col.reduce((a, b) => (a.f.y >= b.f.y ? a : b));
      const cx = top.f.x + top.f.w / 2;
      const header = subs
        .filter((s) => s.page === top.f.page && s.y > top.f.y + top.f.h && s.y - (top.f.y + top.f.h) < 60 && Math.abs(s.x + s.w / 2 - cx) < Math.max(top.f.w, 70))
        .sort((a, b) => a.y - b.y || Math.abs(a.x + a.w / 2 - cx) - Math.abs(b.x + b.w / 2 - cx))[0];
      if (!header) continue;
      const q = camel(header.raw);
      if (!q || q.length > 18) continue;
      for (const r of col) r.column = q;
    }
  }
  // A real table (3+ columns of 5+ widgets) labels its rows in a column of text to the left
  // of the first field column. Take the label whose vertical centre falls inside the row.
  const colX = new Map<number, number>(); // page -> x of the leftmost detected column
  for (const r of rows) {
    if (!r.column) continue;
    const cur = colX.get(r.f.page);
    if (cur === undefined || r.f.x < cur) colX.set(r.f.page, r.f.x);
  }
  for (const [page, x0] of colX) {
    const cells = rows.filter((r) => r.f.page === page && r.column);
    const distinctCols = new Set(cells.map((r) => Math.round(r.f.x / 10))).size;
    if (distinctCols < 3 || cells.length < 15) continue;
    // the row-label column is the rightmost block of text left of the first field column
    const left = spans.filter((s) => s.page === page && s.x + s.w < x0 + 4);
    if (!left.length) continue;
    const rightEdge = Math.max(...left.map((s) => s.x));
    const labelCol = left.filter((s) => s.x > rightEdge - 95);
    for (const r of cells) {
      const text = labelCol
        .filter((s) => s.y + s.h / 2 > r.f.y - 1 && s.y + s.h / 2 < r.f.y + r.f.h + 1)
        .sort((a, b) => b.y - a.y || a.x - b.x)
        .map((s) => s.text.trim())
        .join(" ")
        // extractText splits a styled first letter into its own span ("L" + "ighting")
        .replace(/\b([A-Za-z]) (?=[a-z])/g, "$1");
      const n = norm(text);
      r.label = text;
      r.known = !!LABELS[n];
      r.stem = `${n ? LABELS[n] ?? camel(n) : "blank"}.${r.column}`;
      r.cost = 0;
      r.grid = true;
    }
  }

  // A grid row's printed label sits to the left of the whole row, so the cells further
  // right have no label of their own. Give them the row leader's stem, qualified by their
  // column ("walls and trim" + "code" -> wallsAndTrim.code).
  const bands = new Map<string, Row[]>();
  for (const r of rows) (bands.get(bandKey(r.f.page, r.f.y)) ?? bands.set(bandKey(r.f.page, r.f.y), []).get(bandKey(r.f.page, r.f.y))!).push(r);
  for (const rs of bands.values()) {
    const inCols = rs.filter((r) => r.column && !r.grid);
    if (inCols.length < 3) continue;
    const leader = rs
      .filter((r) => r.dir === "left" && r.cost < 60)
      .sort((a, b) => a.f.x - b.f.x)[0];
    if (!leader) continue;
    for (const r of inCols) {
      if (r === leader) continue;
      if (r.dir === "left" && r.cost < 60) continue; // has a label of its own
      r.stem = `${leader.stem}.${r.column}`;
      r.label = leader.label;
    }
    if (leader.column) leader.stem = `${leader.stem}.${leader.column}`;
  }

  // only qualify where it actually resolves a collision: one printed row label serving
  // several columns (a grid). A row of distinct labels needs no column level.
  for (const r of rows) {
    if (r.grid || !r.column || r.column === r.stem) continue;
    const clash = rows.some(
      (o) => o !== r && o.f.page === r.f.page && o.prefix === r.prefix && o.stem === r.stem && o.column && o.column !== r.column,
    );
    if (clash) r.stem = `${r.stem}.${r.column}`;
  }
}

// Row alignment: when a row of N widgets all take their label from the same text span, and
// that span splits into exactly N parts, pair them left to right. Sub-label x positions are
// only estimates, so ordering beats nearest-centre for "city  province  postal code" rows.
{
  const byRow = new Map<string, Row[]>();
  for (const r of rows) {
    if (!r.sub || (r.dir !== "below" && r.dir !== "above")) continue;
    const k = `${r.sub.src}|${r.dir}|${bandKey(r.f.page, r.f.y)}`;
    (byRow.get(k) ?? byRow.set(k, []).get(k)!).push(r);
  }
  for (const [k, rs] of byRow) {
    if (rs.length < 2) continue;
    const src = Number(k.split("|")[0]);
    const parts = subs.filter((s) => s.src === src).sort((a, b) => a.x - b.x);
    if (parts.length !== rs.length) continue;
    rs.sort((a, b) => a.f.x - b.f.x);
    rs.forEach((r, i) => {
      const p = parts[i]!;
      const n = norm(p.raw);
      r.label = p.raw;
      r.known = !!LABELS[n];
      r.stem = LABELS[n] ?? camel(n.split(" ").slice(0, 5).join(" "));
      if (/address for service/i.test(r.headText ?? "") && ADDRESS_STEMS[r.stem]) r.stem = ADDRESS_STEMS[r.stem]!;
    });
  }
}

// Date triples: qualify day/month/year with the sentence to the left of the row
// ("This tenancy ... starts on:" -> startDay / startMonth / startYear).
{
  const byBand = new Map<string, Row[]>();
  for (const r of rows) {
    if (!/^(day|month|year)$/.test(r.stem)) continue;
    const k = bandKey(r.f.page, r.f.y);
    (byBand.get(k) ?? byBand.set(k, []).get(k)!).push(r);
  }
  for (const rs of byBand.values()) {
    if (rs.length < 2) continue;
    const leftmost = rs.reduce((a, b) => (a.f.x <= b.f.x ? a : b));
    const line = spans
      .filter((s) => s.page === leftmost.f.page && Math.abs(s.y - leftmost.f.y) < 14 && s.x < leftmost.f.x)
      .sort((a, b) => a.x - b.x)
      .map((s) => s.text)
      .join(" ");
    const q = DATE_QUALIFIERS.find(([re]) => re.test(line))?.[1];
    if (!q) continue;
    for (const r of rs) r.stem = q + r.stem[0]!.toUpperCase() + r.stem.slice(1);
  }
}

// Repeated blocks: the same (prefix, stem) used by several widgets becomes row 1, 2, 3 ...
// in reading order, and the row index is suffixed onto the prefix (landlord, landlord2).
const groups = new Map<string, Row[]>();
for (const r of rows) {
  const k = `${r.f.page}|${r.prefix}|${r.stem}`;
  (groups.get(k) ?? groups.set(k, []).get(k)!).push(r);
}
// A "row" of a repeated block is a y band; number bands top-down, shared across the stems
// of one prefix so landlord row 2's last name and first name get the same index.
const bandsByPrefix = new Map<string, number[]>();
for (const [k, rs] of groups) {
  if (rs.length < 2 || rs.some((r) => r.grid)) continue;
  const prefix = k.split("|").slice(0, 2).join("|");
  const ys = rs.map((r) => r.f.y).sort((a, b) => b - a);
  const list = bandsByPrefix.get(prefix) ?? [];
  for (const y of ys) if (!list.some((b) => Math.abs(b - y) < 14)) list.push(y);
  bandsByPrefix.set(prefix, list);
}
for (const [p, list] of bandsByPrefix) list.sort((a, b) => b - a);

// A "daytime phone number" label serves two boxes: the narrow area-code box and the number
// box to its right. The second box on the same baseline takes the ...Number stem.
for (const [k, rs] of groups) {
  if (rs.length < 2) continue;
  if (!/Area$/.test(rs[0]!.stem)) continue;
  const band = new Map<number, Row[]>();
  for (const r of rs) {
    const key = [...band.keys()].find((b) => Math.abs(b - r.f.y) < 8) ?? r.f.y;
    (band.get(key) ?? band.set(key, []).get(key)!).push(r);
  }
  for (const list of band.values()) {
    list.sort((a, b) => a.f.x - b.f.x);
    for (let i = 1; i < list.length; i++) list[i]!.stem = list[i]!.stem.replace(/Area$/, "Number");
  }
}

const labelUse = new Map<string, number>();
for (const r of rows) labelUse.set(norm(r.label), (labelUse.get(norm(r.label)) ?? 0) + 1);

const used = new Set<string>();
const fieldsOut: Record<string, any> = {};
for (const r of rows) {
  let prefix = r.prefix;
  const bands = r.grid ? undefined : bandsByPrefix.get(`${r.f.page}|${r.prefix}`);
  const dup = !r.grid && rows.filter((o) => o.f.page === r.f.page && o.prefix === r.prefix && o.stem === r.stem).length > 1;
  if (bands && dup) {
    const i = bands.findIndex((b) => Math.abs(b - r.f.y) < 14);
    if (i > 0) prefix = `${prefix}${i + 1}`;
  }
  let key = prefix ? `${prefix}.${r.stem}` : r.stem;
  let n = 2;
  while (used.has(key)) key = `${prefix ? prefix + "." : ""}${r.stem}${n++}`;
  used.add(key);

  const ambiguous = (labelUse.get(norm(r.label)) ?? 0) > 1;
  const confidence =
    !r.known || !r.label ? "low" : r.cost < 22 && !ambiguous ? "high" : "medium";

  fieldsOut[key] = {
    pdf: r.f.name,
    type: r.f.type,
    ...(r.f.type === "checkbox" || r.f.type === "radio"
      ? { on: r.f.on?.find((v: string) => v !== "Off") ?? "On" }
      : {}),
    confidence,
    label: r.label,
  };
}

const text = await pdfText(pdf);
const rev = text.match(/#?RTB[-–]\s?\d+[a-z]?\s*\((\d{4}\/\d{2})\)/i);

await mkdir("out", { recursive: true });
const outPath = `out/${base}.map.candidate.json`;
await writeFile(
  outPath,
  JSON.stringify(
    { form: base.toUpperCase(), revision: rev?.[1] ?? "unknown", fields: fieldsOut },
    null,
    2,
  ),
);
const by = { high: 0, medium: 0, low: 0 } as Record<string, number>;
for (const e of Object.values(fieldsOut) as any[]) by[e.confidence]!++;
console.log(`${Object.keys(fieldsOut).length} fields -> ${outPath}`, by);
