import { describe, expect, it, vi } from "vitest";
import { createAccountAudioSettings, type AccountAudioSnapshot } from "./account-audio-settings";

type Row = { musicVolume: number; sfxVolume: number };

function fakeConnection(rows: Row[] = []) {
  const handlers: Record<string, Array<() => void>> = { insert: [], update: [], delete: [] };
  let applied: (() => void) | null = null;
  const setAudioSettings = vi.fn(async (_volumes: Row) => undefined);
  const connection = {
    isActive: true,
    db: { myAudioSettings: {
      iter: () => rows[Symbol.iterator](),
      onInsert: (handler: () => void) => handlers.insert.push(handler),
      onUpdate: (handler: () => void) => handlers.update.push(handler),
      onDelete: (handler: () => void) => handlers.delete.push(handler),
    } },
    subscriptionBuilder: () => ({
      onApplied(callback: () => void) { applied = callback; return this; },
      subscribe: vi.fn(),
    }),
    reducers: { setAudioSettings },
  };
  return {
    connection: connection as never, rows, setAudioSettings,
    settle: () => applied?.(),
    fire: (kind: "insert" | "update" | "delete") => handlers[kind].forEach(handler => handler()),
  };
}

describe("account audio settings transport", () => {
  it("reports nothing until the subscription settles, then the row or its absence", () => {
    const audio = createAccountAudioSettings();
    const seen: AccountAudioSnapshot[] = [];
    audio.api.observe(snapshot => seen.push(snapshot));
    const conn = fakeConnection();
    audio.watch(conn.connection, () => true, () => true);
    expect(audio.api.snapshot()).toEqual({ loaded: false, volumes: null });
    conn.fire("insert");
    expect(seen.at(-1)).toEqual({ loaded: false, volumes: null });
    conn.settle();
    expect(audio.api.snapshot()).toEqual({ loaded: true, volumes: null });
    conn.rows.push({ musicVolume: .2, sfxVolume: .4 });
    conn.fire("insert");
    expect(audio.api.snapshot()).toEqual({ loaded: true, volumes: { musicVolume: .2, sfxVolume: .4 } });
  });

  it("ignores rows from a connection that has been replaced", () => {
    const audio = createAccountAudioSettings();
    let current = true;
    const conn = fakeConnection([{ musicVolume: .2, sfxVolume: .4 }]);
    audio.watch(conn.connection, () => current, () => true);
    current = false;
    conn.settle();
    expect(audio.api.snapshot().loaded).toBe(false);
  });

  it("sends only on a current, active, protocol-ready connection", async () => {
    const audio = createAccountAudioSettings();
    await expect(audio.api.save({ musicVolume: .5, sfxVolume: .5 })).resolves.toBe(false);
    let ready = false;
    const conn = fakeConnection();
    audio.watch(conn.connection, () => true, () => ready);
    await expect(audio.api.save({ musicVolume: .5, sfxVolume: .5 })).resolves.toBe(false);
    ready = true;
    await expect(audio.api.save({ musicVolume: .5, sfxVolume: .5 })).resolves.toBe(true);
    expect(conn.setAudioSettings).toHaveBeenCalledTimes(1);
  });

  it("keeps notifying other listeners when one throws", () => {
    const audio = createAccountAudioSettings();
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    const later = vi.fn();
    audio.api.observe(() => { throw new Error("boom"); });
    audio.api.observe(later);
    audio.watch(fakeConnection().connection, () => true, () => true);
    expect(later).toHaveBeenCalled();
    warn.mockRestore();
  });
});
