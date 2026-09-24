import { tables, type DbConnection } from "../../module_bindings";

export type AudioVolumes = { musicVolume: number; sfxVolume: number };

/**
 * What the server holds for this account. `loaded` is false until the current
 * connection's subscription has settled; `volumes` is null when the account
 * has never saved any, which is every account until its first login on a
 * client that knows about this.
 */
export type AccountAudioSnapshot = { loaded: boolean; volumes: AudioVolumes | null };

export type AccountAudioRemote = {
  snapshot(): AccountAudioSnapshot;
  /** Called on every settle and row change of the current connection. */
  observe(listener: (snapshot: AccountAudioSnapshot) => void): () => void;
  /** Resolves false when nothing could be sent now: offline or not ready yet. */
  save(volumes: AudioVolumes): Promise<boolean>;
};

type Target = { connection: DbConnection; isCurrent: () => boolean; ready: () => boolean };

/**
 * The account's volumes, carried between the coop connection and the game
 * bundle's audio settings. It only transports; deciding when to apply or send
 * lives in the game bundle's account-audio-sync.
 */
export function createAccountAudioSettings() {
  let snapshot: AccountAudioSnapshot = { loaded: false, volumes: null };
  let target: Target | null = null;
  const listeners = new Set<(snapshot: AccountAudioSnapshot) => void>();

  function publish(next: AccountAudioSnapshot) {
    snapshot = next;
    for (const listener of [...listeners]) {
      try { listener(next); } catch (error) { console.warn("WildStat audio settings listener failed:", error); }
    }
  }

  function watch(connection: DbConnection, isCurrent: () => boolean, ready: () => boolean) {
    target = { connection, isCurrent, ready };
    publish({ loaded: false, volumes: null });
    let applied = false;
    const read = () => {
      if (!applied || !isCurrent()) return;
      const row = [...connection.db.myAudioSettings.iter()][0];
      publish({ loaded: true, volumes: row ? { musicVolume: row.musicVolume, sfxVolume: row.sfxVolume } : null });
    };
    connection.db.myAudioSettings.onInsert(read);
    connection.db.myAudioSettings.onUpdate(read);
    connection.db.myAudioSettings.onDelete(read);
    connection.subscriptionBuilder().onApplied(() => { applied = true; read(); }).subscribe([tables.myAudioSettings]);
  }

  const api: AccountAudioRemote = {
    snapshot: () => snapshot,
    observe(listener) {
      listeners.add(listener);
      return () => { listeners.delete(listener); };
    },
    async save(volumes) {
      const current = target;
      if (!current || !current.isCurrent() || !current.connection.isActive || !current.ready()) return false;
      await current.connection.reducers.setAudioSettings(volumes);
      return true;
    },
  };

  return { watch, api };
}
