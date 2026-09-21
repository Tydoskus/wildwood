import { BOSS_REWARD_CLAIM_BITS } from "../../../shared/rules";
import { tables, type DbConnection } from "../../module_bindings";
import {
  PROCEDURAL_ENTRY_BOSS,
  isProceduralMap,
  proceduralMapNumber,
} from "../../../shared/procedural-maps";
import type { ReducerPort } from "../ports";
import {
  unsubscribeIfActive,
  type ActiveSubscription,
} from "./subscription-handoff";

/** One account-scoped view follows the server's admitted map instance automatically. */
export function createProceduralMapService(port: ReducerPort) {
  let connection: DbConnection | null = null;
  let subscription: {
    handle: ActiveSubscription | null;
    ready: boolean;
  } | null = null;
  let nextSubscribe = 0;
  let prepareMap = "";
  const blocked = () => port.protocolBlocked() || port.worldEntryBlocked();
  function refresh(mapId: string) {
    const conn = port.connection();
    if (conn !== connection || !conn?.isActive) {
      unsubscribeIfActive(subscription?.handle ?? null);
      connection = conn;
      subscription = null;
      nextSubscribe = 0;
    }
    if (!conn?.isActive || blocked()) return null;
    if (!subscription && Date.now() >= nextSubscribe) {
      const attempt = {
        handle: null as ActiveSubscription | null,
        ready: false,
      };
      subscription = attempt;
      const failed = (error: unknown) => {
        if (subscription !== attempt) return;
        unsubscribeIfActive(attempt.handle);
        subscription = null;
          nextSubscribe = Date.now() + 3000;
        port.handleFailure("generated map subscription", error);
      };
      try {
        attempt.handle = conn
          .subscriptionBuilder()
          .onApplied(() => {
            if (subscription !== attempt || conn !== connection) {
              unsubscribeIfActive(attempt.handle);
              return;
            }
            attempt.ready = true;
          })
          .onError((ctx) => failed(ctx.event))
          .subscribe([
            tables.proceduralProgress.where((row) =>
              row.identity.eq(conn.identity!),
            ),
            tables.myEndlessTravelAccess,
          ]);
      } catch (error) {
        failed(error);
      }
    }
    if (prepareMap !== mapId) {
      prepareMap = mapId;
    }
    return conn;
  }
  return {
    canTeleportEndless() {
      const conn = port.connection();
      return Boolean(!blocked() && conn?.isActive && conn === connection && subscription?.ready
        && [...conn.db.myEndlessTravelAccess.iter()].some(row => row.identity.isEqual(conn.identity!)));
    },
    async devTeleportEndless(number: number) {
      const conn = port.connection();
      if (blocked() || !conn?.isActive) return { ok: false, error: "WORLD CONNECTION REQUIRED" };
      if (!Number.isSafeInteger(number) || number < 1) return { ok: false, error: "ENTER A POSITIVE WHOLE MAP NUMBER" };
      try {
        await port.runWorldReducer(() => conn.reducers.devTeleportEndless({ number }));
        return { ok: conn === port.connection() };
      } catch (error) {
        return { ok: false, error: port.errorMessage(error) };
      }
    },
    proceduralMapState(mapId: string) {
      const conn = refresh(mapId);
      const ready = Boolean(conn && subscription?.ready);
      const completed = conn?.identity
        ? (conn.db.proceduralProgress.identity.find(conn.identity)?.completed ??
          0)
        : 0;
      return {
        ready,
        completed,
        boss:
          ready && isProceduralMap(mapId)
            ? ([...conn!.db.myProceduralBoss.iter()].find(
                (row) => row.mapId === mapId,
              ) ?? null)
            : null,
      };
    },
    /** How many Endless stages this run has cleared; prestige asks for one more each time. */
    proceduralCompleted() {
      const conn = port.connection();
      return conn?.identity ? (conn.db.proceduralProgress.identity.find(conn.identity)?.completed ?? 0) : 0;
    },
    proceduralMapUnlocked(mapId: string) {
      const number = proceduralMapNumber(mapId);
      const conn = port.connection();
      const completed = conn?.identity
        ? (conn.db.proceduralProgress.identity.find(conn.identity)?.completed ??
          0)
        : 0;
      const campaignComplete = Boolean(
        conn?.identity &&
        (conn.db.playerProgress.identity.find(conn.identity)
          ?.bossRewardClaims ?? 0) &
          BOSS_REWARD_CLAIM_BITS[PROCEDURAL_ENTRY_BOSS],
      );
      return campaignComplete && number !== null && number <= completed + 1;
    },
    hitProceduralBoss(
      mapId: string,
      bossKey: string,
      encounter: bigint,
      hits: number,
      x: number,
      y: number,
    ) {
      if (blocked() || !connection?.isActive || !subscription?.ready) return;
      const boss = [...connection.db.myProceduralBoss.iter()].find(
        (row) => row.key === bossKey,
      );
      if (
        !boss ||
        boss.mapId !== mapId ||
        boss.encounter !== encounter ||
        boss.hp <= 0
      )
        return;
      port.sendReducer("generated boss hit", (conn) =>
        conn.reducers.hitProceduralBossBatch({
          mapId,
          bossKey,
          encounter,
          hits,
          x,
          y,
        }),
      );
    },
  };
}
