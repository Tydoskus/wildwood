import { afterEach, describe, expect, it, vi } from "vitest";
import { parseHTML } from "linkedom";
import { RESEARCH_DEFINITIONS, RESEARCH_IDS } from "../../shared/research";
import {
  hasAvailableResearch,
  createResearchCompletionTracker,
  centerResearchNode,
  researchFocusNode,
  researchElapsedRatio,
  researchIsAvailable,
  researchProgressLabel,
  createTechTreeController,
  type ResearchRanks,
} from "./tech-tree-controller";
import { createTechTreeLayout } from "./tech-tree-layout";

afterEach(() => vi.unstubAllGlobals());

it("opens Power and Utility from separate nodes and returns to the chooser", async () => {
  const { document, window } = parseHTML(`<html><body>
    <span id="notice"></span><div id="overlay" hidden><h2 id="title"><span>Tech Research</span></h2>
    <div id="categories"><button data-research-tree="power"><small class="tech-tree-choice-progress"></small></button><button data-research-tree="utility"><small class="tech-tree-choice-progress"></small></button></div>
    <div id="viewport" hidden><div id="map"><canvas id="canvas"></canvas></div></div>
    <div id="active"></div><button id="back"></button><div id="detail" hidden><div id="content"></div><button id="detailBack"></button></div></div>
  </body></html>`);
  vi.stubGlobal("document", document);
  vi.stubGlobal("window", window);
  vi.stubGlobal("addEventListener", () => {});
  vi.stubGlobal("requestAnimationFrame", () => 0);
  const element = (id: string) => document.getElementById(id)! as HTMLElement;
  const map = element("map");
  map.getBoundingClientRect = () => ({ width: 0, height: 0 } as DOMRect);
  const startResearch = vi.fn(async () => ({ ok: true }));
  const currentRanks = ranks({ researchSpeed: 1 });
  const controller = createTechTreeController({
    notice: element("notice"), overlay: element("overlay"), title: element("title"), categories: element("categories"),
    viewport: element("viewport"), closeButton: element("back"), active: element("active"),
    canvas: element("canvas") as HTMLCanvasElement, map, detail: element("detail"),
    detailContent: element("content"), closeDetailButton: element("detailBack"),
  }, {
    researchRanks: () => currentRanks, activeResearch: () => null, startResearch, gemBalance: () => 0n,
    speedUpResearch: async () => ({ ok: true }), showMessage: () => {}, localIdentity: () => "alice",
    isConnected: () => true, beforeOpen: () => {}, nowMs: () => 0,
  });
  const click = (selector: string) => document.querySelector(selector)!.dispatchEvent(new window.Event("click", { bubbles: true }));

  controller.open();
  expect(element("categories").hidden).toBe(false);
  click('[data-research-tree="utility"]');
  expect(element("viewport").hidden).toBe(false);
  expect(map.querySelectorAll("[data-tech-node]")).toHaveLength(6);
  click('[data-tech-node="tech-utility-bossRespawn"]');
  expect(element("content").textContent).toContain("SLOT UPGRADE SPEED 1/5 OR ENEMY RESPAWN 1/5");
  expect(document.querySelector<HTMLButtonElement>(".tech-tree-action")?.disabled).toBe(true);
  click('[data-tech-node="tech-utility-enemyRespawn"]');
  expect(element("detail").hidden).toBe(false);
  expect(element("content").textContent).toContain("-0.5s PER RANK");
  click(".tech-tree-action");
  await Promise.resolve();
  expect(startResearch).toHaveBeenCalledWith("enemyRespawn");
  click("#back");
  expect(element("categories").hidden).toBe(false);
  click('[data-research-tree="power"]');
  expect(map.querySelectorAll("[data-tech-node]")).toHaveLength(36);
});

function ranks(overrides: Partial<ResearchRanks> = {}): ResearchRanks {
  return {
    ...Object.fromEntries(RESEARCH_IDS.map((id) => [id, 0])) as ResearchRanks,
    ...overrides,
  };
}

describe("research completion notifications", () => {
  const job = { researchId: "warcraft" as const, targetRank: 6, startedAtMs: 100, completesAtMs: 500 };

  it("waits for the confirmed rank, including when the active row is removed first", () => {
    const tracker = createResearchCompletionTracker();
    expect(tracker.poll("player", true, null, ranks({ warcraft: 5 }))).toEqual([]);
    expect(tracker.poll("player", true, job, ranks({ warcraft: 5 }))).toEqual([]);
    expect(tracker.poll("player", true, null, ranks({ warcraft: 5 }))).toEqual([]);
    expect(tracker.poll("player", true, null, ranks({ warcraft: 6 }))).toEqual([job]);
    expect(tracker.poll("player", true, null, ranks({ warcraft: 6 }))).toEqual([]);
  });

  it("does not announce an old account's research after switching players", () => {
    const tracker = createResearchCompletionTracker();
    tracker.poll("first", true, job, ranks({ warcraft: 5 }));
    expect(tracker.poll("second", true, null, ranks({ warcraft: 6 }))).toEqual([]);
    tracker.poll("second", true, job, ranks({ warcraft: 5 }));
    expect(tracker.poll("second", false, null, ranks())).toEqual([]);
    expect(tracker.poll("second", true, null, ranks({ warcraft: 6 }))).toEqual([]);
  });
});

