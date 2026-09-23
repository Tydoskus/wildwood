import { MIN_ATTACK_INTERVAL } from "../../shared/rules";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { createRuntimeHudController } from "./runtime-hud-controller";
import { renderPlayerHud } from "./hud";
vi.mock("./hud", () => ({ renderPlayerHud: vi.fn() }));

class TestElement {
  dataset: Record<string, string> = {};
  className = "";
  textContent = "";
  parentElement: TestElement | null = null;
  children: TestElement[] = [];
  private attributes = new Map<string, string>();
  private classes = new Set<string>();
  classList = {
    add: (name: string) => { this.classes.add(name); },
    remove: (name: string) => { this.classes.delete(name); },
    contains: (name: string) => this.classes.has(name),
    toggle: (name: string, value: boolean) => { if (value) this.classes.add(name); else this.classes.delete(name); },
  };
  style = {
    opacity: "",
    animation: "",
    color: "",
    setProperty: vi.fn(),
    removeProperty: vi.fn(),
  };

  get offsetWidth(): number {
    throw new Error("Reward updates must not force layout to restart an animation.");
  }

  setAttribute(name: string, value: string) { this.attributes.set(name, value); }
  getAttribute(name: string) { return this.attributes.get(name) ?? null; }
  querySelector(selector: string) {
    return this.children.find((child) => child.className === selector.slice(1)) ?? null;
  }
  append(...children: TestElement[]) {
    for (const child of children) {
      child.parentElement = this;
      this.children.push(child);
    }
  }
  appendChild = vi.fn((child: TestElement) => {
    this.append(child);
    return child;
  });
  remove = vi.fn(() => {
    if (!this.parentElement) return;
    const siblings = this.parentElement.children;
    siblings.splice(siblings.indexOf(this), 1);
    this.parentElement = null;
  });
  replaceChildren(...children: TestElement[]) {
    for (const child of [...this.children]) child.remove();
    this.append(...children);
  }
}

function setupHud() {
  const pickupLog = new TestElement();
  const player = { attackRate: 1.56 };
  const controller = createRuntimeHudController({
    elements: { pickupLog, message: new TestElement(), itemDropReveal: new TestElement() },
    player,
  } as unknown as Parameters<typeof createRuntimeHudController>[0]);
  return { controller, pickupLog, player };
}

beforeEach(() => {
  vi.useFakeTimers();
  vi.stubGlobal("window", { setTimeout: globalThis.setTimeout, clearTimeout: globalThis.clearTimeout });
  vi.stubGlobal("document", {
    body: new TestElement(),
    createElement: () => new TestElement(),
  });
});

afterEach(() => {
  vi.clearAllTimers();
  vi.useRealTimers();
  vi.unstubAllGlobals();
});

it("keeps the account-wide online count through a regional handoff, then clears it on account disconnect", () => {
  let online = 2;
  const elements = new Proxy({}, { get(target: any, key) { return target[key] ??= new TestElement(); } });
  const dependencies = new Proxy({
    elements, player: {}, connected: () => false, onlinePlayerCount: () => online,
    remotePlayerCount: () => 0, activeDuel: () => null,
  }, { get(target: any, key) { return target[key] ??= vi.fn(); } });
  const controller = createRuntimeHudController(dependencies as any);
  controller.updateHud(true);
  expect(vi.mocked(renderPlayerHud).mock.lastCall?.[3]).toBe(2);
  online = 5;
  vi.advanceTimersByTime(1_900);
  controller.updateHud();
  expect(vi.mocked(renderPlayerHud).mock.lastCall?.[3]).toBe(2);
  vi.advanceTimersByTime(100);
  controller.updateHud();
  expect(vi.mocked(renderPlayerHud).mock.lastCall?.[3]).toBe(5);
  online = 0;
  controller.updateHud(true);
  expect(vi.mocked(renderPlayerHud).mock.lastCall?.[3]).toBe(0);
});

