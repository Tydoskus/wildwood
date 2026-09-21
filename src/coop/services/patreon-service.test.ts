import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { createPatreonService } from "./patreon-service";
import { updateAvatarFrame } from "../../app/avatar-frames";
import type { PatreonStatus } from "../../../shared/avatar-frames";

vi.mock("../../app/avatar-frames", () => ({ applyAvatarFrame: vi.fn(), configureAvatarFrames: vi.fn(), updateAvatarFrame: vi.fn() }));
const silver: PatreonStatus = { configured: true, linked: true, tier: "silver", frame: "silver", validUntilMs: 9999999999999 };
beforeEach(() => {
  vi.useFakeTimers(); vi.clearAllMocks();
  vi.stubGlobal("window", new EventTarget());
  vi.stubGlobal("document", Object.assign(new EventTarget(), { hidden: false }));
});
afterEach(() => { vi.clearAllTimers(); vi.useRealTimers(); vi.unstubAllGlobals(); });
function setup() {
  const refresh = vi.fn(async () => JSON.stringify(silver));
  const connection = { isActive: true, procedures: { refreshPatreonMembership: refresh } };
  const service = createPatreonService({ connection: () => connection, protocolBlocked: () => false } as any, () => "a".repeat(64));
  service.sync();
  return { service, refresh };
}

it("applies an upgraded frame on return without opening the picker and coalesces focus events", async () => {
  const { service, refresh } = setup();
  await vi.advanceTimersByTimeAsync(0);
  refresh.mockResolvedValue(JSON.stringify({ ...silver, tier: "gold", frame: "gold" }));
  window.dispatchEvent(new Event("focus"));
  document.dispatchEvent(new Event("visibilitychange"));
  await vi.advanceTimersByTimeAsync(0);
  expect(refresh).toHaveBeenCalledTimes(2);
  expect(updateAvatarFrame).toHaveBeenLastCalledWith(expect.objectContaining({ frame: "gold" }));
  service.clear();
});

it("checks once more after the verification limit, then stops when the session clears", async () => {
  const { service, refresh } = setup();
  await vi.advanceTimersByTimeAsync(0);
  window.dispatchEvent(new Event("focus"));
  await vi.advanceTimersByTimeAsync(0);
  refresh.mockResolvedValue(JSON.stringify({ ...silver, tier: "gold", frame: "gold" }));
  await vi.advanceTimersByTimeAsync(65_000);
  expect(refresh).toHaveBeenCalledTimes(3);
  expect(updateAvatarFrame).toHaveBeenLastCalledWith(expect.objectContaining({ frame: "gold" }));
  service.clear();
  window.dispatchEvent(new Event("focus"));
  await vi.advanceTimersByTimeAsync(60 * 60_000);
  expect(refresh).toHaveBeenCalledTimes(3);
});

it("ignores a membership response arriving after sign-out and does not restart polling", async () => {
  const { service, refresh } = setup();
  await vi.advanceTimersByTimeAsync(0);
  let finish!: (value: string) => void;
  refresh.mockImplementationOnce(() => new Promise(resolve => { finish = resolve; }));
  window.dispatchEvent(new Event("focus"));
  service.clear(); vi.mocked(updateAvatarFrame).mockClear();
  finish(JSON.stringify(silver));
  await vi.advanceTimersByTimeAsync(60 * 60_000);
  expect(updateAvatarFrame).not.toHaveBeenCalled();
  expect(refresh).toHaveBeenCalledTimes(2);
});

it("reports the last verified tier synchronously, and none once the session is cleared", async () => {
  const { service } = setup();
  expect(service.api.supporterTier()).toBe("none");
  await vi.advanceTimersByTimeAsync(1);            // the sync's status check resolves; the 30-minute refresh is left ticking
  expect(service.api.supporterTier()).toBe("silver");
  service.clear();
  expect(service.api.supporterTier()).toBe("none");
});
