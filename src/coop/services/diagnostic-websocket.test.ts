import { afterEach, describe, expect, it, vi } from "vitest";
import { gzipSync } from "node:zlib";
import { diagnosticWebSocket } from "./diagnostic-websocket";
class FakeSocket extends EventTarget {
  static latest: FakeSocket;
  protocol = "v1.bsatn.spacetimedb"; readyState = 1; binaryType = "";
  onclose: ((e: CloseEvent) => void) | null = null;
  onopen: (() => void) | null = null;
  onerror: ((e: Event) => void) | null = null;
  onmessage: ((e: { data: ArrayBuffer }) => Promise<void>) | null = null;
  close = vi.fn(); send = vi.fn();
  constructor(readonly url: string, readonly protocols: string[]) { super(); FakeSocket.latest = this; }
  emitClose(code: number, reason: string) {
    const event = Object.assign(new Event("close"), { code, reason, wasClean: code === 1000 }) as CloseEvent;
    this.dispatchEvent(event); this.onclose?.(event);
  }
}
const args = { url: new URL("wss://test.example"), wsProtocol: ["v1.bsatn.spacetimedb"], nameOrAddress: "test-db", compression: "gzip" as const, lightMode: false };
function setup() {
  vi.stubGlobal("WebSocket", FakeSocket); const record = vi.fn(), frameHandlerFailed = vi.fn();
  return { record, frameHandlerFailed, factory: diagnosticWebSocket(record, { transport: "account", database: "test-db", onFrameHandlerFailed: frameHandlerFailed }) };
}
afterEach(() => vi.unstubAllGlobals());
describe("diagnostic WebSocket", () => {
  it("preserves close codes/reasons before the SDK callback and marks requested closes", async () => {
    const { factory, record } = setup(); const adapter = await factory(args);
    const closed = vi.fn(() => expect(record).toHaveBeenCalledWith("socket-close", expect.objectContaining({ code: 1006, detail: "network gone", intentional: false })));
    adapter.onclose = closed; FakeSocket.latest.emitClose(1006, "network gone"); expect(closed).toHaveBeenCalledOnce();
    adapter.close(); FakeSocket.latest.emitClose(1000, "");
    expect(record).toHaveBeenLastCalledWith("socket-close", expect.objectContaining({ intentional: true, clean: true }));
  });
  it("passes raw and gzip SDK frames through unchanged", async () => {
    const { factory } = setup(); const adapter = await factory(args); const message = vi.fn(); adapter.onmessage = message;
    await FakeSocket.latest.onmessage?.({ data: new Uint8Array([0, 1, 2, 3]).buffer });
    const zipped = gzipSync(new Uint8Array([4, 5, 6]));
    await FakeSocket.latest.onmessage?.({ data: new Uint8Array([2, ...zipped]).buffer });
    expect([...message.mock.calls[0][0].data]).toEqual([1, 2, 3]); expect([...message.mock.calls[1][0].data]).toEqual([4, 5, 6]);
  });
  it("records malformed compressed frames and closes so reconnect can recover", async () => {
    const { factory, record } = setup(); const adapter = await factory(args); const message = vi.fn(); adapter.onmessage = message;
    await FakeSocket.latest.onmessage?.({ data: new Uint8Array([2, 0, 0]).buffer });
    expect(message).not.toHaveBeenCalled(); expect(record).toHaveBeenCalledWith("decompression-error", expect.any(Object)); expect(FakeSocket.latest.close).toHaveBeenCalledOnce();
  });
  it('delivers a compressed snapshot before the following raw update', async () => {
    const { factory } = setup(); const adapter = await factory(args);
    const received: number[] = []; adapter.onmessage = message => { received.push(message.data[0]); };
    const snapshot = gzipSync(new Uint8Array([1, ...new Uint8Array(100_000)]));
    const first = FakeSocket.latest.onmessage!({ data: new Uint8Array([2, ...snapshot]).buffer });
    const second = FakeSocket.latest.onmessage!({ data: new Uint8Array([0, 2]).buffer });
    const third = FakeSocket.latest.onmessage!({ data: new Uint8Array([0, 3]).buffer });
    await Promise.all([first, second, third]);
    expect(received).toEqual([1, 2, 3]);
  });
  it('discards queued frames after a decoding failure instead of applying later updates', async () => {
    const { factory, record } = setup(); const adapter = await factory(args);
    const message = vi.fn(); adapter.onmessage = message;
    await Promise.all([
      FakeSocket.latest.onmessage!({ data: new Uint8Array([2, 0, 0]).buffer }),
      FakeSocket.latest.onmessage!({ data: new Uint8Array([0, 2]).buffer }),
    ]);
    expect(message).not.toHaveBeenCalled();
    expect(FakeSocket.latest.close).toHaveBeenCalledOnce();
    expect(record).toHaveBeenCalledWith('decompression-error', expect.any(Object));
  });
  it('does not deliver an old snapshot after its connection is closed', async () => {
    const { factory } = setup(); const adapter = await factory(args);
    const message = vi.fn(); adapter.onmessage = message;
    const zipped = gzipSync(new Uint8Array(100_000));
    const pending = FakeSocket.latest.onmessage!({ data: new Uint8Array([2, ...zipped]).buffer });
    await Promise.resolve(); // Decoding is now in flight.
    adapter.close(); await pending;
    expect(message).not.toHaveBeenCalled();
  });
  it('closes once if the SDK rejects a frame, allowing the normal reconnect path', async () => {
    const { factory, record, frameHandlerFailed } = setup(); const adapter = await factory(args);
    const message = vi.fn(() => { throw new Error('Invalid SDK frame'); }); adapter.onmessage = message;
    await Promise.all([
      FakeSocket.latest.onmessage!({ data: new Uint8Array([0, 1]).buffer }),
      FakeSocket.latest.onmessage!({ data: new Uint8Array([0, 2]).buffer }),
    ]);
    expect(message).toHaveBeenCalledOnce();
    expect(FakeSocket.latest.close).toHaveBeenCalledOnce();
    expect(record).toHaveBeenCalledWith('lifecycle-failure', expect.objectContaining({ detail: 'frame-handler-failed: Invalid SDK frame' }));
    // The hook stays out of the diagnostic row and fires once per failed socket.
    expect(record.mock.calls.every(([, data]) => !('onFrameHandlerFailed' in data))).toBe(true);
    expect(frameHandlerFailed).toHaveBeenCalledOnce();
  });
  it("uses only the temporary WebSocket token and keeps status on exchange failures", async () => {
    const { factory, record } = setup();
    vi.stubGlobal("fetch", vi.fn().mockResolvedValueOnce({ ok: true, json: async () => ({ token: "temporary" }) }).mockResolvedValueOnce({ ok: false, status: 503, statusText: "Service Unavailable" }));
    await factory({ ...args, authToken: "private-credential" });
    expect(FakeSocket.latest.url).toContain("token=temporary"); expect(FakeSocket.latest.url).not.toContain("private-credential");
    await expect(factory({ ...args, authToken: "private-credential" })).rejects.toThrow("HTTP 503");
    expect(JSON.stringify(record.mock.calls)).not.toContain("private-credential");
  });
});

