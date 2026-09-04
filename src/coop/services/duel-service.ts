import type { Identity } from "spacetimedb";
import { tables } from "../../module_bindings";
import { normalizePlayerGender } from "../../../shared/player-gender";
import type { DuelReplay, DuelState } from "../contracts";
import type { ReducerPort } from "../ports";
import { createDuelCooldownStore } from "./duel-cooldown-store";

const DUEL_COOLDOWN_MS = 120_000;
const DUEL_COOLDOWN_KEY_PREFIX = "wildwood-duel-cooldown-v1:";
const SUBSCRIPTION_LOAD_TIMEOUT_MS = 10_000;

type DuelServiceDependencies = {
  reducers: ReducerPort;
  notify: () => void;
  localIdentity: () => string;
  identityFor: (identity: string) => Identity | undefined;
  drainPendingProgress: () => Promise<boolean>;
  storage: Storage;
};

type DuelRow = {
  combatVersion?: number;
  id: bigint;
  challenger: Identity;
  opponent: Identity;
  challengerName: string;
  opponentName: string;
  challengerGender: number;
  opponentGender: number;
  status: string;
  createdAt: { microsSinceUnixEpoch: bigint };
  startedAt: { microsSinceUnixEpoch: bigint };
  startsAtMicros: bigint;
  endsAtMicros: bigint;
  challengerHp: number;
  challengerMaxHp: number;
  challengerDamage: number;
  challengerArmor: number;
  challengerAttackRate: number;
  challengerRegen: number;
  challengerAttacks: number;
  opponentHp: number;
  opponentMaxHp: number;
  opponentDamage: number;
  opponentArmor: number;
  opponentAttackRate: number;
  opponentRegen: number;
  opponentAttacks: number;
  challengerHeadItem: string;
  challengerChestItem: string;
  challengerFeetItem: string;
  challengerRightHandItem: string;
  challengerLeftHandItem: string;
  opponentHeadItem: string;
  opponentChestItem: string;
  opponentFeetItem: string;
  opponentRightHandItem: string;
  opponentLeftHandItem: string;
};

