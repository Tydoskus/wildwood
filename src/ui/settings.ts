export function renderBooleanSetting(button: HTMLElement, enabled: boolean) {
  button.textContent = enabled ? "ON" : "OFF";
  button.setAttribute("aria-pressed", String(enabled));
  button.classList.toggle("is-off", !enabled);
}

export function renderLatencyStatus(
  element: HTMLElement,
  visible: boolean,
  latencyMs: number | null | undefined,
  connected: boolean,
) {
  element.hidden = !visible;
  if (!visible) return;
  const rounded = typeof latencyMs === "number" && Number.isFinite(latencyMs)
    ? Math.round(latencyMs)
    : null;
  const displayed = connected ? rounded : null;
  const text = displayed !== null ? `PING: ${displayed}MS` : "PING: --";
  if (element.textContent !== text) element.textContent = text;
  element.dataset.quality = displayed === null
    ? ""
    : displayed <= 80 ? "good" : displayed <= 150 ? "fair" : "poor";
}

export function renderVolume(
  input: HTMLInputElement,
  value: HTMLElement,
  volume: number,
) {
  const percent = Math.round(volume * 100);
  input.value = String(percent);
  value.textContent = `${percent}%`;
}

export function renderFullscreenSetting(
  button: HTMLButtonElement,
  supported: boolean,
  active: boolean,
) {
  button.disabled = !supported;
  button.textContent = supported ? (active ? "EXIT" : "ENTER") : "N/A";
}

export function renderConnectionStatus(element: HTMLElement, connected: boolean) {
  element.textContent = connected ? "ONLINE" : "OFFLINE";
  element.classList.toggle("is-offline", !connected);
}

export function renderAccountStatus(
  button: HTMLElement,
  status: HTMLElement,
  account: { signedIn: boolean; notice: string },
) {
  button.textContent = account.signedIn ? "SIGN OUT" : "SIGN IN / CREATE";
  const text = account.notice || (account.signedIn ? "SIGNED IN · ACCOUNT SAVE" : "GUEST · DEVICE SAVE");
  status.textContent = text;
  status.classList.toggle("is-signed-in", account.signedIn);
  status.classList.toggle("is-error", /FAILED|WAIT|CHECK/.test(text));
}
