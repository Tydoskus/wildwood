import { describe, expect, it, vi } from "vitest";
import { parseHTML } from "linkedom";
import { createPrestigeController, prestigeRewardLabel, type PrestigeRow } from "./prestige-panel";

function setup(options: { row?: PrestigeRow | null; unlocked?: boolean; completed?: number; run?: () => Promise<any>; perks?: any; spend?: () => Promise<any> } = {}) {
  const { document } = parseHTML(`<html><body>
    <div id="own" hidden><button id="open" disabled>Prestige</button></div>
    <div id="overlay" hidden>
      <div id="level"></div><div id="bonus"></div><div id="points"></div><div id="peak"></div>
      <div id="perks"></div><p id="cost"></p><div id="status"></div>
      <button id="confirm">Prestige</button><button id="close">Back</button>
    </div></body></html>`);
  const pick = (id: string) => document.getElementById(id) as any;
  const runPrestige = vi.fn(options.run ?? (async () => ({ ok: true })));
  const spendPerk = vi.fn(options.spend ?? (async () => ({ ok: true })));
  const showMessage = vi.fn();
  const controller = createPrestigeController({
    openButton: pick("open"), ownActions: pick("own"), overlay: pick("overlay"),
    closeButton: pick("close"), confirmButton: pick("confirm"), level: pick("level"), bonus: pick("bonus"),
    points: pick("points"), peak: pick("peak"), cost: pick("cost"), status: pick("status"),
    prestige: () => options.row ?? null, unlocked: () => options.unlocked ?? false, completed: () => options.completed ?? 0,
    perkList: pick("perks"), perks: () => options.perks ?? null, spendPerk: spendPerk as any,
    runPrestige, showMessage,
  });
  return { controller, pick, runPrestige, spendPerk, showMessage };
}
const click = (element: any) => element.click();

