import { expect, it } from "vitest";
import { parseHTML } from "linkedom";
import { createMapEnemyIndex } from "./map-enemy-index";

it("lists the map's enemies with short reward names, and closes with Back", () => {
  const { document } = parseHTML("<html><body></body></html>");
  const index = createMapEnemyIndex(document as unknown as Document);
  index.open("Tutorial Forest", [
    { name: "Bramble", elite: false, hp: 42, hit: 14, reward: { type: "health", amount: 42 } },
    { name: "Dread Warden", elite: true, hp: 500, hit: 275, reward: { type: "damage", amount: 7 } },
  ]);
  expect(index.isOpen()).toBe(true);
  const rows = [...document.querySelectorAll(".enemy-index-table tbody tr")].map(row => row.textContent);
  expect(rows).toEqual(["Bramble4214+42 HP", "★ Dread Warden500275+7 Atk"]);
  expect(document.querySelector(".enemy-index-map")?.textContent).toBe("Tutorial Forest");
  (document.querySelector(".enemy-index-window .window-back-button") as unknown as HTMLButtonElement).click();
  expect(index.isOpen()).toBe(false);
  index.open("Empty", []);
  expect(index.isOpen()).toBe(false);
});

it("lists the boss last, tagged, with its rewards", () => {
  const { document } = parseHTML("<html><body></body></html>");
  const index = createMapEnemyIndex(document as unknown as Document);
  index.open("Samurai Garden", [
    { name: "Koi Shogun", elite: false, hp: 9_000_000, hit: 120_000, reward: { type: "damage", amount: 50 },
      boss: { rewards: [{ type: "damage", amount: 50 }, { type: "health", amount: 900 }],
        attacks: [{ name: "Slash", hit: 120_000 }, { name: "Whirlpool", hit: 84_000 }, { name: "Contact", hit: 60_000 }] } },
  ]);
  const row = document.querySelector(".enemy-index-table tbody tr.is-boss")!;
  expect(row.querySelector("th")?.textContent).toBe("Koi ShogunBoss");
  expect([...row.querySelectorAll(".enemy-index-reward")].map(span => span.textContent)).toEqual(["+50 Atk", "+900 HP"]);
  // Every attack on its own line under the boss, strongest first.
  expect([...document.querySelectorAll(".enemy-index-attack")].map(line => line.textContent)).toEqual(["Slash120k", "Whirlpool84.0k", "Contact60.0k"]);
});
