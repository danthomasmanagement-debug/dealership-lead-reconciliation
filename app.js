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
  const caseSteps = Array.from(byId("case-progress").children);
  const scoreButtons = Array.from(document.querySelectorAll("[data-score]"));
  const landingSources = Array.from(document.querySelectorAll("[data-preview-source]"));
  const traceSources = Array.from(document.querySelectorAll("[data-trace]"));
  const navigation = Array.from(document.querySelectorAll("[data-view-link]"));
  const eventLog = byId("event-log");
  const importForm = byId("import-form");
  const importButton = importForm.querySelector("button[type='submit']");
  const searchInput = byId("search");
  const legendCounts = new Map();
  const statusLabels = {
    missing: "Missing inquiry", duplicate: "Duplicate", mismatch: "Details differ",
    crm_only: "Sales system only", matched: "Matched"
  };
  const profileActions = {
    missing: "Check the inquiry ID in the sales system before recovering it.",
    duplicate: "Review the copies and confirm which sales record to keep.",
    mismatch: "Check the highlighted fields against the original inquiry before correcting them.",
    crm_only: "Verify how the sales team received the inquiry.",
    matched: "The sales team can use this record for follow-up."
  };
  const sampleInquiry = sample.website.find((row) => row.lead_id === "LD-1002");
  const receivedTime = new Intl.DateTimeFormat("en-US", {
    hour: "numeric", minute: "2-digit", timeZone: "America/Los_Angeles"
  }).format(new Date(sampleInquiry.submitted_at)) + " PT";
  const actionTime = new Intl.DateTimeFormat("en-US", {
    hour: "numeric", minute: "2-digit", second: "2-digit", timeZone: "America/Los_Angeles"
  });
  const profileTime = new Intl.DateTimeFormat("en-US", {
    month: "short", day: "numeric", year: "numeric", hour: "numeric", minute: "2-digit",
    timeZone: "America/Los_Angeles"
  });
  const budgetInput = byId("buyer-budget");
  const timingInput = byId("buyer-timing");
  const consentInput = byId("buyer-consent");
  let demoSales = sample.crm;
  let usingSample = true;
  let lastRecovery = null;
  let recoveryAttempts = 0;
  let recoveryDelta = "";
  let followUpQueued = false;
  let dealWon = false;
  let selectedStock = "";
  let queuedCar;
  let traceSource = "sales";
  let activeView;
  let recordsLabel = "Sample data";
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

  function logAction(title, detail) {
    const stamp = new Date();
    const date = element("time", "", actionTime.format(stamp) + " PT");
    date.dateTime = stamp.toISOString();
    const item = element("li");
    const metadata = element("span", "", detail + " · ");
    metadata.append(date);
    item.append(element("strong", "", title), metadata);
    eventLog.append(item);
  }

  function currentDatasetLabel() {
    if (activeView === "demo") return "Fictional case";
    return activeView === "records" ? recordsLabel : "Sample data";
  }

  function renderView(moveFocus) {
    const hash = window.location.hash;
    const sources = hash === "#sources";
    activeView = hash === "#demo" ? "demo" : hash === "#records" || sources ? "records" : "overview";
    byId("overview").hidden = activeView !== "overview";
    byId("demo-view").hidden = activeView !== "demo";
    byId("records-view").hidden = activeView !== "records";
    setText("start-demo", lastRecovery === null ? "Start demo" : "Resume demo");
    setText("dataset-label", currentDatasetLabel());
    for (const link of navigation) {
      link.setAttribute("aria-current", link.dataset.viewLink === activeView ? "page" : "false");
    }
    if (dialog.open) dialog.close();
    if (moveFocus) {
      const headingId = activeView === "demo" ? "demo-title" :
        activeView === "records" ? sources ? "sources-title" : "records-title" : "title";
      byId(headingId).focus({ preventScroll: true });
    }
    if (sources) byId("sources").scrollIntoView({ block: "start" });
    else if (moveFocus) window.scrollTo(0, 0);
  }

  function showLandingEvidence(source) {
    const website = source === "website";
    for (const button of landingSources) {
      button.setAttribute("aria-pressed", String(button.dataset.previewSource === source));
    }
    setText("landing-evidence-title", website ? "The website captured her request" : "The sales team never saw it");
    setText("landing-evidence-detail", website
      ? sampleInquiry.customer + " asked about stock " + sampleInquiry.vehicle + " at " + receivedTime + "."
      : "The sales system had no record for inquiry " + sampleInquiry.lead_id + ".");
  }

  function renderSummary(datasetLabel) {
    recordsLabel = datasetLabel;
    setText("dataset-label", currentDatasetLabel());
    setText("matched-count", formatNumber.format(result.counts.matched));
    setText("exception-count", formatNumber.format(result.issueCount));
    setText("missing-count", formatNumber.format(result.missingFromCrm));
    setText("match-rate", result.websiteUnique ? Math.round(100 * result.counts.matched / result.websiteUnique) + "%" : "—");
    setText("match-rate-caption", "match rate · " + formatNumber.format(result.counts.matched) + " of " +
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
      element("span", "lead-id", row.id + (row.lead.vehicle ? " · Stock " + row.lead.vehicle : ""))
    );
    const dealer = element("td", "", row.lead.dealership || "—");
    const status = element("td");
    status.append(element("span", "status-pill status-" + row.status, statusLabels[row.status]));
    const action = element("td");
    const details = element("button", "text-button", "Profile");
    details.type = "button";
    details.setAttribute("aria-label", "View profile for " + (row.lead.customer || "unnamed buyer") + ", " + row.id);
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

  function profileFacts(fields) {
    const list = element("dl", "profile-facts");
    for (const [label, value] of fields) {
      const fact = element("div");
      fact.append(element("dt", "", label), element("dd", "", value || "—"));
      list.append(fact);
    }
    return list;
  }

  function sourceComparison(row) {
    const comparison = element("details", "profile-comparison");
    comparison.open = row.diffs.length > 0;
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
    comparison.append(element("summary", "", "Compare source records"), columns);
    return comparison;
  }

  function showDetails(row, sampleContext = usingSample) {
    const { customer, dealership, vehicle, submitted_at: submittedAt } = row.lead;
    const initials = customer.trim().split(/\s+/u).slice(0, 2).map((word) => Array.from(word)[0]).join("");
    const date = /^\d{4}-\d{2}-\d{2}T.*(?:Z|[+-]\d{2}:?\d{2})$/i.test(submittedAt)
      ? new Date(submittedAt) : null;
    const recorded = date && Number.isFinite(date.getTime()) ? profileTime.format(date) + " PT" : submittedAt;
    const origin = row.website.length && row.crm.length ? "Website and sales system" :
      row.website.length ? "Website form" : "Sales system";
    setText("detail-id", row.id);
    setText("detail-title", customer || "Unnamed buyer");
    setText("detail-avatar", initials || "—");

    const overview = element("div", "profile-overview");
    const overviewTop = element("div", "profile-overview-top");
    const copy = element("button", "text-button", "Copy inquiry ID");
    copy.type = "button";
    const copyStatus = element("span", "sr-only");
    copyStatus.setAttribute("role", "status");
    copy.addEventListener("click", async () => {
      try {
        await navigator.clipboard.writeText(row.id);
        copy.textContent = "ID copied";
        copyStatus.textContent = "Copied " + row.id;
      } catch {
        copyStatus.className = "profile-copy-status";
        copyStatus.textContent = "Select and copy " + row.id + " from the profile header.";
      }
    });
    overviewTop.append(element("span", "status-pill status-" + row.status, statusLabels[row.status]), copy, copyStatus);
    overview.append(overviewTop,
      profileFacts([["Dealership", dealership], ["Vehicle stock", vehicle], ["Recorded", recorded], ["Record source", origin]]));
    const review = element("section", "profile-review");
    review.append(
      element("h3", "", "What the check found"),
      element("p", "", row.reasons.join(" ") || "Both sources have the same lead details."),
      element("p", "profile-next", profileActions[row.status])
    );

    const content = [overview];
    const maya = sampleContext && row.id === sampleInquiry.lead_id;
    const sampleNotes = sampleContext ? sample.buyerNotes[row.id] : undefined;
    if (maya || sampleNotes) {
      const notes = element("section", "profile-context");
      const plan = maya ? journey.plan(sampleInquiry, Number(budgetInput.value), timingInput.value) : null;
      const buyer = maya ? {
        needs: "All-wheel-drive SUV",
        budget: "Under " + journey.dollars.format(Number(budgetInput.value)),
        timing: timingInput.value === "soon" ? "Ready to visit this weekend" : "Still browsing",
        message: plan.buyerMessage
      } : sampleNotes;
      const facts = [["Looking for", buyer.needs], ["Budget", buyer.budget], ["Timeline", buyer.timing]];
      if (maya) facts.push(["Text follow-up", consentInput.checked ? "Opted in" : "Awaiting opt-in"]);
      notes.append(element("h3", "", "Sample buyer notes"), profileFacts(facts),
        element("blockquote", "", buyer.message));
      if (maya && activeView !== "demo") {
        const openCase = element("button", "button primary advance", "Open Maya’s demo");
        openCase.type = "button";
        openCase.addEventListener("click", () => {
          dialog.close();
          window.location.hash = "demo";
        });
        notes.append(openCase);
      }
      content.push(notes);
    }
    byId("detail-body").replaceChildren(...content, review, sourceComparison(row));
    dialog.showModal();
    dialog.scrollTop = 0;
  }

  function replaceDataset(website, crm, label) {
    result = core.reconcile(website, crm);
    searchInput.value = "";
    renderSummary(label);
    setFilter("issues");
  }

  function updateTrace() {
    const recovered = lastRecovery !== null;
    setText("story-sales-title", recovered ? "Recovered" : "No record found");
    byId("story-sales").classList.toggle("recovered", recovered);
    for (const button of traceSources) {
      button.setAttribute("aria-pressed", String(button.dataset.trace === traceSource));
    }
    setText("trace-evidence", traceSource === "website"
      ? sampleInquiry.customer + " asked about stock " + sampleInquiry.vehicle + " at " + receivedTime + "."
      : recovered ? "Found " + sampleInquiry.lead_id + " in the sample sales system."
        : "Search for " + sampleInquiry.lead_id + " returned no matching sales record.");
    byId("story-receipt").hidden = !recovered;
    if (recovered) {
      setText("receipt-title", lastRecovery ? "One sales record added" : "Duplicate prevented · attempt " + recoveryAttempts);
      setText("receipt-detail", lastRecovery
        ? recoveryDelta + " The sample sales system now has " + sampleInquiry.lead_id + "."
        : sampleInquiry.lead_id + " was already there. The test added zero records.");
    }
    byId("show-follow-up").hidden = !recovered;
    setText("show-follow-up", followUpQueued ? "Review follow-up" : "Preview follow-up");
    byId("run-test").hidden = followUpQueued;
    setText("run-test", recovered ? "Test a safe retry" : "Recover inquiry");
    byId("run-test").classList.toggle("primary", !recovered);
    byId("run-test").classList.toggle("secondary", recovered);
  }

  function currentPlan() {
    return journey.plan(sampleInquiry, Number(budgetInput.value), timingInput.value, selectedStock);
  }

  function updateFollowUp() {
    const plan = currentPlan();
    if (plan.recommended?.stock !== selectedStock) selectedStock = "";
    setText("buyer-message", plan.buyerMessage);
    setText("intent-level", plan.intent);
    setText("intent-reason", plan.reason);
    byId("intent-level").classList.toggle("hot", timingInput.value === "soon");
    const matches = plan.matches.map((car, index) => {
      const item = element("li");
      const option = element("label", "vehicle-option");
      const choice = element("input");
      choice.type = "radio";
      choice.name = "offered-stock";
      choice.value = car.stock;
      choice.checked = car === plan.recommended;
      choice.disabled = followUpQueued;
      const name = element("div");
      name.append(element("strong", "", car.model),
        element("span", "", "All-wheel drive · Stock " + car.stock));
      const price = element("div", "vehicle-price");
      price.append(element("strong", "", journey.dollars.format(car.price)));
      if (!index) price.append(element("span", "", car.stock === sampleInquiry.vehicle ? "Maya’s pick" : "Best fit"));
      option.append(choice, name, price);
      item.append(option);
      return item;
    });
    byId("vehicle-list").replaceChildren(...matches);
    setText("reply-message", plan.reply);
    setText("reply-state", followUpQueued ? "Queued in demo" : "Draft");
    for (const input of [budgetInput, timingInput, consentInput]) input.disabled = followUpQueued;
    byId("queue-follow-up").hidden = followUpQueued;
    byId("review-outcome").hidden = !followUpQueued;
    byId("queue-follow-up").setAttribute("aria-disabled", String(!consentInput.checked));
    byId("follow-up-status").hidden = consentInput.checked;
    setText("follow-up-status", consentInput.checked ? "" : "The reply stays a draft until the buyer opts in.");
  }

  function updateOutcome() {
    setText("outcome-summary", dealWon
      ? "Maya’s recovered inquiry became a sale in this example."
      : "The draft is saved in the demo queue. You can now record the sample sales outcome.");
    byId("scoreboard").hidden = !dealWon;
    if (dealWon) showScoreProof(0);
    byId("close-deal").hidden = dealWon;
    byId("restart-story").className = "button " + (dealWon ? "primary" : "secondary");
  }

  function showScoreProof(active) {
    const retries = recoveryAttempts - 1;
    const retryDetail = retries > 0 ? " Skipped " + retries + (retries === 1 ? " duplicate retry." : " duplicate retries.") : "";
    const details = [
      recoveryDelta + retryDetail,
      queuedCar ? queuedCar.model + " · Stock " + queuedCar.stock + " · " + journey.dollars.format(queuedCar.price) :
        "The draft offered an inventory availability update.",
      "Maya’s deal was marked won in this simulation."
    ];
    for (const [index, button] of scoreButtons.entries()) {
      button.setAttribute("aria-pressed", String(index === active));
    }
    setText("score-proof", details[active]);
  }

  function showStoryStep(step, moveFocus = true) {
    byId("story-trace-view").hidden = step !== 0;
    byId("follow-up-view").hidden = step !== 1;
    byId("outcome-view").hidden = step !== 2;
    const completed = [lastRecovery !== null, followUpQueued, dealWon];
    for (const [index, item] of caseSteps.entries()) {
      const complete = completed[index];
      item.classList.toggle("complete", complete);
      item.querySelector(".step-marker").textContent = complete ? "✓" : String(index + 1);
      item.querySelector(".sr-only").textContent = complete ? "Completed: " : "";
      item.setAttribute("aria-current", index === step ? "step" : "false");
      item.querySelector("button").disabled = index > 0 && !completed[index - 1];
    }
    const titles = ["Maya Patel’s inquiry", "Help Maya find a car", dealWon ? "Deal won" : "Follow-up queued"];
    setText("story-title", titles[step]);
    [updateTrace, updateFollowUp, updateOutcome][step]();
    if (moveFocus) {
      const title = byId("story-title");
      title.focus({ preventScroll: true });
      byId("case-progress").scrollIntoView({ block: "nearest" });
    }
  }

  function resetJourney() {
    demoSales = sample.crm;
    lastRecovery = null;
    recoveryAttempts = 0;
    recoveryDelta = "";
    followUpQueued = false;
    dealWon = false;
    selectedStock = "";
    queuedCar = undefined;
    traceSource = "sales";
    budgetInput.value = "32000";
    timingInput.value = "soon";
    consentInput.checked = true;
    while (eventLog.children.length > 2) eventLog.lastElementChild.remove();
    byId("queued-reply-text").closest("details").open = false;
    showStoryStep(0, false);
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
    if (byId("previous").disabled) byId("next").focus();
  });
  byId("next").addEventListener("click", () => {
    page += 1;
    renderTable();
    if (byId("next").disabled) byId("previous").focus();
  });
  byId("close-detail").addEventListener("click", () => dialog.close());
  byId("demo-profile").addEventListener("click", () => {
    const row = core.reconcile(sample.website, demoSales).rows.find((lead) => lead.id === sampleInquiry.lead_id);
    showDetails(row, true);
  });
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
  byId("run-test").addEventListener("click", () => {
    const recovery = journey.recover(sampleInquiry, demoSales);
    recoveryAttempts += 1;
    lastRecovery = recovery.added;
    demoSales = recovery.records;
    if (recovery.added) {
      const before = core.reconcile(sample.website, sample.crm).missingFromCrm;
      const after = core.reconcile(sample.website, demoSales);
      recoveryDelta = before + " → " + after.missingFromCrm + " missing inquiries.";
      logAction("Recovery created one record", "Sales system · " + sampleInquiry.lead_id);
      if (usingSample) {
        result = after;
        renderSummary("Sample data · recovery applied");
        renderTable();
      }
    } else {
      logAction("Retry " + (recoveryAttempts - 1) + " skipped", "Inquiry already present");
    }
    showStoryStep(0, false);
    if (recovery.added) byId("show-follow-up").focus({ preventScroll: true });
  });
  byId("show-follow-up").addEventListener("click", () => showStoryStep(1));
  byId("back-to-trace").addEventListener("click", () => showStoryStep(0));
  byId("review-outcome").addEventListener("click", () => showStoryStep(2));
  for (const [index, step] of caseSteps.entries()) {
    step.querySelector("button").addEventListener("click", () => showStoryStep(index));
  }
  for (const button of landingSources) {
    button.addEventListener("click", () => showLandingEvidence(button.dataset.previewSource));
  }
  for (const button of traceSources) {
    button.addEventListener("click", () => {
      traceSource = button.dataset.trace;
      updateTrace();
    });
  }
  for (const input of [budgetInput, timingInput, consentInput]) input.addEventListener("change", updateFollowUp);
  for (const [index, button] of scoreButtons.entries()) {
    button.addEventListener("click", () => showScoreProof(index));
  }
  byId("vehicle-list").addEventListener("change", (event) => {
    if (event.target.name !== "offered-stock") return;
    selectedStock = event.target.value;
    setText("reply-message", currentPlan().reply);
  });
  byId("queue-follow-up").addEventListener("click", () => {
    if (!consentInput.checked || followUpQueued || lastRecovery === null) return;
    followUpQueued = true;
    const plan = currentPlan();
    queuedCar = plan.recommended;
    setText("queued-reply-text", plan.reply);
    logAction("Follow-up queued", queuedCar
      ? "Stock " + queuedCar.stock + " · " + journey.dollars.format(queuedCar.price)
      : "Availability update");
    showStoryStep(2);
  });
  byId("close-deal").addEventListener("click", () => {
    if (!followUpQueued || dealWon) return;
    dealWon = true;
    logAction("Deal marked won", "Sample sales outcome recorded");
    showStoryStep(2);
  });
  byId("restart-story").addEventListener("click", () => {
    resetJourney();
    if (usingSample) replaceDataset(sample.website, sample.crm, "Sample data");
    showStoryStep(0);
  });

  setText("case-id", sampleInquiry.lead_id);
  for (const id of ["website-time", "message-time"]) {
    byId(id).dateTime = sampleInquiry.submitted_at;
    setText(id, receivedTime);
  }
  setText("received-event", receivedTime + " · " + sampleInquiry.lead_id);
  createLegend();
  replaceDataset(sample.website, sample.crm, "Sample data");
  showStoryStep(0, false);
  renderView(false);
  window.addEventListener("hashchange", () => renderView(true));
})();
