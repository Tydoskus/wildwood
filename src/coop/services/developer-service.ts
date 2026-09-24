import type { BalanceEditorState, BalanceSettings, MapBalanceSnapshot } from "../../../shared/map-balance-types";
import { Identity } from "spacetimedb";
import { isDeveloperIdentity } from "../../app/developer";
import type { AccessAuditEntry, BugReportEntry } from "../contracts";
import type { ReducerPort } from "../ports";
import type { AnalyticsDashboard } from "./analytics-types";

type DeveloperServiceDependencies = {
  reducers: ReducerPort;
  notify: () => void;
  drainPendingProgress: () => Promise<boolean>;
  localIdentity: () => string;
  localDbIdentity: () => Identity | null;
  profileIdentityFor: (identity: string) => Identity | undefined;
};

type AccessAuditRow = {
  identity: Identity;
  displayName: string;
  firstSeenAt: { microsSinceUnixEpoch: bigint };
  lastSeenAt: { microsSinceUnixEpoch: bigint };
  accountType: string;
  lastProtocolVersion: number;
  label: string;
};

type BugReportRow = {
  id: bigint;
  reporter: Identity;
  reporterName: string;
  message: string;
  protocolVersion: number;
  reportedAt: { microsSinceUnixEpoch: bigint };
};

