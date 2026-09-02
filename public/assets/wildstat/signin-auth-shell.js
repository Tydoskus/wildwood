if (document.documentElement.classList.contains("signin-auth-return")) {
  document.getElementById("connectionPanel").hidden = false;
  document.getElementById("accountChoicePanel").hidden = true;
  document.getElementById("loadingDetail").textContent = "Verifying Sign-In";
}
