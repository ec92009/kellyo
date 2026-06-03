const LOCAL_HOSTS = new Set(["localhost", "127.0.0.1", "::1", "0.0.0.0"]);
const isLocalOwner = LOCAL_HOSTS.has(window.location.hostname) || window.location.protocol === "file:";
let revealPasswords = false;
let clientEntries = [];

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
          <td><code>${revealPasswords ? client.password : masked(client.password)}</code></td>
          <td><span class="status-badge ${client.statusClass}">${client.status}</span></td>
          <td>${client.notes}</td>
        </tr>
      `
    )
    .join("");
}

async function loadLocalClients() {
  clientById("owner-mode-title").textContent = "Local owner";
  clientById("owner-mode-copy").textContent = "Credential table is available from this localhost session.";
  clientById("owner-lock").hidden = true;
  clientById("owner-console").hidden = false;

  try {
    const response = await fetch("data/owner-clients.local.json", { cache: "no-store" });
    if (!response.ok) throw new Error("Missing local credential file");
    const data = await response.json();
    clientEntries = data.clients || [];
    renderClients();
  } catch (error) {
    clientById("client-rows").innerHTML = `
      <tr>
        <td colspan="7">
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

