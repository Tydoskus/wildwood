import { afterEach, expect, it, vi } from "vitest";
import { MULTIPLAYER_SEND_TIMEOUT_MS, createMultiplayerSync } from "./multiplayer-sync";
afterEach(() => vi.useRealTimers());
const settle = async () => { await Promise.resolve(); await Promise.resolve(); };

it("sends one state per session/change and no repeated network polling", async () => {
  let session: object | null = null;
  const send = vi.fn(async () => {});
  const sync = createMultiplayerSync({ session: () => session, send });
  sync.setEnabled(true); expect(send).not.toHaveBeenCalled();
  session = {}; sync.sync(); await settle();
  for (let i = 0; i < 100; i++) sync.sync();
  expect(send.mock.calls).toEqual([[true]]);
  sync.setEnabled(false); await settle();
  expect(send.mock.calls).toEqual([[true], [false]]);
  session = {}; sync.sync(); await settle();
  expect(send.mock.calls).toEqual([[true], [false], [false]]);
});

it("coalesces rapid changes and ignores old connection acknowledgements", async () => {
  let session: object = {};
  const pending: (() => void)[] = [];
  const send = vi.fn(() => new Promise<void>(resolve => pending.push(resolve)));
  const sync = createMultiplayerSync({ session: () => session, send });
  sync.setEnabled(true); sync.setEnabled(false);
  expect(send).toHaveBeenCalledTimes(1);
  session = {}; sync.sync();
  pending[0](); await settle();
  expect(send).toHaveBeenCalledTimes(2);
  pending[1](); await settle(); sync.sync();
  expect(send.mock.calls).toEqual([[true], [false]]);
});

it("backs off failed or cooldown-limited changes instead of spamming reducers", async () => {
  vi.useFakeTimers();
  const session = {}, send = vi.fn().mockRejectedValueOnce(new Error("cooldown")).mockResolvedValue(undefined);
  const sync = createMultiplayerSync({ session: () => session, send });
  sync.setEnabled(true); await settle();
  for (let i = 0; i < 20; i++) sync.sync();
  expect(send).toHaveBeenCalledTimes(1);
  vi.advanceTimersByTime(4_999); sync.sync();
  expect(send).toHaveBeenCalledTimes(1);
  vi.advanceTimersByTime(1); sync.sync(); await settle();
  expect(send).toHaveBeenCalledTimes(2);
});

it("sends again when an answer arrives while the session blips, instead of waiting on it for good", async () => {
  const connection = {};
  let session: object | null = connection;
  const pending: (() => void)[] = [];
  const send = vi.fn(() => new Promise<void>(resolve => pending.push(resolve)));
  const sync = createMultiplayerSync({ session: () => session, send });
  sync.setEnabled(true);
  // A world re-entry clears the session for a moment, just as the answer lands.
  session = null; pending[0](); await settle(); session = connection;
  sync.sync();
  expect(send.mock.calls).toEqual([[true], [true]]);
  pending[1](); await settle();
  for (let i = 0; i < 10; i++) sync.sync();
  expect(send).toHaveBeenCalledTimes(2);
});

it("gives up a send that is never answered and sends the state again", async () => {
  vi.useFakeTimers();
  const session = {}, send = vi.fn(() => new Promise<void>(() => {}));
  const sync = createMultiplayerSync({ session: () => session, send });
  sync.setEnabled(true);
  vi.advanceTimersByTime(MULTIPLAYER_SEND_TIMEOUT_MS - 1); sync.sync();
  expect(send).toHaveBeenCalledTimes(1);
  vi.advanceTimersByTime(1); sync.sync();
  expect(send.mock.calls).toEqual([[true], [true]]);
});
