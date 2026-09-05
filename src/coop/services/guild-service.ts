import { Identity } from "spacetimedb";
import type { GuildSnapshot } from "../../../shared/guilds";
import type { ReducerPort } from "../ports";

export type GuildAction =
  | { kind: "create"; name: string } | { kind: "join"; guildId: string } | { kind: "leave" }
  | { kind: "champion"; identity: string; champion: boolean } | { kind: "refreshChampion" }
  | { kind: "transfer"; identity: string } | { kind: "kick"; identity: string }
  | { kind: "challenge"; opponentGuildId: string };

type Dependencies = {
  reducers: ReducerPort;
  localIdentity: () => string;
  drainPendingProgress: () => Promise<boolean>;
};

/** On-demand root snapshots. No persistent subscriptions or background database polling. */
export function createGuildService(deps: Dependencies) {
  let generation = 0;
  let pendingAction: symbol | null = null;
  function request() {
    const connection = deps.reducers.connection();
    if (deps.reducers.protocolBlocked()) throw new Error("Update the game to continue.");
    if (!connection?.isActive || !deps.localIdentity()) throw new Error("Connect to your character to continue.");
    const identity = deps.localIdentity();
    const started = generation;
    return { connection, check() {
      if (started !== generation || connection !== deps.reducers.connection() || identity !== deps.localIdentity()) {
        throw new Error("This session changed. Reopen the panel to refresh.");
      }
    } };
  }
  async function mutate<T>(action: (connection: NonNullable<ReturnType<ReducerPort["connection"]>>) => Promise<T>) {
    if (pendingAction) throw new Error("An action is already being saved.");
    const current = request();
    const token = Symbol("guild-action");
    pendingAction = token;
    try {
      if (!await deps.drainPendingProgress()) throw new Error("Your progress is still syncing. Try again shortly.");
      current.check();
      const result = await deps.reducers.runWorldReducer(() => action(current.connection));
      current.check();
      return result;
    } catch (error) {
      throw new Error(deps.reducers.errorMessage(error));
    } finally { if (pendingAction === token) pendingAction = null; }
  }
  const api = {
    cancel() { generation++; },
    async loadGuild(afterId = "0"): Promise<GuildSnapshot> {
      const current = request();
      const result = await current.connection.procedures.getGuildHub({ afterId: BigInt(afterId) });
      current.check();
      return JSON.parse(result) as GuildSnapshot;
    },
    async guildAction(action: GuildAction) {
      return mutate(async (connection) => {
        switch (action.kind) {
          case "create": return connection.reducers.createGuild({ name: action.name });
          case "join": return connection.reducers.joinGuild({ guildId: BigInt(action.guildId) });
          case "leave": return connection.reducers.leaveGuild({});
          case "champion": return connection.reducers.setGuildChampion({ identity: Identity.fromString(action.identity), champion: action.champion });
          case "refreshChampion": return connection.reducers.refreshGuildChampion({});
          case "transfer": return connection.reducers.transferGuildLeadership({ identity: Identity.fromString(action.identity) });
          case "kick": return connection.reducers.kickGuildMember({ identity: Identity.fromString(action.identity) });
          case "challenge": return connection.reducers.challengeGuild({ opponentGuildId: BigInt(action.opponentGuildId) });
        }
      });
    },
  };
  return { api, resetSession() { api.cancel(); pendingAction = null; } };
}
export type GuildApi = ReturnType<typeof createGuildService>["api"];
