import { Identity } from "spacetimedb";
import { isDeveloperIdentity } from "../../app/developer";
import type { DevPlayerSummary, DevReviewQueue } from "../../../shared/dev-review";
import type { ModerationHistoryPage } from "../../../shared/moderation-history";
import type { DbConnection } from "../../module_bindings";
import type { ReducerPort } from "../ports";

export type DevModerationResult = { ok: true } | { ok: false; error: string };

/** The server refuses a timed suspension past seven days; stay a little inside it. */
const MAX_TIMED_SUSPENSION_MS = 7 * 86_400_000 - 5 * 60_000;

/**
 * Mute an account's chat for `minutes`, or lift the mute with 0. The server
 * accepts it only from the database owner or the signed-in developer account.
 */
export async function setChatMute(connection: DbConnection, identity: string, minutes: number): Promise<void> {
  await connection.reducers.devSetChatMute({ identity: Identity.fromString(identity), minutes });
}

type DevModerationDependencies = {
  reducers: ReducerPort;
  localIdentity: () => string;
};

/**
 * Developer triage: the report and bug queue, player lookup, mutes and bans.
 * Every call is checked again by the server; the local identity check only
 * keeps a stale tab from sending requests that would be refused anyway.
 */
export function createDevModerationService(dependencies: DevModerationDependencies) {
  // Suspension deadlines are absolute. Measure them against the server's clock
  // from the last queue read, so a skewed device clock cannot overshoot 7 days.
  let serverOffsetMs = 0;

  function connection() {
    const current = dependencies.reducers.connection();
    if (!current || !isDeveloperIdentity(dependencies.localIdentity())) throw new Error("Developer access required.");
    return current;
  }

  async function reducer(label: string, run: (current: DbConnection) => unknown): Promise<DevModerationResult> {
    if (dependencies.reducers.protocolBlocked()) return { ok: false, error: "Update required." };
    let current: DbConnection;
    try { current = connection(); }
    catch (error) { return { ok: false, error: (error as Error).message }; }
    try {
      await dependencies.reducers.runWorldReducer(() => run(current));
      return { ok: true };
    } catch (error) {
      const message = dependencies.reducers.errorMessage(error);
      dependencies.reducers.handleFailure(label, error);
      return { ok: false, error: message };
    }
  }

  return {
    api: {
      async reviewQueue(): Promise<DevReviewQueue> {
        const queue = JSON.parse(await connection().procedures.getDevReviewQueue({})) as DevReviewQueue;
        serverOffsetMs = queue.serverNowMs - Date.now();
        return queue;
      },
      /** `mailReporter` sends the reporter one letter about it, in the same transaction. */
      reviewReport(reportKey: string, decision: string, note: string, mailReporter: boolean) {
        return reducer("report review", current => current.reducers.devReviewReport({ reportKey, decision, note, mailReporter }));
      },
      reviewBug(id: string, decision: string, note: string, mailReporter: boolean) {
        return reducer("bug review", current => current.reducers.devReviewBug({ id: BigInt(id), decision, note, mailReporter }));
      },
      async findPlayers(query: string): Promise<DevPlayerSummary[]> {
        return JSON.parse(await connection().procedures.devFindPlayers({ query })) as DevPlayerSummary[];
      },
      async playerHistory(identity: string): Promise<ModerationHistoryPage> {
        const result = await connection().procedures.getPlayerModerationHistory({ identity: Identity.fromString(identity) });
        return JSON.parse(result) as ModerationHistoryPage;
      },
      /** `hours` 0 suspends permanently. */
      suspend(identity: string, expectedDisplayName: string, hours: number, reason: string) {
        const untilMs = hours === 0 ? 0 : Date.now() + serverOffsetMs + Math.min(hours * 3_600_000, MAX_TIMED_SUSPENSION_MS);
        return reducer("account suspension", current => current.reducers.devSuspendPlayerAccount({
          identity: Identity.fromString(identity), expectedDisplayName, untilMicros: BigInt(Math.floor(untilMs)) * 1000n, reason,
        }));
      },
      liftSuspension(identity: string, reason: string) {
        return reducer("lift suspension", current => current.reducers.devLiftPlayerSuspension({ identity: Identity.fromString(identity), reason }));
      },
      /** `minutes` 0 lifts the mute. */
      setChatMute(identity: string, minutes: number) {
        return reducer("chat mute", current => setChatMute(current, identity, minutes));
      },
    },
  };
}

export type DevModerationApi = ReturnType<typeof createDevModerationService>["api"];
