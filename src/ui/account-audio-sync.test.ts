import { describe, expect, it, vi } from "vitest";
import type { AccountAudioRemote, AccountAudioSnapshot, AudioVolumes } from "../coop/services/account-audio-settings";
import { createAccountAudioSync, markUnsyncedAudio, readUnsyncedAudio } from "./account-audio-sync";

const KEY = "audio-unsynced";

class MemoryStorage {
  values = new Map<string, string>();
  getItem(key: string) { return this.values.get(key) ?? null; }
  setItem(key: string, value: string) { this.values.set(key, value); }
  removeItem(key: string) { this.values.delete(key); }
}

function fakeRemote(initial: AccountAudioSnapshot = { loaded: false, volumes: null }) {
  let snapshot = initial;
  const listeners = new Set<(next: AccountAudioSnapshot) => void>();
  const sent: AudioVolumes[] = [];
  let answer: () => Promise<boolean> = () => Promise.resolve(true);
  const remote: AccountAudioRemote = {
    snapshot: () => snapshot,
    observe(listener) { listeners.add(listener); return () => listeners.delete(listener); },
    save(volumes) { sent.push(volumes); return answer(); },
  };
  return {
    remote, sent,
    answerWith(next: () => Promise<boolean>) { answer = next; },
    publish(next: AccountAudioSnapshot) {
      snapshot = next;
      for (const listener of listeners) listener(next);
    },
  };
}

/** A clock the test advances by hand, so debounce is checked without real time. */
function fakeClock() {
  let now = 0;
  let nextId = 1;
  const timers = new Map<number, { at: number; callback: () => void }>();
  return {
    schedule: (callback: () => void, delayMs: number) => { const id = nextId++; timers.set(id, { at: now + delayMs, callback }); return id; },
    cancel: (timer: unknown) => { timers.delete(timer as number); },
    async advance(ms: number) {
      const until = now + ms;
      for (;;) {
        const due = [...timers.entries()].filter(([, timer]) => timer.at <= until).sort((a, b) => a[1].at - b[1].at)[0];
        if (!due) break;
        timers.delete(due[0]);
        now = due[1].at;
        due[1].callback();
        await Promise.resolve();
        await Promise.resolve();
      }
      now = until;
      await Promise.resolve();
      await Promise.resolve();
    },
    pending: () => timers.size,
  };
}

function setup(options: { local?: AudioVolumes; snapshot?: AccountAudioSnapshot; storage?: MemoryStorage } = {}) {
  const storage = options.storage ?? new MemoryStorage();
  const clock = fakeClock();
  const remote = fakeRemote(options.snapshot);
  const device = { volumes: options.local ?? { musicVolume: .35, sfxVolume: .35 } };
  const apply = vi.fn((volumes: AudioVolumes) => { device.volumes = volumes; });
  const warn = vi.fn();
  const sync = createAccountAudioSync({
    remote: remote.remote, local: () => device.volumes, apply, unsyncedKey: KEY, storage,
    schedule: clock.schedule, cancel: clock.cancel, warn,
  });
  const change = (channel: "music" | "sfx", value: number) => {
    device.volumes = { ...device.volumes, [channel === "music" ? "musicVolume" : "sfxVolume"]: value };
    sync.localChanged(channel);
  };
  return { storage, clock, remote, device, apply, warn, sync, change };
}

