// Builds maps/RTB-27.map.json: the grid pages are generated from the printed row labels and
// column positions, the identification and signature pages come from the hand-checked table
// below (checked against a marker render of every page).
import { createHash } from "node:crypto";
import { readFile, writeFile } from "node:fs/promises";
import { loadLayout, pdfText } from "./layout";
import { camel, norm, LABELS } from "./label-dict";

const { pdf, fields, spans } = await loadLayout("forms/RTB-27.pdf");

// --- hand-checked keys for the non-grid pages (raw PDF field name -> semantic key)
const HAND: Record<string, string> = {
  Text1: "landlord.firstName",
  Text2: "landlord.lastName",
  "landlord first and middle name": "landlord2.firstName",
  Text3: "landlord2.lastName",
  Text4: "landlord.addressUnit",
  Text5: "landlord.addressStreet",
  Text6: "landlord.addressCity",
  province: "landlord.addressProvince",
  Text7: "landlord.addressPostalCode",
  Text8: "tenant.firstName",
  "last name": "tenant.lastName",
  "first and middle name": "tenant2.firstName",
  "last name_2": "tenant2.lastName",
  Text9: "premises.unitNumber",
  "street  and name": "premises.street",
  city: "premises.city",
  province_2: "premises.province",
  "postal code": "premises.postalCode",
  Date10_af_date: "inspection.possessionDate",
  Date11_af_date: "inspection.moveInDate",
  Date12_af_date: "inspection.moveOutDate",
  Date13_af_date: "inspection.moveOutInspectionDate",
  Text14: "tenantAgent.moveIn",
  Text15: "tenantAgent.moveOut",
  // X / Y, page 5
  "List Repairs to be complete at the start of the tenancy": "startOfTenancy.repairsList",
  Text122: "startOfTenancy.tenantName",
  "Check Box123": "startOfTenancy.tenantAgrees",
  "Check Box124": "startOfTenancy.tenantDisagrees",
  "tenant not agree reasons": "startOfTenancy.disagreeReasons",
  "List Damage to the rental unit or residential property for which the tenant is responsible_2":
    "endOfTenancy.damageList",
  // Z / 1-6, page 6
  Text125: "endOfTenancy.tenantName",
  "Check Box127": "endOfTenancy.tenantAgrees",
  "Check Box128": "endOfTenancy.tenantDisagrees",
  "2 I tenants name": "endOfTenancy.disagreeReasons",
  Text141: "deductions.tenantName",
  Text130: "deductions.securityDeposit",
  Text131: "deductions.petDamageDeposit",
  Date132_af_date: "deductions.date",
  Signature2: "deductions.tenantSignature",
  Signature1: "signatures.landlordMoveIn",
  Signature3: "signatures.landlordMoveOut",
  Signature4: "signatures.tenantMoveIn",
  Signature5: "signatures.tenantMoveOut",
  Text10: "forwarding.unitNumber",
  Text11: "forwarding.street",
  Text12: "forwarding.city",
  Text13: "forwarding.province",
  Text16: "forwarding.postalCode",
  Text17: "forwarding.email",
  "ll first middle end": "landlordEnd.firstName",
  "ll last end": "landlordEnd.lastName",
  "ll unit end": "landlordEnd.addressUnit",
  "ll street end": "landlordEnd.addressStreet",
  "ll city end": "landlordEnd.addressCity",
  "ll province end": "landlordEnd.addressProvince",
  "ll postal code end": "landlordEnd.addressPostalCode",
};

// --- grid pages: row label (left column) x column position
const COLS: [number, string][] = [
  [300, "moveIn.comment"],
  [410, "moveIn.code"],
  [520, "moveOut.comment"],
  [Infinity, "moveOut.code"],
];

// section headings that wrap onto two printed lines, so only the first line is extracted
const PREFIX_FIX: Record<string, string> = {
  main: "mainBathroom",
  master: "masterBedroom1",
  stairwell: "stairwellAndHall",
  garageOr: "garageOrParking",
  keysAndTypeOf: "keys",
};

const out: Record<string, { pdf: string; type: string; on?: string }> = {};
const used = new Set<string>();
const put = (key: string, f: (typeof fields)[number]) => {
  let k = key;
  let n = 2;
  while (used.has(k)) k = `${key}${n++}`;
  used.add(k);
  out[k] = {
    pdf: f.name,
    type: f.type,
    ...(f.type === "checkbox" ? { on: f.on?.find((v) => v !== "Off") ?? "On" } : {}),
  };
};

const pagesWithGrid = new Set([1, 2, 3]);
for (const f of fields) {
  if (HAND[f.name]) continue;
  if (!pagesWithGrid.has(f.page)) continue;
  // section: nearest "J.Entry" style heading above, in the far-left column
  let section = "";
  let bestY = Infinity;
  for (const s of spans) {
    if (s.page !== f.page || s.x > 100) continue;
    const m = s.text.match(/^\s*[A-Z]\s*[.)]\s*(\S.*)$/);
    if (!m) continue;
    // a section heading is printed level with the first row it covers, so allow a little
    // slack below the widget top before treating it as belonging to the next section
    if (s.y < f.y - 8 || s.y >= bestY) continue;
    bestY = s.y;
    section = camel(m[1]!.split(/\s+/).slice(0, 4).join(" "));
  }
  // row label: the text in the 100..206 band that overlaps this row vertically
  const label = spans
    .filter((s) => s.page === f.page && s.x > 100 && s.x < 206 && s.y + s.h / 2 > f.y - 1 && s.y + s.h / 2 < f.y + f.h + 1)
    .sort((a, b) => b.y - a.y || a.x - b.x)
    .map((s) => s.text.trim())
    .join(" ")
    // extractText splits a styled first letter into its own span ("L" + "ighting")
    .replace(/\b([A-Za-z]) (?=[a-z])/g, "$1");
  const n = norm(label);
  const stem = n ? LABELS[n] ?? camel(n) : "blank";
  const col = COLS.find(([x]) => f.x < x)![1];
  section = PREFIX_FIX[section] ?? section;
  put(`${section ? section + "." : ""}${stem}.${col}`, f);
}
for (const f of fields) {
  if (!HAND[f.name]) continue;
  put(HAND[f.name]!, f);
}
// anything left (keys/controls page, signature page) keeps the automap key shape
const cand = JSON.parse(await Bun.file("out/RTB-27.map.candidate.json").text());
const candByPdf = new Map<string, string>(
  (Object.entries(cand.fields) as [string, any][]).map(([k, e]) => [e.pdf, k]),
);
for (const f of fields) {
  if (HAND[f.name] || pagesWithGrid.has(f.page)) continue;
  put(candByPdf.get(f.name) ?? camel(f.name), f);
}

const text = await pdfText(pdf);
const rev = text.match(/#RTB-27 \((\d{4}\/\d{2})\)/)![1];
const catalog = JSON.parse(await readFile("data/bc-rtb-forms.json", "utf8"));
const source = catalog.forms.find((f: any) => f.id === "RTB-27").official_url;
const pdfSha = createHash("sha256")
  .update(new Uint8Array(await readFile("forms/RTB-27.pdf")))
  .digest("hex");
await writeFile(
  "maps/RTB-27.map.json",
  JSON.stringify({ form: "RTB-27", revision: rev, source, pdf_sha256: pdfSha, fields: out }, null, 2) + "\n",
);
console.log(`RTB-27 (${rev}): ${Object.keys(out).length} keys -> maps/RTB-27.map.json`);
