/**
 * Status renders run on the 100ms HUD tick whether or not the settings window
 * is open. Assigning the same text or attribute still dirties the node, so
 * these only write what changed.
 */
export function setText(element: HTMLElement, text: string) {
  if (element.textContent !== text) element.textContent = text;
}

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
  if (element.hidden !== !visible) element.hidden = !visible;
  if (!visible) return;
  const rounded = typeof latencyMs === "number" && Number.isFinite(latencyMs)
    ? Math.round(latencyMs)
    : null;
  const displayed = connected ? rounded : null;
  const text = displayed !== null ? `PING: ${displayed}MS` : "PING: --";
  setText(element, text);
  const quality = displayed === null
    ? ""
    : displayed <= 80 ? "good" : displayed <= 150 ? "fair" : "poor";
  if (element.dataset.quality !== quality) element.dataset.quality = quality;
}

export function renderVolume(
  input: HTMLInputElement,
  value: HTMLElement,
  volume: number,
) {
  const percent = Math.round(volume * 100);
  input.value = String(percent);
  input.style.setProperty("--volume-percent", `${percent}%`);
  input.setAttribute("aria-valuetext", `${percent}%`);
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
  setText(element, connected ? "ONLINE" : "OFFLINE");
  if (element.classList.contains("is-offline") !== !connected) element.classList.toggle("is-offline", !connected);
}

export function renderAccountStatus(
  button: HTMLElement,
  status: HTMLElement,
  account: { signedIn: boolean; notice: string },
) {
  setText(button, account.signedIn ? "SIGN OUT" : "SIGN IN / CREATE");
  const text = account.notice || (account.signedIn ? "SIGNED IN · ACCOUNT SAVE" : "GUEST · DEVICE SAVE");
  setText(status, text);
  const error = /FAILED|WAIT|CHECK/.test(text);
  if (status.classList.contains("is-signed-in") !== account.signedIn) status.classList.toggle("is-signed-in", account.signedIn);
  if (status.classList.contains("is-error") !== error) status.classList.toggle("is-error", error);
}
