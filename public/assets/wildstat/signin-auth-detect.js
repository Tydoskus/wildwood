if (/[?&](?:code|error)=/.test(location.search)) {
  document.documentElement.classList.add("signin-auth-return");
}

// Only the old public site moved; native apps and local previews did not.
if (location.hostname.toLowerCase() === "tydoskus.github.io") {
  document.documentElement.classList.add("wildstat-legacy-host");
}
