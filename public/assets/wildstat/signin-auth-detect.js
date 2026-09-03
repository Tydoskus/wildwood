if (/[?&](?:code|error)=/.test(location.search)) {
  document.documentElement.classList.add("signin-auth-return");
}

if (!/(^|\.)wildstatmmo\.com$/i.test(location.hostname)) {
  document.documentElement.classList.add("wildstat-legacy-host");
}
