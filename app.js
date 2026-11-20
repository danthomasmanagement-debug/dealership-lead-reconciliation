(function () {
  "use strict";

  const core = window.LeadReconciliation;
  const sample = window.LeadSampleData;
  const byId = (id) => document.getElementById(id);
  const formatNumber = new Intl.NumberFormat("en-US");
  const pageSize = 8;
  const filterButtons = Array.from(document.querySelectorAll("[data-filter]"));
  const dialog = byId("detail-dialog");
  const importForm = byId("import-form");
  const importButton = importForm.querySelector("button[type='submit']");
  const searchInput = byId("search");
  const legendCounts = new Map();
  let result;
  let filter = "issues";
  let page = 0;

  function element(tag, className, content) {
    const node = document.createElement(tag);
    if (className) node.className = className;
    if (content !== undefined) node.textContent = content;
    return node;
  }

  function setText(id, value) {
    byId(id).textContent = value;
  }

  function renderSummary(datasetLabel) {
    setText("dataset-label", datasetLabel);
    setText("web-count", formatNumber.format(result.websiteCount) + " records");
    setText("crm-count", formatNumber.format(result.crmCount) + " records");
    setText("union-count", formatNumber.format(result.rows.length) + " unique IDs");
    setText("matched-count", formatNumber.format(result.counts.matched));
    setText("exception-count", formatNumber.format(result.issueCount));
    setText("missing-count", formatNumber.format(result.missingFromCrm));
    setText("match-rate", result.websiteUnique ? Math.round(100 * result.counts.matched / result.websiteUnique) + "%" : "—");
    setText("match-rate-caption", formatNumber.format(result.counts.matched) + " of " +
      formatNumber.format(result.websiteUnique) + " unique website leads");
    byId("export").disabled = result.issueCount === 0;

    const segments = [];
    for (const status of core.statusOrder) {
      const count = result.counts[status];
      legendCounts.get(status).textContent = formatNumber.format(count);
      if (count) {
        const segment = element("span", "status-" + status);
        segment.style.flexGrow = String(count);
        segments.push(segment);
      }
    }
    byId("status-bar").replaceChildren(...segments);
  }

  function createLegend() {
    for (const status of core.statusOrder) {
      const item = element("li");
      const button = element("button", "status-" + status);
      button.type = "button";
      button.dataset.legendStatus = status;
      button.setAttribute("aria-pressed", "false");
      const dot = element("span", "legend-dot");
      dot.setAttribute("aria-hidden", "true");
      const count = element("b", "", "0");
      button.append(dot, element("span", "", core.statusLabels[status]), count);
      button.addEventListener("click", () => setFilter(filter === status ? "all" : status));
      legendCounts.set(status, count);
      item.append(button);
      byId("legend").append(item);
    }
  }

  function matchesFilter(row, query) {
    const matchesStatus = filter === "all" ||
      (filter === "issues" ? row.status !== "matched" : row.status === filter);
    if (!matchesStatus || !query) return matchesStatus;
    return [row.id, core.statusLabels[row.status], ...row.reasons,
      ...[...row.website, ...row.crm].flatMap((record) => Object.values(record))
    ].some((value) => value.toLowerCase().includes(query));
  }

  function createRow(row) {
    const tableRow = element("tr");
    const lead = element("td");
    lead.append(
      element("div", "record-name", row.lead.customer || "Unnamed lead"),
      element("span", "lead-id", row.id)
    );
    const dealer = element("td", "", row.lead.dealership || "—");
    const status = element("td");
    status.append(element("span", "status-pill status-" + row.status, core.statusLabels[row.status]));
    const action = element("td");
    const details = element("button", "text-button", "Details");
    details.type = "button";
    details.setAttribute("aria-label", "Details for " + row.id + ", " + (row.lead.customer || "unnamed lead"));
    details.addEventListener("click", () => showDetails(row));
    action.append(details);
    tableRow.append(lead, dealer, status, action);
    return tableRow;
  }

  function renderTable() {
    const query = searchInput.value.trim().toLowerCase();
    const matchingRows = result.rows.filter((row) => matchesFilter(row, query));
    const lastPage = Math.max(0, Math.ceil(matchingRows.length / pageSize) - 1);
    page = Math.min(page, lastPage);
    const start = page * pageSize;
    const visibleRows = matchingRows.slice(start, start + pageSize);
    const viewLabel = core.statusLabels[filter] || (filter === "issues" ? "Needs review" : "All leads");
    const countLabel = formatNumber.format(matchingRows.length) + (matchingRows.length === 1 ? " lead" : " leads");
    setText("table-caption", viewLabel + " · " + countLabel);

    for (const button of filterButtons) {
      button.setAttribute("aria-pressed", String(button.dataset.filter === filter));
    }
    for (const button of byId("legend").querySelectorAll("button")) {
      button.setAttribute("aria-pressed", String(button.dataset.legendStatus === filter));
    }
    const body = byId("rows");
    if (visibleRows.length) body.replaceChildren(...visibleRows.map(createRow));
    else {
      const message = query ? "No leads match your search." :
        filter === "issues" ? "There are no exceptions to review." : "No records in this view.";
      const row = element("tr");
      const cell = element("td", "empty-state", message);
      cell.colSpan = 4;
      row.append(cell);
      body.replaceChildren(row);
    }
    byId("pages").hidden = lastPage === 0;
    setText("page-label", (start + 1) + "–" + (start + visibleRows.length) + " of " + matchingRows.length);
    byId("previous").disabled = page === 0;
    byId("next").disabled = page === lastPage;
  }

  function setFilter(nextFilter) {
    filter = nextFilter;
    page = 0;
    renderTable();
  }

  function showDetails(row) {
    setText("detail-id", row.id);
    setText("detail-title", row.lead.customer || "Unnamed lead");
    const body = byId("detail-body");
    const status = element("p", "detail-note");
    status.append(element("span", "status-pill status-" + row.status, core.statusLabels[row.status]));
    const notes = element("p", "detail-note", row.reasons.join(" ") || "Both sources have the same lead details.");
    const columns = element("div", "detail-columns");
    for (const [label, records] of [["Website", row.website], ["CRM", row.crm]]) {
      const source = element("section", "detail-source");
      source.append(element("h3", "", label + " · " + records.length + (records.length === 1 ? " record" : " records")));
      if (!records.length) source.append(element("p", "", "No matching record."));
      for (const record of records) {
        const fields = element("dl");
        for (const key of core.headers.slice(1)) {
          fields.append(
            element("dt", "", core.fields[key]),
            element("dd", row.diffs.includes(key) ? "different" : "", record[key] || "—")
          );
        }
        source.append(fields);
      }
      columns.append(source);
    }
    body.replaceChildren(status, notes, columns);
    dialog.showModal();
  }

  function replaceDataset(website, crm, label) {
    result = core.reconcile(website, crm);
    searchInput.value = "";
    renderSummary(label);
    setFilter("issues");
  }

  function showImportMessage(message, isError = false) {
    const status = byId("import-message");
    status.hidden = !message;
    status.classList.toggle("error", isError);
    status.textContent = message;
  }

  function downloadCsv(filename, csv) {
    const url = URL.createObjectURL(new Blob([csv], { type: "text/csv;charset=utf-8" }));
    const link = element("a");
    link.href = url;
    link.download = filename;
    document.body.append(link);
    link.click();
    link.remove();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  }

  importForm.addEventListener("submit", async (event) => {
    event.preventDefault();
    const websiteFile = byId("website-file").files[0];
    const crmFile = byId("crm-file").files[0];
    if (!websiteFile || !crmFile) {
      showImportMessage("Choose both CSVs. Download the samples for the expected columns.", true);
      return;
    }
    importButton.disabled = true;
    byId("reset").disabled = true;
    showImportMessage("Reading and comparing records…");
    try {
      const [websiteText, crmText] = await Promise.all([websiteFile.text(), crmFile.text()]);
      const website = core.parseSourceCsv(websiteText, "Website CSV");
      const crm = core.parseSourceCsv(crmText, "CRM CSV");
      replaceDataset(website, crm, "Imported data");
      showImportMessage("Compared " + formatNumber.format(website.length) + " website records and " +
        formatNumber.format(crm.length) + " CRM records.");
    } catch (error) {
      showImportMessage(error.message, true);
    } finally {
      importButton.disabled = false;
      byId("reset").disabled = false;
    }
  });

  for (const button of filterButtons) {
    button.addEventListener("click", () => setFilter(button.dataset.filter));
  }
  byId("review-exceptions").addEventListener("click", () => {
    searchInput.value = "";
    setFilter("issues");
  });
  searchInput.addEventListener("input", () => {
    page = 0;
    renderTable();
  });
  byId("previous").addEventListener("click", () => {
    page -= 1;
    renderTable();
  });
  byId("next").addEventListener("click", () => {
    page += 1;
    renderTable();
  });
  byId("close-detail").addEventListener("click", () => dialog.close());
  byId("export").addEventListener("click", () => downloadCsv("lead-exceptions.csv", core.exceptionsCsv(result)));
  byId("download-web").addEventListener("click", () => downloadCsv("website-leads.csv", core.createCsv(core.headers, sample.website)));
  byId("download-crm").addEventListener("click", () => downloadCsv("crm-leads.csv", core.createCsv(core.headers, sample.crm)));
  byId("reset").addEventListener("click", () => {
    importForm.reset();
    replaceDataset(sample.website, sample.crm, "Sample data");
    showImportMessage("Sample records restored.");
  });

  createLegend();
  replaceDataset(sample.website, sample.crm, "Sample data");
  const exampleRow = result.rows.find((row) => row.id === "LD-1005");
  byId("sample-example").addEventListener("click", () => showDetails(exampleRow));
})();