describe("account audio sync", () => {
  it("applies the account's volumes when the subscription settles", async () => {
    const t = setup({ local: { musicVolume: .35, sfxVolume: .35 } });
    t.remote.publish({ loaded: true, volumes: { musicVolume: .1, sfxVolume: .9 } });
    expect(t.apply).toHaveBeenCalledWith({ musicVolume: .1, sfxVolume: .9 });
    await t.clock.advance(5_000);
    // Applying the account's copy never sends it straight back.
    expect(t.remote.sent).toEqual([]);
  });

  it("applies a snapshot that was already loaded before the game bundle started", () => {
    const t = setup({ snapshot: { loaded: true, volumes: { musicVolume: 0, sfxVolume: .5 } } });
    expect(t.apply).toHaveBeenCalledWith({ musicVolume: 0, sfxVolume: .5 });
  });

  it("does nothing when the account already matches, including f32 rounding", async () => {
    const t = setup({ local: { musicVolume: .35, sfxVolume: .7 } });
    t.remote.publish({ loaded: true, volumes: { musicVolume: Math.fround(.35), sfxVolume: Math.fround(.7) } });
    expect(t.apply).not.toHaveBeenCalled();
    await t.clock.advance(5_000);
    expect(t.remote.sent).toEqual([]);
  });

  it("uploads this device's volumes once when the account has none", async () => {
    const t = setup({ local: { musicVolume: .2, sfxVolume: .6 } });
    t.remote.publish({ loaded: true, volumes: null });
    await t.clock.advance(0);
    expect(t.remote.sent).toEqual([{ musicVolume: .2, sfxVolume: .6 }]);
    // The insert comes back through the subscription; that is not a new change.
    t.remote.publish({ loaded: true, volumes: { musicVolume: Math.fround(.2), sfxVolume: Math.fround(.6) } });
    await t.clock.advance(5_000);
    expect(t.remote.sent).toHaveLength(1);
    expect(t.apply).not.toHaveBeenCalled();
    expect(t.storage.getItem(KEY)).toBeNull();
  });

  it("retries the first upload until the session is ready to accept it", async () => {
    const t = setup({ local: { musicVolume: .2, sfxVolume: .6 } });
    let ready = false;
    t.remote.answerWith(() => Promise.resolve(ready));
    t.remote.publish({ loaded: true, volumes: null });
    await t.clock.advance(0);
    expect(t.remote.sent).toHaveLength(1);
    ready = true;
    await t.clock.advance(1_000);
    expect(t.remote.sent).toHaveLength(2);
    expect(t.storage.getItem(KEY)).toBeNull();
  });

  it("debounces slider releases into one send of the final value", async () => {
    const t = setup();
    t.remote.publish({ loaded: true, volumes: { musicVolume: .35, sfxVolume: .35 } });
    t.change("music", .4);
    await t.clock.advance(500);
    t.change("music", .5);
    await t.clock.advance(500);
    t.change("sfx", .8);
    await t.clock.advance(999);
    expect(t.remote.sent).toEqual([]);
    await t.clock.advance(1);
    expect(t.remote.sent).toEqual([{ musicVolume: .5, sfxVolume: .8 }]);
  });

  it("never sends while a slider is only being dragged", async () => {
    const t = setup();
    t.remote.publish({ loaded: true, volumes: { musicVolume: .35, sfxVolume: .35 } });
    for (const value of [.36, .4, .5, .6]) {
      t.device.volumes = { ...t.device.volumes, musicVolume: value };
      t.sync.localEditing("music");
    }
    await t.clock.advance(5_000);
    expect(t.remote.sent).toEqual([]);
  });

  it("skips the send when a change ends where the account already is", async () => {
    const t = setup();
    t.remote.publish({ loaded: true, volumes: { musicVolume: .35, sfxVolume: .35 } });
    t.change("music", .9);
    t.change("music", .35);
    await t.clock.advance(2_000);
    expect(t.remote.sent).toEqual([]);
    expect(t.storage.getItem(KEY)).toBeNull();
  });

  it("does not bounce its own saved value back into the settings", async () => {
    const t = setup();
    t.remote.publish({ loaded: true, volumes: { musicVolume: .35, sfxVolume: .35 } });
    t.change("music", .6);
    await t.clock.advance(1_000);
    expect(t.remote.sent).toEqual([{ musicVolume: .6, sfxVolume: .35 }]);
    t.remote.publish({ loaded: true, volumes: { musicVolume: Math.fround(.6), sfxVolume: Math.fround(.35) } });
    await t.clock.advance(5_000);
    expect(t.apply).not.toHaveBeenCalled();
    expect(t.remote.sent).toHaveLength(1);
  });

  it("keeps a newer local change when an older save echoes back", async () => {
    const t = setup();
    t.remote.publish({ loaded: true, volumes: { musicVolume: .35, sfxVolume: .35 } });
    t.change("music", .6);
    await t.clock.advance(1_000);
    t.change("music", .8);
    t.remote.publish({ loaded: true, volumes: { musicVolume: .6, sfxVolume: .35 } });
    expect(t.apply).not.toHaveBeenCalled();
    await t.clock.advance(1_000);
    expect(t.remote.sent.at(-1)).toEqual({ musicVolume: .8, sfxVolume: .35 });
  });

  it("lets another device's change through for channels this device has not touched", async () => {
    const t = setup();
    t.remote.publish({ loaded: true, volumes: { musicVolume: .35, sfxVolume: .35 } });
    t.change("music", .6);
    t.remote.publish({ loaded: true, volumes: { musicVolume: .1, sfxVolume: .9 } });
    expect(t.apply).toHaveBeenCalledWith({ musicVolume: .6, sfxVolume: .9 });
    await t.clock.advance(1_000);
    expect(t.remote.sent).toEqual([{ musicVolume: .6, sfxVolume: .9 }]);
  });

  it("keeps a change made offline and sends it on the next login", async () => {
    const storage = new MemoryStorage();
    const offline = setup({ storage, local: { musicVolume: .35, sfxVolume: .35 } });
    offline.change("sfx", 0);
    await offline.clock.advance(5_000);
    expect(offline.remote.sent).toEqual([]);
    expect(readUnsyncedAudio(KEY, storage)).toEqual(new Set(["sfx"]));

    // A reload later, the account still holds the old value.
    const online = setup({ storage, local: { musicVolume: .35, sfxVolume: 0 } });
    online.remote.publish({ loaded: true, volumes: { musicVolume: .5, sfxVolume: .35 } });
    expect(online.apply).toHaveBeenCalledWith({ musicVolume: .5, sfxVolume: 0 });
    await online.clock.advance(0);
    expect(online.remote.sent).toEqual([{ musicVolume: .5, sfxVolume: 0 }]);
    expect(storage.getItem(KEY)).toBeNull();
  });

  it("honours the sign-in screen's mute over the account's copy", async () => {
    const storage = new MemoryStorage();
    markUnsyncedAudio(KEY, "music", storage);
    const t = setup({ storage, local: { musicVolume: 0, sfxVolume: .35 } });
    t.remote.publish({ loaded: true, volumes: { musicVolume: .7, sfxVolume: .2 } });
    expect(t.apply).toHaveBeenCalledWith({ musicVolume: 0, sfxVolume: .2 });
    await t.clock.advance(0);
    expect(t.remote.sent).toEqual([{ musicVolume: 0, sfxVolume: .2 }]);
  });

  it("stays local-only without a connection, and a failed save never throws", async () => {
    const storage = new MemoryStorage();
    const apply = vi.fn();
    const clock = fakeClock();
    const offline = createAccountAudioSync({ remote: null, local: () => ({ musicVolume: .2, sfxVolume: .2 }), apply, unsyncedKey: KEY, storage, schedule: clock.schedule, cancel: clock.cancel });
    expect(() => offline.localChanged("music")).not.toThrow();
    await clock.advance(5_000);
    expect(apply).not.toHaveBeenCalled();

    const t = setup();
    t.remote.publish({ loaded: true, volumes: { musicVolume: .35, sfxVolume: .35 } });
    t.remote.answerWith(() => Promise.reject(new Error("Wildstat updated.")));
    t.change("music", .6);
    await t.clock.advance(60_000);
    // Bounded retries, each logged rather than thrown into the UI.
    expect(t.remote.sent.length).toBeGreaterThan(1);
    expect(t.remote.sent.length).toBeLessThanOrEqual(10);
    expect(t.warn).toHaveBeenCalled();
    expect(t.clock.pending()).toBe(0);
  });

  it("does not send until the subscription has settled", async () => {
    const t = setup();
    t.change("music", .6);
    await t.clock.advance(5_000);
    expect(t.remote.sent).toEqual([]);
    t.remote.publish({ loaded: true, volumes: { musicVolume: .35, sfxVolume: .35 } });
    await t.clock.advance(0);
    expect(t.remote.sent).toEqual([{ musicVolume: .6, sfxVolume: .35 }]);
  });
});
