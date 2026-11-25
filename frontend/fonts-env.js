/* Load local TT Fors trial fonts only on localhost; use Manrope on public deployments. */
(function () {
  var host = window.location.hostname;
  var isLocal = host === "localhost" || host === "127.0.0.1";
  var link = document.createElement("link");
  link.rel = "stylesheet";
  link.href = isLocal
    ? "fonts-local.css?v=2026"
    : "https://fonts.googleapis.com/css2?family=Manrope:wght@400;500;600&display=swap";
  document.head.appendChild(link);
})();