export function createDeveloperService(dependencies: DeveloperServiceDependencies) {
  const accessAuditEntries = new Map<string, AccessAuditEntry & { identityValue: Identity }>();
  const bugReportEntries = new Map<string, BugReportEntry>();
  let presenceVisible = true;

  function upsertAccessAudit(row: AccessAuditRow) {
    const identity = row.identity.toHexString();
    accessAuditEntries.set(identity, {
      identity,
      identityValue: row.identity,
      displayName: row.displayName,
      firstSeenAtMs: Number(row.firstSeenAt.microsSinceUnixEpoch / 1000n),
      lastSeenAtMs: Number(row.lastSeenAt.microsSinceUnixEpoch / 1000n),
      accountType: row.accountType,
      lastProtocolVersion: row.lastProtocolVersion,
      label: row.label,
    });
    dependencies.notify();
  }

  function removeAccessAudit(row: { identity: Identity }) {
    accessAuditEntries.delete(row.identity.toHexString());
    dependencies.notify();
  }

  function upsertBugReport(row: BugReportRow) {
    bugReportEntries.set(row.id.toString(), {
      id: row.id,
      reporter: row.reporter.toHexString(),
      reporterName: row.reporterName,
      message: row.message,
      protocolVersion: row.protocolVersion,
      reportedAtMs: Number(row.reportedAt.microsSinceUnixEpoch / 1000n),
    });
    dependencies.notify();
  }

  function removeBugReport(row: { id: bigint }) {
    bugReportEntries.delete(row.id.toString());
    dependencies.notify();
  }

  function hasAccess() {
    return isDeveloperIdentity(dependencies.localIdentity());
  }

  return {
    tables: {
      upsertAccessAudit, removeAccessAudit, upsertBugReport, removeBugReport,
    },
    identityFor: (identity: string) => accessAuditEntries.get(identity)?.identityValue,
    observePresence(visible: boolean) {
      presenceVisible = visible;
    },
    api: {
      async findTeleportPlayer(query: string): Promise<{ identity: string; displayName: string; mapId: string }> {
        const connection = dependencies.reducers.connection();
        if (!connection || !hasAccess()) throw new Error("Developer access required.");
        const result = await connection.procedures.getDeveloperTravelTarget({ query });
        if (connection !== dependencies.reducers.connection() || !hasAccess()) throw new Error("Connection changed. Try again.");
        return JSON.parse(result);
      },
      async devTeleportToPlayer(identity: string, mapId: string): Promise<{ mapId: string; x: number; y: number; facing: number }> {
        const connection = dependencies.reducers.connection();
        const owner = dependencies.localIdentity();
        if (!connection || !hasAccess() || dependencies.reducers.protocolBlocked()) throw new Error("Developer connection required.");
        if (!await dependencies.drainPendingProgress()) throw new Error("Rewards are still syncing. Try again.");
        if (connection !== dependencies.reducers.connection() || owner !== dependencies.localIdentity()) throw new Error("Connection changed. Try again.");
        const result = await connection.procedures.devTeleportToPlayer({ identity: Identity.fromString(identity), mapId });
        if (connection !== dependencies.reducers.connection() || owner !== dependencies.localIdentity()) throw new Error("Connection changed. Try again.");
        return JSON.parse(result);
      },
      async getMapBalance(mapId: string): Promise<MapBalanceSnapshot> {
        const conn = dependencies.reducers.connection();
        if (!conn) throw new Error("Connect to load map balance.");
        const value = await conn.procedures.getMapConfiguration({ mapId });
        if (conn !== dependencies.reducers.connection()) throw new Error("Connection changed while loading balance.");
        return JSON.parse(value);
      },
      async balanceEditor(): Promise<BalanceEditorState> {
        const conn = dependencies.reducers.connection();
        if (!conn || !hasAccess()) throw new Error("Developer access required.");
        return JSON.parse(await conn.procedures.getBalanceEditor({}));
      },
      async previewBalance(mapId: string, settings: BalanceSettings): Promise<MapBalanceSnapshot> {
        const conn = dependencies.reducers.connection();
        if (!conn || !hasAccess()) throw new Error("Developer access required.");
        return JSON.parse(await conn.procedures.previewMapBalance({ mapId, settingsJson: JSON.stringify(settings) }));
      },
      async saveBalance(expectedRevision: number, settings: BalanceSettings) {
        const conn = dependencies.reducers.connection();
        if (!conn || !hasAccess()) throw new Error("Developer access required.");
        await conn.reducers.setMapBalance({ expectedRevision, settingsJson: JSON.stringify(settings) });
      },
      async restoreBalance(expectedRevision: number, revision: number) {
        const conn = dependencies.reducers.connection();
        if (!conn || !hasAccess()) throw new Error("Developer access required.");
        await conn.reducers.restoreMapBalance({ expectedRevision, revision });
      },
      async analyticsDashboard(fromDayKey: string, toDayKey: string): Promise<AnalyticsDashboard> {
        const connection = dependencies.reducers.connection();
        if (!connection || !hasAccess()) throw new Error("Developer access required.");
        return JSON.parse(await connection.procedures.getAnalyticsDashboard({ fromDayKey, toDayKey })) as AnalyticsDashboard;
      },
      async devAdjustGems(identity: string, delta: bigint, reason: string) {
        const connection = dependencies.reducers.connection();
        if (dependencies.reducers.protocolBlocked()) return { ok: false, error: "UPDATE REQUIRED" };
        if (!connection || !hasAccess()) return { ok: false, error: "DEVELOPER CONNECTION REQUIRED" };
        const target = identity === dependencies.localIdentity()
          ? dependencies.localDbIdentity()
          : dependencies.profileIdentityFor(identity);
        if (!target) return { ok: false, error: "PLAYER PROFILE UNAVAILABLE" };
        try {
          await dependencies.reducers.runWorldReducer(() => connection.reducers.devAdjustGems({ identity: target, delta, reason }));
          return { ok: true };
        } catch (error) {
          const message = dependencies.reducers.errorMessage(error);
          dependencies.reducers.handleFailure("Gem adjustment", error);
          return { ok: false, error: message };
        }
      },
      isDeveloper(identity = dependencies.localIdentity()) {
        return isDeveloperIdentity(identity);
      },
      developerPresenceVisible: () => presenceVisible,
      async setDeveloperPresence(visible: boolean) {
        const connection = dependencies.reducers.connection();
        if (dependencies.reducers.protocolBlocked() || !connection || !hasAccess()) {
          return { ok: false, error: "DEVELOPER ACCESS REQUIRED" };
        }
        try {
          await dependencies.reducers.runWorldReducer(() => connection.reducers.setDeveloperPresence({ visible }));
          presenceVisible = visible;
          dependencies.notify();
          return { ok: true };
        } catch (error) {
          const message = dependencies.reducers.errorMessage(error);
          dependencies.reducers.handleFailure("developer presence", error);
          return { ok: false, error: message };
        }
      },
      accessAuditEntries() {
        return [...accessAuditEntries.values()].map(({ identityValue: _identityValue, ...entry }) => ({ ...entry }));
      },
      bugReportEntries() {
        return [...bugReportEntries.values()].map((entry) => ({ ...entry }));
      },
      async deleteBugReport(id: bigint) {
        const connection = dependencies.reducers.connection();
        if (dependencies.reducers.protocolBlocked() || !connection || !hasAccess()) {
          return { ok: false, error: "DEVELOPER ACCESS REQUIRED" };
        }
        if (!bugReportEntries.has(id.toString())) return { ok: false, error: "BUG REPORT NOT FOUND" };
        try {
          await dependencies.reducers.runWorldReducer(() => connection.reducers.devDeleteBugReport({ id }));
          return { ok: true };
        } catch (error) {
          const message = dependencies.reducers.errorMessage(error);
          dependencies.reducers.handleFailure("bug report delete", error);
          return { ok: false, error: message };
        }
      },
      async setAccessAuditLabel(identity: string, label: string) {
        const connection = dependencies.reducers.connection();
        if (dependencies.reducers.protocolBlocked() || !connection || !hasAccess()) {
          return { ok: false, error: "DEVELOPER ACCESS REQUIRED" };
        }
        const entry = accessAuditEntries.get(identity);
        if (!entry) return { ok: false, error: "AUDIT ROW NOT FOUND" };
        try {
          await dependencies.reducers.runWorldReducer(() => connection.reducers.devSetAccessAuditLabel({ identity: entry.identityValue, label }));
          return { ok: true };
        } catch (error) {
          const message = dependencies.reducers.errorMessage(error);
          dependencies.reducers.handleFailure("audit label update", error);
          return { ok: false, error: message };
        }
      },
      async updatePlayerSave(identity: string, update: {
        displayName: string;
        maxHp: number;
        damage: number;
        attackRate: number;
        projectileSpeed: number;
        projectileCount: number;
        attackRange: number;
        armor: number;
        regen: number;
        speed: number;
      }) {
        const connection = dependencies.reducers.connection();
        if (dependencies.reducers.protocolBlocked() || !connection || !hasAccess()) {
          return { ok: false, error: "DEVELOPER ACCESS REQUIRED" };
        }
        const targetIdentity = dependencies.profileIdentityFor(identity) ?? accessAuditEntries.get(identity)?.identityValue;
        if (!targetIdentity) return { ok: false, error: "PLAYER IDENTITY NOT FOUND" };
        try {
          await dependencies.reducers.runWorldReducer(() => connection.reducers.devUpdatePlayerSave({ identity: targetIdentity, ...update }));
          return { ok: true };
        } catch (error) {
          const message = dependencies.reducers.errorMessage(error);
          dependencies.reducers.handleFailure("developer save update", error);
          return { ok: false, error: message };
        }
      },
    },
    clearSession() {
      accessAuditEntries.clear();
      bugReportEntries.clear();
    },
  };
}

export type DeveloperService = ReturnType<typeof createDeveloperService>;
