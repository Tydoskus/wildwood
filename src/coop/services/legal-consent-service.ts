import type { DbConnection } from "../../module_bindings";
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

  function store(next: StoredLegalConsent) {
    consent = next;
    try { dependencies.storage.setItem(dependencies.storageKey, JSON.stringify(next)); } catch {}
  }

  async function sendToServer(connection: DbConnection, next: StoredLegalConsent) {
    await connection.reducers.acceptTerms({
      termsVersion: next.termsVersion,
      ageBand: next.ageBand,
    });
  }

  async function syncConnection(connection: DbConnection) {
    if (!consent) return false;
    try {
      await sendToServer(connection, consent);
      return true;
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
      return { ok: false, error: "Wildstat is currently available to players age 13 and older." };
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

    if (connection?.isActive && dependencies.protocolReady() && dependencies.shouldEnterWorld()) {
      const entered = await dependencies.requestWorldEntry();
      if (!entered) return { ok: false, error: "Could not enter Wildstat. Try again." };
    }
    store(next);
    dependencies.notify();
    return { ok: true };
  }

  return {
    acceptAge,
    accepted: () => consent?.termsVersion === TERMS_VERSION,
    syncConnection,
  };
}

export const legalConsentInternals = { parseStoredConsent };
