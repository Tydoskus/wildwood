import { hasApprovedGameSession } from "../coop/startup-state-machine";
import { setHidden, setText } from "./dom-write";
import type { CoopAccess } from "../game/runtime/coop-access";
import type { createGameElements } from "./game-elements";

/** What Auto Farm may do with the connection: farm, wait for it to come back, or stop. */
export type FarmConnection = "ready" | "recovering" | "ended";

/** The one connection screen also carries game updates: a protocol update, and a scheduled one's blocking phase. */
export type UpdateScreen = {
  setUpdating: (shown: boolean) => void;
  /** Blocking scheduled-update text, or "" when none blocks. */
  setScheduledUpdate: (text: string) => void;
};

export type ReconnectOverlayDeps = {
  coop: CoopAccess;
  e: Pick<ReturnType<typeof createGameElements>, "reconnectOverlayEl" | "reconnectTitleEl" | "reconnectDetailEl">;
  hasStarted: () => boolean;
  setFarmConnection: (connection: FarmConnection) => void;
  refreshAutoFarm: () => void;
  setGameplayPause: (reason: string, active: boolean) => void;
};

/**
 * The single connection screen: reconnecting, and game updates. It retries by itself.
 * Each refresh also tells Auto Farm the connection's state and pauses play while it is down.
 */
export function createReconnectOverlay(deps: ReconnectOverlayDeps) {
  const { coop } = deps;
  const client = coop.client;
  const { reconnectOverlayEl, reconnectTitleEl, reconnectDetailEl } = deps.e;
  let updating = false, scheduledUpdate = "";

  function refresh() {
    const reconnecting = Boolean(client?.isReconnectingAfterWake?.());
    const account = coop.accountState();
    const waitingForServer = Boolean(account?.updating);
    const accountRecoveryRequired = deps.hasStarted() && !hasApprovedGameSession(account);
    // Reuse connection notifications instead of reading account/token storage
    // from autofarm's per-frame movement loop.
    deps.setFarmConnection(account?.sessionConflict ? "ended"
      : reconnecting || waitingForServer || account?.authInProgress || account?.returningFromSignIn || !deps.hasStarted() ? "recovering"
      : !hasApprovedGameSession(account) ? "ended"
      : !coop.connected() || !account?.hydrated ? "recovering" : "ready");
    deps.refreshAutoFarm();
    const diagnostics = client?.connectionDiagnostics?.();
    const updateShown = updating || Boolean(scheduledUpdate);
    const reconnectShown = reconnecting && !waitingForServer && !accountRecoveryRequired;
    setHidden(reconnectOverlayEl, !updateShown && !reconnectShown);
    reconnectOverlayEl.classList.toggle("is-updating", updateShown);
    // A badge, not the overlay
    reconnectOverlayEl.classList.toggle("is-quiet", !updateShown && Boolean(client?.isReconnectingQuietly?.()));
    setText(reconnectTitleEl, updateShown ? "Game Updating" : "Reconnecting");
    setText(reconnectDetailEl, scheduledUpdate || (updating ? "Reconnecting when the new version is ready"
      : diagnostics?.phase === "connecting"
      ? "Connecting to WildStat…"
      : diagnostics?.phase === "preparing-session"
        ? "Restoring your session…"
        : diagnostics?.phase === "hydrating"
          ? "Syncing the world…"
          : diagnostics?.issue?.message || "Restoring your connection"));
    // Pause reasons compose: ending an ad, reward window, or reconnect cannot
    // accidentally resume gameplay while another blocking surface remains.
    deps.setGameplayPause("connection-gate", reconnecting || waitingForServer || accountRecoveryRequired);
  }

  const setUpdating = (shown: boolean) => { if (updating !== shown) { updating = shown; refresh(); } };
  const setScheduledUpdate = (text: string) => { if (scheduledUpdate !== text) { scheduledUpdate = text; refresh(); } };
  return { refresh, setUpdating, setScheduledUpdate } satisfies UpdateScreen & { refresh: () => void };
}
