(function () {
  const storageKey = "kellyo-theme";
  const root = document.documentElement;
  const nightMedia = window.matchMedia ? window.matchMedia("(prefers-color-scheme: dark)") : null;

  function getStoredTheme() {
    try {
      const storedTheme = window.localStorage.getItem(storageKey);
      return storedTheme === "night" || storedTheme === "day" ? storedTheme : null;
    } catch {
      return null;
    }
  }

  function getPreferredTheme() {
    return getStoredTheme() || (nightMedia?.matches ? "night" : "day");
  }

  function applyTheme(theme) {
    const nextTheme = theme === "night" ? "night" : "day";
    root.dataset.theme = nextTheme;
    root.style.colorScheme = nextTheme === "night" ? "dark" : "light";
    document.querySelectorAll("[data-theme-toggle]").forEach((button) => {
      const isNight = nextTheme === "night";
      button.setAttribute("aria-pressed", String(isNight));
      button.setAttribute("aria-label", isNight ? "Switch to day mode" : "Switch to night mode");
    });
  }

  function setTheme(theme) {
    applyTheme(theme);
    try {
      window.localStorage.setItem(storageKey, theme);
    } catch {
      return;
    }
  }

  function bindThemeToggle() {
    applyTheme(getPreferredTheme());
    document.querySelectorAll("[data-theme-toggle]").forEach((button) => {
      button.addEventListener("click", () => {
        setTheme(root.dataset.theme === "night" ? "day" : "night");
      });
    });
  }

  applyTheme(getPreferredTheme());

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", bindThemeToggle);
  } else {
    bindThemeToggle();
  }

  window.KellyOTheme = { applyTheme, setTheme };
}());
