const LOCAL_HOSTS = new Set(["localhost", "127.0.0.1", "::1", "0.0.0.0"]);
const STATUS_CLASSES = {
  Active: "mapped",
  Pending: "needs",
  Review: "ready",
  Disabled: "backlog",
};
const isLocalOwner = LOCAL_HOSTS.has(window.location.hostname) || window.location.protocol === "file:";
let revealPasswords = false;
let clientEntries = [];
let canSaveClients = false;

function clientById(id) {
  return document.getElementById(id);
}

function escapeHtml(value) {
  return String(value ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;");
}

function escapeAttribute(value) {
  return escapeHtml(value).replaceAll('"', "&quot;");
}

function normalizeClient(client) {
  const status = client.status || "Active";
  return {
    name: client.name || client.username || "Client",
    role: client.role || "Client",
    tier: client.tier || "Client",
    username: client.username || "",
    password: client.password || "",
    status,
    statusClass: client.statusClass || STATUS_CLASSES[status] || "mapped",
    notes: client.notes || "",
  };
}

function emptyClient() {
  return {
    name: `Client ${clientEntries.length}`,
    role: "Reviewer",
    tier: "Reviewer",
    username: "",
    password: "",
    status: "Active",
    statusClass: "mapped",
    notes: "",
  };
}

function renderClients() {
  clientById("client-rows").innerHTML = clientEntries
    .map((rawClient) => {
      const client = normalizeClient(rawClient);
      return `
        <tr>
          <td><strong>${escapeHtml(client.name)}</strong></td>
          <td>${escapeHtml(client.role)}</td>
          <td>${escapeHtml(client.tier)}</td>
          <td><code>${escapeHtml(client.username)}</code></td>
          <td>
            <div class="password-editor">
              <input
                type="${revealPasswords ? "text" : "password"}"
                value="${escapeAttribute(client.password)}"
                data-password-for="${escapeAttribute(client.username)}"
                aria-label="Password for ${escapeAttribute(client.username)}"
              >
              <button class="button mini" type="button" data-save-password="${escapeAttribute(client.username)}" ${canSaveClients ? "" : "disabled"}>
                Save
              </button>
            </div>
          </td>
          <td><span class="status-badge ${escapeAttribute(client.statusClass)}">${escapeHtml(client.status)}</span></td>
          <td>${escapeHtml(client.notes)}</td>
          <td>
            <div class="row-actions">
              <button class="icon-button" type="button" data-edit-client="${escapeAttribute(client.username)}" aria-label="Edit ${escapeAttribute(client.username)}" title="Edit client">
                <svg aria-hidden="true" viewBox="0 0 24 24">
                  <path d="M12 20h9"></path>
                  <path d="M16.5 3.5a2.1 2.1 0 0 1 3 3L7 19l-4 1 1-4Z"></path>
                </svg>
              </button>
              <button class="icon-button danger" type="button" data-delete-client="${escapeAttribute(client.username)}" aria-label="Delete ${escapeAttribute(client.username)}" title="Delete client" ${canSaveClients ? "" : "disabled"}>
                <svg aria-hidden="true" viewBox="0 0 24 24">
                  <path d="M3 6h18"></path>
                  <path d="M8 6V4h8v2"></path>
                  <path d="M19 6l-1 14H6L5 6"></path>
                  <path d="M10 11v6"></path>
                  <path d="M14 11v6"></path>
                </svg>
              </button>
            </div>
          </td>
        </tr>
      `;
    })
    .join("");
  bindRowActions();
}

async function ownerApiAvailable() {
  try {
    const response = await fetch("/api/owner/health", { cache: "no-store" });
    if (!response.ok) return false;
    const data = await response.json();
    return data.service === "kellyo-owner";
  } catch {
    return false;
  }
}

function editorForm() {
  return clientById("client-editor");
}

function setEditorMessage(message) {
  clientById("client-editor-message").textContent = message;
}

function fillEditor(client, originalUsername = "") {
  const form = editorForm();
  const normalized = normalizeClient(client);
  form.elements.originalUsername.value = originalUsername;
  form.elements.name.value = normalized.name;
  form.elements.role.value = normalized.role;
  form.elements.tier.value = normalized.tier;
  form.elements.username.value = normalized.username;
  form.elements.password.value = normalized.password;
  form.elements.status.value = normalized.status;
  form.elements.notes.value = normalized.notes;
  form.hidden = false;
  setEditorMessage(canSaveClients ? "" : "Saving requires the KellyO Owner mini server.");
  form.elements.name.focus();
}

function closeEditor() {
  editorForm().hidden = true;
  editorForm().reset();
  setEditorMessage("");
}

function collectEditorClient() {
  const form = editorForm();
  const status = form.elements.status.value || "Active";
  return {
    name: form.elements.name.value.trim(),
    role: form.elements.role.value.trim(),
    tier: form.elements.tier.value.trim(),
    username: form.elements.username.value.trim(),
    password: form.elements.password.value,
    status,
    statusClass: STATUS_CLASSES[status] || "mapped",
    notes: form.elements.notes.value.trim(),
  };
}

async function saveClient(event) {
  event.preventDefault();
  if (!canSaveClients) {
    setEditorMessage("Saving requires the KellyO Owner mini server.");
    return;
  }

  const form = editorForm();
  const client = collectEditorClient();
  if (!client.username) {
    setEditorMessage("Username is required.");
    return;
  }

  setEditorMessage("Saving client...");
  try {
    const response = await fetch("/api/owner/client", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        originalUsername: form.elements.originalUsername.value,
        client,
      }),
    });
    const result = await response.json();
    if (!response.ok || !result.ok) throw new Error(result.error || "Save failed");
    clientEntries = (result.clients || []).map(normalizeClient);
    renderClients();
    fillEditor(result.client, result.client.username);
    setEditorMessage("Saved.");
  } catch (error) {
    setEditorMessage(error.message || "Save failed.");
  }
}

