import { OFFLINE_WINDOW_SECONDS } from "../../shared/offline-progress";
import { offlineWindowSecondsWithResearch } from "../../shared/utility-research";

/**
 * Developer-only: backdate the unattended window and reconnect, so offline
 * progress can be checked in a minute instead of waiting an hour.
 *
 * It reaches the same code path a real absence does — the server still decides
 * the map, the survivability and the payout — so what it shows is what a real
 * player would have been given.
 */
export function createOfflineProgressTestControl(parent: HTMLElement, dependencies: {
  allowed: () => boolean;
  simulate: (seconds: number) => Promise<boolean>;
  offlineWindowRank?: () => number;
  showMessage: (message: string, color: string) => void;
}) {
  const form = document.createElement("form");
  form.className = "setting-row dev-offline-progress";
  form.innerHTML = `<label for="devOfflineMinutes">Simulate time away</label>
    <div class="dev-offline-progress-actions">
      <input id="devOfflineMinutes" type="number" min="1" max="${OFFLINE_WINDOW_SECONDS / 60}" step="1" value="${OFFLINE_WINDOW_SECONDS / 60}" inputmode="numeric" aria-label="Minutes away" required>
      <button class="secondary-button" type="submit">Apply</button>
    </div>`;
  const input = form.querySelector("input")!;
  const button = form.querySelector("button")!;
  let pending = false;

  function render() {
    const maxMinutes = offlineWindowSecondsWithResearch(dependencies.offlineWindowRank?.() ?? 0) / 60;
    if (input.value === input.max) input.value = String(maxMinutes);
    input.max = String(maxMinutes);
    form.hidden = !dependencies.allowed();
    input.disabled = button.disabled = pending || form.hidden;
    button.textContent = pending ? "Applying…" : "Apply";
  }

  form.addEventListener("submit", async event => {
    event.preventDefault();
    const minutes = Number(input.value);
    if (pending || !dependencies.allowed()) return;
    if (!Number.isSafeInteger(minutes) || minutes < 1) {
      dependencies.showMessage("ENTER A WHOLE NUMBER OF MINUTES", "#ffbc91");
      return;
    }
    pending = true; render();
    try {
      const applied = await dependencies.simulate(Math.min(offlineWindowSecondsWithResearch(dependencies.offlineWindowRank?.() ?? 0), minutes * 60));
      dependencies.showMessage(
        applied ? "TIME AWAY SET · RELOAD TO COLLECT" : "DEVELOPER CONNECTION REQUIRED",
        applied ? "#72ef58" : "#ffbc91",
      );
    } catch (error) {
      dependencies.showMessage(error instanceof Error ? error.message : "COULD NOT SET TIME AWAY", "#ff9b91");
    } finally { pending = false; render(); }
  });

  parent.append(form); render();
  return { render, element: form };
}
