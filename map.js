const formatter = new Intl.NumberFormat("en-US");
const currencyFormatter = new Intl.NumberFormat("en-US", {
  style: "currency",
  currency: "USD",
  maximumFractionDigits: 0,
});
const percentFormatter = new Intl.NumberFormat("en-US", {
  style: "percent",
  maximumFractionDigits: 1,
});
const statusClass = {
  "Mapped": "mapped",
  "Mapped in site": "mapped",
  "Needs engine": "needs",
  "Needs formula port": "needs",
  "Needs spec": "needs",
  "Needs versioning": "needs",
  "Needs state policy": "needs",
  "Needs review workflow": "needs",
  "Formula port started": "ready",
  "Ready for expansion": "ready",
  "Backlog": "backlog",
};

let workbookData = null;
let taxParameters = null;
let activeFilter = "All";

function byId(id) {
  return document.getElementById(id);
}

function setSummary(summary) {
  byId("sheet-count").textContent = formatter.format(summary.sheetCount);
  byId("formula-count").textContent = formatter.format(summary.formulaCells);
  byId("validation-count").textContent = formatter.format(summary.validations);
  byId("v1-count").textContent = formatter.format(summary.v1Modules);
}

function matchesFilter(sheet) {
  if (activeFilter === "All") return true;
  if (activeFilter === "V1") return sheet.priority === "V1";
  if (activeFilter === "Future") return sheet.priority === "Future";
  return sheet.category === activeFilter;
}

function matchesSearch(sheet, term) {
  if (!term) return true;
  const text = [
    sheet.name,
    sheet.module,
    sheet.category,
    sheet.priority,
    sheet.status,
    ...(sheet.inputs || []),
    ...(sheet.outputs || []),
    sheet.testFocus,
  ]
    .join(" ")
    .toLowerCase();
  return text.includes(term);
}

function renderModules() {
  const term = byId("module-search").value.trim().toLowerCase();
  const sheets = workbookData.sheets.filter((sheet) => matchesFilter(sheet) && matchesSearch(sheet, term));
  byId("module-grid").innerHTML = sheets
    .map(
      (sheet) => `
        <article class="module-card">
          <div class="module-card-top">
            <div>
              <p class="mini-label">${sheet.category}</p>
              <h3>${sheet.module}</h3>
            </div>
            <span class="priority-badge">${sheet.priority}</span>
          </div>
          <dl class="module-stats">
            <div><dt>Excel tab</dt><dd>${sheet.name}</dd></div>
            <div><dt>Formulas</dt><dd>${formatter.format(sheet.formulaCells)}</dd></div>
            <div><dt>Validations</dt><dd>${formatter.format(sheet.validations)}</dd></div>
            <div><dt>Status</dt><dd><span class="status-badge ${statusClass[sheet.status] || "needs"}">${sheet.status}</span></dd></div>
          </dl>
          <div class="io-grid">
            <div>
              <h4>Inputs</h4>
              <ul>${(sheet.inputs || []).map((item) => `<li>${item}</li>`).join("")}</ul>
            </div>
            <div>
              <h4>Outputs</h4>
              <ul>${(sheet.outputs || []).map((item) => `<li>${item}</li>`).join("")}</ul>
            </div>
          </div>
        </article>
      `
    )
    .join("");
}

function renderScenarios() {
  byId("scenario-list").innerHTML = workbookData.qaScenarios
    .map(
      (item, index) => `
        <article>
          <span>${String(index + 1).padStart(2, "0")}</span>
          <div>
            <h3>${item.scenario}</h3>
            <p>${item.expected}</p>
          </div>
        </article>
      `
    )
    .join("");
}

function bindControls() {
  byId("module-search").addEventListener("input", renderModules);
  document.querySelectorAll("[data-filter]").forEach((button) => {
    button.addEventListener("click", () => {
      document.querySelectorAll("[data-filter]").forEach((item) => item.classList.remove("is-active"));
      button.classList.add("is-active");
      activeFilter = button.dataset.filter;
      renderModules();
    });
  });
}

function populateQuickCalcControls() {
  const statusSelect = byId("qc-status");
  const stateSelect = byId("qc-state");
  statusSelect.innerHTML = "";
  taxParameters.filingStatuses.forEach((status) => {
    const option = document.createElement("option");
    option.value = status;
    option.textContent = status;
    if (status === "MFJ") option.selected = true;
    statusSelect.append(option);
  });

  stateSelect.innerHTML = "";
  ["None", ...Object.keys(taxParameters.states).filter((state) => state !== "None").sort()].forEach((state) => {
    const option = document.createElement("option");
    option.value = state;
    option.textContent = state;
    if (state === "California") option.selected = true;
    stateSelect.append(option);
  });
}

function quickCalcInput() {
  return {
    filingStatus: byId("qc-status").value,
    state: byId("qc-state").value,
    ordinaryIncome: byId("qc-ordinary").value,
    longTermCapitalGains: byId("qc-ltcg").value,
  };
}

function setQuickCalcResult(id, value, formatterFn = currencyFormatter.format) {
  byId(id).textContent = formatterFn(value);
}

function renderQuickCalc() {
  if (!taxParameters) return;
  const result = window.KellyOTaxEngine.calculateQuickCalc(quickCalcInput(), taxParameters);
  setQuickCalcResult("qc-total-taxable", result.totalTaxableIncome);
  setQuickCalcResult("qc-federal-ordinary", result.federalOrdinaryTax);
  setQuickCalcResult("qc-ltcg-tax", result.federalLongTermCapitalGainsTax);
  setQuickCalcResult("qc-state-tax", result.stateTax);
  setQuickCalcResult("qc-combined-tax", result.combinedTax);
  setQuickCalcResult("qc-fed-effective", result.federalEffectiveRate, percentFormatter.format);
  setQuickCalcResult("qc-combined-effective", result.combinedEffectiveRate, percentFormatter.format);
  setQuickCalcResult("qc-marginal", result.federalMarginalRate, percentFormatter.format);
}

async function bindQuickCalc() {
  taxParameters = await window.KellyOTaxEngine.loadTaxParameters();
  populateQuickCalcControls();
  byId("quick-calc-form").addEventListener("submit", (event) => {
    event.preventDefault();
    renderQuickCalc();
  });
  ["qc-status", "qc-state", "qc-ordinary", "qc-ltcg"].forEach((id) => {
    byId(id).addEventListener("input", renderQuickCalc);
    byId(id).addEventListener("change", renderQuickCalc);
  });
  renderQuickCalc();
}

function hydrateAccessState() {
  const access = window.KellyOGateAccess.getAccess();
  if (!access) return;
  byId("workspace-copy").textContent = `${access.label} has entered the protected workbook map. Quick Calc is available for guided review. Full scenario calculations remain locked until workbook parity checks are complete.`;
}

async function loadWorkbookMap() {
  const response = await fetch("data/workbook-map.json");
  workbookData = await response.json();
  hydrateAccessState();
  setSummary(workbookData.summary);
  renderModules();
  bindControls();
  await bindQuickCalc();
}

loadWorkbookMap();
