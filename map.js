const formatter = new Intl.NumberFormat("en-US");
const statusClass = {
  "Mapped": "mapped",
  "Mapped in site": "mapped",
  "Needs engine": "needs",
  "Needs formula port": "needs",
  "Needs spec": "needs",
  "Needs versioning": "needs",
  "Needs state policy": "needs",
  "Needs review workflow": "needs",
  "Ready for expansion": "ready",
  "Backlog": "backlog",
};

let workbookData = null;
let activeFilter = "All";
const clientCredentials = [
  {
    id: 0,
    username: "localhost",
    password: "",
    localOnly: true,
    label: "Client 0: Owner localhost",
  },
  {
    id: 1,
    username: "Kelly",
    password: "xxxxxx",
    localOnly: false,
    label: "Client 1: Kelly",
  },
];
const localHosts = new Set(["localhost", "127.0.0.1", "::1", "0.0.0.0"]);

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
          <p class="test-focus">${sheet.testFocus}</p>
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

function bindGate() {
  const form = byId("gate-form");
  const message = byId("gate-message");
  const workspace = byId("gated-workspace");
  const workspaceCopy = byId("workspace-copy");
  form.addEventListener("submit", (event) => {
    event.preventDefault();
    const formData = new FormData(form);
    const username = String(formData.get("username") || "").trim();
    const password = String(formData.get("password") || "");
    const isLocal = localHosts.has(window.location.hostname) || window.location.protocol === "file:";
    const matched = clientCredentials.find((client) => {
      if (client.localOnly) {
        return isLocal && username.toLowerCase() === client.username && password === client.password;
      }
      return username === client.username && password === client.password;
    });
    if (!matched) {
      message.textContent = "Mock paywall closed. Client username and password required.";
      workspace.classList.add("is-locked");
      return;
    }
    message.textContent = `${matched.label} passed the mock paywall. Calculations remain locked pending formula tests.`;
    workspaceCopy.textContent = `${matched.label} can now see the test-lab placeholder. Live calculations are still withheld until the workbook formulas are ported and CPA-tested.`;
    workspace.classList.remove("is-locked");
    workspace.scrollIntoView({ behavior: "smooth", block: "start" });
  });
}

async function loadWorkbookMap() {
  const response = await fetch("data/workbook-map.json");
  workbookData = await response.json();
  setSummary(workbookData.summary);
  renderModules();
  renderScenarios();
  bindControls();
  bindGate();
}

loadWorkbookMap();
