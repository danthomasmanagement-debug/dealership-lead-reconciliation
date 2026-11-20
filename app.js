(function () {
  "use strict";

  const core = window.LeadReconciliation;
  const sample = window.LeadSampleData;
  const journey = window.LeadDemoJourney;
  const byId = (id) => document.getElementById(id);
  const formatNumber = new Intl.NumberFormat("en-US");
  const pageSize = 8;
  const filterButtons = Array.from(document.querySelectorAll("[data-filter]"));
  const dialog = byId("detail-dialog");
  const story = byId("story-dialog");
  const importForm = byId("import-form");
  const importButton = importForm.querySelector("button[type='submit']");
  const searchInput = byId("search");
  const legendCounts = new Map();
  const statusLabels = {
    missing: "Missing inquiry", duplicate: "Duplicate", mismatch: "Details differ",
    crm_only: "Sales system only", matched: "Matched"
  };
  const sampleInquiry = sample.website.find((row) => row.lead_id === "LD-1002");
  const budgetInput = byId("buyer-budget");
  const timingInput = byId("buyer-timing");
  const consentInput = byId("buyer-consent");
  let demoSales = sample.crm;
  let usingSample = true;
  let lastRecovery = null;
  let followUpQueued = false;
  let dealWon = false;
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
    setText("matched-count", formatNumber.format(result.counts.matched));
    setText("exception-count", formatNumber.format(result.issueCount));
    setText("missing-count", formatNumber.format(result.missingFromCrm));
    setText("match-rate", result.websiteUnique ? Math.round(100 * result.counts.matched / result.websiteUnique) + "%" : "—");
    setText("match-rate-caption", formatNumber.format(result.counts.matched) + " of " +
      formatNumber.format(result.websiteUnique) + " website inquiries");
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
      button.append(dot, element("span", "", statusLabels[status]), count);
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
    return [row.id, statusLabels[row.status], core.statusLabels[row.status], ...row.reasons,
      ...[...row.website, ...row.crm].flatMap((record) => Object.values(record))
    ].some((value) => value.toLowerCase().includes(query));
  }

  function createRow(row) {
    const tableRow = element("tr");
    const lead = element("td");
    lead.append(
      element("div", "record-name", row.lead.customer || "Unnamed buyer"),
      element("span", "lead-id", row.id)
    );
    const dealer = element("td", "", row.lead.dealership || "—");
    const status = element("td");
    status.append(element("span", "status-pill status-" + row.status, statusLabels[row.status]));
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
    const viewLabel = statusLabels[filter] || (filter === "issues" ? "Needs review" : "All inquiries");
    const countLabel = formatNumber.format(matchingRows.length) + (matchingRows.length === 1 ? " inquiry" : " inquiries");
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
      const message = query ? "No inquiries match your search." :
        filter === "issues" ? "There are no issues to review." : "No records in this view.";
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
    setText("detail-title", row.lead.customer || "Unnamed buyer");
    const body = byId("detail-body");
    const status = element("p", "detail-note");
    status.append(element("span", "status-pill status-" + row.status, statusLabels[row.status]));
    const notes = element("p", "detail-note", row.reasons.join(" ") || "Both sources have the same lead details.");
    const columns = element("div", "detail-columns");
    for (const [label, records] of [["Website", row.website], ["Sales system", row.crm]]) {
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

  function updateTrace() {
    const recovered = lastRecovery !== null;
    setText("story-summary", recovered
      ? "Maya’s inquiry is now visible in the sample sales system."
      : "The website saved Maya’s message, but the sales team’s system had no matching inquiry.");
    setText("story-web", sampleInquiry.customer + " · " + sampleInquiry.dealership + " · Stock " + sampleInquiry.vehicle);
    setText("story-sales-title", recovered ? "Inquiry found" : "No record found");
    setText("story-sales-detail", recovered
      ? "The sales team can now see the request about stock " + sampleInquiry.vehicle + "."
      : "The sales team’s list had no entry for Maya’s request.");
    setText("hero-sales-state", recovered ? "Recovered in demo" : "No record found");
    byId("story-sales").classList.toggle("recovered", recovered);
    byId("story-receipt").hidden = !recovered;
    if (recovered) {
      setText("receipt-title", lastRecovery ? "Inquiry recovered" : "Already recorded");
      setText("receipt-detail", lastRecovery
        ? "The test checked for the inquiry ID first, then added one matching record."
        : "The check found the existing inquiry and skipped it. The record count stayed the same.");
    }
    byId("show-follow-up").hidden = !recovered;
    setText("run-test", recovered ? "Test again" : "Try sending it again");
    byId("run-test").className = "button " + (recovered ? "secondary" : "primary");
  }

  function updateFollowUp() {
    const plan = journey.plan(sampleInquiry, Number(budgetInput.value), timingInput.value);
    setText("buyer-message", plan.buyerMessage);
    setText("intent-level", plan.intent);
    setText("intent-reason", plan.reason);
    byId("intent-level").classList.toggle("hot", timingInput.value === "soon");
    const matches = plan.matches.map((car, index) => {
      const item = element("li");
      const name = element("div");
      name.append(element("strong", "", car.model),
        element("span", "", "All-wheel drive · Stock " + car.stock));
      const price = element("div", "vehicle-price");
      price.append(element("strong", "", journey.dollars.format(car.price)));
      if (!index) price.append(element("span", "", "Top match"));
      item.append(name, price);
      return item;
    });
    byId("vehicle-list").replaceChildren(...matches);
    setText("reply-message", plan.reply);
    setText("score-recovered", lastRecovery === null ? "0" : "1");
    setText("score-follow-up", followUpQueued ? "1" : "0");
    setText("score-won", dealWon ? "1" : "0");
    byId("queue-follow-up").disabled = followUpQueued || !consentInput.checked;
    byId("close-deal").hidden = !followUpQueued;
    byId("close-deal").disabled = dealWon;
    byId("restart-story").hidden = !dealWon;
    budgetInput.disabled = followUpQueued;
    timingInput.disabled = followUpQueued;
    consentInput.disabled = followUpQueued;
    setText("follow-up-status", dealWon ? "The sample deal is marked won." :
      followUpQueued ? "The reply is saved to the demo queue." :
      consentInput.checked ? "Opt-in confirmed. This reply can be queued in the demo." :
      "This reply stays a draft because the buyer hasn’t opted in.");
  }

  function showStoryStep(followUp) {
    byId("story-trace-view").hidden = followUp;
    byId("follow-up-view").hidden = !followUp;
    setText("story-title", followUp ? "Help Maya find a car" : "What happened to Maya’s message?");
    if (followUp) updateFollowUp();
    else updateTrace();
    if (story.open) {
      story.scrollTop = 0;
      byId(followUp ? "buyer-budget" : "close-story").focus({ preventScroll: true });
    }
  }

  function resetJourney() {
    demoSales = sample.crm;
    lastRecovery = null;
    followUpQueued = false;
    dealWon = false;
    budgetInput.value = "32000";
    timingInput.value = "soon";
    consentInput.checked = true;
    updateTrace();
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
      showImportMessage("Choose both CSVs. Use the sample files to see the expected columns.", true);
      return;
    }
    importButton.disabled = true;
    byId("reset").disabled = true;
    showImportMessage("Reading and comparing records…");
    try {
      const [websiteText, crmText] = await Promise.all([websiteFile.text(), crmFile.text()]);
      const website = core.parseSourceCsv(websiteText, "Website CSV");
      const crm = core.parseSourceCsv(crmText, "Sales system CSV");
      usingSample = false;
      replaceDataset(website, crm, "Your files");
      showImportMessage("Compared " + formatNumber.format(website.length) + " website records and " +
        formatNumber.format(crm.length) + " sales system records.");
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
    setFilter("all");
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
    usingSample = true;
    resetJourney();
    replaceDataset(sample.website, sample.crm, "Sample data");
    showImportMessage("Sample records restored.");
  });
  byId("sample-example").addEventListener("click", () => {
    showStoryStep(false);
    story.showModal();
  });
  byId("close-story").addEventListener("click", () => story.close());
  byId("run-test").addEventListener("click", () => {
    const recovery = journey.recover(sampleInquiry, demoSales);
    lastRecovery = recovery.added;
    demoSales = recovery.records;
    if (usingSample) {
      result = core.reconcile(sample.website, demoSales);
      renderSummary("Sample test");
      renderTable();
    }
    updateTrace();
    if (recovery.added) byId("show-follow-up").focus();
  });
  byId("show-follow-up").addEventListener("click", () => showStoryStep(true));
  byId("back-to-trace").addEventListener("click", () => showStoryStep(false));
  byId("story-records").addEventListener("click", () => {
    story.close();
    byId("review-exceptions").click();
  });
  for (const input of [budgetInput, timingInput, consentInput]) input.addEventListener("change", updateFollowUp);
  byId("queue-follow-up").addEventListener("click", () => {
    if (!consentInput.checked || followUpQueued || lastRecovery === null) return;
    followUpQueued = true;
    updateFollowUp();
    byId("close-deal").focus();
  });
  byId("close-deal").addEventListener("click", () => {
    if (!followUpQueued || dealWon) return;
    dealWon = true;
    updateFollowUp();
    byId("restart-story").focus();
  });
  byId("restart-story").addEventListener("click", () => {
    resetJourney();
    if (usingSample) replaceDataset(sample.website, sample.crm, "Sample data");
    showStoryStep(false);
  });

  createLegend();
  replaceDataset(sample.website, sample.crm, "Sample data");
})();