describe("prestige panel", () => {
  it("greys the button until the first Endless map is open, and only on your own profile", () => {
    const locked = setup({ unlocked: false });
    locked.controller.refresh(true);
    expect(locked.pick("own").hidden).toBe(false);
    expect(locked.pick("open").disabled).toBe(true);
    expect(locked.pick("open").title).toContain("Aegis Prime");
    locked.controller.refresh(false);
    expect(locked.pick("own").hidden).toBe(true);

    const open = setup({ unlocked: true, row: { level: 2, perkPoints: 2, peakPower: 1_500 } });
    open.controller.refresh(true);
    expect(open.pick("open").disabled).toBe(false);
    expect(open.pick("open").textContent).toBe("Prestige 2");
  });

  it("still opens after a prestige so the banked point can be spent", () => {
    // Prestiging clears the campaign, so the unlock condition is false again.
    const s = setup({ unlocked: false, row: { level: 1, perkPoints: 1, peakPower: 0 }, perks: {} });
    s.controller.refresh(true);
    expect(s.pick("open").disabled).toBe(false);
    s.controller.open();
    expect(s.pick("overlay").hidden).toBe(false);
    const spend = [...s.pick("perks").children].map((row: any) => row.querySelector("button"));
    expect(spend.some((button: any) => !button.disabled)).toBe(true);
    // The button stays reachable; what is missing is said beside it.
    expect(s.pick("confirm").hidden).toBe(false);
    expect(s.pick("status").textContent).toContain("Endless 1 boss");
  });

  it("opens while locked and says what is missing inside", () => {
    // Refusing to open put the window's own explanation behind the very gate
    // it was explaining, and a client view behind the server's locked out a
    // player who had actually earned the prestige.
    const s = setup({ unlocked: false });
    click(s.pick("open"));
    expect(s.pick("overlay").hidden).toBe(false);
    expect(s.pick("status").textContent).toContain("Aegis Prime");
  });

  it("holds back only while the campaign itself is unfinished", () => {
    // The campaign is the one requirement this client can be sure of, because
    // it reads it from its own progress row.
    const run = vi.fn(async () => ({ ok: false, error: "Clear Endless 2 before prestiging." }));
    const s = setup({ unlocked: false, run, row: { level: 1, perkPoints: 0, peakPower: 5 } });
    click(s.pick("open"));
    expect(s.pick("confirm").hidden).toBe(false);
    expect(s.pick("confirm").disabled).toBe(true);
    click(s.pick("confirm"));
    click(s.pick("confirm"));
    expect(run).not.toHaveBeenCalled();
    expect(s.pick("status").textContent).toBeTruthy();
  });

  it("sends a prestige the server may yet allow when its own Endless count lags", () => {
    // Toephu had cleared Endless 1 and the server agreed, but this window read
    // zero and greyed the button out. An unknown count must not refuse.
    const run = vi.fn(async () => ({ ok: true }));
    const s = setup({ unlocked: true, completed: 0, run, row: { level: 1, perkPoints: 0, peakPower: 5 } });
    s.controller.refresh(true);
    click(s.pick("open"));
    expect(s.pick("confirm").disabled).toBe(false);
    click(s.pick("confirm"));
    click(s.pick("confirm"));
    expect(run).toHaveBeenCalled();
  });

  it("shows the standing bonus and what the next prestige pays", () => {
    const s = setup({ completed: 3,  unlocked: true, row: { level: 3, perkPoints: 1, peakPower: 2_000_000 } });
    click(s.pick("open"));
    expect(s.pick("overlay").hidden).toBe(false);
    expect(s.pick("level").textContent).toBe("PRESTIGE 3");
    expect(s.pick("bonus").textContent).toBe("+30%");
    expect(s.pick("points").textContent).toBe("1");
    expect(s.pick("peak").textContent).not.toBe("—");
    expect(s.pick("cost").textContent).toContain("every map unlock");
    expect(s.pick("cost").textContent).toContain(prestigeRewardLabel(3));
  });

  it("needs a second press before it resets anything", async () => {
    const s = setup({ unlocked: true, row: { level: 0, perkPoints: 0, peakPower: 0 } });
    click(s.pick("open"));
    click(s.pick("confirm"));
    expect(s.runPrestige).not.toHaveBeenCalled();
    expect(s.pick("confirm").textContent).toBe("Yes, prestige");
    expect(s.pick("status").textContent).toContain("cannot be undone");
    click(s.pick("confirm"));
    await Promise.resolve(); await Promise.resolve();
    expect(s.runPrestige).toHaveBeenCalledTimes(1);
    expect(s.pick("overlay").hidden).toBe(true);
  });

  it("disarms when reopened, so a stale press cannot fire", () => {
    const s = setup({ unlocked: true, row: { level: 0, perkPoints: 0, peakPower: 0 } });
    click(s.pick("open"));
    click(s.pick("confirm"));
    click(s.pick("close"));
    click(s.pick("open"));
    expect(s.pick("confirm").textContent).toBe("Prestige");
    click(s.pick("confirm"));
    expect(s.runPrestige).not.toHaveBeenCalled();
  });

  it("lists every perk with its rank, and only offers a spend when a point is banked", () => {
    const none = setup({ unlocked: true, row: { level: 1, perkPoints: 0, peakPower: 0 }, perks: { keenEdge: 2 } });
    none.controller.open();
    const rows = () => [...none.pick("perks").children] as any[];
    expect(rows()).toHaveLength(4);
    expect(rows()[0].querySelector(".prestige-perk-title").textContent).toBe("Keen Edge 2/5");
    // Both what the rank owned is worth and what one more point buys.
    const value = rows()[0].querySelector(".prestige-perk-value").textContent;
    expect(value).toContain("Now +10% critical chance, +24% critical damage");
    expect(value).toContain("Next +15% critical chance, +36% critical damage");
    expect(rows().every((row: any) => row.querySelector("button").disabled)).toBe(true);

    const banked = setup({ unlocked: true, row: { level: 3, perkPoints: 1, peakPower: 0 }, perks: { riposte: 5 } });
    banked.controller.open();
    const perkRows = [...banked.pick("perks").children] as any[];
    expect(perkRows[0].querySelector("button").disabled).toBe(false);
    const maxed = perkRows.find((row: any) => row.dataset.perk === "riposte");
    expect(maxed.querySelector("button").textContent).toBe("Maxed");
    expect(maxed.querySelector(".prestige-perk-value").textContent).not.toContain("Next");
    expect(maxed.querySelector("button").disabled).toBe(true);
  });

  it("spends a point on the perk whose button was pressed", async () => {
    const s = setup({ unlocked: true, row: { level: 1, perkPoints: 1, peakPower: 0 }, perks: {} });
    s.controller.open();
    const row = [...s.pick("perks").children].find((entry: any) => entry.dataset.perk === "splitShot") as any;
    row.querySelector("button").click();
    await Promise.resolve(); await Promise.resolve(); await Promise.resolve();
    expect(s.spendPerk).toHaveBeenCalledWith("splitShot");
    expect(s.pick("status").textContent).toContain("rank 1");
  });

  it("keeps the same perk buttons across renders, so a press is not replaced mid-tap", async () => {
    // Rebuilding the list on every render swapped the button out between the
    // press and its click, which is why spending a point took several taps.
    const s = setup({ unlocked: true, row: { level: 1, perkPoints: 1, peakPower: 0 }, perks: {} });
    s.controller.open();
    const button = () => ([...s.pick("perks").children]
      .find((entry: any) => entry.dataset.perk === "splitShot") as any).querySelector("button");
    const before = button();
    s.controller.refresh(true);
    s.controller.render();
    expect(button()).toBe(before);

    before.click();
    await Promise.resolve(); await Promise.resolve(); await Promise.resolve();
    expect(s.spendPerk).toHaveBeenCalledWith("splitShot");
  });

  it("keeps the window open and reports why when the server refuses", async () => {
    const s = setup({ unlocked: true, row: { level: 0, perkPoints: 0, peakPower: 0 },
      run: async () => ({ ok: false, error: "Finish your duel before prestiging." }) });
    click(s.pick("open"));
    click(s.pick("confirm")); click(s.pick("confirm"));
    await Promise.resolve(); await Promise.resolve(); await Promise.resolve();
    expect(s.pick("overlay").hidden).toBe(false);
    expect(s.pick("status").textContent).toContain("duel");
  });
});

