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

  const buyerNotes = {
    "LD-1001": {
      needs: "Fuel-efficient daily driver", budget: "$26,000", timing: "Within a month",
      message: "I have a long commute and would like to see fuel-efficient options. Is stock A214 available to test-drive?"
    },
    "LD-1005": {
      needs: "Four-door commuter", budget: "$28,000", timing: "This month",
      message: "Could you confirm the mileage on stock D119 and whether it has adaptive cruise control?"
    },
    "LD-1007": {
      needs: "Room for two car seats", budget: "$36,000", timing: "Within two weeks",
      message: "Can I see stock C633 this Saturday? I’d like to check how two car seats fit."
    },
    "LD-1008": {
      needs: "Compact car with parking sensors", budget: "$25,000", timing: "This week",
      message: "Is stock A214 still available? I’d like to see how it feels to park and ask about trade-in options."
    },
    "LD-1012": {
      needs: "Easy highway commute", budget: "$30,000", timing: "Within a month",
      message: "Could you send the service history for stock D119? I’m comparing a few cars for my commute."
    },
    "LD-1024": {
      needs: "Space for luggage and sports gear", budget: "$34,000", timing: "Next month",
      message: "Can you tell me how much cargo space stock C806 has with the rear seats up?"
    },
    "LD-1026": {
      needs: "Reliable second car", budget: "$27,000", timing: "Flexible",
      message: "Is stock D119 available in the evenings for a test drive? I’m looking for a second car."
    }
  };
  const sample = { website, crm, buyerNotes };
  if (typeof module === "object" && module.exports) module.exports = sample;
  else scope.LeadSampleData = sample;
})(globalThis);
