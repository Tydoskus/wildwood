export type UpdateResumeMode = "account" | "guest";

type UpdateResumeIntent = {
  version: string;
  mode: UpdateResumeMode;
  createdAt: number;
};

const UPDATE_RESUME_MAX_AGE_MS = 10 * 60_000;

/** Lets the first release of this feature recognize an older active tab. */
export function inferLegacyUpdateResumeMode(options: {
  requestedVersion: string;
  currentVersion: string;
  hadPlayableTab: boolean;
  hasAccountToken: boolean;
  consumedVersion: string;
}): UpdateResumeMode | null {
  if (!options.requestedVersion || options.requestedVersion !== options.currentVersion) return null;
  if (!options.hadPlayableTab || options.consumedVersion === options.requestedVersion) return null;
  return options.hasAccountToken ? "account" : "guest";
}

/** One-use handoff from an active old client to its forced-update reload. */
export function createUpdateResumeStore(
  storage: Storage,
  key: string,
  now: () => number = Date.now,
) {
  return {
    write(version: string, mode: UpdateResumeMode) {
      if (!version) return;
      const intent: UpdateResumeIntent = { version, mode, createdAt: now() };
      try { storage.setItem(key, JSON.stringify(intent)); } catch {}
    },

    consume(version: string): UpdateResumeMode | null {
      try {
        const serialized = storage.getItem(key);
        storage.removeItem(key);
        if (!serialized || !version) return null;
        const intent = JSON.parse(serialized) as Partial<UpdateResumeIntent>;
        const age = now() - Number(intent.createdAt);
        if (intent.version !== version || (intent.mode !== "account" && intent.mode !== "guest")) return null;
        if (!Number.isFinite(age) || age < 0 || age > UPDATE_RESUME_MAX_AGE_MS) return null;
        return intent.mode;
      } catch {
        try { storage.removeItem(key); } catch {}
        return null;
      }
    },
  };
}