describe("profile stat gain breakdown", () => {
  it("multiplies tech by prestige and names both sources", async () => {
    const { profileStatDisplayRows } = await import("./profile");
    const { createEmptyResearchRanks } = await import("../../shared/research");
    const profile: any = { identity: "a", name: "A", progress: { maxHp: 100, damage: 10, attackRate: 1, armor: 0, regen: 0,
      speed: 100, speedOverride: 0, projectileCount: 1, attackRange: 100, equippedHead: "", equippedChest: "", equippedFeet: "",
      equippedRightHand: "", equippedLeftHand: "", inventoryJson: "[]" }, lifetime: {}, research: createEmptyResearchRanks() };
    const gain = (ranks: any, level: number) =>
      profileStatDisplayRows(profile, () => "0%", .38, ranks, level).find((row: any) => row.kind === "stat-gain");
    const ranks = { ...createEmptyResearchRanks(), foraging: 10 };
    expect(gain(ranks, 0)!.total).toBe("+10%");
    expect(gain(createEmptyResearchRanks(), 2)!.total).toBe("+20%");
    // 1.10 tech times 1.20 prestige is 32 percent, not 30.
    const both = gain(ranks, 2)!;
    expect(both.total).toBe("+32%");
    expect(both.sources).toEqual([{ label: "Tech", value: "+10%" }, { label: "Prestige", value: "+20%" }]);
    expect(gain(createEmptyResearchRanks(), 0)!.sources).toEqual([]);
  });
});

