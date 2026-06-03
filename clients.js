const LOCAL_HOSTS = new Set(["localhost", "127.0.0.1", "::1", "0.0.0.0"]);
const isLocalOwner = LOCAL_HOSTS.has(window.location.hostname) || window.location.protocol === "file:";
let revealPasswords = false;
let clientEntries = [];
let canSavePasswords = false;

function clientById(id) {
  return document.getElementById(id);
}

function masked(value) {
  return "•".repeat(Math.max(8, String(value).length));
}

function renderClients() {
  clientById("client-rows").innerHTML = clientEntries
    .map(
      (client) => `
        <tr>
          <td><strong>${client.name}</strong></td>
          <td>${client.role}</td>
          <td>${client.tier}</td>
          <td><code>${client.username}</code></td>
          <td>
            <div class="password-editor">
              <input
                type="${revealPasswords ? "text" : "password"}"
                value="${escapeAttribute(client.password)}"
                data-password-for="${escapeAttribute(client.username)}"
                aria-label="Password for ${escapeAttribute(client.username)}"
              >
              <button class="button mini" type="button" data-save-password="${escapeAttribute(client.username)}" ${canSavePasswords ? "" : "disabled"}>
                Save
              </button>
            </div>
          </td>
          <td><span class="status-badge ${client.statusClass}">${client.status}</span></td>
          <td>${client.notes}</td>
          <td>
            <div class="row-actions">
              <button class="icon-button" type="button" data-edit-client="${escapeAttribute(client.username)}" aria-label="Edit ${escapeAttribute(client.username)} password" title="Edit password">
                <svg aria-hidden="true" viewBox="0 0 24 24">
                  <path d="M12 20h9"></path>
                  <path d="M16.5 3.5a2.1 2.1 0 0 1 3 3L7 19l-4 1 1-4Z"></path>
                </svg>
              </button>
              <button class="icon-button danger" type="button" data-delete-client="${escapeAttribute(client.username)}" aria-label="Delete ${escapeAttribute(client.username)}" title="Delete client" ${canSavePasswords ? "" : "disabled"}>
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
      `
    )
    .join("");
  bindPasswordButtons();
}

function escapeAttribute(value) {
  return String(value)
    .replaceAll("&", "&amp;")
    .replaceAll('"', "&quot;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;");
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

async function savePassword(username) {
  const input = document.querySelector(`[data-password-for="${CSS.escape(username)}"]`);
  if (!input) return;
  const button = document.querySelector(`[data-save-password="${CSS.escape(username)}"]`);
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
  } catch (error) {
    button.textContent = "Error";
    setTimeout(() => {
      button.textContent = originalText;
      button.disabled = false;
    }, 1400);
  }
}

function bindPasswordButtons() {
  document.querySelectorAll("[data-save-password]").forEach((button) => {
    button.addEventListener("click", () => savePassword(button.dataset.savePassword));
  });
  document.querySelectorAll("[data-edit-client]").forEach((button) => {
    button.addEventListener("click", () => {
      const input = document.querySelector(`[data-password-for="${CSS.escape(button.dataset.editClient)}"]`);
      if (!input) return;
      revealPasswords = true;
      clientById("toggle-passwords").textContent = "Hide passwords";
      renderClients();
      const refreshedInput = document.querySelector(`[data-password-for="${CSS.escape(button.dataset.editClient)}"]`);
      refreshedInput?.focus();
      refreshedInput?.select();
    });
  });
  document.querySelectorAll("[data-delete-client]").forEach((button) => {
    button.addEventListener("click", () => deleteClient(button.dataset.deleteClient));
  });
}

async function deleteClient(username) {
  if (!canSavePasswords) return;
  const client = clientEntries.find((entry) => entry.username === username);
  const label = client?.name || username;
  if (!window.confirm(`Delete ${label}? This removes the local credential entry.`)) return;

  const button = document.querySelector(`[data-delete-client="${CSS.escape(username)}"]`);
  button.disabled = true;
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
  } catch (error) {
    button.disabled = false;
    button.title = "Delete failed";
  }
}

async function loadLocalClients() {
  clientById("owner-mode-title").textContent = "Local owner";
  canSavePasswords = await ownerApiAvailable();
  clientById("owner-mode-copy").textContent = canSavePasswords
    ? "Credential table is editable from this localhost session."
    : "Credential table is visible, but password saving requires the KellyO Owner app mini server.";
  clientById("owner-lock").hidden = true;
  clientById("owner-console").hidden = false;

  try {
    const response = await fetch(canSavePasswords ? "/api/owner/clients" : "data/owner-clients.local.json", { cache: "no-store" });
    if (!response.ok) throw new Error("Missing local credential file");
    const data = await response.json();
    clientEntries = data.clients || [];
    renderClients();
  } catch (error) {
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

if (isLocalOwner) {
  loadLocalClients();
} else {
  lockPublicPage();
}
