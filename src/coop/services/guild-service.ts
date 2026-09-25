import { Identity } from "spacetimedb";
import type { GuildSnapshot, GuildReport, GuildPreview } from "../../../shared/guilds";
import type { ReducerPort } from "../ports";

export type GuildAction =
  | { kind: "admission"; action: "open" | "requestOnly" | "request" | "cancel" | "accept" | "decline"; guildId?: string; identity?: string; note?: string }
  | { kind: "create"; name: string } | { kind: "join"; guildId: string } | { kind: "leave" }
  | { kind: "transfer"; identity: string } | { kind: "kick"; identity: string }
  | { kind: "vicePresident"; identity: string; enabled: boolean }
  | { kind: "emblem"; emblem: number }
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
    async loadGuildPreview(guildId: string): Promise<GuildPreview> {
      const current = request();
      const result = await current.connection.procedures.getGuildPreview({ guildId: BigInt(guildId) });
      current.check();
      return JSON.parse(result) as GuildPreview;
    },
    async loadReplay(reportKey: string): Promise<GuildReport> {
      const current = request();
      const result = await current.connection.procedures.getGuildReplay({ reportKey });
      current.check();
      return JSON.parse(result) as GuildReport;
    },
    async loadGuild(afterId = "0", byPower = false): Promise<GuildSnapshot> {
      const current = request();
      const result = await (byPower ? current.connection.procedures.getGuildBattleHub({ afterId: BigInt(afterId) }) : current.connection.procedures.getGuildHub({ afterId: BigInt(afterId) }));
      current.check();
      return JSON.parse(result) as GuildSnapshot;
    },
    async guildAction(action: GuildAction) {
      return mutate(async (connection) => {
        switch (action.kind) {
          case "admission": return connection.reducers.guildAdmission({ action: action.action, guildId: BigInt(action.guildId ?? "0"), identity: Identity.fromString(action.identity ?? deps.localIdentity()), note: action.note ?? "" });
          case "emblem": return connection.reducers.setGuildEmblem({ emblem: action.emblem });
          case "create": return connection.reducers.createGuild({ name: action.name });
          case "join": return connection.reducers.joinGuild({ guildId: BigInt(action.guildId) });
          case "leave": return connection.reducers.leaveGuild({});
          case "transfer": return connection.reducers.transferGuildLeadership({ identity: Identity.fromString(action.identity) });
          case "vicePresident": return connection.reducers.setGuildVicePresident({ identity: Identity.fromString(action.identity), enabled: action.enabled });
          case "kick": return connection.reducers.kickGuildMember({ identity: Identity.fromString(action.identity) });
          case "challenge": return connection.reducers.challengeGuild({ opponentGuildId: BigInt(action.opponentGuildId) });
        }
      });
    },
  };
  return { api, resetSession() { api.cancel(); pendingAction = null; } };
}
export type GuildApi = ReturnType<typeof createGuildService>["api"];
