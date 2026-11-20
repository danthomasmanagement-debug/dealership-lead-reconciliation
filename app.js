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
  const quickEditButtons = Array.from(document.querySelectorAll("[data-quick]"));
  const responseButtons = Array.from(document.querySelectorAll("[data-response]"));
  const landingSources = Array.from(document.querySelectorAll("[data-preview-source]"));
  const traceSources = Array.from(document.querySelectorAll("[data-trace]"));
  const navigation = Array.from(document.querySelectorAll("[data-view-link]"));
  const eventLog = byId("event-log");
  const routingEvents = byId("routing-events");
  const caseEvents = { recovery: [], routing: [] };
  const routingDestination = byId("routing-destination");
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
  const routingInquiry = sample.website.find((row) => row.lead_id === "LD-1024");
  const originalRouting = sample.crm.find((row) => row.lead_id === routingInquiry.lead_id).dealership;
  const originalPlan = journey.plan(sampleInquiry, 32000, "soon");
  const receivedTime = new Intl.DateTimeFormat("en-US", {
    hour: "numeric", minute: "2-digit", timeZone: "America/Los_Angeles"
  }).format(new Date(sampleInquiry.submitted_at)) + " PT";
  const profileTime = new Intl.DateTimeFormat("en-US", {
    month: "short", day: "numeric", year: "numeric", hour: "numeric", minute: "2-digit",
    timeZone: "America/Los_Angeles"
  });
  const budgetInput = byId("buyer-budget");
  const timingInput = byId("buyer-timing");
  const consentInput = byId("buyer-consent");
  const replyEdits = { short: false, alternateTime: false };
  const consentTask = "Review Maya’s inquiry and confirm her contact preferences.";
  const responseActions = { visit: "Choose a time", draft: "Draft a cheaper reply", task: "Create sales task" };
  let demoSales = sample.crm;
  let usingSample = true;
  let recoveryProof = null;
  let recoveryAttempts = 0;
  let queuedPlan = null;
  let handoffTask = false;
  let responseKind = "";
  let response = null;
  let responseApplied = false;
  let responseDraft = "";
  let responseResult = "";
  let visitSlotId = "";
  let visitBooking = null;
  let dealWon = false;
  let selectedStock = "";
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

  function logAction(title, detail, caseType = "recovery") {
    const stamp = new Date();
    const date = element("time", "", profileTime.format(stamp) + " PT");
    date.dateTime = stamp.toISOString();
    caseEvents[caseType].push({ title, detail, timestamp: date.dateTime });
    const item = element("li");
    const metadata = element("span", "", detail + " · ");
    metadata.append(date);
    item.append(element("strong", "", title), metadata);
    (caseType === "routing" ? routingEvents : eventLog).append(item);
  }

  function clearCaseEvents(caseType, list, initialRows) {
    caseEvents[caseType].length = 0;
    while (list.children.length > initialRows) list.lastElementChild.remove();
  }

  function currentDatasetLabel() {
    if (activeView === "demo" || activeView === "routing") return "Fictional case";
    return activeView === "records" ? recordsLabel : "Sample data";
  }

  function renderView(moveFocus) {
    const hash = window.location.hash;
    const sources = hash === "#sources";
    activeView = hash === "#demo" ? "demo" : hash === "#routing" ? "routing" :
      hash === "#records" || sources ? "records" : "overview";
    byId("overview").hidden = activeView !== "overview";
    byId("demo-view").hidden = activeView !== "demo";
    byId("routing-view").hidden = activeView !== "routing";
    byId("records-view").hidden = activeView !== "records";
    setText("start-demo", recoveryProof === null ? "Start demo" : "Resume demo");
    setText("dataset-label", currentDatasetLabel());
    for (const link of navigation) {
      link.setAttribute("aria-current", link.dataset.viewLink === (activeView === "routing" ? "demo" : activeView) ? "page" : "false");
    }
    if (dialog.open) dialog.close();
    if (moveFocus) {
      const headingId = activeView === "demo" ? "demo-title" : activeView === "routing" ? "routing-title" :
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
    setText("landing-evidence-title", website ? "The website captured her request" : "The sales system has no matching inquiry");
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
      const buyer = maya ? {
        needs: "All-wheel-drive SUV",
        budget: "Under $32,000",
        timing: "Ready to visit this weekend",
        message: originalPlan.buyerMessage
      } : sampleNotes;
      const facts = [["Looking for", buyer.needs], ["Budget", buyer.budget], ["Timeline", buyer.timing]];
      if (maya) facts.push(["Demo text consent", consentInput.checked ? "Opted in" : "Awaiting opt-in"]);
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

  function syncSampleRecords(nextResult) {
    if (!usingSample) return;
    result = nextResult;
    renderSummary("Sample data · corrections applied");
    renderTable();
  }

  function recoveryImpact() {
    const proof = recoveryProof;
    return proof.missingBefore + " → " + proof.missingAfter + " missing inquiries. " +
      proof.matchedBefore + " → " + proof.matchedAfter + " of " + proof.websiteTotal + " matched.";
  }

  function salesRecordCount(total) {
    return total + (total === 1 ? " sales record" : " sales records");
  }

  function handoffComplete() {
    return queuedPlan !== null || handoffTask;
  }

  function updateTrace() {
    const recovered = recoveryProof !== null;
    setText("story-sales-title", recovered ? "Recovered" : "Missing");
    byId("story-sales").classList.toggle("recovered", recovered);
    for (const button of traceSources) {
      button.setAttribute("aria-pressed", String(button.dataset.trace === traceSource));
    }
    setText("trace-evidence", traceSource === "website"
      ? sampleInquiry.customer + " asked about stock " + sampleInquiry.vehicle + " at " + receivedTime + "."
      : recovered ? "Found " + sampleInquiry.lead_id + " in the sample sales system."
        : "Search for " + sampleInquiry.lead_id + " returned no matching sales record.");
    byId("recovery-proof").hidden = !recovered;
    byId("retry-receipt").hidden = recoveryAttempts < 2;
    byId("guided-success").hidden = !recovered;
    byId("verify-retry").hidden = !recovered;
    if (recovered) {
      setText("guided-count", recoveryProof.salesBefore + " → " + salesRecordCount(recoveryProof.salesAfter));
      setText("proof-before", salesRecordCount(recoveryProof.salesBefore));
      setText("proof-after", salesRecordCount(recoveryProof.salesAfter));
      setText("proof-impact", recoveryImpact());
      if (recoveryAttempts > 1) {
        setText("retry-receipt", "Retry " + (recoveryAttempts - 1) + ": 0 records added. " +
          salesRecordCount(recoveryProof.salesAfter) + " remains for " + sampleInquiry.lead_id + ".");
      }
    }
    byId("show-follow-up").hidden = !recovered;
    setText("show-follow-up", queuedPlan ? "See queued reply" : "See suggested reply");
    byId("run-test").hidden = recovered;
  }

  function currentPlan(stock = selectedStock) {
    return journey.plan(sampleInquiry, Number(budgetInput.value), timingInput.value, stock, replyEdits);
  }

  function renderSuggestion(plan) {
    const car = plan.recommended;
    setText("suggested-car", car ? car.model + " · " + journey.dollars.format(car.price) : "Inventory follow-up");
    setText("suggestion-reason", car ? "All-wheel drive · Within budget" : "No cars match this budget");
    byId("suggestion-explainer").hidden = !car;
    setText("recommendation-detail", journey.recommendationReason(sampleInquiry, Number(budgetInput.value), car));
    setText("reply-message", plan.reply);
  }

  function updateFollowUp() {
    const plan = queuedPlan || currentPlan();
    const complete = handoffComplete();
    if (plan.recommended?.stock !== selectedStock) selectedStock = "";
    setText("buyer-message", originalPlan.buyerMessage);
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
      choice.disabled = complete;
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
    renderSuggestion(plan);
    setText("reply-state", queuedPlan ? "Queued in demo" : "Suggested reply");
    for (const input of [budgetInput, timingInput, consentInput]) input.disabled = complete;
    for (const button of quickEditButtons) {
      const key = button.dataset.quick;
      button.disabled = complete;
      if (key !== "cheaper") button.setAttribute("aria-pressed", String(replyEdits[key]));
    }
    byId("queue-follow-up").hidden = complete || !consentInput.checked;
    byId("create-sales-task").hidden = complete || consentInput.checked;
    byId("review-outcome").hidden = !complete;
    byId("queue-follow-up").setAttribute("aria-disabled", String(!consentInput.checked));
    byId("follow-up-status").hidden = complete || consentInput.checked;
    setText("follow-up-status", consentInput.checked ? "" : "Texting requires consent.");
  }

  function applyQuickEdit(key) {
    if (handoffComplete()) return;
    let status;
    if (key === "cheaper") {
      const plan = currentPlan();
      const cheaper = journey.cheaperMatch(plan.matches, plan.recommended);
      if (cheaper) selectedStock = cheaper.stock;
      status = cheaper ? "Now offering stock " + cheaper.stock + "." : "This is already the lowest-priced match.";
    } else {
      replyEdits[key] = !replyEdits[key];
      status = key === "short" ? (replyEdits.short ? "Shortened the draft." : "Restored the full draft.") :
        "Draft updated.";
    }
    updateFollowUp();
    const message = byId("quick-edit-status");
    message.hidden = false;
    message.textContent = status;
  }

  function renderBuyerResponse() {
    const pickingVisit = responseApplied && response?.nextAction === "visit";
    for (const button of responseButtons) {
      button.setAttribute("aria-pressed", String(button.dataset.response === responseKind));
      button.disabled = responseApplied;
    }
    setText("buyer-response", response?.message || "");
    setText("response-detail", response?.detail || "");
    byId("response-detail").hidden = pickingVisit;
    setText("response-action", response ? responseActions[response.nextAction] : "");
    byId("response-action").hidden = !response || responseApplied;
    byId("response-draft").hidden = !responseDraft;
    setText("response-draft-text", responseDraft);
    byId("response-feedback").hidden = !responseResult;
    setText("response-feedback", responseResult);
    renderVisit(pickingVisit);
  }

  function visitLabel(booking) {
    return booking.window.split(" ")[0] + " at " + booking.time + " PT";
  }

  function renderVisit(pickingVisit) {
    byId("visit-picker").hidden = !pickingVisit || visitBooking !== null;
    byId("visit-confirmation").hidden = visitBooking === null;
    if (visitBooking) {
      setText("visit-receipt", visitLabel(visitBooking) + " · " + sampleInquiry.dealership);
    }
    if (!pickingVisit || visitBooking) return;

    const visitWindow = queuedPlan.appointment;
    const slots = journey.visitSlots(visitWindow);
    setText("visit-window", visitWindow + " · Pacific time");
    byId("confirm-visit").disabled = !visitSlotId;
    const choices = slots.map((slot) => {
      const label = element("label", "visit-slot");
      const input = element("input");
      input.type = "radio";
      input.name = "visit-slot";
      input.value = slot.id;
      input.disabled = !slot.available;
      input.checked = slot.id === visitSlotId;
      label.append(input, element("strong", "", slot.time),
        element("span", "visit-availability", slot.available ? "Available" : "Taken"));
      return label;
    });
    byId("visit-slots").replaceChildren(...choices);
  }

  function chooseBuyerResponse(kind) {
    if (!queuedPlan || responseApplied) return;
    responseKind = kind;
    response = journey.respondToReply(sampleInquiry, queuedPlan, kind, Number(budgetInput.value));
    renderBuyerResponse();
  }

  function applyBuyerResponse() {
    if (!queuedPlan || !response || responseApplied) return;
    responseApplied = true;
    logAction("Sample buyer response", response.message);
    if (response.nextAction === "visit") {
      visitSlotId = journey.visitSlots(queuedPlan.appointment).find((slot) => slot.available)?.id || "";
    } else if (response.nextAction === "draft") {
      responseDraft = currentPlan(response.car.stock).reply;
      responseResult = "Cheaper option drafted.";
      logAction("Cheaper reply drafted", responseDraft);
    } else {
      responseResult = "Sales task created.";
      logAction("Sales task created", response.detail);
    }
    renderBuyerResponse();
    if (response.nextAction === "visit") {
      byId("visit-slots").querySelector("input:checked")?.focus();
    } else {
      byId("response-feedback").focus();
    }
  }

  function updateOutcome() {
    const queuedCar = queuedPlan?.recommended;
    setText("handoff-summary", visitBooking ? visitLabel(visitBooking) + " · Stock " + queuedCar.stock :
      queuedCar ? "Stock " + queuedCar.stock + " · Buyer consent confirmed" :
      handoffTask ? consentTask : "Inventory follow-up · Buyer consent confirmed");
    byId("response-demo").hidden = queuedPlan === null;
    byId("outcome-options").hidden = queuedPlan === null;
    byId("scoreboard").hidden = !dealWon;
    if (dealWon) showScoreProof(0);
    byId("close-deal").hidden = !queuedPlan || dealWon;
    renderBuyerResponse();
  }

  function showScoreProof(active) {
    const queuedCar = queuedPlan?.recommended;
    const retries = recoveryAttempts - 1;
    const retryDetail = retries > 0 ? " Skipped " + retries + (retries === 1 ? " duplicate retry." : " duplicate retries.") : "";
    const details = [
      recoveryImpact() + retryDetail,
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
    const complete = handoffComplete();
    const completed = [recoveryProof !== null, complete, complete];
    for (const [index, item] of caseSteps.entries()) {
      const complete = completed[index];
      item.classList.toggle("complete", complete);
      item.querySelector(".step-marker").textContent = complete ? "✓" : String(index + 1);
      item.querySelector(".sr-only").textContent = complete ? "Completed: " : "";
      item.setAttribute("aria-current", index === step ? "step" : "false");
      item.querySelector("button").disabled = index > 0 && !completed[index - 1];
    }
    const titles = [recoveryProof ? "Maya’s inquiry is back" : "Recover the inquiry",
      "Review the reply", handoffTask ? "Sales task created" : dealWon ? "Sample deal won" :
        visitBooking ? "Test drive booked" : "Reply queued"];
    setText("story-title", titles[step]);
    [updateTrace, updateFollowUp, updateOutcome][step]();
    if (moveFocus) {
      const title = byId("story-title");
      title.focus({ preventScroll: true });
      byId("case-progress").scrollIntoView({ block: "nearest" });
    }
  }

  function resetJourney() {
    recoveryProof = null;
    recoveryAttempts = 0;
    queuedPlan = null;
    handoffTask = false;
    responseKind = "";
    response = null;
    responseApplied = false;
    responseDraft = "";
    responseResult = "";
    visitSlotId = "";
    visitBooking = null;
    byId("visit-error").hidden = true;
    replyEdits.short = false;
    replyEdits.alternateTime = false;
    dealWon = false;
    selectedStock = "";
    traceSource = "sales";
    budgetInput.value = "32000";
    timingInput.value = "soon";
    consentInput.checked = true;
    clearCaseEvents("recovery", eventLog, 2);
    byId("queued-reply-text").closest("details").open = false;
    byId("quick-edit-status").hidden = true;
    for (const id of ["case-details", "original-inquiry", "reply-customize", "outcome-options",
      "suggestion-explainer", "response-demo"]) byId(id).open = false;
    for (const id of ["guided-success", "guided-done"]) byId(id).classList.remove("is-fresh");
    showStoryStep(0, false);
  }

  function showImportMessage(message, isError = false) {
    const status = byId("import-message");
    status.hidden = !message;
    status.classList.toggle("error", isError);
    status.textContent = message;
  }

  function routedDealership() {
    return demoSales.find((row) => row.lead_id === routingInquiry.lead_id)?.dealership || "No sales record";
  }

  function renderRouting() {
    const actual = routedDealership();
    setText("routing-sales", actual);
    setText("routing-apply", actual === routingInquiry.dealership ? "Test repeat correction" : "Apply routing correction");
    byId("routing-apply").disabled = !routingDestination.value;
    byId("routing-export").hidden = caseEvents.routing.length === 0;
  }

  function setRoutingMessage(message, status) {
    const feedback = byId("routing-result");
    feedback.textContent = message;
    feedback.dataset.state = status;
  }

  function downloadFile(filename, content, type = "text/csv;charset=utf-8") {
    const url = URL.createObjectURL(new Blob([content], { type }));
    const link = element("a");
    link.href = url;
    link.download = filename;
    document.body.append(link);
    link.click();
    link.remove();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  }

  function downloadCaseReport(caseType) {
    const routing = caseType === "routing";
    const inquiry = routing ? routingInquiry : sampleInquiry;
    const lines = [
      "Lead Check — " + (routing ? "Routing challenge" : "Recovery handoff"),
      "Fictional simulation. All actions use sample data in this browser.",
      "",
      "Inquiry: " + inquiry.lead_id + " · " + inquiry.customer,
      "Website inquiry received: " + inquiry.submitted_at + " (UTC)"
    ];
    if (routing) {
      lines.push(
        "Website dealership: " + routingInquiry.dealership,
        "Sales system before: " + originalRouting,
        "Sales system now: " + routedDealership()
      );
    } else {
      lines.push(
        "Sales records for this inquiry: " + recoveryProof.salesBefore + " → " + recoveryProof.salesAfter,
        "Sample dataset impact: " + recoveryImpact(),
        "Text consent: " + (queuedPlan ? "Confirmed" : "Pending"),
        "Handoff: " + (handoffTask ? consentTask : "Sample reply queued"),
        "Draft: " + (queuedPlan?.reply || "Pending consent"),
        "Simulated sale: " + (dealWon ? "Marked won" : "No sale recorded")
      );
      if (visitBooking) lines.push("Sample test drive: " + visitLabel(visitBooking) + " · " + inquiry.dealership);
    }
    lines.push("", "Simulation run activity (UTC)");
    for (const event of caseEvents[caseType]) {
      lines.push(event.timestamp + " | " + event.title + " | " + event.detail);
    }
    downloadFile("lead-check-" + inquiry.lead_id + ".txt", lines.join("\n") + "\n", "text/plain;charset=utf-8");
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
  byId("export").addEventListener("click", () => downloadFile("lead-exceptions.csv", core.exceptionsCsv(result)));
  byId("download-web").addEventListener("click", () => downloadFile("website-leads.csv", core.createCsv(core.headers, sample.website)));
  byId("download-crm").addEventListener("click", () => downloadFile("crm-leads.csv", core.createCsv(core.headers, sample.crm)));
  byId("reset").addEventListener("click", () => {
    importForm.reset();
    usingSample = true;
    demoSales = sample.crm;
    resetJourney();
    clearCaseEvents("routing", routingEvents, 2);
    routingDestination.value = "";
    setRoutingMessage("Compare the two records before choosing a destination.", "working");
    renderRouting();
    replaceDataset(sample.website, sample.crm, "Sample data");
    showImportMessage("Sample records restored.");
  });
  function runRecovery() {
    const prior = demoSales;
    const recovery = journey.recover(sampleInquiry, demoSales);
    recoveryAttempts += 1;
    demoSales = recovery.records;
    if (recovery.added) {
      const before = core.reconcile(sample.website, prior);
      const after = core.reconcile(sample.website, demoSales);
      recoveryProof = {
        salesBefore: before.rows.find((row) => row.id === sampleInquiry.lead_id).crm.length,
        salesAfter: after.rows.find((row) => row.id === sampleInquiry.lead_id).crm.length,
        missingBefore: before.missingFromCrm,
        missingAfter: after.missingFromCrm,
        matchedBefore: before.counts.matched,
        matchedAfter: after.counts.matched,
        websiteTotal: after.websiteUnique
      };
      logAction("Recovery created one record", "Sales system · " + sampleInquiry.lead_id);
      syncSampleRecords(after);
    } else {
      logAction("Retry " + (recoveryAttempts - 1) + " skipped", "Inquiry already present");
    }
    if (recovery.added) {
      byId("guided-success").classList.add("is-fresh");
      showStoryStep(0, false);
      const next = byId("show-follow-up");
      next.focus({ preventScroll: true });
      next.scrollIntoView({ block: "nearest" });
    } else {
      updateTrace();
    }
  }
  byId("run-test").addEventListener("click", runRecovery);
  byId("verify-retry").addEventListener("click", runRecovery);
  byId("show-follow-up").addEventListener("click", () => showStoryStep(1));
  byId("review-outcome").addEventListener("click", () => showStoryStep(2));
  byId("finish-customizing").addEventListener("click", () => {
    byId("reply-customize").open = false;
    const action = handoffComplete() ? "review-outcome" : consentInput.checked ? "queue-follow-up" : "create-sales-task";
    byId(action).focus();
  });
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
  for (const button of quickEditButtons) {
    button.addEventListener("click", () => applyQuickEdit(button.dataset.quick));
  }
  for (const button of responseButtons) {
    button.addEventListener("click", () => chooseBuyerResponse(button.dataset.response));
  }
  byId("response-demo").addEventListener("toggle", (event) => {
    if (event.currentTarget.open && !response) chooseBuyerResponse("interested");
  });
  byId("response-action").addEventListener("click", applyBuyerResponse);
  byId("visit-slots").addEventListener("change", (event) => {
    if (event.target.name !== "visit-slot") return;
    visitSlotId = event.target.value;
    byId("confirm-visit").disabled = false;
    byId("visit-error").hidden = true;
  });
  byId("visit-picker").addEventListener("submit", (event) => {
    event.preventDefault();
    if (!queuedPlan || !responseApplied || response?.nextAction !== "visit") return;
    const result = journey.bookVisit(queuedPlan.appointment, visitSlotId, visitBooking);
    if (result.status === "already-booked") return;
    if (result.status === "unavailable") {
      setText("visit-error", "Choose an available time.");
      byId("visit-error").hidden = false;
      return;
    }
    visitBooking = result.booking;
    logAction("Sample test drive booked", visitLabel(visitBooking) + " · " + sampleInquiry.dealership);
    showStoryStep(2, false);
    byId("visit-confirmation").focus();
  });
  for (const [index, button] of scoreButtons.entries()) {
    button.addEventListener("click", () => showScoreProof(index));
  }
  byId("vehicle-list").addEventListener("change", (event) => {
    if (event.target.name !== "offered-stock") return;
    selectedStock = event.target.value;
    renderSuggestion(currentPlan());
  });
  byId("queue-follow-up").addEventListener("click", () => {
    if (!consentInput.checked || handoffComplete() || recoveryProof === null) return;
    queuedPlan = currentPlan();
    const queuedCar = queuedPlan.recommended;
    setText("queued-reply-text", queuedPlan.reply);
    logAction("Follow-up queued", queuedCar
      ? "Stock " + queuedCar.stock + " · " + journey.dollars.format(queuedCar.price)
      : "Availability update");
    byId("guided-done").classList.add("is-fresh");
    showStoryStep(2);
  });
  byId("create-sales-task").addEventListener("click", () => {
    if (consentInput.checked || handoffComplete() || recoveryProof === null) return;
    handoffTask = true;
    logAction("Sales task created", consentTask);
    byId("guided-done").classList.add("is-fresh");
    showStoryStep(2);
  });
  byId("close-deal").addEventListener("click", () => {
    if (!queuedPlan || dealWon) return;
    dealWon = true;
    logAction("Deal marked won", "Sample sales outcome recorded");
    showStoryStep(2);
  });
  byId("restart-story").addEventListener("click", () => {
    demoSales = demoSales.filter((row) => row.lead_id !== sampleInquiry.lead_id);
    resetJourney();
    if (usingSample) replaceDataset(sample.website, demoSales,
      routedDealership() === originalRouting ? "Sample data" : "Sample data · corrections applied");
    showStoryStep(0);
  });

  routingDestination.addEventListener("change", renderRouting);
  byId("routing-form").addEventListener("submit", (event) => {
    event.preventDefault();
    const destination = routingDestination.value;
    if (!destination) return;
    const before = routedDealership();
    const correction = journey.correctRouting(routingInquiry, demoSales, destination);
    demoSales = correction.records;
    const outcomes = {
      corrected: ["Routing corrected", before + " → " + routedDealership() + ". One existing record updated."],
      unchanged: ["Repeat correction skipped", "0 records updated. The sales record already matches the website."],
      "wrong-destination": ["Destination rejected", destination + " differs from the original website request. 0 records updated."],
      missing: ["Correction stopped", "The inquiry has no sales record yet. 0 records updated."],
      duplicate: ["Correction stopped", "More than one sales record uses this inquiry ID. 0 records updated."]
    };
    const [title, detail] = outcomes[correction.status];
    setRoutingMessage(title + ". " + detail, correction.status);
    logAction(title, detail, "routing");
    if (correction.status === "corrected") syncSampleRecords(core.reconcile(sample.website, demoSales));
    renderRouting();
  });
  for (const button of document.querySelectorAll("[data-report]")) {
    button.addEventListener("click", () => downloadCaseReport(button.dataset.report));
  }

  setText("case-id", sampleInquiry.lead_id);
  setText("proof-id", sampleInquiry.lead_id);
  byId("message-time").dateTime = sampleInquiry.submitted_at;
  setText("message-time", receivedTime);
  for (const id of ["guided-success", "guided-done"]) {
    byId(id).addEventListener("animationend", () => byId(id).classList.remove("is-fresh"));
  }
  setText("received-event", profileTime.format(new Date(sampleInquiry.submitted_at)) + " PT · " + sampleInquiry.lead_id);
  setText("routing-case-id", routingInquiry.lead_id + " · Stock " + routingInquiry.vehicle);
  setText("routing-case-title", routingInquiry.customer + "’s inquiry");
  setText("routing-website", routingInquiry.dealership);
  setText("routing-original-time", profileTime.format(new Date(routingInquiry.submitted_at)) + " PT · " + routingInquiry.lead_id);
  setText("routing-original-mismatch", routingInquiry.dealership + " on website · " + originalRouting + " in sales system");
  for (const dealership of [originalRouting, routingInquiry.dealership]) {
    const option = element("option", "", dealership);
    option.value = dealership;
    routingDestination.append(option);
  }
  createLegend();
  replaceDataset(sample.website, sample.crm, "Sample data");
  showStoryStep(0, false);
  renderRouting();
  renderView(false);
  window.addEventListener("hashchange", () => renderView(true));
})();
