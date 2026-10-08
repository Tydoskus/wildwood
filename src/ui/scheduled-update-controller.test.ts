import { afterEach, describe, expect, it, vi } from "vitest";
import { createScheduledUpdateController } from "./scheduled-update-controller";
import type { ReleaseWindow } from "../../shared/release-window";
function fixture() {
  let now = 1000;
  let release: ReleaseWindow | null = { id: "release-1", version: "0.696", phase: "scheduled", startsAt: 301000, expiresAt: 391000, updatedAt: 1000, reload: true };
  const d = { now: () => now, release: () => release, playing: () => true,
    pause: vi.fn(), save: vi.fn(), drain: vi.fn(async () => true), acknowledge: vi.fn(async () => {}),
    rememberSession: vi.fn(() => true), render: vi.fn(), checkVersion: vi.fn() };
  return { d, controller: createScheduledUpdateController(d), time: (value: number) => { now = value; },
    phase: (phase: ReleaseWindow["phase"]) => { release = { ...release!, phase }; }, clear: () => { release = null; } };
}
const settle = async () => { for (let i = 0; i < 10; i++) await Promise.resolve(); };
afterEach(() => vi.useRealTimers());
describe("planned update handoff", () => {
  it("counts down locally without saving or pausing gameplay", () => {
    const f = fixture(); f.controller.tick();
    expect(f.d.render).toHaveBeenLastCalledWith({ text: "Update in 5:00", blocking: false, urgent: false });
    f.time(291000); f.controller.tick();
    expect(f.d.render).toHaveBeenLastCalledWith({ text: "Update in 0:10", blocking: false, urgent: true });
    expect(f.d.drain).not.toHaveBeenCalled(); expect(f.d.pause).not.toHaveBeenCalled();
    expect(f.controller.canReload()).toBe(false);
  });
  it("pauses before saving and acknowledges only after the save succeeds", async () => {
    const f = fixture(); f.phase("draining");
    let saved!: (value: boolean) => void;
    f.d.drain.mockImplementation(() => new Promise(resolve => { saved = resolve; }));
    f.controller.tick();
    expect(f.d.pause).toHaveBeenCalledWith(true); expect(f.d.acknowledge).not.toHaveBeenCalled();
    saved(true); await settle();
    expect(f.d.acknowledge).toHaveBeenCalledExactlyOnceWith("release-1");
    f.controller.tick(); await settle(); expect(f.d.drain).toHaveBeenCalledOnce();
    f.phase("complete"); f.controller.tick();
    expect(f.d.pause).toHaveBeenLastCalledWith(false); expect(f.d.checkVersion).toHaveBeenCalledOnce();
  });
  it("retries failed saves and never falsely acknowledges", async () => {
    const f = fixture(); f.phase("draining"); f.d.drain.mockResolvedValueOnce(false);
    f.controller.tick(); await settle(); expect(f.d.acknowledge).not.toHaveBeenCalled();
    f.time(4000); f.controller.tick(); await settle(); expect(f.d.acknowledge).toHaveBeenCalledOnce();
  });
  it.each(["cancelled", "expired"])("releases gameplay on %s, including a late save reply", async kind => {
    const f = fixture(); f.phase("draining"); let saved!: (value: boolean) => void;
    f.d.drain.mockImplementation(() => new Promise(resolve => { saved = resolve; }));
    f.controller.tick();
    if (kind === "expired") f.time(400000); else f.phase("cancelled");
    f.controller.tick(); saved(true); await settle();
    expect(f.d.pause).toHaveBeenLastCalledWith(false); expect(f.d.acknowledge).not.toHaveBeenCalled();
    expect(f.controller.canReload()).toBe(true);
  });
  it("waits for saves and a recorded session before allowing a normal reload", async () => {
    const f = fixture(); f.clear();
    f.d.drain.mockResolvedValueOnce(false);
    expect(await f.controller.prepareReload("0.696")).toBe(false);
    expect(f.d.rememberSession).not.toHaveBeenCalled();
    expect(await f.controller.prepareReload("0.696")).toBe(true);
    expect(f.d.rememberSession).toHaveBeenCalledWith("0.696");
  });
  it("times out a stalled save without trapping the player or reloading", async () => {
    vi.useFakeTimers(); const f = fixture(); f.clear(); f.d.drain.mockReturnValue(new Promise(() => {}));
    const result = f.controller.prepareReload("0.696");
    await vi.advanceTimersByTimeAsync(10001);
    expect(await result).toBe(false); expect(f.d.pause).toHaveBeenLastCalledWith(false);
  });
});

it("uses the existing update screen and preserves its independent protocol gate", async () => {
  const { parseHTML } = await import("linkedom");
  const { createScheduledUpdateView } = await import("./scheduled-update-controller");
  const { document } = parseHTML('<html><body><div id="gameUpdateGate" hidden>Game Updating</div></body></html>');
  const render = createScheduledUpdateView(document as unknown as Document);
  const gate = document.getElementById("gameUpdateGate")!;
  render({ text: "Saving progress…", blocking: true, urgent: false });
  expect(gate.hasAttribute("data-scheduled-update")).toBe(true);
  expect(document.querySelector(".scheduled-update")!.hasAttribute("hidden")).toBe(true);
  render({ text: "", blocking: false, urgent: false });
  expect(gate.hasAttribute("data-scheduled-update")).toBe(false);
  expect(gate.hasAttribute("hidden")).toBe(true);
  gate.removeAttribute("hidden");
  render({ text: "Update in 2:00", blocking: false, urgent: false });
  expect(gate.hasAttribute("hidden")).toBe(false);
});