describe("runtime reward notifications", () => {
  it("shows research and both bench-slot completions as separate reward-style cards", () => {
    const { controller, pickupLog } = setupHud();
    controller.showProgressCompletion("Research", "WARCRAFT Lv 6", "⚔", "#f3a6ce");
    controller.showProgressCompletion("Upgrade", "WEAPON +1", "◆", "#f3cf70");
    controller.showProgressCompletion("Upgrade", "HELMET +2", "◆", "#f3cf70");
    expect(pickupLog.children).toHaveLength(3);
    expect(pickupLog.children.map((entry) => entry.getAttribute("aria-label"))).toEqual([
      "Research complete: WARCRAFT Lv 6", "Upgrade complete: WEAPON +1", "Upgrade complete: HELMET +2",
    ]);
    expect(pickupLog.children.every((entry) => entry.className.includes("stat-reward-toast"))).toBe(true);
    vi.advanceTimersByTime(2_400);
    expect(pickupLog.children).toHaveLength(0);
  });

  it("changes an existing attack-speed popup to Capped and keeps repeated capped rewards there", () => {
    const { controller, pickupLog, player } = setupHud();
    controller.logPickup("+0.25 ATK/SEC", "#fff");
    const entry = pickupLog.children[0];
    expect(entry.querySelector(".stat-reward-value")?.textContent).toBe("+0.25");
    player.attackRate = MIN_ATTACK_INTERVAL;
    controller.logPickup("+0.25 ATK/SEC", "#fff");
    controller.logPickup("+0.25 ATK/SEC", "#fff");
    expect(pickupLog.children).toHaveLength(1);
    expect(entry.querySelector(".stat-reward-value")?.textContent).toBe("Capped");
    expect(entry.getAttribute("aria-label")).toBe("Attack Speed Capped");
    expect(entry.classList.contains("is-capped")).toBe(true);
    controller.logPickup("+1 DAMAGE", "#fff");
    expect(pickupLog.children[1].querySelector(".stat-reward-value")?.textContent).toBe("+1");
  });

  it("updates only the amount on the same card without restarting its entrance", () => {
    const { controller, pickupLog } = setupHud();
    controller.logPickup("+1 DAMAGE", "#ff655a");
    const entry = pickupLog.children[0];
    const originalChildren = [...entry.children];
    entry.style.setProperty.mockClear();

    vi.advanceTimersByTime(500);
    controller.logPickup("+1 DAMAGE", "#ff655a");
    controller.logPickup("+1 DAMAGE", "#ff655a");

    expect(pickupLog.children).toHaveLength(1);
    expect(pickupLog.children[0]).toBe(entry);
    originalChildren.forEach((child, index) => expect(entry.children[index]).toBe(child));
    expect(entry.querySelector(".stat-reward-value")?.textContent).toBe("+3");
    expect(entry.getAttribute("aria-label")).toBe("Damage +3");
    expect(pickupLog.appendChild).toHaveBeenCalledOnce();
    expect(entry.remove).not.toHaveBeenCalled();
    expect(entry.style.animation).toBe("");
    expect(entry.style.removeProperty).not.toHaveBeenCalled();
    expect(entry.style.setProperty).not.toHaveBeenCalled();
    expect(vi.getTimerCount()).toBe(2);
  });

  it("keeps base and total rewards from combining when the setting changes", () => {
    const { controller, pickupLog } = setupHud();
    controller.logPickup("+1.36 DAMAGE", "#ff655a", "total");
    const totalCard = pickupLog.children[0];
    controller.logPickup("+1 DAMAGE", "#ff655a", "base");
    expect(totalCard.remove).toHaveBeenCalledOnce();
    expect(pickupLog.children).toHaveLength(1);
    expect(pickupLog.children[0].querySelector(".stat-reward-value")?.textContent).toBe("+1");
    controller.logPickup("+1 DAMAGE", "#ff655a", "base");
    expect(pickupLog.children[0].querySelector(".stat-reward-value")?.textContent).toBe("+2");
  });

  it("extends the steady hold, then fades and removes the card after the last reward", () => {
    const { controller, pickupLog } = setupHud();
    controller.logPickup("+1 DAMAGE", "#ff655a");
    const entry = pickupLog.children[0];
    vi.advanceTimersByTime(1_000);
    controller.logPickup("+1 DAMAGE", "#ff655a");

    vi.advanceTimersByTime(2_099);
    expect(pickupLog.children[0]).toBe(entry);
    expect(entry.classList.contains("is-expiring")).toBe(false);
    vi.advanceTimersByTime(1);
    expect(entry.classList.contains("is-expiring")).toBe(true);
    vi.advanceTimersByTime(299);
    expect(pickupLog.children[0]).toBe(entry);
    vi.advanceTimersByTime(1);
    expect(pickupLog.children).toHaveLength(0);

    controller.logPickup("+1 DAMAGE", "#ff655a");
    expect(pickupLog.children[0]).not.toBe(entry);
    expect(pickupLog.children[0].querySelector(".stat-reward-value")?.textContent).toBe("+1");
  });

  it("cancels an in-progress fade in place when another reward arrives", () => {
    const { controller, pickupLog } = setupHud();
    controller.logPickup("+1 DAMAGE", "#ff655a");
    const entry = pickupLog.children[0];
    vi.advanceTimersByTime(2_250);
    expect(entry.classList.contains("is-expiring")).toBe(true);

    controller.logPickup("+1 DAMAGE", "#ff655a");
    expect(entry.classList.contains("is-expiring")).toBe(false);
    expect(entry.style.animation).toBe("");
    expect(entry.style.removeProperty).not.toHaveBeenCalled();
    vi.advanceTimersByTime(2_399);
    expect(pickupLog.children[0]).toBe(entry);
    expect(pickupLog.appendChild).toHaveBeenCalledOnce();
    vi.advanceTimersByTime(1);
    expect(pickupLog.children).toHaveLength(0);
  });

  it("keeps different stats separate without reordering or extending the other card", () => {
    const { controller, pickupLog } = setupHud();
    controller.logPickup("+1 DAMAGE", "#ff655a");
    controller.logPickup("+1 ARMOR", "#fff");
    const [damage, armor] = pickupLog.children;
    vi.advanceTimersByTime(1_000);
    controller.logPickup("+1 DAMAGE", "#ff655a");
    expect(pickupLog.children[0]).toBe(damage);
    expect(pickupLog.children[1]).toBe(armor);

    vi.advanceTimersByTime(1_400);
    expect(pickupLog.children).toHaveLength(1);
    expect(pickupLog.children[0]).toBe(damage);
    expect(armor.remove).toHaveBeenCalledOnce();
  });

  it("clears both expiry timers and accumulated totals with transient UI", () => {
    const { controller, pickupLog } = setupHud();
    controller.logPickup("+1 DAMAGE", "#ff655a");
    controller.logPickup("+1 DAMAGE", "#ff655a");
    controller.clearTransientUi();
    expect(pickupLog.children).toHaveLength(0);
    expect(vi.getTimerCount()).toBe(0);

    controller.logPickup("+1 DAMAGE", "#ff655a");
    expect(pickupLog.children[0].querySelector(".stat-reward-value")?.textContent).toBe("+1");
  });
});
