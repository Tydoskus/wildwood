import { renderBooleanSetting } from "./settings";

/**
 * The account's offline-progress opt-out.
 *
 * Unlike the other switches in Settings this is not a device preference: it
 * lives on the account so it holds across every device, and the server reads
 * it when deciding whether to pay for time away. The button therefore renders
 * from whatever the connection last reported rather than from storage.
 */
type OfflineProgressSession = {
  offlineProgressEnabled: () => boolean;
  setOfflineProgressEnabled: (enabled: boolean) => Promise<boolean> | boolean;
  isConnected?: () => boolean;
};

export function installOfflineProgressSetting(doc: Document, session: () => OfflineProgressSession | null | undefined) {
  const enabled = () => session()?.offlineProgressEnabled() ?? true;
  const connected = () => Boolean(session()?.isConnected?.());
  const button = doc.getElementById("offlineProgressToggle") as HTMLButtonElement | null;
  if (!button) return { refresh: () => {} };
  let busy = false;
  function refresh() {
    renderBooleanSetting(button!, enabled());
    button!.disabled = busy || !connected();
  }
  button.addEventListener("click", async () => {
    if (busy || !connected()) return;
    busy = true;
    refresh();
    try { await session()?.setOfflineProgressEnabled(!enabled()); }
    finally { busy = false; refresh(); }
  });
  refresh();
  return { refresh };
}
