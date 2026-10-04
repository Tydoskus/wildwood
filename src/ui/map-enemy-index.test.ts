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
