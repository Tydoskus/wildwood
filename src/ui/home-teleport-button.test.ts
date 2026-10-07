import { afterEach, describe, expect, it, vi } from "vitest";
import { parseHTML } from "linkedom";
import { CHAT_CLOSED_EVENT, HOME_TELEPORT_CHAT_CLOSE_HOLD_MS, bindHomeTeleportButton } from "./home-teleport-button";

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
    expect(button.title).toBe("Teleport ready in 00:04");
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

describe("Home teleport hold after chat closes", () => {
  function held() {
    vi.useFakeTimers({ toFake: ["setTimeout", "clearTimeout", "performance", "Date"] });
    const { window, document, Event } = parseHTML('<button id="home">Home</button>');
    const button = document.querySelector("button")! as unknown as HTMLButtonElement;
    const teleport = vi.fn(async () => true), showBlocked = vi.fn();
    bindHomeTeleportButton(button, { beforeTeleport: vi.fn(), teleport, showFailure: vi.fn(), showBlocked });
    return { teleport, showBlocked, click: () => button.dispatchEvent(new Event("click")),
      closeChat: () => window.dispatchEvent(new Event(CHAT_CLOSED_EVENT)),
      countdown: () => button.querySelector<HTMLElement>(".home-teleport-cooldown")! };
  }

  it("ignores taps for three seconds after chat closes, saying so only when tapped", async () => {
    const s = held();
    s.closeChat();
    expect(s.countdown().hidden).toBe(true);
    s.click();
    expect(s.teleport).not.toHaveBeenCalled();
    expect(s.showBlocked).toHaveBeenCalledWith("TOWN READY IN 00:03");
    await vi.advanceTimersByTimeAsync(HOME_TELEPORT_CHAT_CLOSE_HOLD_MS - 1);
    s.click();
    expect(s.teleport).not.toHaveBeenCalled();
    await vi.advanceTimersByTimeAsync(1);
    s.click();
    await vi.advanceTimersByTimeAsync(0);
    expect(s.teleport).toHaveBeenCalledOnce();
  });

  it("goes straight home when chat was not just closed", async () => {
    const s = held();
    s.click();
    await vi.advanceTimersByTimeAsync(0);
    expect(s.teleport).toHaveBeenCalledOnce();
    expect(s.showBlocked).not.toHaveBeenCalled();
  });
});

describe("Town toolbar teleport", () => {
  it("reads Town away from the Town and Fight in it, never Base or Home", async () => {
    const { homeTeleportLook, paintHomeTeleportButton } = await import("./home-teleport-button");
    expect(homeTeleportLook("tutorial_forest")).toMatchObject({ label: "Town", ariaLabel: "Teleport to Town" });
    expect(homeTeleportLook("soul_dimension").label).toBe("Town");
    expect(homeTeleportLook("town")).toMatchObject({ label: "Fight", ariaLabel: "Return to enemy map" });
    // Home is retired: being there is not being at the hub.
    expect(homeTeleportLook("home_exterior").label).toBe("Town");
    const { document } = parseHTML('<button><img class="toolbar-icon" src=""><span class="toolbar-label">Base</span></button>');
    const button = document.querySelector("button")! as unknown as HTMLButtonElement;
    paintHomeTeleportButton(button, "beginner_desert");
    expect(button.querySelector(".toolbar-label")!.textContent).toBe("Town");
    paintHomeTeleportButton(button, "town");
    expect(button.querySelector(".toolbar-label")!.textContent).toBe("Fight");
    expect(button.querySelector("img")!.getAttribute("src")).toContain("Icon_AutoFarm");
  });
});
