(function (scope) {
  "use strict";

  const fields = {
    lead_id: "Lead ID",
    customer: "Customer",
    dealership: "Dealership",
    vehicle: "Vehicle / stock ID",
    submitted_at: "Submitted at"
  };
  const headers = Object.keys(fields);
  const comparedFields = headers.slice(1);
  const statusLabels = {
    missing: "Missing from CRM",
    duplicate: "Duplicate",
    mismatch: "Field mismatch",
    crm_only: "CRM only",
    matched: "Matched"
  };
  const statusOrder = Object.keys(statusLabels);

  function readCsv(text) {
    const records = [];
    let row = [];
    let field = "";
    let quoted = false;
    let quoteClosed = false;
    let line = 1;
    let recordStart = 1;

    function finishField() {
      row.push(field);
      field = "";
      quoteClosed = false;
    }

    function finishRecord() {
      finishField();
      if (row.length > 1 || row[0].trim()) records.push({ values: row, line: recordStart });
      row = [];
    }

    const input = text.replace(/^\uFEFF/, "");
    for (let index = 0; index < input.length; index += 1) {
      const character = input[index];
      if (quoted) {
        if (character === '"' && input[index + 1] === '"') {
          field += '"';
          index += 1;
        } else if (character === '"') {
          quoted = false;
          quoteClosed = true;
        } else {
          field += character;
          if (character === "\n") line += 1;
        }
      } else if (character === ",") {
        finishField();
      } else if (character === "\n" || character === "\r") {
        if (character === "\r" && input[index + 1] === "\n") index += 1;
        finishRecord();
        line += 1;
        recordStart = line;
      } else if (quoteClosed && (character === " " || character === "\t")) {
        continue;
      } else if (quoteClosed) {
        throw new Error("Unexpected character after a closing quote on line " + line + ".");
      } else if (character === '"') {
        if (field.length) throw new Error("Unexpected quote on line " + line + ".");
        quoted = true;
      } else {
        field += character;
      }
    }
    if (quoted) throw new Error("Unclosed quoted field starting on line " + recordStart + ".");
    if (row.length || field || quoteClosed) finishRecord();
    return records;
  }

  function parseSourceCsv(text, label) {
    try {
      const [header, ...records] = readCsv(text);
      if (!header) throw new Error("The CSV needs a header row.");
      const columnNames = header.values.map((value) => value.trim().toLowerCase());
      if (new Set(columnNames).size !== columnNames.length) throw new Error("Column names must be unique.");
      const missing = headers.filter((key) => !columnNames.includes(key));
      if (missing.length) throw new Error("Missing columns: " + missing.join(", ") + ".");
      const columnPositions = headers.map((key) => columnNames.indexOf(key));

      return records.map((record) => {
        if (record.values.length !== columnNames.length) {
          throw new Error("Line " + record.line + " has the wrong number of columns.");
        }
        const lead = Object.fromEntries(headers.map((key, index) => [
          key, record.values[columnPositions[index]].trim()
        ]));
        if (!lead.lead_id) throw new Error("Line " + record.line + " needs a lead ID.");
        return lead;
      });
    } catch (error) {
      throw new Error(label + ": " + error.message);
    }
  }

  function normalize(value) {
    return value.trim().replace(/\s+/g, " ").toLowerCase();
  }

  function groupLeads(records) {
    const groups = new Map();
    for (const record of records) {
      const key = record.lead_id.trim().toUpperCase();
      if (!groups.has(key)) groups.set(key, []);
      groups.get(key).push(record);
    }
    return groups;
  }

  function reconcile(websiteRecords, crmRecords) {
    const websiteGroups = groupLeads(websiteRecords);
    const crmGroups = groupLeads(crmRecords);
    const ids = new Set([...websiteGroups.keys(), ...crmGroups.keys()]);
    const rows = [];
    const counts = Object.fromEntries(statusOrder.map((status) => [status, 0]));
    let missingFromCrm = 0;

    for (const id of ids) {
      const website = websiteGroups.get(id) || [];
      const crm = crmGroups.get(id) || [];
      const repeated = website.length > 1 || crm.length > 1;
      const diffs = website.length === 1 && crm.length === 1
        ? comparedFields.filter((key) => {
          const webValue = normalize(website[0][key]);
          const crmValue = normalize(crm[0][key]);
          return !webValue || !crmValue || webValue !== crmValue;
        })
        : [];
      const reasons = [];
      if (website.length > 1) reasons.push(website.length + " website records share this lead ID.");
      if (crm.length > 1) reasons.push(crm.length + " CRM records share this lead ID.");
      if (!website.length) reasons.push("This lead ID only appears in the CRM export.");
      if (!crm.length) {
        reasons.push("This website lead has no matching CRM record.");
        missingFromCrm += 1;
      }
      if (diffs.length) reasons.push("Missing or different values: " + diffs.map((key) => fields[key]).join(", ") + ".");

      let status = "matched";
      if (repeated) status = "duplicate";
      else if (!crm.length) status = "missing";
      else if (!website.length) status = "crm_only";
      else if (diffs.length) status = "mismatch";

      counts[status] += 1;
      rows.push({ id, status, website, crm, diffs, reasons, lead: website[0] || crm[0] });
    }
    rows.sort((left, right) =>
      statusOrder.indexOf(left.status) - statusOrder.indexOf(right.status) ||
      left.id.localeCompare(right.id, "en", { numeric: true })
    );
    return {
      rows,
      counts,
      websiteCount: websiteRecords.length,
      crmCount: crmRecords.length,
      websiteUnique: websiteGroups.size,
      missingFromCrm,
      issueCount: rows.length - counts.matched
    };
  }

  function createCsv(columnNames, records, spreadsheetSafe = false) {
    function quote(value) {
      let string = String(value ?? "");
      if (spreadsheetSafe && /^[\t\r\n ]*[=+\-@]|^[\t\r\n]/.test(string)) string = "'" + string;
      return '"' + string.replace(/"/g, '""') + '"';
    }
    const lines = [columnNames, ...records.map((record) => columnNames.map((key) => record[key]))];
    return lines.map((line) => line.map(quote).join(",")).join("\r\n") + "\r\n";
  }

  function exceptionsCsv(result) {
    const columns = [
      "lead_id", "status", "customer", "dealership", "vehicle",
      "website_records", "crm_records", "fields_to_review", "notes"
    ];
    const exceptions = result.rows.filter((row) => row.status !== "matched").map((row) => ({
      lead_id: row.id,
      status: statusLabels[row.status],
      customer: row.lead.customer,
      dealership: row.lead.dealership,
      vehicle: row.lead.vehicle,
      website_records: row.website.length,
      crm_records: row.crm.length,
      fields_to_review: row.diffs.join(", "),
      notes: row.reasons.join(" ")
    }));
    return createCsv(columns, exceptions, true);
  }

  const api = { fields, headers, statusLabels, statusOrder, parseSourceCsv, reconcile, createCsv, exceptionsCsv };
  if (typeof module === "object" && module.exports) module.exports = api;
  else scope.LeadReconciliation = api;
})(globalThis);
