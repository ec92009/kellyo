(function () {
  document.querySelectorAll("[data-status-toggle]").forEach((button) => {
    const detailsId = button.getAttribute("aria-controls");
    const details = detailsId ? document.getElementById(detailsId) : null;
    if (!details) return;

    button.addEventListener("click", () => {
      const isOpen = button.getAttribute("aria-expanded") === "true";
      button.setAttribute("aria-expanded", String(!isOpen));
      details.hidden = isOpen;
    });
  });

  const trialModal = document.getElementById("trial-modal");
  if (!trialModal) return;

  document.querySelectorAll("[data-trial-modal-open]").forEach((button) => {
    button.addEventListener("click", () => {
      if (typeof trialModal.showModal === "function") {
        trialModal.showModal();
      } else {
        trialModal.setAttribute("open", "");
      }
    });
  });

  document.querySelectorAll("[data-trial-modal-close]").forEach((button) => {
    button.addEventListener("click", () => {
      trialModal.close();
    });
  });

  trialModal.addEventListener("click", (event) => {
    if (event.target === trialModal) trialModal.close();
  });
}());
