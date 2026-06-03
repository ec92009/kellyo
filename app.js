const scenarios = {
  baseline: {
    total: "$184,200",
    saved: "$0",
    q3: "$46,050",
    note:
      "Starting point with projected W-2, K-1, Schedule C income, state tax, and equal quarterly installments.",
  },
  owner: {
    total: "$154,900",
    saved: "$29,300",
    q3: "$38,725",
    note:
      "Adds S corp salary/distribution planning, additional retirement contribution capacity, and accountable plan assumptions.",
  },
  stack: {
    total: "$132,400",
    saved: "$51,800",
    q3: "$33,100",
    note:
      "Compares owner-comp planning with PTET, cost segregation, depreciation limits, and real estate loss treatment.",
  },
};

const tabs = document.querySelectorAll("[data-scenario]");
const taxTotal = document.getElementById("tax-total");
const taxSaved = document.getElementById("tax-saved");
const q3Payment = document.getElementById("q3-payment");
const scenarioNote = document.getElementById("scenario-note");

tabs.forEach((tab) => {
  tab.addEventListener("click", () => {
    tabs.forEach((item) => item.classList.remove("is-active"));
    tab.classList.add("is-active");

    const scenario = scenarios[tab.dataset.scenario];
    taxTotal.textContent = scenario.total;
    taxSaved.textContent = scenario.saved;
    q3Payment.textContent = scenario.q3;
    scenarioNote.textContent = scenario.note;
  });
});

document.getElementById("preview-form").addEventListener("submit", (event) => {
  event.preventDefault();
  const data = new FormData(event.currentTarget);
  const subject = encodeURIComponent("KellyO first-look review");
  const body = encodeURIComponent(
    `Hi Kelly,\n\nI put together a first-look site for KellyO as a discussion springboard.\n\nReview focus: ${data.get(
      "focus"
    )}\n\nNotes: ${data.get("notes")}\n\nCan we review this together?\n`
  );

  window.location.href = `mailto:kellycohen11@gmail.com?subject=${subject}&body=${body}`;
});
