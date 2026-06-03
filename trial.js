document.getElementById("trial-form").addEventListener("submit", (event) => {
  event.preventDefault();
  const data = new FormData(event.currentTarget);
  const subject = encodeURIComponent("KellyO 30-day trial request");
  const body = encodeURIComponent(
    `Hi Kelly,\n\nI'd like to try KellyO free for 30 days.\n\nName: ${data.get("name")}\nEmail: ${data.get(
      "email"
    )}\nFirm or practice: ${data.get("firm")}\nClient count: ${data.get("clientCount")}\n\nWhat the trial should prove:\n${data.get("notes")}\n`
  );
  document.getElementById("trial-message").textContent = "Opening a trial request email draft.";
  window.location.href = `mailto:kellycohen11@gmail.com?subject=${subject}&body=${body}`;
});