it("renews credentials before connecting and retries a 401 once without exposing tokens", async () => {
  const { record } = setup(); const resolve = vi.fn().mockResolvedValueOnce("current-id").mockResolvedValueOnce("renewed-id");
  const fetch = vi.fn().mockResolvedValueOnce({ ok: false, status: 401 }).mockResolvedValueOnce({ ok: true, json: async () => ({ token: "temporary" }) });
  vi.stubGlobal("fetch", fetch);
  await diagnosticWebSocket(record, { transport: "account", database: "test-db" }, resolve)({ ...args, authToken: "old-id" });
  expect(resolve.mock.calls).toEqual([["old-id", false], ["current-id", true]]);
  expect(fetch.mock.calls[1][1].headers.Authorization).toBe("Bearer renewed-id");
  expect(FakeSocket.latest.url).toContain("token=temporary");
  expect(JSON.stringify(record.mock.calls)).not.toContain("renewed-id");
});

it("cancels a stale portal connection while credential renewal is pending", async () => {
  setup(); let current = true; let finish!: (token: string) => void;
  const resolve = () => new Promise<string>(r => { finish = r; });
  const fetch = vi.fn(); vi.stubGlobal("fetch", fetch);
  const pending = diagnosticWebSocket(vi.fn(), { transport: "account", database: "test-db", isCurrent: () => current }, resolve)({ ...args, authToken: "old" });
  current = false; finish("renewed");
  await expect(pending).rejects.toThrow("superseded"); expect(fetch).not.toHaveBeenCalled();
});