describe("hasAvailableResearch", () => {
  it("centers the active rank band ahead of any available earlier node", () => {
    const { nodes } = createTechTreeLayout();
    expect(researchFocusNode(nodes, ranks(), {
      researchId: "warcraft", targetRank: 6, startedAtMs: 1, completesAtMs: 2,
    })?.id).toBe("tech-2-warcraft");
    expect(researchFocusNode(nodes, ranks(), {
      researchId: "warcraft", targetRank: 5, startedAtMs: 1, completesAtMs: 2,
    })?.id).toBe("tech-1-warcraft");
  });

  it("chooses the first available node in tree order and advances past completed bands", () => {
    const { nodes } = createTechTreeLayout();
    expect(researchFocusNode(nodes, ranks(), null)?.id).toBe("tech-1-foraging");
    expect(researchFocusNode(nodes, ranks({ foraging: 5 }), null)?.id).toBe("tech-1-warcraft");
    const nextBand = ranks(Object.fromEntries(RESEARCH_IDS.map((id) => [id, RESEARCH_DEFINITIONS[id].ranksPerBand])) as ResearchRanks);
    expect(researchFocusNode(nodes, nextBand, null)?.id).toBe("tech-2-foraging");
    const complete = ranks(Object.fromEntries(RESEARCH_IDS.map((id) => [id, RESEARCH_DEFINITIONS[id].maxRank])) as ResearchRanks);
    expect(researchFocusNode(nodes, complete, null)).toBe(nodes.at(-1));
  });

  it("centers using viewport-relative bounds, not a nested tier's offsetTop", () => {
    const viewport = {
      scrollTop: 900, scrollLeft: 20, scrollHeight: 4000, scrollWidth: 600,
      clientHeight: 400, clientWidth: 300, clientTop: 2, clientLeft: 2,
      getBoundingClientRect: () => ({ top: 100, left: 10 }),
    };
    const node = { offsetTop: 28, getBoundingClientRect: () => ({ top: 702, left: 202, height: 112, width: 112 }) };
    centerResearchNode(viewport as HTMLElement, node as unknown as HTMLElement);
    expect(viewport.scrollTop).toBe(1356);
    expect(viewport.scrollLeft).toBe(116);
    node.getBoundingClientRect = () => ({ top: -5000, left: -5000, height: 112, width: 112 });
    centerResearchNode(viewport as HTMLElement, node as unknown as HTMLElement);
    expect(viewport.scrollTop).toBe(0);
    expect(viewport.scrollLeft).toBe(0);
  });

  it("fills active research from empty to full as elapsed time increases", () => {
    expect(researchElapsedRatio(1_000, 5_000, 1_000)).toBe(0);
    expect(researchElapsedRatio(1_000, 5_000, 3_000)).toBe(.5);
    expect(researchElapsedRatio(1_000, 5_000, 5_000)).toBe(1);
  });

  it("splits a saved cumulative rank without losing any completed levels", () => {
    expect([0, 1, 2, 3].map((band) => researchProgressLabel("warcraft", 17, band))).toEqual([
      "5 / 5",
      "5 / 5",
      "5 / 5",
      "2 / 5",
    ]);
  });

  it("reports an immediately researchable node", () => {
    expect(hasAvailableResearch(ranks())).toBe(true);
  });

  it("ignores unfinished nodes whose prerequisites are locked", () => {
    expect(researchIsAvailable("criticalDamage", ranks())).toBe(false);
  });

  it("opens the next tier only after every preceding five-rank node", () => {
    const firstBand = ranks(Object.fromEntries(
      RESEARCH_IDS.map((id) => [id, RESEARCH_DEFINITIONS[id].ranksPerBand]),
    ) as ResearchRanks);
    expect(researchIsAvailable("foraging", firstBand)).toBe(true);
    expect(researchIsAvailable("warcraft", firstBand)).toBe(false);
    firstBand.foraging += 1;
    expect(researchIsAvailable("warcraft", firstBand)).toBe(true);
  });

  it("clears once every research is maxed", () => {
    const complete = ranks(Object.fromEntries(
      RESEARCH_IDS.map((id) => [id, RESEARCH_DEFINITIONS[id].maxRank]),
    ) as ResearchRanks);
    expect(hasAvailableResearch(complete)).toBe(false);
  });
});
