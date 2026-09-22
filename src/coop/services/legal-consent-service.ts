import { tables, type DbConnection } from "../../module_bindings";
import {
  TERMS_VERSION,
  isEligiblePlayerAgeBand,
  playerAgeBand,
  type EligiblePlayerAgeBand,
} from "../../../shared/legal";

type StoredLegalConsent = {
  termsVersion: string;
  ageBand: EligiblePlayerAgeBand;
};

type LegalConsentDependencies = {
  storage: Pick<Storage, "getItem" | "setItem">;
  storageKey: string;
  connection: () => DbConnection | null;
  protocolReady: () => boolean;
  shouldEnterWorld: () => boolean;
  requestWorldEntry: () => Promise<boolean>;
  notify: () => void;
  handleFailure: (action: string, error: unknown) => void;
};

function parseStoredConsent(value: string | null): StoredLegalConsent | null {
  if (!value) return null;
  try {
    const parsed = JSON.parse(value) as Partial<StoredLegalConsent>;
    const ageBand = parsed.ageBand;
    if (parsed.termsVersion !== TERMS_VERSION || typeof ageBand !== "number" || !isEligiblePlayerAgeBand(ageBand)) return null;
    return { termsVersion: TERMS_VERSION, ageBand };
  } catch {
    return null;
  }
}

export function createLegalConsentService(dependencies: LegalConsentDependencies) {
  let consent = (() => {
    try { return parseStoredConsent(dependencies.storage.getItem(dependencies.storageKey)); }
    catch { return null; }
  })();

  /**
   * What the account itself agreed to, read from the server.
   *
   * Local storage is a cache and it is keyed by token, so on another device,
   * or after a token change, it is empty and the player was asked their age
   * again for an account that had already answered. The server's row is the
   * truth; this adopts it.
   */
  function adoptServerConsent(connection: DbConnection) {
    // A connection may be mid-setup, or a test double without this view.
    const row = [...(connection.db?.myLegalConsent?.iter?.() ?? [])][0];
    if (!row || row.termsVersion !== TERMS_VERSION || !isEligiblePlayerAgeBand(row.ageBand)) return;
    const next = { termsVersion: TERMS_VERSION, ageBand: row.ageBand } satisfies StoredLegalConsent;
    if (consent?.termsVersion === next.termsVersion && consent.ageBand === next.ageBand) return;
    // Record it as already synced, so adopting the account's own answer does
    // not send it straight back as a fresh acceptance.
    synced.set(connection, { key: `${next.termsVersion}:${next.ageBand}`, pending: Promise.resolve() });
    store(next);
    dependencies.notify();
  }

  /** Watch the row, so a session that connects before it arrives catches up. */
  function watch(connection: DbConnection) {
    const read = () => adoptServerConsent(connection);
    const table = connection.db?.myLegalConsent;
    if (!table) return;
    table.onInsert(read);
    table.onUpdate(read);
    connection.subscriptionBuilder().onApplied(read).subscribe([tables.myLegalConsent]);
  }

  function store(next: StoredLegalConsent) {
    consent = next;
    try { dependencies.storage.setItem(dependencies.storageKey, JSON.stringify(next)); } catch {}
  }

  const synced = new WeakMap<DbConnection, { key: string; pending: Promise<void> }>();
  function sendToServer(connection: DbConnection, next: StoredLegalConsent) {
    const key = `${next.termsVersion}:${next.ageBand}`;
    const current = synced.get(connection);
    if (current?.key === key) return current.pending;
    const pending = Promise.resolve().then(() => connection.reducers.acceptTerms({
      termsVersion: next.termsVersion, ageBand: next.ageBand,
    })).catch(error => {
      if (synced.get(connection)?.pending === pending) synced.delete(connection);
      throw error;
    });
    synced.set(connection, { key, pending });
    return pending;
  }

  async function syncConnection(connection: DbConnection) {
    adoptServerConsent(connection);
    if (!consent) return false;
    try {
      await sendToServer(connection, consent);
      return dependencies.connection() === connection && connection.isActive;
    } catch (error) {
      dependencies.handleFailure("terms acceptance", error);
      dependencies.notify();
      return false;
    }
  }

  async function acceptAge(age: number) {
    let ageBand: ReturnType<typeof playerAgeBand>;
    try {
      ageBand = playerAgeBand(age);
    } catch (error) {
      return { ok: false, error: error instanceof Error ? error.message : "Choose a valid age." };
    }
    if (!isEligiblePlayerAgeBand(ageBand)) {
      return { ok: false, error: "WildStat is currently available to players age 13 and older." };
    }

    const next = { termsVersion: TERMS_VERSION, ageBand } satisfies StoredLegalConsent;
    const connection = dependencies.connection();
    if (connection?.isActive && dependencies.protocolReady()) {
      try {
        await sendToServer(connection, next);
      } catch (error) {
        dependencies.handleFailure("terms acceptance", error);
        return { ok: false, error: "Could not save your agreement. Try again." };
      }
    }

    // Acceptance is complete independently of world entry. Do not make the
    // player repeat it after a failed entry or a reconnect during submission.
    store(next);
    dependencies.notify();
    const current = dependencies.connection();
    if (current?.isActive && dependencies.protocolReady() && dependencies.shouldEnterWorld()) {
      if (!await syncConnection(current)) return { ok: false, error: "Could not save your agreement. Try again." };
      const entered = await dependencies.requestWorldEntry();
      if (!entered) return { ok: false, error: "Could not enter WildStat. Try again." };
    }
    return { ok: true };
  }

  return {
    acceptAge,
    accepted: () => consent?.termsVersion === TERMS_VERSION,
    syncConnection,
    watch,
  };
}

export const legalConsentInternals = { parseStoredConsent };
