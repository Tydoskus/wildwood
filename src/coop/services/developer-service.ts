import type { Identity } from "spacetimedb";
import { isDeveloperIdentity } from "../../app/developer";
import type { AccessAuditEntry, BugReportEntry } from "../contracts";
import type { ReducerPort } from "../ports";

type DeveloperServiceDependencies = {
  reducers: ReducerPort;
  notify: () => void;
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
    tables: { upsertAccessAudit, removeAccessAudit, upsertBugReport, removeBugReport },
    identityFor: (identity: string) => accessAuditEntries.get(identity)?.identityValue,
    observePresence(visible: boolean) {
      presenceVisible = visible;
    },
    api: {
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
