(function (scope) {
  "use strict";

  const inventory = [
    { stock: "B371", model: "2023 Compact SUV", price: 30900, drive: "AWD", type: "SUV" },
    { stock: "C209", model: "2022 Compact SUV", price: 27600, drive: "AWD", type: "SUV" },
    { stock: "C633", model: "2024 Midsize SUV", price: 34900, drive: "AWD", type: "SUV" },
    { stock: "A214", model: "2023 Compact SUV", price: 24100, drive: "FWD", type: "SUV" },
    { stock: "D119", model: "2024 Sedan", price: 25500, drive: "AWD", type: "Sedan" }
  ];
  const dollars = new Intl.NumberFormat("en-US", { style: "currency", currency: "USD", maximumFractionDigits: 0 });

  function recover(inquiry, salesRecords) {
    const id = inquiry.lead_id.trim().toUpperCase();
    const alreadyPresent = salesRecords.some((row) => row.lead_id.trim().toUpperCase() === id);
    return {
      records: alreadyPresent ? salesRecords : [...salesRecords, { ...inquiry }],
      added: !alreadyPresent
    };
  }

  function plan(inquiry, budget, timing) {
    const interestedStock = inquiry.vehicle;
    const readyToVisit = timing === "soon";
    const matches = inventory.filter((car) => car.type === "SUV" && car.drive === "AWD" && car.price < budget)
      .sort((left, right) => Number(right.stock === interestedStock) -
        Number(left.stock === interestedStock) || left.price - right.price);
    const recommended = matches[0];
    const buyerMessage = readyToVisit
      ? "Is stock " + interestedStock + " still available? I’m looking for an all-wheel-drive SUV under " +
        dollars.format(budget) + ". I can stop by this weekend."
      : "I’m comparing all-wheel-drive SUVs under " + dollars.format(budget) +
        ". I haven’t decided when I’ll come in yet.";
    const firstName = inquiry.customer.split(" ")[0];
    let reply = "Hi " + firstName + ", thanks for telling us what you’re looking for. ";
    if (recommended) {
      reply += "We have a " + recommended.model + " with all-wheel drive for " +
        dollars.format(recommended.price) + " (stock " + recommended.stock + "). ";
      reply += readyToVisit ? "Would Saturday morning work for a test drive?" : "Would you like more details while you compare options?";
    } else {
      reply += "I can keep an eye out for an all-wheel-drive SUV in your budget. Would you like an update when one comes in?";
    }
    return {
      matches, buyerMessage, reply,
      intent: readyToVisit ? "Hot lead" : "Still browsing",
      reason: readyToVisit ? "Asked about a specific car and offered a visit window." :
        "Shared vehicle preferences with no visit date yet."
    };
  }

  const api = { recover, plan, dollars };
  if (typeof module === "object" && module.exports) module.exports = api;
  else scope.LeadDemoJourney = api;
})(globalThis);
