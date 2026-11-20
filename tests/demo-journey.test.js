const assert = require("node:assert/strict");
const test = require("node:test");
const { correctRouting, recover } = require("../demo-journey.js");
const { website, crm } = require("../sample-data.js");

const routingInquiry = website.find((row) => row.lead_id === "LD-1024");
const routingRecord = crm.find((row) => row.lead_id === routingInquiry.lead_id);

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
  const inquiry = website.find((row) => row.lead_id === "LD-1002");
  const first = recover(inquiry, crm);
  const retry = recover({ ...inquiry, lead_id: " ld-1002 " }, first.records);

  assert.equal(first.added, true);
  assert.equal(first.records.length, crm.length + 1);
  assert.deepEqual(first.records.at(-1), inquiry);
  assert.notStrictEqual(first.records.at(-1), inquiry);
  assert.equal(retry.added, false);
  assert.strictEqual(retry.records, first.records);
});
