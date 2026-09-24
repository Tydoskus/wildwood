import { afterEach, expect, it } from "vitest";
import { parseHTML } from "linkedom";
import { readFileSync } from "node:fs";
import { createItemInspectionController, itemInspectionButtonLabel, itemStatsWithBowSkills } from "./item-inspection-controller";
import { itemStats } from "../../shared/items";
import { formatEquipmentStat } from "./equipment-stat-format";

const DAMAGE = formatEquipmentStat(itemInspectionButtonLabel(itemStats("iron_bow")[0]));

const globals = globalThis as unknown as Record<string, unknown>;
const saved = { document: globals.document, HTMLElement: globals.HTMLElement };
afterEach(() => Object.assign(globals, saved));

function inspection(roll = { arrowStorm: 2.4, ricochet: 0, piercingShot: 12 }) {
  const { document, window } = parseHTML(`<html><body><section id="panel" hidden><div class="item-inspection-tools"></div>
    <h2 id="title"></h2><div id="content"></div><button id="back"></button></section></body></html>`);
  Object.assign(globals, { document, HTMLElement: window.HTMLElement });
  const controller = createItemInspectionController({
    panel: document.getElementById("panel")!, title: document.getElementById("title")!,
    content: document.getElementById("content")!, back: document.getElementById("back") as HTMLButtonElement,
    bowSkills: itemId => itemId === "iron_bow" ? roll : null,
  });
  const lines = () => [...document.querySelectorAll(".item-inspection-stats span")].map(span => span.textContent);
  return { controller, lines, document };
}

it("lists a player's own bow skills in title case under its stats", () => {
  const view = inspection();
  view.controller.open({ itemId: "iron_bow", ownItem: true });
  // 2.4% x 2.5 for Arrow Storm plus 12% x 2 for Piercing Shot.
  expect(view.lines()).toEqual([DAMAGE, "Arrow Storm 2.4%", "Piercing Shot 12.0%", "Skills: +30.0% dmg"]);
  const skill = view.document.querySelector<HTMLElement>('[data-stat-kind="skill"]')!;
  expect(skill.textContent).toBe("Arrow Storm 2.4%");
  expect(skill.getAttribute("style")).toBeNull();
  expect(view.document.querySelector('[data-stat-kind="skill-score"]')!.textContent).toBe("Skills: +30.0% dmg");
});

it("scores a kept copy by its own roll", () => {
  const view = inspection();
  view.controller.open({ itemId: "iron_bow", ownItem: true, skills: { arrowStorm: 0, ricochet: 5, piercingShot: 0 } });
  expect(view.lines()).toEqual([DAMAGE, "Ricochet 5.0%", "Skills: +6.0% dmg"]);
});

it("shows nothing extra for a bow without skills, or for someone else's bow", () => {
  const view = inspection({ arrowStorm: 0, ricochet: 0, piercingShot: 0 });
  view.controller.open({ itemId: "iron_bow", ownItem: true });
  expect(view.lines()).toEqual([DAMAGE]);
  const other = inspection();
  other.controller.open({ itemId: "iron_bow" });
  expect(other.lines()).toEqual([DAMAGE]);
});

it("is never uppercased by a stylesheet in the item window or the drop reveal", () => {
  // Skill names are title case on purpose, even beside uppercase stat lines.
  const css = readFileSync(new URL("../../public/assets/wildstat/game.css", import.meta.url), "utf8");
  for (const rule of css.match(/[^{}]*\{[^}]*text-transform:\s*uppercase[^}]*\}/g) ?? []) {
    expect(rule).not.toMatch(/item-inspection|item-drop/);
  }
});

it("appends the skills to a dropped bow's stat lines", () => {
  expect(itemStatsWithBowSkills("iron_bow", 0, { arrowStorm: 0, ricochet: 5.1, piercingShot: 0 }))
    .toEqual([...itemStats("iron_bow", 0), "Ricochet 5.1%"]);
  expect(itemStatsWithBowSkills("iron_bow", 0, null)).toEqual(itemStats("iron_bow", 0));
});