export function createDuelService(dependencies: DuelServiceDependencies) {
  const cooldownStore = createDuelCooldownStore(dependencies.storage, DUEL_COOLDOWN_KEY_PREFIX);
  const duels = new Map<bigint, DuelState>();
  const replays = new Map<bigint, DuelReplay>();
  const replayLoads = new Map<bigint, Promise<DuelReplay | null>>();
  const cancelReplayLoads = new Map<bigint, () => void>();
  let lastPulseAt = 0;
  let cooldownUntil = 0;

  function rememberCooldown(until: number) {
    cooldownUntil = until;
    cooldownStore.write(dependencies.localIdentity(), until);
  }

  function restoreCooldown() {
    cooldownUntil = cooldownStore.read(dependencies.localIdentity());
  }

  function upsert(row: DuelRow) {
    duels.set(row.id, {
      id: row.id,
      combatVersion: row.combatVersion ?? 0,
      challenger: row.challenger.toHexString(),
      opponent: row.opponent.toHexString(),
      challengerName: row.challengerName,
      opponentName: row.opponentName,
      challengerGender: normalizePlayerGender(row.challengerGender),
      opponentGender: normalizePlayerGender(row.opponentGender),
      status: row.status,
      createdAtMs: Number(row.createdAt.microsSinceUnixEpoch / 1_000n),
      startsAtMs: Number(row.startsAtMicros / 1_000n),
      startedAtMs: Number(row.startedAt.microsSinceUnixEpoch / 1_000n),
      endsAtMs: Number(row.endsAtMicros / 1_000n),
      challengerHp: row.challengerHp,
      challengerMaxHp: row.challengerMaxHp,
      challengerDamage: row.challengerDamage,
      challengerArmor: row.challengerArmor,
      challengerAttackRate: row.challengerAttackRate,
      challengerRegen: row.challengerRegen,
      challengerAttacks: row.challengerAttacks,
      opponentHp: row.opponentHp,
      opponentMaxHp: row.opponentMaxHp,
      opponentDamage: row.opponentDamage,
      opponentArmor: row.opponentArmor,
      opponentAttackRate: row.opponentAttackRate,
      opponentRegen: row.opponentRegen,
      opponentAttacks: row.opponentAttacks,
      challengerHeadItem: row.challengerHeadItem,
      challengerChestItem: row.challengerChestItem,
      challengerFeetItem: row.challengerFeetItem,
      challengerRightHandItem: row.challengerRightHandItem,
      challengerLeftHandItem: row.challengerLeftHandItem,
      opponentHeadItem: row.opponentHeadItem,
      opponentChestItem: row.opponentChestItem,
      opponentFeetItem: row.opponentFeetItem,
      opponentRightHandItem: row.opponentRightHandItem,
      opponentLeftHandItem: row.opponentLeftHandItem,
    });
    dependencies.notify();
  }

  function remove(row: { id: bigint }) {
    duels.delete(row.id);
    dependencies.notify();
  }

  function upsertReplay(row: any) {
    replays.set(row.id, {
      id: row.id,
      combatVersion: row.combatVersion ?? 0,
      challengerIdentity: row.challengerIdentity,
      opponentIdentity: row.opponentIdentity,
      challengerName: row.challengerName,
      opponentName: row.opponentName,
      challengerGender: normalizePlayerGender(row.challengerGender),
      opponentGender: normalizePlayerGender(row.opponentGender),
      winnerName: row.winnerName,
      durationSeconds: row.durationSeconds,
      challengerMaxHp: row.challengerMaxHp,
      challengerDamage: row.challengerDamage,
      challengerArmor: row.challengerArmor,
      challengerAttackRate: row.challengerAttackRate,
      challengerRegen: row.challengerRegen,
      challengerFinalHp: row.challengerFinalHp,
      challengerAttacks: row.challengerAttacks,
      challengerDamageDealt: row.challengerDamageDealt,
      challengerRegened: row.challengerRegened,
      challengerBlocked: row.challengerBlocked,
      opponentMaxHp: row.opponentMaxHp,
      opponentDamage: row.opponentDamage,
      opponentArmor: row.opponentArmor,
      opponentAttackRate: row.opponentAttackRate,
      opponentRegen: row.opponentRegen,
      opponentFinalHp: row.opponentFinalHp,
      opponentAttacks: row.opponentAttacks,
      opponentDamageDealt: row.opponentDamageDealt,
      opponentRegened: row.opponentRegened,
      opponentBlocked: row.opponentBlocked,
      challengerHeadItem: row.challengerHeadItem,
      challengerChestItem: row.challengerChestItem,
      challengerFeetItem: row.challengerFeetItem,
      challengerRightHandItem: row.challengerRightHandItem,
      challengerLeftHandItem: row.challengerLeftHandItem,
      opponentHeadItem: row.opponentHeadItem,
      opponentChestItem: row.opponentChestItem,
      opponentFeetItem: row.opponentFeetItem,
      opponentRightHandItem: row.opponentRightHandItem,
      opponentLeftHandItem: row.opponentLeftHandItem,
    });
    dependencies.notify();
  }

  function loadReplay(id: bigint): Promise<DuelReplay | null> {
    const existing = replays.get(id);
    if (existing) return Promise.resolve({ ...existing });
    const loading = replayLoads.get(id);
    if (loading) return loading;
    const connection = dependencies.reducers.connection();
    if (!connection) return Promise.resolve(null);

    let resolveRequest!: (replay: DuelReplay | null) => void;
    const request = new Promise<DuelReplay | null>((resolve) => {
      resolveRequest = resolve;
    });
    replayLoads.set(id, request);

    let subscription: { unsubscribe: () => void } | null = null;
    let settled = false;
    let unsubscribeAfterSubscribe = false;
    let timeoutId: number | null = null;
    const releaseSubscription = () => {
      if (subscription) {
        subscription.unsubscribe();
        subscription = null;
      } else {
        unsubscribeAfterSubscribe = true;
      }
    };
    const finish = (replay: DuelReplay | null) => {
      if (settled) return;
      settled = true;
      if (timeoutId !== null) window.clearTimeout(timeoutId);
      replayLoads.delete(id);
      cancelReplayLoads.delete(id);
      releaseSubscription();
      resolveRequest(replay);
    };
    cancelReplayLoads.set(id, () => finish(null));
    timeoutId = window.setTimeout(() => finish(null), SUBSCRIPTION_LOAD_TIMEOUT_MS);

    subscription = connection
      .subscriptionBuilder()
      .onApplied(() => {
        if (dependencies.reducers.connection() !== connection) return finish(null);
        const row = [...connection.db.duelReplay.iter()].find((replay) => replay.id === id);
        if (row) upsertReplay(row);
        const replay = replays.get(id);
        finish(replay ? { ...replay } : null);
      })
      .onError(() => finish(null))
      .subscribe([tables.duelReplay.where((replay) => replay.id.eq(id))]);
    if (unsubscribeAfterSubscribe) releaseSubscription();
    return request;
  }

  return {
    tables: { upsert, remove },
    api: {
      localDuel() {
        for (const duel of duels.values()) {
          if (duel.challenger === dependencies.localIdentity()) return { ...duel };
        }
        return null;
      },
      duelCooldownRemainingMs: () => Math.max(0, cooldownUntil - Date.now()),
      duelReplay(id: bigint) {
        const replay = replays.get(id);
        return replay ? { ...replay } : null;
      },
      loadDuelReplay: loadReplay,
      async requestDuel(opponentIdentity: string) {
        if (dependencies.reducers.protocolBlocked()) return { ok: false, error: "UPDATE REQUIRED" };
        if (!dependencies.reducers.connection()) return { ok: false, error: "NOT CONNECTED" };
        const opponent = dependencies.identityFor(opponentIdentity);
        if (!opponent) return { ok: false, error: "PLAYER PROFILE UNAVAILABLE" };
        try {
          if (!await dependencies.drainPendingProgress()) return { ok: false, error: "SAVE STILL SYNCING · TRY AGAIN" };
          const connection = dependencies.reducers.connection();
          if (!connection) return { ok: false, error: "NOT CONNECTED" };
          await dependencies.reducers.runWorldReducer(() => connection.reducers.requestDuel({ opponent }));
          rememberCooldown(Date.now() + DUEL_COOLDOWN_MS);
          return { ok: true };
        } catch (error) {
          const message = dependencies.reducers.errorMessage(error);
          const cooldownSeconds = /duel cooldown:\s*(\d+) seconds/i.exec(message)?.[1];
          if (cooldownSeconds) rememberCooldown(Date.now() + Number(cooldownSeconds) * 1_000);
          dependencies.reducers.handleFailure("duel request", error);
          console.warn("WildStat duel request rejected:", message);
          return { ok: false, error: message };
        }
      },
      acceptDuel(id: bigint) {
        if (dependencies.reducers.protocolBlocked() || !dependencies.reducers.connection()) return;
        dependencies.reducers.sendReducer("duel acceptance", (connection) => connection.reducers.acceptDuel({ id }));
      },
      pulseDuel() {
        if (dependencies.reducers.protocolBlocked() || !dependencies.reducers.connection()) return;
        const now = performance.now();
        if (now - lastPulseAt < 500) return;
        lastPulseAt = now;
        dependencies.reducers.sendReducer("duel pulse", (connection) => connection.reducers.pulseDuel({}));
      },
    },
    restoreCooldown,
    activeReplayLoadCount: () => replayLoads.size,
    resetSession() {
      duels.clear();
      for (const cancel of [...cancelReplayLoads.values()]) cancel();
      cancelReplayLoads.clear();
      replays.clear();
      replayLoads.clear();
      lastPulseAt = 0;
    },
  };
}