async function savePassword(username) {
  const input = document.querySelector(`[data-password-for="${CSS.escape(username)}"]`);
  const button = document.querySelector(`[data-save-password="${CSS.escape(username)}"]`);
  if (!input || !button) return;

  const originalText = button.textContent;
  button.textContent = "Saving";
  button.disabled = true;

  try {
    const response = await fetch("/api/owner/client-password", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ username, password: input.value }),
    });
    const result = await response.json();
    if (!response.ok || !result.ok) throw new Error(result.error || "Save failed");
    const client = clientEntries.find((entry) => entry.username === username);
    if (client) client.password = input.value;
    button.textContent = "Saved";
    setTimeout(() => {
      button.textContent = originalText;
      button.disabled = false;
    }, 900);
  } catch {
    button.textContent = "Error";
    setTimeout(() => {
      button.textContent = originalText;
      button.disabled = false;
    }, 1400);
  }
}

async function deleteClient(username) {
  if (!canSaveClients) return;
  const client = clientEntries.find((entry) => entry.username === username);
  const label = client?.name || username;
  if (!window.confirm(`Delete ${label}? This removes the local credential entry.`)) return;

  const button = document.querySelector(`[data-delete-client="${CSS.escape(username)}"]`);
  if (button) button.disabled = true;
  try {
    const response = await fetch("/api/owner/client", {
      method: "DELETE",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ username }),
    });
    const result = await response.json();
    if (!response.ok || !result.ok) throw new Error(result.error || "Delete failed");
    clientEntries = clientEntries.filter((entry) => entry.username !== username);
    renderClients();
    closeEditor();
  } catch {
    if (button) {
      button.disabled = false;
      button.title = "Delete failed";
    }
  }
}

function bindRowActions() {
  document.querySelectorAll("[data-save-password]").forEach((button) => {
    button.addEventListener("click", () => savePassword(button.dataset.savePassword));
  });
  document.querySelectorAll("[data-edit-client]").forEach((button) => {
    button.addEventListener("click", () => {
      const client = clientEntries.find((entry) => entry.username === button.dataset.editClient);
      if (client) fillEditor(client, client.username);
    });
  });
  document.querySelectorAll("[data-delete-client]").forEach((button) => {
    button.addEventListener("click", () => deleteClient(button.dataset.deleteClient));
  });
}

async function loadLocalClients() {
  clientById("owner-mode-title").textContent = "Local owner";
  canSaveClients = await ownerApiAvailable();
  clientById("owner-mode-copy").textContent = canSaveClients
    ? "Credential records are editable from this localhost session."
    : "Credential records are visible, but saving requires the KellyO Owner app mini server.";
  clientById("owner-lock").hidden = true;
  clientById("owner-console").hidden = false;

  try {
    const response = await fetch(canSaveClients ? "/api/owner/clients" : "data/owner-clients.local.json", { cache: "no-store" });
    if (!response.ok) throw new Error("Missing local credential file");
    const data = await response.json();
    clientEntries = (data.clients || []).map(normalizeClient);
    renderClients();
  } catch {
    clientById("client-rows").innerHTML = `
      <tr>
        <td colspan="8">
          Local credential file not found. Create <code>site/data/owner-clients.local.json</code>
          on the owner's machine.
        </td>
      </tr>
    `;
  }
}

function lockPublicPage() {
  clientById("owner-mode-title").textContent = "Public visitor";
  clientById("owner-mode-copy").textContent = "Credential data is blocked outside localhost.";
  clientById("owner-lock").hidden = false;
  clientById("owner-console").hidden = true;
}

clientById("toggle-passwords")?.addEventListener("click", () => {
  revealPasswords = !revealPasswords;
  clientById("toggle-passwords").textContent = revealPasswords ? "Hide passwords" : "Show passwords";
  renderClients();
});

clientById("add-client")?.addEventListener("click", () => fillEditor(emptyClient()));
clientById("cancel-client")?.addEventListener("click", closeEditor);
editorForm()?.addEventListener("submit", saveClient);

if (isLocalOwner) {
  loadLocalClients();
} else {
  lockPublicPage();
}
