(function (scope) {
  "use strict";

  const customers = [
    "Avery Chen", "Maya Patel", "Jonah Lee", "Priya Desai", "Miles Cooper",
    "Taylor Brooks", "Rowan Kim", "Jamie Rivera", "Harper Nguyen", "Morgan Blake",
    "Noah Wilson", "Riley Morgan", "Aria Santos", "Samira Khan", "Cameron Scott",
    "Parker Reed", "Nina Park", "Drew Ellis", "Kai Bennett", "Isabel Cruz",
    "Jordan Price", "Quinn Ward", "Elliot Stone", "Ellis Martin", "Jules Silva",
    "Alex Flores", "Devon Shaw", "Reese Walker", "Sofia Bell", "Emery Fox"
  ];
  const dealerships = ["Cedar Ridge Auto", "Riverbend Motors", "Evergreen Auto Group", "Harborline Motors"];
  const vehicles = ["A214", "B371", "C806", "A508", "D119", "B274", "C633"];
  const website = customers.map((customer, index) => ({
    lead_id: "LD-" + (1001 + index),
    customer,
    dealership: dealerships[index % dealerships.length],
    vehicle: vehicles[index % vehicles.length],
    submitted_at: "2026-11-" + String(12 + Math.floor(index / 6)) + "T" +
      String(16 + index % 6).padStart(2, "0") + ":" + String((7 * index) % 60).padStart(2, "0") + ":00Z"
  }));
  const missingIds = new Set(["LD-1002", "LD-1008", "LD-1026"]);
  const crm = website.filter((record) => !missingIds.has(record.lead_id)).map((record) => ({ ...record }));
  crm.find((record) => record.lead_id === "LD-1005").vehicle = "A999";
  crm.find((record) => record.lead_id === "LD-1024").dealership = "Cedar Ridge Auto";
  crm.push({ ...crm.find((record) => record.lead_id === "LD-1007") });
  crm.push({
    lead_id: "LD-1031",
    customer: "Bailey Reed",
    dealership: "Riverbend Motors",
    vehicle: "E507",
    submitted_at: "2026-11-16T20:14:00Z"
  });
  website.push({ ...website.find((record) => record.lead_id === "LD-1012") });

  const sample = { website, crm };
  if (typeof module === "object" && module.exports) module.exports = sample;
  else scope.LeadSampleData = sample;
})(globalThis);
