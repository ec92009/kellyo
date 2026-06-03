(function () {
  const accessKey = "kellyo-client-access";
  const defaultClientCredentials = [
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
  const isLocalHost = localHosts.has(window.location.hostname) || window.location.protocol === "file:";

  function getAccess() {
    try {
      const raw = window.sessionStorage.getItem(accessKey);
      return raw ? JSON.parse(raw) : null;
    } catch {
      return null;
    }
  }

  function setAccess(client) {
    const access = {
      username: client.username,
      label: client.label,
      grantedAt: new Date().toISOString(),
    };
    try {
      window.sessionStorage.setItem(accessKey, JSON.stringify(access));
    } catch {
      return access;
    }
    return access;
  }

  function clearAccess() {
    try {
      window.sessionStorage.removeItem(accessKey);
    } catch {
      return;
    }
  }

  async function loadCredentials() {
    if (!isLocalHost) return defaultClientCredentials;
    try {
      const response = await fetch("/api/owner/clients", { cache: "no-store" });
      if (!response.ok) return defaultClientCredentials;
      const data = await response.json();
      const localClients = (data.clients || []).map((client, index) => ({
        id: index,
        username: String(client.username || ""),
        password: String(client.password || ""),
        localOnly: String(client.username || "").toLowerCase() === "localhost",
        label: `${client.name}: ${client.role}`,
      }));
      return localClients.length ? localClients : defaultClientCredentials;
    } catch {
      return defaultClientCredentials;
    }
  }

  function findMatchedClient(clientCredentials, username, password) {
    return clientCredentials.find((client) => {
      if (client.localOnly) {
        return isLocalHost && username.toLowerCase() === client.username.toLowerCase() && password === client.password;
      }
      return username === client.username && password === client.password;
    });
  }

  async function bindGate(options = {}) {
    const form = document.getElementById(options.formId || "gate-form");
    const message = document.getElementById(options.messageId || "gate-message");
    const workspace = document.getElementById(options.workspaceId || "gated-workspace");
    const workspaceCopy = document.getElementById(options.workspaceCopyId || "workspace-copy");
    const successTarget = document.querySelector(options.successSelector || "[data-gate-success]");
    const successLink = document.getElementById(options.successLinkId || "enter-paywall");
    const trialTarget = document.querySelector(options.trialSelector || "[data-trial-cta]");
    if (!form || !message || !workspace || !workspaceCopy) return;

    const clientCredentials = await loadCredentials();
    const next = new URLSearchParams(window.location.search).get("next");
    if (successLink && next === "map") {
      successLink.setAttribute("href", "./map.html");
    }

    form.addEventListener("submit", (event) => {
      event.preventDefault();
      const formData = new FormData(form);
      const username = String(formData.get("username") || "").trim();
      const password = String(formData.get("password") || "");
      const matched = findMatchedClient(clientCredentials, username, password);
      if (!matched) {
        message.textContent = "Mock paywall closed. Client username and password required.";
        workspace.classList.add("is-locked");
        if (successTarget) successTarget.hidden = true;
        if (trialTarget) trialTarget.hidden = false;
        return;
      }
      setAccess(matched);
      message.textContent = `${matched.label} passed the mock paywall. Calculations remain locked pending formula tests.`;
      workspaceCopy.textContent = `${matched.label} can now see the test-lab placeholder. Live calculations are still withheld until the workbook formulas are ported and CPA-tested.`;
      workspace.classList.remove("is-locked");
      if (successTarget) successTarget.hidden = false;
      if (trialTarget) trialTarget.hidden = true;
      workspace.scrollIntoView({ behavior: "smooth", block: "start" });
    });
  }

  function requireAccess(options = {}) {
    const access = getAccess();
    if (access) {
      document.body.classList.remove("is-access-pending");
      return access;
    }
    window.location.replace(options.redirectUrl || "./gate.html?next=map");
    return null;
  }

  window.KellyOGateAccess = {
    bindGate,
    clearAccess,
    getAccess,
    isLocalHost,
    loadCredentials,
    requireAccess,
  };
}());
