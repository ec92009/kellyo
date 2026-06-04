(function () {
  const accessKey = "kellyo-client-access";
  const kellyNotesKey = "kellyo-kelly-review-notes";
  const authBase = "/api/auth";
  const localHosts = new Set(["localhost", "127.0.0.1", "::1", "0.0.0.0"]);
  const isLocalHost = localHosts.has(window.location.hostname) || window.location.protocol === "file:";

  function normalizeAccess(access) {
    if (!access || !access.username) return null;
    return {
      username: String(access.username),
      label: String(access.label || access.username),
      role: String(access.role || "Client"),
      grantedAt: access.grantedAt || new Date().toISOString(),
      serverVerified: true,
    };
  }

  function getAccess() {
    try {
      const raw = window.sessionStorage.getItem(accessKey);
      const access = raw ? JSON.parse(raw) : null;
      if (!access?.serverVerified) {
        clearAccess();
        return null;
      }
      return normalizeAccess(access);
    } catch {
      return null;
    }
  }

  function setAccess(client) {
    const access = normalizeAccess(client);
    if (!access) return null;
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

  async function authFetch(path, options = {}) {
    const response = await fetch(`${authBase}${path}`, {
      cache: "no-store",
      credentials: "same-origin",
      ...options,
      headers: {
        ...(options.body ? { "Content-Type": "application/json" } : {}),
        ...(options.headers || {}),
      },
    });
    let data = {};
    try {
      data = await response.json();
    } catch {
      data = {};
    }
    if (!response.ok || data.ok === false) {
      throw new Error(data.error || "Secure sign-in is not available yet.");
    }
    return data;
  }

  async function fetchSession() {
    const data = await authFetch("/session");
    const access = setAccess(data.access);
    if (!access) throw new Error("No active session.");
    return access;
  }

  async function login(username, password) {
    const data = await authFetch("/login", {
      method: "POST",
      body: JSON.stringify({ username, password }),
    });
    const access = setAccess(data.access);
    if (!access) throw new Error("Sign-in did not return a session.");
    return access;
  }

  async function logout(logoutUrl) {
    try {
      await authFetch("/logout", { method: "POST" });
    } catch {
      // Clear the browser display state even if a static preview has no API.
    }
    clearAccess();
    window.location.assign(logoutUrl || "./gate.html");
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

  function bindPasswordToggles(root = document) {
    root.querySelectorAll("[data-password-toggle]").forEach((button) => {
      if (button.dataset.boundPasswordToggle) return;
      const inputId = button.getAttribute("aria-controls");
      const input = inputId
        ? document.getElementById(inputId)
        : button.closest(".password-field")?.querySelector("input");
      if (!input) return;

      function setVisible(isVisible) {
        input.type = isVisible ? "text" : "password";
        button.classList.toggle("is-visible", isVisible);
        button.setAttribute("aria-pressed", String(isVisible));
        button.setAttribute("aria-label", isVisible ? "Hide password" : "Show password");
        button.setAttribute("title", isVisible ? "Hide password" : "Show password");
      }

      button.dataset.boundPasswordToggle = "true";
      button.addEventListener("click", () => {
        setVisible(input.type !== "text");
        input.focus({ preventScroll: true });
      });
      setVisible(input.type === "text");
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
    const gateSection = form?.closest(".calc-gate");
    const gateTitle = document.getElementById(options.titleId || "gate-title");
    const gateCopy = gateSection?.querySelector(".gate-copy p:not(.section-kicker)");
    if (!form || !message || !workspace || !workspaceCopy) return;
    bindPasswordToggles(form);

    const defaultGateTitle = gateTitle?.textContent || "";
    const defaultGateCopy = gateCopy?.textContent || "";
    const next = new URLSearchParams(window.location.search).get("next");
    const successRedirectUrl = options.successRedirectUrl || "./map.html";
    if (successLink && next === "map") {
      successLink.setAttribute("href", "./map.html");
    }

    function applyLockedState(text = "Client username and password required.") {
      if (gateSection) gateSection.classList.remove("is-signed-in");
      if (gateTitle) gateTitle.textContent = defaultGateTitle;
      if (gateCopy) gateCopy.textContent = defaultGateCopy;
      message.textContent = text;
      workspace.classList.add("is-locked");
      if (successTarget) successTarget.hidden = true;
      if (trialTarget) trialTarget.hidden = false;
      updateKellyReviewPanel(null);
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

    try {
      const existingAccess = await fetchSession();
      applyAccessState(existingAccess);
    } catch {
      applyLockedState();
    }

    form.addEventListener("submit", async (event) => {
      event.preventDefault();
      const formData = new FormData(form);
      const username = String(formData.get("username") || "").trim();
      const password = String(formData.get("password") || "");
      if (!username || !password) {
        applyLockedState("Enter the assigned username and password.");
        return;
      }

      const submitButton = form.querySelector("[type='submit']");
      const originalText = submitButton?.textContent || "";
      if (submitButton) {
        submitButton.disabled = true;
        submitButton.textContent = "Checking";
      }
      message.textContent = "Checking credentials securely...";

      try {
        const access = await login(username, password);
        if (options.redirectOnSuccess !== false) {
          window.location.assign(successRedirectUrl);
          return;
        }
        applyAccessState(access, true);
      } catch (error) {
        applyLockedState(error.message || "Client access is closed. Valid username and password required.");
      } finally {
        if (submitButton) {
          submitButton.disabled = false;
          submitButton.textContent = originalText;
        }
      }
    });
  }

  function bindSignedInClientCtas(access, logoutUrl) {
    document.body.classList.toggle("has-client-access", Boolean(access));
    if (!access) return;

    document.querySelectorAll(".client-cta").forEach((link) => {
      link.textContent = "Log out";
      link.setAttribute("href", logoutUrl);
      link.setAttribute("aria-label", "Log out and return to the client gate");
      link.removeAttribute("aria-current");
      if (link.dataset.boundAccessLogout) return;

      link.dataset.boundAccessLogout = "true";
      link.addEventListener("click", (event) => {
        event.preventDefault();
        logout(logoutUrl);
      });
    });
  }

  function renderAccountMenu(access, options = {}) {
    const logoutUrl = options.logoutUrl || "./gate.html";
    bindSignedInClientCtas(access, logoutUrl);

    const menu = document.querySelector(options.menuSelector || "[data-account-menu]");
    if (!menu) return;

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

    if (!menu.dataset.boundAccountMenu) {
      menu.dataset.boundAccountMenu = "true";
      toggle.addEventListener("click", () => {
        const isOpen = toggle.getAttribute("aria-expanded") === "true";
        toggle.setAttribute("aria-expanded", String(!isOpen));
        panel.hidden = isOpen;
      });

      logoutButton.addEventListener("click", () => logout(logoutUrl));

      document.addEventListener("click", (event) => {
        if (!menu.contains(event.target)) closeMenu();
      });

      document.addEventListener("keydown", (event) => {
        if (event.key === "Escape") closeMenu();
      });
    }
  }

  async function bindAccountMenu(options = {}) {
    const cachedAccess = getAccess();
    renderAccountMenu(cachedAccess, options);
    try {
      renderAccountMenu(await fetchSession(), options);
    } catch {
      clearAccess();
      renderAccountMenu(null, options);
    }
  }

  function requireAccess(options = {}) {
    const cachedAccess = getAccess();
    if (cachedAccess) {
      document.body.classList.remove("is-access-pending");
    }

    fetchSession()
      .then(() => {
        document.body.classList.remove("is-access-pending");
      })
      .catch(() => {
        clearAccess();
        window.location.replace(options.redirectUrl || "./gate.html?next=map");
      });

    return cachedAccess;
  }

  window.KellyOGateAccess = {
    bindAccountMenu,
    bindGate,
    bindPasswordToggles,
    clearAccess,
    fetchSession,
    getAccess,
    isLocalHost,
    login,
    logout,
    requireAccess,
  };
}());
