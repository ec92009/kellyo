(function () {
  const version = "v95.5";

  function bindVersionLabels() {
    document.querySelectorAll("[data-site-version]").forEach((label) => {
      label.textContent = version;
      label.setAttribute("aria-label", `KellyO version ${version}`);
    });
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", bindVersionLabels);
  } else {
    bindVersionLabels();
  }

  window.KellyOVersion = { value: version };
}());
