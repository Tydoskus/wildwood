if (/[?&](?:code|error)=/.test(location.search)) {
  document.documentElement.classList.add("signin-auth-return");
}

// Only the old public site moved; native apps and local previews did not.
if (location.hostname.toLowerCase() === "tydoskus.github.io") {
  document.documentElement.classList.add("wildstat-legacy-host");
}

// game.js starts downloading from the head; the coop bundle reuses this link
// (preloadDeferredGameBundle). Skipped under Data Saver, where it loads after Play.
(function () {
  var meta = document.querySelector('meta[name="wildstat-game-src"]');
  var connection = navigator.connection;
  if (!meta || !meta.content || (connection && connection.saveData)) return;
  var link = document.createElement("link");
  link.id = "wildstatGamePreload";
  link.rel = "preload";
  link.as = "script";
  link.href = meta.content;
  link.addEventListener("load", function () { link.setAttribute("data-state", "loaded"); }, { once: true });
  link.addEventListener("error", function () { link.setAttribute("data-state", "failed"); }, { once: true });
  document.head.appendChild(link);
})();
