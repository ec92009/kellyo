(function () {
  const accessKey = "kellyo-client-access";
  const kellyNotesKey = "kellyo-kelly-review-notes";
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

  function isKellyAccess(access) {
    const username = String(access?.username || "").toLowerCase();
    const label = String(access?.label || "").toLowerCase();
    return username === "kelly" || label.includes("kelly");
  }

  function loadKellyNotes() {
    try {
      return JSON.parse(window.localStorage.getItem(kellyNotesKey) || "{}");
    } catch {
      return {};
    }
  }

  function saveKellyNote(key, checked) {
    try {
      const notes = loadKellyNotes();
      notes[key] = checked;
      window.localStorage.setItem(kellyNotesKey, JSON.stringify(notes));
    } catch {
      return;
    }
  }

  function updateKellyReviewPanel(access) {
    const panel = document.getElementById("kelly-review-panel");
    if (!panel) return null;

    const isVisible = isKellyAccess(access);
    panel.hidden = !isVisible;
    if (!isVisible) return panel;

    const notes = loadKellyNotes();
    panel.querySelectorAll("[data-kelly-note]").forEach((input) => {
      const key = input.dataset.kellyNote;
      input.checked = Boolean(notes[key]);
      if (input.dataset.boundKellyNote) return;
      input.dataset.boundKellyNote = "true";
      input.addEventListener("change", () => saveKellyNote(key, input.checked));
    });
    return panel;
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
    const gateSection = form.closest(".calc-gate");
    const gateTitle = document.getElementById(options.titleId || "gate-title");
    const gateCopy = gateSection?.querySelector(".gate-copy p:not(.section-kicker)");
    if (!form || !message || !workspace || !workspaceCopy) return;

    const defaultGateTitle = gateTitle?.textContent || "";
    const defaultGateCopy = gateCopy?.textContent || "";
    const clientCredentials = await loadCredentials();
    const next = new URLSearchParams(window.location.search).get("next");
    const successRedirectUrl = options.successRedirectUrl || "./map.html";
    if (successLink && next === "map") {
      successLink.setAttribute("href", "./map.html");
    }

    function applyAccessState(access, shouldScroll = false) {
      if (gateSection) gateSection.classList.add("is-signed-in");
      if (gateTitle) gateTitle.textContent = "Signed in.";
      if (gateCopy) gateCopy.textContent = `${access.label || access.username} can enter the protected planning area.`;
      message.textContent = `Welcome, ${access.label || access.username}. Your protected workspace is open.`;
      workspaceCopy.textContent = "Your planning workspace is open. Use it to review scenarios, estimates, and advisor-ready outputs.";
      workspace.classList.remove("is-locked");
      if (successTarget) successTarget.hidden = false;
      if (trialTarget) trialTarget.hidden = true;
      const reviewPanel = updateKellyReviewPanel(access);
      if (shouldScroll) {
        const scrollTarget = reviewPanel && !reviewPanel.hidden ? reviewPanel : workspace;
        scrollTarget.scrollIntoView({ behavior: "smooth", block: "start" });
      }
    }

    const existingAccess = getAccess();
    if (existingAccess) {
      applyAccessState(existingAccess);
    } else {
      if (gateSection) gateSection.classList.remove("is-signed-in");
      updateKellyReviewPanel(null);
    }

    form.addEventListener("submit", (event) => {
      event.preventDefault();
      const formData = new FormData(form);
      const username = String(formData.get("username") || "").trim();
      const password = String(formData.get("password") || "");
      const matched = findMatchedClient(clientCredentials, username, password);
      if (!matched) {
        if (gateSection) gateSection.classList.remove("is-signed-in");
        if (gateTitle) gateTitle.textContent = defaultGateTitle;
        if (gateCopy) gateCopy.textContent = defaultGateCopy;
        message.textContent = "Client access is closed. Valid username and password required.";
        workspace.classList.add("is-locked");
        if (successTarget) successTarget.hidden = true;
        if (trialTarget) trialTarget.hidden = false;
        updateKellyReviewPanel(null);
        return;
      }
      const access = setAccess(matched);
      if (options.redirectOnSuccess !== false) {
        window.location.assign(successRedirectUrl);
        return;
      }
      applyAccessState(access, true);
    });
  }

  function bindAccountMenu(options = {}) {
    const menu = document.querySelector(options.menuSelector || "[data-account-menu]");
    if (!menu) return;

    const access = getAccess();
    if (!access) {
      menu.hidden = true;
      return;
    }

    const toggle = menu.querySelector("[data-account-toggle]");
    const panel = menu.querySelector("[data-account-panel]");
    const label = menu.querySelector("[data-account-label]");
    const logoutButton = menu.querySelector("[data-account-logout]");
    if (!toggle || !panel || !logoutButton) return;

    menu.hidden = false;
    if (label) label.textContent = access.label || access.username || "Signed in";

    function closeMenu() {
      toggle.setAttribute("aria-expanded", "false");
      panel.hidden = true;
    }

    toggle.addEventListener("click", () => {
      const isOpen = toggle.getAttribute("aria-expanded") === "true";
      toggle.setAttribute("aria-expanded", String(!isOpen));
      panel.hidden = isOpen;
    });

    logoutButton.addEventListener("click", () => {
      clearAccess();
      window.location.assign(options.logoutUrl || "./gate.html");
    });

    document.addEventListener("click", (event) => {
      if (!menu.contains(event.target)) closeMenu();
    });

    document.addEventListener("keydown", (event) => {
      if (event.key === "Escape") closeMenu();
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
    bindAccountMenu,
    bindGate,
    clearAccess,
    getAccess,
    isLocalHost,
    loadCredentials,
    requireAccess,
  };
}());
