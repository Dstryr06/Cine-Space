// Runs before the page paints so there is no flash of the wrong theme.
(function () {
  var saved = null;
  try { saved = localStorage.getItem("cs_theme"); } catch (e) { /* storage blocked */ }
  var dark = window.matchMedia && window.matchMedia("(prefers-color-scheme: dark)").matches;
  document.documentElement.setAttribute("data-theme", saved === "light" || saved === "dark" ? saved : (dark ? "dark" : "light"));
})();
