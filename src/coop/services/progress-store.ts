import { ATTACK_BALANCE_VERSION } from "../../../shared/rules";
import { copyProgress, isProgressSave, migrateProgressSave, type ProgressSave } from "./progress";

type StoredProgress = {
  identity?: unknown;
  balanceVersion?: unknown;
  progress?: unknown;
};

export function createProgressStore(storage: Storage, storageKey: string) {
  const scopedKey = (identity: string) => `${storageKey}/${identity}`;

  return {
    read(identity: string): ProgressSave | null {
      try {
        let serialized = storage.getItem(scopedKey(identity));
        if (!serialized) {
          const legacy = storage.getItem(storageKey);
          if (legacy) {
            const candidate = JSON.parse(legacy) as StoredProgress;
            if (candidate.identity === identity) {
              serialized = legacy;
              storage.setItem(scopedKey(identity), legacy);
              storage.removeItem(storageKey);
            }
          }
        }
        const candidate = JSON.parse(serialized || "null") as StoredProgress | null;
        if (!candidate || candidate.identity !== identity || !isProgressSave(candidate.progress)) return null;
        const progress = migrateProgressSave(candidate.progress, candidate.balanceVersion);
        if (candidate.balanceVersion !== ATTACK_BALANCE_VERSION) this.write(identity, progress);
        return progress;
      } catch {
        return null;
      }
    },

    write(identity: string, progress: ProgressSave) {
      const normalized = copyProgress(progress);
      try {
        storage.setItem(scopedKey(identity), JSON.stringify({
          identity,
          balanceVersion: ATTACK_BALANCE_VERSION,
          progress: normalized,
        }));
      } catch {}
      return normalized;
    },

    clear(identity: string) {
      try {
        if (identity) storage.removeItem(scopedKey(identity));
        const candidate = JSON.parse(storage.getItem(storageKey) || "null") as StoredProgress | null;
        if (!candidate || candidate.identity === identity) storage.removeItem(storageKey);
      } catch {}
    },
  };
}
