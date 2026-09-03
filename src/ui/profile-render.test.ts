import { afterEach, describe, expect, it, vi } from "vitest";
import { createEmptyResearchRanks } from "../../shared/research";
import { renderProfileStats } from "./profile";
import type { PlayerProfileData } from "../wildstat-coop";

class ElementStub {
  className = "";
  textContent = "";
  hidden = false;
  dataset: Record<string, string> = {};
  children: (ElementStub | string)[] = [];
  attributes = new Map<string, string>();
  listeners = new Map<string, (event: { key?: string; preventDefault: () => void }) => void>();
  classList = { toggle: (name: string, on: boolean) => {
    const names = new Set(this.className.split(" "));
    if (on) names.add(name); else names.delete(name);
    this.className = [...names].join(" ");
  } };
  append(...children: (ElementStub | string)[]) { this.children.push(...children); }
  replaceChildren() { this.children = []; }
  setAttribute(name: string, value: string) { this.attributes.set(name, value); }
  getAttribute(name: string) { return this.attributes.get(name) ?? null; }
  addEventListener(name: string, callback: (event: { key?: string; preventDefault: () => void }) => void) { this.listeners.set(name, callback); }
  querySelectorAll(): ElementStub[] {
    return this.children.flatMap((child) => child instanceof ElementStub
      ? [...(child.getAttribute("aria-expanded") === "true" ? [child] : []), ...child.querySelectorAll()] : []);
  }
  activate(key?: string) { this.listeners.get(key ? "keydown" : "click")?.({ key, preventDefault() {} }); }
}

const profile = (identity = "alice") => ({
  identity, research: createEmptyResearchRanks(), itemUpgradeLevels: {},
  progress: { maxHp: 100, damage: 10, armor: 4, attackRate: 1, regen: 2, speed: 190, attackRange: 260,
    equippedRightHand: "", equippedLeftHand: "", equippedHead: "", equippedChest: "", speedOverride: 0 },
}) as PlayerProfileData;

describe("compact profile stat rendering", () => {
  afterEach(() => vi.unstubAllGlobals());
  it("shows only totals until expanded and supports keyboard details", () => {
    vi.stubGlobal("document", { createElement: () => new ElementStub() });
    const grid = new ElementStub();
    renderProfileStats(profile(), grid as unknown as HTMLElement, () => "20%", .38);
    expect(grid.children).toHaveLength(2);
    const [left, right] = grid.children as ElementStub[];
    expect(left.children).toHaveLength(5);
    expect(right.children).toHaveLength(5);
    const row = left.children[0] as ElementStub;
    const [label, summary, details] = row.children as ElementStub[];
    expect(label.textContent).toBe("Max Hp:");
    expect(summary.children).toHaveLength(1);
    expect(((summary.children[0] as ElementStub).children[0] as ElementStub).textContent).toBe("100");
    expect(details.hidden).toBe(true);
    expect(row.getAttribute("aria-label")).not.toContain("Base");
    row.activate("Enter");
    expect(details.hidden).toBe(false);
    expect((right.children[0] as ElementStub).getAttribute("aria-expanded")).toBe("false");
    expect(right.children.every((child) => (child as ElementStub).getAttribute("aria-expanded") === "false")).toBe(true);
    expect(row.getAttribute("aria-label")).toContain("Base 100");
    expect((details.children[0] as ElementStub).className).toBe("profile-stat-equation");
    row.activate(" ");
    expect(details.hidden).toBe(true);
  });
  it("preserves expanded details during refresh, but not across players", () => {
    vi.stubGlobal("document", { createElement: () => new ElementStub() });
    const grid = new ElementStub();
    const render = (identity: string) => renderProfileStats(profile(identity), grid as unknown as HTMLElement, () => "20%", .38);
    render("alice");
    const thirdRow = () => (grid.children[0] as ElementStub).children[1] as ElementStub;
    thirdRow().activate();
    render("alice");
    expect(thirdRow().getAttribute("aria-expanded")).toBe("true");
    render("bob");
    expect(thirdRow().getAttribute("aria-expanded")).toBe("false");
  });
});
