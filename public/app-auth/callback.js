(() => {
  const query = new URLSearchParams(window.location.search);
  history.replaceState({}, '', window.location.pathname);
  const valid = query.get('state') && Boolean(query.get('code')) !== Boolean(query.get('error')) &&
    [...query.keys()].every(key => query.getAll(key).length === 1);
  if (!valid) {
    document.getElementById('fallback').hidden = false;
    document.getElementById('status').textContent = 'Start sign-in from the WildStat app, then return here.';
    return;
  }
  const destination = new URL('com.wildstatmmo.preview://auth/callback');
  for (const key of ['code', 'state', 'error', 'iss']) {
    const value = query.get(key);
    if (value !== null) destination.searchParams.set(key, value);
  }
  const link = document.getElementById('return');
  link.href = destination.href;
  link.hidden = false;
  document.getElementById('status').textContent = 'Tap below if WildStat does not open automatically.';
  // The iOS authentication session consumes this redirect and dismisses itself.
  // Render help only if the OS has not returned to the app, avoiding a page flash.
  setTimeout(() => { document.getElementById('fallback').hidden = false; }, 2000);
  window.location.replace(destination.href);
})();
