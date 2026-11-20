const assert = require("node:assert/strict");
const test = require("node:test");
const {
  correctRouting, recover, plan, recommendationReason, cheaperMatch, respondToReply, visitSlots, bookVisit
} = require("../demo-journey.js");
const { website, crm } = require("../sample-data.js");

const routingInquiry = website.find((row) => row.lead_id === "LD-1024");
const routingRecord = crm.find((row) => row.lead_id === routingInquiry.lead_id);
const mayaInquiry = website.find((row) => row.lead_id === "LD-1002");

test("rejects a dealership that differs from the website inquiry", () => {
  const correction = correctRouting(routingInquiry, crm, routingRecord.dealership);

  assert.equal(correction.status, "wrong-destination");
  assert.strictEqual(correction.records, crm);
});

test("corrects only the dealership on the one matching sales record", () => {
  const correction = correctRouting(
    { ...routingInquiry, lead_id: " ld-1024 " },
    crm,
    " harborline motors "
  );

  assert.equal(correction.status, "corrected");
  assert.equal(correction.records.length, crm.length);
  assert.notStrictEqual(correction.records, crm);
  assert.equal(routingRecord.dealership, "Cedar Ridge Auto");
  for (const [index, record] of crm.entries()) {
    if (record === routingRecord) {
      assert.deepEqual(correction.records[index], { ...record, dealership: "Harborline Motors" });
    } else {
      assert.strictEqual(correction.records[index], record);
    }
  }
});

test("a routing correction retry keeps the first correction without another write", () => {
  const first = correctRouting(routingInquiry, crm, routingInquiry.dealership);
  const retry = correctRouting(routingInquiry, first.records, routingInquiry.dealership);

  assert.equal(first.status, "corrected");
  assert.equal(retry.status, "unchanged");
  assert.strictEqual(retry.records, first.records);
});

test("does not create a missing record during a routing correction", () => {
  const records = crm.filter((row) => row !== routingRecord);
  const correction = correctRouting(routingInquiry, records, routingInquiry.dealership);

  assert.equal(correction.status, "missing");
  assert.strictEqual(correction.records, records);
});

test("leaves duplicate inquiry IDs untouched", () => {
  const records = [...crm, { ...routingRecord, lead_id: " ld-1024 " }];
  const correction = correctRouting(routingInquiry, records, routingInquiry.dealership);

  assert.equal(correction.status, "duplicate");
  assert.strictEqual(correction.records, records);
});

test("original inquiry recovery still inserts once and skips retries", () => {
  const first = recover(mayaInquiry, crm);
  const retry = recover({ ...mayaInquiry, lead_id: " ld-1002 " }, first.records);

  assert.equal(first.added, true);
  assert.equal(first.records.length, crm.length + 1);
  assert.deepEqual(first.records.at(-1), mayaInquiry);
  assert.notStrictEqual(first.records.at(-1), mayaInquiry);
  assert.equal(retry.added, false);
  assert.strictEqual(retry.records, first.records);
});

test("preserves the default reply and records its offered appointment", () => {
  const offer = plan(mayaInquiry, 32000, "soon");

  assert.equal(offer.reply, "Hi Maya! Stock B371 is available for $30,900. Would Saturday morning work for a test drive?");
  assert.equal(offer.appointment, "Saturday morning");
});

test("combines a shorter reply with a Monday visit, even while browsing", () => {
  const initial = plan(mayaInquiry, 32000, "exploring");
  const edited = plan(mayaInquiry, 32000, "exploring", undefined, { short: true, alternateTime: true });

  assert.equal(initial.appointment, "");
  assert.equal(edited.reply, "Hi Maya! Stock B371 is $30,900. Test drive Monday afternoon?");
  assert.ok(edited.reply.length < initial.reply.length);
  assert.equal(edited.appointment, "Monday afternoon");
  assert.equal(edited.buyerMessage, initial.buyerMessage);
});

test("keeps pricing in an abbreviated reply even after picking another stock number", () => {
  const edited = plan(mayaInquiry, 28000, "soon", "C209", { short: true });

  assert.match(edited.reply, /C209.*\$27,600/);
  assert.equal(edited.appointment, "Saturday morning");
});

