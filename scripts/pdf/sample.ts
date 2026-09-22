// Sample data keyed by semantic name (see forms/rtb1.map.json). Checkboxes take
// true/false; text fields take strings. Every one of the 122 mapped keys appears
// here, so `bun run fill` exercises the whole form.
//
// Mutually exclusive checkbox groups are respected: only one member of each is
// ticked (see the README for the list of groups).
export const sample: Record<string, string | boolean> = {
  // page 1: schedule of parties
  "form.rtb26Attached": false,

  // page 1: landlords (business name goes in the "last name" box)
  "landlord.businessName": "Sample Landlord Ltd.",
  "landlord.firstName": "",
  "landlord2.businessName": "Doe",
  "landlord2.firstName": "John Robert",

  // page 1: tenants
  "tenant.lastName": "Sample",
  "tenant.firstName": "Jane",
  "tenant2.lastName": "Sample",
  "tenant2.firstName": "Alex Lee",
  "tenant.phoneArea": "604",
  "tenant.phoneNumber": "555-0100",
  "tenant.email": "jane.sample@example.com",
  "tenant.otherPhoneArea": "778",
  "tenant.otherPhoneNumber": "555-0101",
  "tenant.emailAlt": "alex.sample@example.com",

  // page 1: rental unit address
  "premises.unitNumber": "101",
  "premises.street": "123 Example Street",
  "premises.city": "Vancouver",
  "premises.province": "BC",
  "premises.postalCode": "V5K 0A1",

  // page 1: landlord address for service (group: isLandlord / isAgent)
  "landlord.isLandlord": true,
  "landlord.isAgent": false,
  "landlord.addressUnit": "700",
  "landlord.addressStreet": "500 Sample Avenue",
  "landlord.addressCity": "Vancouver",
  "landlord.addressProvince": "BC",
  "landlord.addressPostalCode": "V6B 0A2",
  "landlord.phoneArea": "604",
  "landlord.phoneNumber": "555-0199",
  "landlord.otherPhoneArea": "604",
  "landlord.otherPhoneNumber": "555-0198",
  "landlord.email": "office@example.com",
  "landlord.faxArea": "604",
  "landlord.faxNumber": "555-0197",
  "landlord.emailAlt": "accounts@example.com",

  // page 2: start date and term (group: isMonthToMonth / isOtherPeriodic / isFixedTerm)
  "tenancy.startDay": "01",
  "tenancy.startMonth": "October",
  "tenancy.startYear": "2026",
  "tenancy.isMonthToMonth": true,
  "tenancy.isOtherPeriodic": false,
  // group: periodicIsWeekly / periodicIsBiweekly / periodicIsOther (only with B)
  "tenancy.periodicIsWeekly": false,
  "tenancy.periodicIsBiweekly": false,
  "tenancy.periodicIsOther": false,
  "tenancy.periodicOtherText": "",
  "tenancy.isFixedTerm": false,
  "tenancy.endDay": "",
  "tenancy.endMonth": "",
  "tenancy.endYear": "",
  // group: fixedTermContinues / fixedTermMustVacate (only with C)
  "tenancy.fixedTermContinues": false,
  "tenancy.fixedTermMustVacate": false,
  "tenancy.vacateReason": "",
  "tenancy.vacateRegulationSection": "",
  "tenancy.vacateLandlordInitials": "",
  "tenancy.vacateTenantInitials": "",

  // page 2: rent, $1500.00 each month, due on the 1st
  "rent.amount": "1500.00",
  // group: isDaily / isWeekly / isMonthly (payment frequency)
  "rent.isDaily": false,
  "rent.isWeekly": false,
  "rent.isMonthly": true,
  "rent.dueDayOfMonth": "1st",
  // group: increasePeriodIsDay / increasePeriodIsWeek / isSubjectToIncrease (rent period)
  "rent.increasePeriodIsDay": false,
  "rent.increasePeriodIsWeek": false,
  "rent.isSubjectToIncrease": true,

  // page 2: what is included in the rent (independent checkboxes, not a group)
  "rent.includes.water": true,
  "rent.includes.naturalGas": false,
  "rent.includes.garbageCollection": true,
  "rent.includes.fridge": true,
  "rent.includes.carpets": true,
  "rent.includes.cablevision": false,
  "rent.includes.sewageDisposal": true,
  "rent.includes.recyclingServices": true,
  "rent.includes.dishwasher": true,
  "rent.includes.parking": true,
  "rent.includes.parkingSpaces": "1",
  "rent.includes.electricity": true,
  "rent.includes.snowRemoval": true,
  "rent.includes.kitchenScrapCollection": true,
  "rent.includes.stove": true,
  "rent.includes.other1": true,
  "rent.includes.other1Text": "Bike locker",
  "rent.includes.internet": false,
  "rent.includes.storage": true,
  "rent.includes.laundryCoinOp": true,
  "rent.includes.windowCoverings": true,
  "rent.includes.other2": false,
  "rent.includes.other2Text": "",
  "rent.includes.heat": true,
  "rent.includes.recreationFacilities": false,
  "rent.includes.freeLaundry": false,
  "rent.includes.furniture": false,
  "rent.includes.other3": false,
  "rent.includes.other3Text": "",
  "rent.includes.additionalInfo": true,
  "rent.includes.additionalInfoText": "One assigned parking stall in the underground garage.",

  // page 3: security deposit $750.00 due 01 September 2026, pet deposit not applicable
  "deposit.securityAmount": "750.00",
  "deposit.dueDay": "01",
  "deposit.dueMonth": "September",
  "deposit.dueYear": "2026",
  "deposit.petDepositNotApplicable": true,
  "deposit.petAmount": "",
  "deposit.petDueDay": "",
  "deposit.petDueMonth": "",
  "deposit.petDueYear": "",

  // page 6: addendum (group: isAttached / isNotAttached)
  "addendum.isAttached": false,
  "addendum.isNotAttached": true,
  "addendum.pageCount": "",
  "addendum.additionalTermsCount": "",

  // page 6: signature block
  "signatures.landlord.lastName": "Sample Landlord Ltd.",
  "signatures.landlord.firstName": "",
  "signatures.landlord.signature": "Sample Landlord Ltd. (per J. Doe)",
  "signatures.landlord.date": "2026-09-22",
  "signatures.landlord2.lastName": "Doe",
  "signatures.landlord2.firstName": "John Robert",
  "signatures.landlord2.signature": "John R. Doe",
  "signatures.landlord2.date": "2026-09-22",
  "signatures.tenant.lastName": "Sample",
  "signatures.tenant.firstName": "Jane",
  "signatures.tenant.signature": "Jane Sample",
  "signatures.tenant.date": "2026-09-22",
  "signatures.tenant2.lastName": "Sample",
  "signatures.tenant2.firstName": "Alex Lee",
  "signatures.tenant2.signature": "Alex L. Sample",
  "signatures.tenant2.date": "2026-09-22",
};
