import { expect, it } from "vitest";
import { parseHTML } from "linkedom";
import { renderEnemyIndexRows } from "./map-enemy-index";

it("draws a row per enemy with short reward names, and a boss with its attacks under it", () => {
  const { document } = parseHTML("<html><body><table><tbody></tbody></table></body></html>");
  const body = document.querySelector("tbody") as unknown as HTMLElement;
  renderEnemyIndexRows(document as unknown as Document, body, [
    { name: "Bramble", elite: false, hp: 42, hit: 14, reward: { type: "health", amount: 42 } },
    { name: "Dread Warden", elite: true, hp: 500, hit: 275, reward: { type: "damage", amount: 7 } },
    { name: "Koi Shogun", elite: false, hp: 9_000_000, hit: 120_000, reward: { type: "damage", amount: 50 },
      boss: { rewards: [{ type: "damage", amount: 50 }, { type: "health", amount: 900 }],
        attacks: [{ name: "Slash", hit: 120_000 }, { name: "Whirlpool", hit: 84_000 }, { name: "Contact", hit: 60_000 }] } },
  ]);
  const rows = [...body.querySelectorAll("tr")].map(row => row.textContent);
  expect(rows[0]).toBe("Bramble4214+42 HP");
  expect(rows[1]).toBe("★ Dread Warden500275+7 Atk");
  expect(document.querySelector("tr.is-boss th")?.textContent).toBe("Koi ShogunBoss");
  expect([...document.querySelectorAll(".enemy-index-reward")].slice(-2).map(span => span.textContent)).toEqual(["+50 Atk", "+900 HP"]);
  expect([...document.querySelectorAll(".enemy-index-attack")].map(line => line.textContent)).toEqual(["Slash120k", "Whirlpool84.0k", "Contact60.0k"]);
});