test("finds the lowest-priced match strictly cheaper than the current vehicle", () => {
  const offer = plan(mayaInquiry, 36000, "soon", "C633");
  const cheapest = cheaperMatch(offer.matches, offer.recommended);

  assert.equal(cheapest.stock, "C209");
  assert.equal(cheaperMatch(offer.matches, cheapest), undefined);
  assert.equal(cheaperMatch(offer.matches, undefined), undefined);
});

test("explains the selected stock, its all-wheel drive, and exact budget difference", () => {
  const requested = plan(mayaInquiry, 32000, "soon").recommended;
  const alternative = plan(mayaInquiry, 28000, "soon").recommended;

  assert.equal(recommendationReason(mayaInquiry, 32000, requested),
    "Maya asked about this car. It has all-wheel drive and is $1,100 under budget.");
  assert.equal(recommendationReason(mayaInquiry, 28000, alternative),
    "It has all-wheel drive and is $400 under budget.");
  assert.equal(recommendationReason(mayaInquiry, 20000, undefined),
    "No all-wheel-drive SUV fits this budget.");
});

test("an interested buyer accepts the actual offered time or asks for a team follow-up", () => {
  const scheduled = plan(mayaInquiry, 32000, "soon", undefined, { alternateTime: true });
  const browsing = plan(mayaInquiry, 32000, "exploring");
  const unavailable = plan(mayaInquiry, 20000, "soon", undefined, { alternateTime: true });

  const acceptance = respondToReply(mayaInquiry, scheduled, "interested", 32000);
  assert.equal(acceptance.nextAction, "visit");
  assert.match(acceptance.message, /Monday afternoon/);
  assert.strictEqual(acceptance.car, scheduled.recommended);
  assert.equal(respondToReply(mayaInquiry, browsing, "interested", 32000).nextAction, "task");
  assert.equal(unavailable.appointment, "");
  assert.equal(respondToReply(mayaInquiry, unavailable, "interested", 20000).nextAction, "task");
});

test("a cheaper request offers an affordable alternative or asks for a team follow-up", () => {
  const offer = plan(mayaInquiry, 32000, "soon");
  const alternative = respondToReply(mayaInquiry, offer, "cheaper", 32000);
  const constrained = respondToReply(mayaInquiry, offer, "cheaper", 27000);

  assert.equal(alternative.nextAction, "draft");
  assert.equal(alternative.car.stock, "C209");
  assert.match(alternative.detail, /\$27,600/);
  assert.equal(constrained.nextAction, "task");
  assert.equal(constrained.car, undefined);
});

test("each offered visit window has one taken slot and two available slots", () => {
  const saturday = plan(mayaInquiry, 32000, "soon").appointment;
  const monday = plan(mayaInquiry, 32000, "soon", undefined, { alternateTime: true }).appointment;

  assert.deepEqual(visitSlots(saturday), [
    { id: "sat-0930", time: "9:30 AM", available: false },
    { id: "sat-1030", time: "10:30 AM", available: true },
    { id: "sat-1130", time: "11:30 AM", available: true }
  ]);
  assert.deepEqual(visitSlots(monday), [
    { id: "mon-1530", time: "3:30 PM", available: false },
    { id: "mon-1630", time: "4:30 PM", available: true },
    { id: "mon-1730", time: "5:30 PM", available: true }
  ]);
  assert.deepEqual(visitSlots(""), []);
});

test("changing a returned slot does not change later availability", () => {
  const slots = visitSlots("Saturday morning");
  slots[0].available = true;
  slots.pop();

  const fresh = visitSlots("Saturday morning");
  assert.equal(fresh.length, 3);
  assert.equal(fresh[0].available, false);
});

test("booking rejects taken, unknown, and mismatched-window slots", () => {
  for (const slotId of ["sat-0930", "missing", "mon-1630"]) {
    assert.deepEqual(bookVisit("Saturday morning", slotId), { status: "unavailable", booking: null });
  }
});

test("booking selects a valid time and preserves it on a repeat attempt", () => {
  const first = bookVisit("Monday afternoon", "mon-1630");
  assert.deepEqual(first, {
    status: "booked", booking: { id: "mon-1630", time: "4:30 PM", window: "Monday afternoon" }
  });

  const retry = bookVisit("Monday afternoon", "mon-1730", first.booking);
  assert.equal(retry.status, "already-booked");
  assert.strictEqual(retry.booking, first.booking);
});
