export const MULTIPLAYER_IDLE_MS = 60_000;
/** With the eye off, a player standing still this long is shown to players with it on (they cost them nothing). */
export const EYE_OFF_SHOWN_IDLE_MS = 30_000;

/** Only manual gameplay movement renews this, independently of window subscriptions. */
export function installMultiplayerIdle(doc: Document, expire: () => void) {
  let enabled = false, lastMovementAt = Date.now();
  let timer: ReturnType<typeof setTimeout> | undefined;
  function check() {
    clearTimeout(timer);
    if (!enabled) return;
    const remaining = MULTIPLAYER_IDLE_MS - (Date.now() - lastMovementAt);
    if (remaining <= 0) { enabled = false; expire(); return; }
    timer = setTimeout(check, remaining);
  }
  doc.addEventListener("visibilitychange", check);
  return {
    setEnabled(value: boolean) { enabled = value; lastMovementAt = Date.now(); check(); },
    noteManualMovement() {
      if (!enabled || doc.hidden) return;
      // An overdue background session must expire before resumed movement.
      if (Date.now() - lastMovementAt >= MULTIPLAYER_IDLE_MS) { check(); return; }
      // Keep the existing timer; it checks this deadline without per-frame timers.
      lastMovementAt = Date.now();
    },
    dispose() {
      clearTimeout(timer);
      doc.removeEventListener("visibilitychange", check);
    },
  };
}