describe("each prestige asks for one Endless stage more", () => {
  it("keeps the second prestige shut until Endless 1 is cleared this run, and says so", () => {
    const short = setup({ unlocked: true, completed: 0, row: { level: 1, perkPoints: 1, peakPower: 5 } });
    short.controller.refresh(true);
    click(short.pick("open"));
    // Explained, and still pressable. A client that reads zero stages may
    // simply not have the row yet, and refusing on that reading is what told
    // Toephu to clear a boss he had already beaten. The server decides.
    expect(short.pick("confirm").hidden).toBe(false);
    expect(short.pick("confirm").disabled).toBe(false);
    expect(short.pick("status").textContent).toContain("Endless 1 boss");
    const ready = setup({ unlocked: true, completed: 1, row: { level: 1, perkPoints: 1, peakPower: 5 } });
    ready.controller.refresh(true);
    click(ready.pick("open"));
    expect(ready.pick("confirm").hidden).toBe(false);
    expect(ready.pick("cost").textContent).toContain("You would earn");
  });
  it("prestiges as soon as the cleared stage this client reads meets the requirement", () => {
    // Teus's window read zero stages because the row saying otherwise was not
    // subscribed, and the press was swallowed with no error. The subscription
    // is what fixed that; the gate below is safe only because of it, so this
    // covers the case that used to be wrong.
    const run = vi.fn(async () => ({ ok: true }));
    const s = setup({ unlocked: true, completed: 1, run, row: { level: 1, perkPoints: 0, peakPower: 5 } });
    s.controller.refresh(true);
    click(s.pick("open"));
    expect(s.pick("confirm").hidden).toBe(false);
    expect(s.pick("confirm").disabled).toBe(false);
    click(s.pick("confirm"));
    click(s.pick("confirm"));
    expect(run).toHaveBeenCalled();
  });

  it("names only the Endless boss once one is required", () => {
    // The maps are one ladder: tier 15 is Aegis Prime and tier 16 is Endless 1,
    // so a run that reaches the required stage has cleared everything under it
    // and naming the earlier boss as well is noise.
    const s = setup({ unlocked: false, completed: 0, row: { level: 1, perkPoints: 0, peakPower: 5 } });
    s.controller.refresh(true);
    click(s.pick("open"));
    expect(s.pick("status").textContent).toBe("Clear the Endless 1 boss to prestige.");
  });

  it("asks for Aegis Prime only for the very first prestige", () => {
    const first = setup({ unlocked: false, completed: 0, row: { level: 0, perkPoints: 0, peakPower: 5 } });
    first.controller.refresh(true);
    first.controller.open();
    expect(first.pick("status").textContent).toContain("Aegis Prime");

    // A later run is measured by its Endless stage alone, whatever an earlier
    // run reached, because progress resets with the prestige.
    const later = setup({ unlocked: false, completed: 0, row: { level: 3, perkPoints: 0, peakPower: 5 } });
    later.controller.refresh(true);
    click(later.pick("open"));
    expect(later.pick("status").textContent).toBe("Clear the Endless 3 boss to prestige.");
  });

  it("leaves the profile button alone on a repeated refresh", () => {
    // The HUD tick refreshes this every 100ms with the profile window closed.
    const s = setup({ unlocked: true, row: { level: 2, perkPoints: 0, peakPower: 10 } });
    s.controller.refresh(true);
    const open = s.pick("open");
    const own = s.pick("own");
    const setAttribute = vi.spyOn(open, "setAttribute");
    const text = vi.spyOn(open, "textContent", "set");
    const title = vi.spyOn(open, "title", "set");
    const hidden = vi.spyOn(own, "hidden", "set");
    for (let tick = 0; tick < 5; tick += 1) s.controller.refresh(true);
    expect(setAttribute).not.toHaveBeenCalled();
    expect(text).not.toHaveBeenCalled();
    expect(title).not.toHaveBeenCalled();
    expect(hidden).not.toHaveBeenCalled();
    s.controller.refresh(false);
    expect(own.hidden).toBe(true);
    expect(hidden).toHaveBeenCalledTimes(1);
  });
});
