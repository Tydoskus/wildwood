import { afterEach, describe, expect, it, vi } from "vitest";
import { createForestRewardPrototypePanel } from "./forest-reward-prototype-panel";

class ElementStub {
  textContent = "";
  className = "";
  disabled = false;
  children: ElementStub[] = [];
  listeners = new Map<string, () => void>();
  append(...children: ElementStub[]) { this.children.push(...children); }
  setAttribute() {}
  addEventListener(name: string, callback: () => void) { this.listeners.set(name, callback); }
  click() { if (!this.disabled) this.listeners.get("click")?.(); }
}

function fixture() {
  vi.stubGlobal("document", { createElement: () => new ElementStub() });
  const parent = new ElementStub();
  const state = { encounter: 1n, enemyHp: 24, damage: 10, kills: 0n, lastAttack: 0n, nextAttackAt: 0n, respawnAt: 0n };
  const send = vi.fn(async (_action?: unknown) => ({ ok: true }));
  const controller = createForestRewardPrototypePanel(parent as unknown as HTMLElement, { state: () => state, send });
  const section = parent.children[0];
  return { controller, state, send, status: section.children[2], buttons: section.children[3].children, feedback: section.children[4] };
}

describe("forest prototype developer controls", () => {
  afterEach(() => vi.unstubAllGlobals());
  it("sends numbered attacks and replays the exact payload even after confirmation", async () => {
    const f = fixture();
    f.buttons[1].click();
    await vi.waitFor(() => expect(f.buttons[1].disabled).toBe(false));
    expect(f.send).toHaveBeenLastCalledWith({ encounter: 1n, firstAttack: 1n, count: 1 });
    f.state.lastAttack = 1n;
    f.buttons[3].click();
    await vi.waitFor(() => expect(f.buttons[3].disabled).toBe(false));
    expect(f.send).toHaveBeenLastCalledWith({ encounter: 1n, firstAttack: 1n, count: 1 });
    f.buttons[2].click();
    expect(f.send).toHaveBeenLastCalledWith({ encounter: 1n, firstAttack: 2n, count: 3 });
  });
  it("shows only confirmed values and discards late responses after clearing access", async () => {
    const f = fixture();
    let resolve!: (result: { ok: boolean }) => void;
    f.send.mockImplementationOnce(() => new Promise((done) => { resolve = done; }));
    f.buttons[1].click();
    expect(f.status.textContent).toContain("Test damage 10");
    f.controller.clear();
    resolve({ ok: true });
    await Promise.resolve();
    expect(f.feedback.textContent).toBe("");
    expect(f.buttons[3].disabled).toBe(true);
  });
});
