import { afterEach, describe, expect, it, vi } from "vitest";
import { parseHTML } from "linkedom";
import { HOME_TELEPORT_COMBAT_LOCK_MS, bindHomeTeleportButton, noteCombat } from "./home-teleport-button";

function setup(teleport: () => Promise<boolean>) {
  const { document, Event } = parseHTML('<button id="home">Home</button>');
  const button = document.querySelector("button")! as unknown as HTMLButtonElement;
  const showFailure = vi.fn();
  bindHomeTeleportButton(button, { beforeTeleport: vi.fn(), teleport, showFailure });
  return { button, showFailure, click: () => button.dispatchEvent(new Event("click")) };
}

afterEach(() => vi.useRealTimers());

describe("Home toolbar cooldown", () => {
  it("blocks repeat clicks while teleporting and for five seconds after success", async () => {
    vi.useFakeTimers();
    let finish!: (changed: boolean) => void;
    const teleport = vi.fn(() => new Promise<boolean>(resolve => { finish = resolve; }));
    const { button, click } = setup(teleport);
    click(); click();
    expect(teleport).toHaveBeenCalledTimes(1);
    await vi.advanceTimersByTimeAsync(6_000);
    expect(button.disabled).toBe(true);
    finish(true);
    await vi.advanceTimersByTimeAsync(0);
    const countdown = button.querySelector<HTMLElement>(".home-teleport-cooldown")!;
    expect(countdown.hidden).toBe(false);
    expect(countdown.textContent).toBe("5");
    await vi.advanceTimersByTimeAsync(1_000);
    expect(countdown.textContent).toBe("4");
    expect(button.title).toBe("Teleport ready in 4s");
    await vi.advanceTimersByTimeAsync(3_999);
    click();
    expect(teleport).toHaveBeenCalledTimes(1);
    await vi.advanceTimersByTimeAsync(1);
    expect(button.disabled).toBe(false);
    expect(countdown.hidden).toBe(true);
    expect(button.classList.contains("is-home-cooldown")).toBe(false);
    click();
    expect(teleport).toHaveBeenCalledTimes(2);
  });

  it.each([false, new Error("offline")])("allows immediate retries after an unsuccessful teleport: %s", async result => {
    const teleport = vi.fn(async () => {
      if (result instanceof Error) throw result;
      return result;
    });
    const { button, click, showFailure } = setup(teleport);
    click();
    await Promise.resolve();
    expect(button.disabled).toBe(false);
    expect(showFailure).toHaveBeenCalledWith(result instanceof Error);
    expect(button.querySelector<HTMLElement>(".home-teleport-cooldown")!.hidden).toBe(true);
    click();
    expect(teleport).toHaveBeenCalledTimes(2);
  });
});

describe("Home teleport combat lock", () => {
  afterEach(() => noteCombat(-1e12));   // leave no lock behind for other tests

  function locked(atHome = false) {
    vi.useFakeTimers({ toFake: ["setTimeout", "clearTimeout", "performance", "Date"] });
    const { document, Event } = parseHTML('<button id="home">Home</button>');
    const button = document.querySelector("button")! as unknown as HTMLButtonElement;
    const teleport = vi.fn(async () => true), showBlocked = vi.fn();
    bindHomeTeleportButton(button, { beforeTeleport: vi.fn(), teleport, showFailure: vi.fn(), atHome: () => atHome, showBlocked });
    return { button, teleport, showBlocked, click: () => button.dispatchEvent(new Event("click")),
      countdown: () => button.querySelector<HTMLElement>(".home-teleport-cooldown")! };
  }

  it("holds the way home for thirty seconds after a blow, counting down, and a new blow starts it again", async () => {
    const s = locked();
    noteCombat();
    expect(s.button.classList.contains("is-home-combat")).toBe(true);
    expect(s.countdown().textContent).toBe("30");
    s.click();
    expect(s.teleport).not.toHaveBeenCalled();
    expect(s.showBlocked).toHaveBeenCalledWith("LEAVE COMBAT TO GO HOME · 30s");
    await vi.advanceTimersByTimeAsync(20_000);
    expect(s.countdown().textContent).toBe("10");
    noteCombat();   // hit again
    await vi.advanceTimersByTimeAsync(HOME_TELEPORT_COMBAT_LOCK_MS - 1);
    s.click();
    expect(s.teleport).not.toHaveBeenCalled();
    await vi.advanceTimersByTimeAsync(251);
    expect(s.button.classList.contains("is-home-combat")).toBe(false);
    expect(s.countdown().hidden).toBe(true);
    s.click();
    await vi.advanceTimersByTimeAsync(0);
    expect(s.teleport).toHaveBeenCalledOnce();
  });

  it("never holds the way back out from home", async () => {
    const s = locked(true);
    noteCombat();
    expect(s.button.classList.contains("is-home-combat")).toBe(false);
    s.click();
    await vi.advanceTimersByTimeAsync(0);
    expect(s.teleport).toHaveBeenCalledOnce();
    expect(s.showBlocked).not.toHaveBeenCalled();
  });
});
