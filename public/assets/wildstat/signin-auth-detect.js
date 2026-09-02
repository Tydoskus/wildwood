if (/[?&](?:code|error)=/.test(location.search)) {
  document.documentElement.classList.add("signin-auth-return");
}
