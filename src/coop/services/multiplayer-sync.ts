import { MULTIPLAYER_TOGGLE_COOLDOWN_MS } from "../../../shared/multiplayer";

/**
 * A send still unanswered after this long is given up and the state sent
 * again (the server takes a repeat as a no-op). An answer lost in a reconnect
 * otherwise held the eye for the rest of the session.
 */
export const MULTIPLAYER_SEND_TIMEOUT_MS = 20_000;

/**
 * Coalesce eye changes; retry only dirty state, never poll the server. With
 * `sendPresence`, the eye travels with whether to be seen anyway while it is
 * off (idle or autofarming), in one call, so the two can never cross.
 */
export function createMultiplayerSync(options: {
  session: () => object | null;
  send: (enabled: boolean) => Promise<unknown>;
  sendPresence?: (enabled: boolean, shown: boolean) => Promise<unknown>;
}) {
  let wanted = false, shown = false, acknowledged: string | undefined;
  const key = () => `${wanted}:${options.sendPresence ? shown : ""}`;
  let session: object | null = null, pending: object | null = null;
  let retryAt = 0, pendingSince = 0;
  function reset() { session = null; pending = null; acknowledged = undefined; retryAt = 0; }
  function sync() {
    const current = options.session();
    if (current !== session) { reset(); session = current; }
    if (pending && Date.now() - pendingSince >= MULTIPLAYER_SEND_TIMEOUT_MS) pending = null;
    if (!current || pending || acknowledged === key() || Date.now() < retryAt) return;
    const ticket = {}, value = key(), enabled = wanted, seen = shown;
    pending = ticket; pendingSince = Date.now();
    void (options.sendPresence ? options.sendPresence(enabled, seen) : options.send(enabled)).then(() => {
      if (pending !== ticket) return;
      // Release the send even when the session blipped while its answer was on
      // the way (a world re-entry briefly clears it): keeping it pending left
      // every later sync waiting on it, and the eye dead until a reload. The
      // next sync sends the state again rather than trusting this answer.
      pending = null;
      if (options.session() !== current) return;
      acknowledged = value; retryAt = 0;
      sync();
    }, () => {
      if (pending !== ticket) return;
      pending = null; retryAt = Date.now() + MULTIPLAYER_TOGGLE_COOLDOWN_MS;
    });
  }
  return { sync, reset, enabled: () => wanted,
    setEnabled(value: boolean) { wanted = value; sync(); },
    /** Seen with the eye off: while idle or autofarming. Ignored with it on, which already shows the player. */
    setShown(value: boolean) { shown = value; sync(); },
  };
}
