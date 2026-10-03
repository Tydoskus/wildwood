import { describe, expect, it } from "vitest";
import { CAMPAIGN_MAPS } from "../../../shared/campaign-registry";
import { MAP_ASSET_GROUPS } from "./map-asset-groups";
import { BOSSES, BOSS_KINDS, bossForMap, bossStateForMap, clearBossAttack } from "./boss-registry";
import { createGameBootstrap } from "./game-bootstrap";

describe("world boss registry", () => {
  it("places each campaign map's boss on that map, and nowhere else", () => {
    expect(BOSS_KINDS).toEqual(CAMPAIGN_MAPS.map((map) => map.bossKind));
    for (const map of CAMPAIGN_MAPS) expect(bossForMap(map.id)?.kind).toBe(map.bossKind);
    expect(new Set(BOSS_KINDS.map((kind) => BOSSES[kind].mapId)).size).toBe(BOSS_KINDS.length);
    expect(bossForMap("home_exterior")).toBeNull();
    expect(bossForMap("endless_1")).toBeNull();
  });

  it("loads each boss's art with its own map", () => {
    for (const kind of BOSS_KINDS) {
      const { mapId, assetGroup } = BOSSES[kind];
      expect(MAP_ASSET_GROUPS[mapId].art).toContain(assetGroup);
    }
  });

  it("starts every boss at full health, opening with its first attack and no attack in play", () => {
    const { bosses } = createGameBootstrap();
    for (const kind of BOSS_KINDS) {
      const boss = bosses[kind];
      expect(boss).toMatchObject({ isBoss: true, r: BOSSES[kind].body.radius, hp: BOSSES[kind].maxHp(), nextAttack: BOSSES[kind].firstAttack, encounter: null });
      for (const slot of BOSSES[kind].attackSlots) expect(boss[slot as keyof typeof boss]).toBeNull();
      expect(bossStateForMap(bosses, BOSSES[kind].mapId)).toBe(boss);
    }
    // The Dragon predates boss kinds; combat recognises it by having none.
    expect("bossKind" in bosses.dragon).toBe(false);
  });

  it("ends a boss's attack in every slot it uses", () => {
    const { bosses } = createGameBootstrap();
    bosses.frostclaw.roar = { windup: 0, timer: 1, duration: 1, hitPlayer: false };
    bosses.frostclaw.rift = { angle: 0, windup: 0, timer: 1, duration: 1, hitPlayer: false };
    clearBossAttack("frostclaw", bosses.frostclaw);
    expect(bosses.frostclaw).toMatchObject({ roar: null, rift: null });
  });
});
