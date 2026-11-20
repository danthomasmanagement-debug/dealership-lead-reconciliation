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

  function normalizeKey(value) {
    return value.trim().toUpperCase();
  }

  function recover(inquiry, salesRecords) {
    const id = normalizeKey(inquiry.lead_id);
    const alreadyPresent = salesRecords.some((row) => normalizeKey(row.lead_id) === id);
    return {
      records: alreadyPresent ? salesRecords : [...salesRecords, { ...inquiry }],
      added: !alreadyPresent
    };
  }

  function correctRouting(inquiry, salesRecords, dealership) {
    const destination = normalizeKey(inquiry.dealership);
    if (!destination || typeof dealership !== "string" || normalizeKey(dealership) !== destination) {
      return { records: salesRecords, status: "wrong-destination" };
    }

    const inquiryId = normalizeKey(inquiry.lead_id);
    const matchingRecords = salesRecords.filter((row) => normalizeKey(row.lead_id) === inquiryId);
    if (matchingRecords.length === 0) return { records: salesRecords, status: "missing" };
    if (matchingRecords.length > 1) return { records: salesRecords, status: "duplicate" };

    const [salesRecord] = matchingRecords;
    if (normalizeKey(salesRecord.dealership) === destination) {
      return { records: salesRecords, status: "unchanged" };
    }
    const records = salesRecords.map((row) => row === salesRecord ? { ...row, dealership: inquiry.dealership } : row);
    return { records, status: "corrected" };
  }

  function plan(inquiry, budget, timing, preferredStock, { short = false, alternateTime = false } = {}) {
    const interestedStock = inquiry.vehicle;
    const requestedVehicle = inventory.find((car) => car.stock === interestedStock);
    const readyToVisit = timing === "soon";
    const matches = inventory.filter((car) => car.type === "SUV" && car.drive === "AWD" && car.price < budget)
      .sort((left, right) => Number(right.stock === interestedStock) -
        Number(left.stock === interestedStock) || left.price - right.price);
    const recommended = matches.find((car) => car.stock === preferredStock) || matches[0];
    const appointment = recommended && (readyToVisit || alternateTime)
      ? alternateTime ? "Monday afternoon" : "Saturday morning"
      : "";
    const buyerMessage = readyToVisit
      ? "Is stock " + interestedStock + " still available? I’m looking for an all-wheel-drive SUV under " +
        dollars.format(budget) + ". I can stop by this weekend."
      : "Is stock " + interestedStock + " still available? I’m comparing all-wheel-drive SUVs under " +
        dollars.format(budget) + " and haven’t decided when I’ll come in.";
    const firstName = inquiry.customer.split(" ")[0];
    let reply = "Hi " + firstName + "! ";
    if (!short && requestedVehicle && requestedVehicle.price >= budget) {
      reply += "Stock " + interestedStock + " is " +
        dollars.format(requestedVehicle.price) + ", above your limit. ";
    }
    if (recommended) {
      if (short) {
        reply += "Stock " + recommended.stock + " is " + dollars.format(recommended.price) + ". ";
        reply += appointment ? "Test drive " + appointment + "?" : "Want the details?";
      } else {
        reply += recommended.stock === interestedStock
          ? "Stock " + recommended.stock + " is available for " + dollars.format(recommended.price) + ". "
          : "I found an AWD " + recommended.model + " for " + dollars.format(recommended.price) + " (stock " + recommended.stock + "). ";
        reply += appointment ? "Would " + appointment + " work for a test drive?" : "Would you like more details while you compare options?";
      }
    } else {
      reply += short ? "Want an update when a matching SUV comes in?" :
        "I can keep an eye out for an all-wheel-drive SUV in your budget. Would you like an update when one comes in?";
    }
    return {
      matches, recommended, buyerMessage, reply, appointment,
      intent: readyToVisit ? "Hot lead" : "Still browsing",
      reason: readyToVisit ? "Asked about a specific car and offered a visit window." :
        "Asked about a specific car, with no visit date yet."
    };
  }

  function recommendationReason(inquiry, budget, car) {
    if (!car) return "No all-wheel-drive SUV fits this budget.";

    const matchesRequest = car.stock === inquiry.vehicle;
    const firstName = inquiry.customer.split(" ")[0];
    const fit = dollars.format(budget - car.price) + " under budget";
    return matchesRequest
      ? firstName + " asked about this car. It has all-wheel drive and is " + fit + "."
      : "It has all-wheel drive and is " + fit + ".";
  }

  function cheaperMatch(matches, car) {
    if (!car) return undefined;

    return matches.reduce((cheapest, match) => {
      if (match.price >= car.price) return cheapest;
      return !cheapest || match.price < cheapest.price ? match : cheapest;
    }, undefined);
  }

  function respondToReply(inquiry, offer, kind, budget) {
    if (kind === "cheaper") {
      const message = "Do you have anything cheaper?";
      const car = cheaperMatch(offer.matches.filter((match) => match.price < budget), offer.recommended);
      if (car) {
        return {
          message, nextAction: "draft", car,
          detail: "Suggest stock " + car.stock + " at " + dollars.format(car.price) + "."
        };
      }
      return {
        message, nextAction: "task", car,
        detail: "Ask the sales team to look for a lower-priced option."
      };
    }
    if (kind !== "interested") throw new RangeError("Unknown sample response.");

    const car = offer.recommended;
    if (offer.appointment) {
      return {
        message: offer.appointment + " works for me!", nextAction: "visit", car,
        detail: "Record a sample test drive for " + offer.appointment + "."
      };
    }
    const firstName = inquiry.customer.split(" ")[0];
    return {
      message: "I’m interested. Could you send me more details?", nextAction: "task", car,
      detail: "Ask the sales team to follow up with " + firstName + "."
    };
  }

  const api = { recover, correctRouting, plan, recommendationReason, cheaperMatch, respondToReply, dollars };
  if (typeof module === "object" && module.exports) module.exports = api;
  else scope.LeadDemoJourney = api;
})(globalThis);
