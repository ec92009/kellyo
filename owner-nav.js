const ownerHosts = new Set(["localhost", "127.0.0.1", "::1", "0.0.0.0"]);
const isOwnerHost = ownerHosts.has(window.location.hostname) || window.location.protocol === "file:";

if (isOwnerHost) {
  document.querySelectorAll("[data-owner-link]").forEach((link) => {
    link.hidden = false;
  });
}

