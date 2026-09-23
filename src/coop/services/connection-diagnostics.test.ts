import { describe, expect, it, vi } from "vitest";
import { createConnectionDiagnostics } from "./connection-diagnostics";
import { normalizeConnectionDiagnostic, safeDiagnosticText } from "../../../shared/connection-diagnostics";
const owner = "a".repeat(64);
function memory() { const data = new Map<string, string>(); return { getItem: (key: string) => data.get(key) ?? null, setItem: (key: string, value: string) => { data.set(key, value); }, removeItem: (key: string) => { data.delete(key); } }; }
function fixture() {
  let identity = owner; let available = false; const storage = memory();
  const submit = vi.fn(async (_payload: string) => {});
  const options = { storage, storageKey: "test", now: () => 10000,
    snapshot: () => ({ owner: identity, clientVersion: "0.685", mapId: "samurai_garden", transport: "account" }),
    submit: () => available ? submit : null };
  return { options, submit, setOwner: (v: string) => { identity = v; }, connect: () => { available = true; } };
}
describe("connection diagnostic delivery", () => {
  it("persists a disconnect through reload and uploads only after reconnecting", async () => {
    const f = fixture(); const collector = createConnectionDiagnostics(f.options);
    collector.record("socket-close", { code: 1006, mapAgeMs: 900000 });
    await collector.flush(); expect(f.submit).not.toHaveBeenCalled();
    const reloaded = createConnectionDiagnostics(f.options); f.connect(); await reloaded.flush();
    expect(JSON.parse(f.submit.mock.calls[0][0])[0]).toMatchObject({ code: 1006, mapAgeMs: 900000, mapId: "samurai_garden" });
    expect(reloaded.pending()).toBe(0);
  });
  it("never attributes an old player's queued events to a different account", async () => {
    const f = fixture(); const collector = createConnectionDiagnostics(f.options);
    collector.record("socket-close"); f.setOwner("b".repeat(64)); f.connect(); await collector.flush();
    expect(f.submit).not.toHaveBeenCalled(); expect(collector.pending()).toBe(1);
    f.setOwner(owner); await collector.flush(); expect(f.submit).toHaveBeenCalledOnce();
  });
  it("delivers a carried event with whichever player connects next, through a reload", async () => {
    const f = fixture(); f.setOwner(""); const collector = createConnectionDiagnostics(f.options);
    collector.record("session-blocked", { detail: "sign-in-return:success" }, true);
    collector.record("page-hidden");
    expect(collector.pending()).toBe(1);
    f.setOwner("b".repeat(64)); f.connect();
    await createConnectionDiagnostics(f.options).flush();
    expect(JSON.parse(f.submit.mock.calls[0][0])).toMatchObject([{ detail: "sign-in-return:success" }]);
  });
  it("keeps failed uploads and retries with the same event IDs", async () => {
    const f = fixture(); const collector = createConnectionDiagnostics(f.options); f.connect();
    collector.record("socket-close"); f.submit.mockRejectedValueOnce(new Error("offline"));
    await collector.flush(); expect(collector.pending()).toBe(1);
    await collector.flush(); expect(f.submit.mock.calls[0][0]).toBe(f.submit.mock.calls[1][0]); expect(collector.pending()).toBe(0);
  });
  it("bounds the queue, batches delivery, and preserves events recorded during upload", async () => {
    const f = fixture(); const collector = createConnectionDiagnostics(f.options); f.connect();
    for (let n = 0; n < 90; n++) collector.record("socket-close", { detail: `event-${n}` });
    expect(collector.pending()).toBe(80);
    let finish!: () => void;
    f.submit.mockImplementationOnce(() => new Promise<void>(resolve => { finish = resolve; }));
    const flush = collector.flush(); collector.record("title-screen"); finish(); await flush;
    expect(JSON.parse(f.submit.mock.calls[0][0])).toHaveLength(12);
    expect(collector.pending()).toBe(68);
    await collector.flush(); expect(collector.pending()).toBe(56);
  });
  it("sanitizes sensitive error text and discards unknown fields", () => {
    const text = safeDiagnosticText('failed https://auth.example/?token=secret Bearer abc token=foo user@example.com eyJabc.eyJdef.sig');
    expect(text).not.toMatch(/secret|abc|foo|user@example|eyJ/);
    const sample = normalizeConnectionDiagnostic({ eventId: "abcdefgh", kind: "socket-close", token: "private", detail: "ok", code: Infinity });
    expect(sample).not.toHaveProperty("token"); expect(sample?.code).toBe(0);
  });
});
