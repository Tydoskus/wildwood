import { Identity } from "spacetimedb";
import type { ReducerPort } from "../ports";
import { applyAvatarFrame, configureAvatarFrames, updateAvatarFrame } from "../../app/avatar-frames";
import type { AvatarFrame, AvatarFrameState, PatreonStatus } from "../../../shared/avatar-frames";

export function createPatreonService(reducers: ReducerPort, localIdentity: () => string) {
  let refreshTimer: ReturnType<typeof setInterval> | undefined;
  let autoIdentity = "";
  let watchingReturns = false;
  let returnRetry: ReturnType<typeof setTimeout> | undefined;
  let lastReturnCheck = -Infinity;
  let checkingReturn = false;
  let sessionGeneration = 0;
  let linked = false, linkPendingUntil = 0;
  // The tier the last status check reported, so a synchronous caller (the ad
  // gate) can ask without a round trip. Unknown until the first check lands.
  let supporterTier: AvatarFrame = "none";
  function onReturn() {
    if ((!linked && Date.now() >= linkPendingUntil) || typeof document !== "undefined" && document.hidden || !autoIdentity || !reducers.connection()?.isActive || checkingReturn || Date.now() - lastReturnCheck < 5_000) return;
    lastReturnCheck = Date.now();
    checkingReturn = true;
    const generation = sessionGeneration;
    void status(true).catch(() => {}).finally(() => { if (generation === sessionGeneration) checkingReturn = false; });
    clearTimeout(returnRetry);
    // A return shortly after checkout can fall inside the server's one-minute
    // verification limit. Check once more without requiring the frame picker.
    returnRetry = setTimeout(() => {
      returnRetry = undefined;
      if (autoIdentity && reducers.connection()?.isActive && (typeof document === "undefined" || !document.hidden)) void status(true).catch(() => {});
    }, 65_000);
  }
  function watchReturns() {
    if (watchingReturns || typeof window === "undefined") return;
    watchingReturns = true;
    window.addEventListener("focus", onReturn);
    document.addEventListener("visibilitychange", onReturn);
  }
  configureAvatarFrames(async identities => {
    const connection = reducers.connection();
    if (!connection?.isActive) throw new Error("Not connected");
    return JSON.parse(await connection.procedures.getAvatarFrames({ identities: identities.map(id => Identity.fromString(id)) })) as AvatarFrameState[];
  });
  function connection() {
    const active = reducers.connection();
    if (!active?.isActive || reducers.protocolBlocked()) throw new Error("Connect to the latest WildStat version first.");
    return active;
  }
  async function status(refresh: boolean) {
    const active = connection(), identity = localIdentity(), generation = sessionGeneration;
    const result = JSON.parse(await (refresh ? active.procedures.refreshPatreonMembership({}) : active.procedures.getPatreonStatus({}))) as PatreonStatus;
    if (generation !== sessionGeneration || active !== reducers.connection() || identity !== localIdentity()) throw new Error("Account changed. Open your profile again.");
    linked = result.linked;
    supporterTier = result.tier;
    if (linked) linkPendingUntil = 0;
    updateAvatarFrame({ identity, ...result });
    if (result.linked && !refreshTimer) refreshTimer = setInterval(() => { if (reducers.connection()?.isActive) void status(true).catch(() => {}); }, 30 * 60_000);
    if (!result.linked) { clearInterval(refreshTimer); refreshTimer = undefined; }
    return result;
  }
  async function change(action: (active: ReturnType<typeof connection>) => Promise<unknown>) {
    const active = connection(), identity = localIdentity();
    await action(active);
    if (active !== reducers.connection() || identity !== localIdentity()) throw new Error("Account changed. Open your profile again.");
    return status(false);
  }
  const api = {
    applyAvatarFrame,
    patreonStatus: () => status(false), refreshPatreon: () => status(true),
    /** Membership as last verified; "none" for anyone unlinked, lapsed or not yet checked. */
    supporterTier: () => supporterTier,
    beginPatreonLink: async () => {
      const active = connection(), generation = sessionGeneration;
      const state = Array.from(crypto.getRandomValues(new Uint8Array(32)), byte => byte.toString(16).padStart(2, "0")).join("");
      const url = await active.procedures.beginPatreonLink({ state });
      // Checkout can outlast the OAuth state's expiry after linking succeeded.
      // Keep checking on return for this session until that link is observed.
      if (generation === sessionGeneration && active === reducers.connection()) linkPendingUntil = Infinity;
      return url;
    },
    setAvatarFrame: (frame: AvatarFrame) => change(active => active.reducers.setAvatarFrame({ frame })),
    disconnectPatreon: () => change(active => active.reducers.disconnectPatreon({})),
    requestPatreonHelp: (email: string) => connection().reducers.requestPatreonHelp({ email }),
  };
  return { api,
    sync() {
      if (!localIdentity() || autoIdentity === localIdentity()) return;
      autoIdentity = localIdentity();
      watchReturns();
      void status(true).catch(() => {});
    },
    clear() {
      sessionGeneration++; checkingReturn = false;
      linked = false; linkPendingUntil = 0; supporterTier = "none";
      autoIdentity = ""; clearInterval(refreshTimer); refreshTimer = undefined;
      clearTimeout(returnRetry); returnRetry = undefined; lastReturnCheck = -Infinity;
      if (watchingReturns) {
        window.removeEventListener("focus", onReturn);
        document.removeEventListener("visibilitychange", onReturn);
        watchingReturns = false;
      }
    },
  };
}
