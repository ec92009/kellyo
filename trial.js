document.getElementById("trial-form").addEventListener("submit", (event) => {
  event.preventDefault();
  const data = new FormData(event.currentTarget);
  const recipients = "kellycohen11@gmail.com,ec92009@gmail.com";
  const subject = encodeURIComponent("KellyO 1-week trial request");
  const body = encodeURIComponent(
    `Hi KellyO team,\n\nI'd like to try KellyO free for 1 week.\n\nName: ${data.get("name")}\nEmail: ${data.get(
      "email"
    )}\nFirm or practice: ${data.get("firm")}\nClient count: ${data.get("clientCount")}\n\nWhat the trial should prove:\n${data.get("notes")}\n`
  );
  document.getElementById("trial-message").textContent = "Opening a trial request email draft.";
  window.location.href = `mailto:${recipients}?subject=${subject}&body=${body}`;
});
