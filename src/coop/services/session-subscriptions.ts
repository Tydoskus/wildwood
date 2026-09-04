import type { ActiveSubscription } from "./subscription-handoff";

export type SessionSubscriptionScope = "account" | "game" | `boss:${string}`;

/** Serializes query replacements, including map changes while a subscription
 * is still pending. Never unsubscribe a pending SDK handle. */
export function createSessionSubscriptions(options: {
  isCurrent: () => boolean;
  subscribe: (scope: SessionSubscriptionScope, applied: () => void) => ActiveSubscription;
  hydrate: (scope: SessionSubscriptionScope) => void;
  loading: () => void;
  ready: () => void;
  error: (error: unknown) => void;
}) {
  function slot() {
    let wanted: SessionSubscriptionScope | null = null;
    let active: SessionSubscriptionScope | null = null;
    let handle: ActiveSubscription | null = null;
    let busy = false;
    let applied = false;
    function pump() {
      if (!options.isCurrent() || busy || wanted === active) return;
      busy = true;
      const start = () => {
        if (!options.isCurrent()) return;
        active = wanted;
        applied = false;
        if (!active) { busy = false; checkReady(); return; }
        const scope = active;
        try {
          handle = options.subscribe(scope, () => {
            if (!options.isCurrent()) return;
            applied = true;
            busy = false;
            // Boss history must not run before private cutscene history is loaded.
            if (!scope.startsWith("boss:") || primary.ready()) options.hydrate(scope);
            pump();
            checkReady();
          });
        } catch (error) { options.error(error); }
      };
      try {
        if (handle) {
          const old = handle;
          handle = null;
          old.unsubscribeThen(start);
        } else start();
      } catch (error) { options.error(error); }
    }
    return {
      set(key: SessionSubscriptionScope | null) { wanted = key; pump(); },
      ready: () => !busy && applied && active === wanted,
    };
  }
  const primary = slot();
  const boss = slot();
  let game = false;
  let configured = false;
  let notified: boolean | null = null;
  function checkReady() {
    if (!configured || !primary.ready() || (game && !boss.ready()) || notified === game) return;
    notified = game;
    options.ready();
  }
  return {
    refresh(enteredWorld: boolean, mapId: string) {
      // World entry is monotonic within a connection. Disconnect creates a new controller.
      const nextGame = game || enteredWorld;
      if (!configured || nextGame !== game) options.loading();
      game = nextGame;
      configured = true;
      primary.set(game ? "game" : "account");
      if (game) boss.set(`boss:${mapId}`);
      checkReady();
    },
  };
}
