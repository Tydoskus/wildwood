import { describe, expect, it } from "vitest";
import { ENEMY_TYPES, type EnemyKind } from "../../shared/enemy-definitions";
import { enemyDefeatDefinition } from "../../shared/enemy-defeats";
import { generateMap, generatedEnemyStats } from "../../shared/procedural-maps";
import { MAP_IDS } from "../../shared/rules";
import { rewardHealthRows, rewardHealthCsv } from "./reward-health-data";

describe("reward per health graph source data", () => {
  it("includes every rewarded campaign species accepted by the server, without averaging", () => {
    const rows = rewardHealthRows();
    for (const mapId of MAP_IDS) {
      for (const enemy of Object.keys(ENEMY_TYPES) as EnemyKind[]) {
        const definition = enemyDefeatDefinition(mapId, enemy);
        const row = rows.find(row => row.mapId === mapId && row.enemy === enemy);
        if (!definition) { expect(row).toBeUndefined(); continue; }
        expect(row).toMatchObject({ kind: "regular", hp: ENEMY_TYPES[enemy].hp, stat: definition.reward.type,
          reward: definition.reward.amount, population: definition.population, ratio: definition.reward.amount / ENEMY_TYPES[enemy].hp });
      }
    }
    expect(rows.some(row => row.enemy === "Spitter")).toBe(true);
    expect(rows.find(row => row.enemy === "Needle")?.stat).toBe("speed");
    expect(rows.find(row => row.enemy === "King Slime")?.elite).toBe(true);
    expect(new Set(rows.map(row => row.id)).size).toBe(rows.length);
  });
  it("excludes gate-only bosses from reward sources", () => {
    expect(rewardHealthRows().every(row => row.kind === "regular")).toBe(true);
  });
  it.each([1, 2, 15, 40, 10000])("uses actual generated reward lanes for Endless %i", number => {
    const id = `endless_${number}` as const, map = generateMap(id);
    const rows = rewardHealthRows([id]);
    expect(rows.filter(row => row.kind === "regular").reduce((sum, row) => sum + row.population, 0)).toBe(map.camps.reduce((sum, camp) => sum + camp.count, 0));
    const regularDefinitions = map.camps.flatMap(camp => [generatedEnemyStats(map, camp.lane), ...(camp.stat === "damage" && camp.count > 6 ? [generatedEnemyStats(map, "Dread Warden")] : [])]);
    for (const definition of regularDefinitions) expect(rows).toContainEqual(expect.objectContaining({ hp: definition.hp, reward: definition.reward.amount, stat: definition.reward.type, kind: "regular" }));
    expect(rows.every(row => row.kind === "regular")).toBe(true);
    expect(rows.every(row => Number.isFinite(row.ratio) && row.ratio > 0)).toBe(true);
  });
  it("exports exact numbers and rejects unknown maps", () => {
    const row = rewardHealthRows(["tutorial_forest"])[0];
    expect(rewardHealthCsv([row])).toContain(`"${row.ratio}"`);
    expect(rewardHealthCsv([{ ...row, enemy: 'Test, "enemy"' }])).toContain('"Test, ""enemy"""');
    expect(() => rewardHealthRows(["missing"])).toThrow("Unknown combat map");
  });
});
