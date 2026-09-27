// Normalised label text -> semantic key stem, and section heading text -> key prefix.
// Mined from the hand-verified maps/bc/RTB-1.map.json: for each key there, the label the
// position heuristic finds near its widget is the dictionary entry.

// lower case, strip punctuation and collapse whitespace
export function norm(s: string): string {
  return s
    .toLowerCase()
    .replace(/[’']/g, "")
    .replace(/[^a-z0-9#]+/g, " ")
    .trim();
}

export function camel(s: string): string {
  const parts = norm(s).replace(/#/g, " number ").split(" ").filter(Boolean);
  if (!parts.length) return "field";
  return parts
    .map((p, i) => (i === 0 ? p : p[0]!.toUpperCase() + p.slice(1)))
    .join("")
    .replace(/^(\d)/, "n$1")
    .slice(0, 40);
}

// label -> stem
export const LABELS: Record<string, string> = {
  "last name": "lastName",
  "first and middle name s": "firstName",
  "first and middle names": "firstName",
  "first and middle name": "firstName",
  "landlord f irst and middle name or business name": "firstName",
  "landlord f irst and middle name": "firstName",
  "landlord last name": "lastName",
  "f irst and middle name": "firstName",
  "possession date": "possessionDate",
  "move in inspection date": "moveInInspectionDate",
  "move out date": "moveOutDate",
  "move out inspection date": "moveOutInspectionDate",
  "on move in": "moveIn",
  "on move out": "moveOut",
  comment: "comment",
  code: "code",
  "street number and street name": "street",
  "street and name": "street",
  "street # and name": "street",
  "site unit #": "unitNumber",
  "street number and street name of rental unit": "street",
  city: "city",
  province: "province",
  "postal code": "postalCode",
  "unit number": "unitNumber",
  "unit site #": "unitNumber",
  "unit #": "unitNumber",
  "daytime phone number": "phoneArea",
  "other phone number": "otherPhoneArea",
  "phone number": "phoneArea",
  "fax number for service": "faxArea",
  "email address for service": "email",
  "other email address for service": "emailAlt",
  email: "email",
  day: "day",
  month: "month",
  year: "year",
  date: "date",
  signature: "signature",
  "signature of landlord": "signature",
  "signature of tenant": "signature",
  time: "time",
  water: "water",
  electricity: "electricity",
  heat: "heat",
  "natural gas": "naturalGas",
  "snow removal": "snowRemoval",
  "recreation facilities": "recreationFacilities",
  "garbage collection": "garbageCollection",
  "kitchen scrap collection": "kitchenScrapCollection",
  "free laundry": "freeLaundry",
  "laundry coin op": "laundryCoinOp",
  laundry: "laundry",
  refrigerator: "fridge",
  stove: "stove",
  furniture: "furniture",
  carpets: "carpets",
  "window coverings": "windowCoverings",
  cablevision: "cablevision",
  "internet services": "internet",
  internet: "internet",
  "sewage disposal": "sewageDisposal",
  "recycling services": "recyclingServices",
  dishwasher: "dishwasher",
  storage: "storage",
  parking: "parking",
  "parking for": "parkingSpaces",
  other: "other",
  "other 1": "other",
  yes: "yes",
  no: "no",
  "n a": "notApplicable",
  amount: "amount",
  address: "address",
  "rental unit": "rentalUnit",
  "condition on move in": "moveIn",
  "condition on move out": "moveOut",
  "condition at beginning of tenancy": "moveIn",
  "condition at the beginning of tenancy": "moveIn",
  "condition at end of tenancy": "moveOut",
  "condition at the end of tenancy": "moveOut",
};

// a day/month/year triple is qualified by the sentence to its left ("... starts on:")
export const DATE_QUALIFIERS: [RegExp, string][] = [
  [/\bstart|\bbegin|\bcommenc/i, "start"],
  [/\bend(s|ing)?\b|\bexpir/i, "end"],
  [/\bdue\b|\bby\b|\bpay|\brequired to\b/i, "due"],
  [/\bmove[- ]?in\b/i, "moveIn"],
  [/\bmove[- ]?out\b/i, "moveOut"],
  [/\bsign|\bdated\b/i, "signed"],
];

// inside an "address for service" block these stems belong to the party's address
export const ADDRESS_STEMS: Record<string, string> = {
  unitNumber: "addressUnit",
  street: "addressStreet",
  city: "addressCity",
  province: "addressProvince",
  postalCode: "addressPostalCode",
};

// sub-heading (a short left-indented line ending in ":") -> an extra key level
export const SUBSECTIONS: Record<string, string> = {
  "what is included in the rent": "includes",
  "rent includes": "includes",
};

// section heading -> key prefix
export const SECTIONS: Record<string, string> = {
  "landlord s": "landlord",
  "tenant s": "tenant",
  landlords: "landlord",
  tenants: "tenant",
  "address of place being rented to tenant s": "premises",
  "address for service": "landlord",
  "beginning and term of the agreement": "tenancy",
  rent: "rent",
  "security deposit and pet damage deposit": "deposit",
  addendum: "addendum",
  "tenancy agreement signed by": "signatures",
  "condition inspection report": "inspection",
  "legal name of landlord s": "landlord",
  "legal name of tenant s": "tenant",
  "legal name of tenant s agent": "tenantAgent",
  "landlord s address for service": "landlord",
  "address of rental unit": "premises",
};
