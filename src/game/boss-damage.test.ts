import { describe, expect, it } from "vitest";
import { damageAfterArmor } from "./combat";
import { BOSS_DAMAGE_PROFILES, BOSS_DAMAGE_REFERENCE } from "./boss-damage";
import { ENEMY_TYPES, type EnemyKind } from "./enemies";
import { lateMapReferenceBuild } from "../../shared/incoming-damage";

const encounters = {
  dragon: {
    kinds: ["Bramble", "Needle", "Mossback", "Spitter", "Brood", "Cindermaw", "King Slime", "Dread Warden"],
    build: { maxHp: 4_000, armor: 60 },
  },
  spider: {
    kinds: ["Dune Raider", "Dune Archer", "Venom Guard", "Wastes Reaper", "Blight Oracle"],
    build: { maxHp: 30_000, armor: 1_400 },
  },
  frostclaw: {
    kinds: ["Frost Raider", "Glacier Archer", "Rime Guard", "Whiteout Reaper", "Aurora Oracle"],
    build: { maxHp: 130_000, armor: 5_000 },
  },
  magmalisk: {
    kinds: ["Ember Raider", "Cinder Archer", "Magma Guard", "Ash Reaper", "Inferno Oracle"],
    build: { maxHp: 1_200_000, armor: 100_000 },
  },
  gloomroot: {
    kinds: ["Depth Raider", "Abyss Archer", "Obsidian Colossus", "Doom Reaper", "Nether Oracle"],
    build: { maxHp: 8_000_000, armor: 2_000_000 },
  },
  tidewyrm: {
    kinds: ["Tide Raider", "Reef Archer", "Coral Colossus", "Drowned Reaper", "Tidal Oracle"],
    build: { maxHp: 60_000_000, armor: 25_000_000 },
  },
  koiShogun: {
    kinds: ["Sakura Ronin", "Petal Archer", "Bamboo Guardian", "Moonblade Reaper", "Shrine Oracle"],
    build: lateMapReferenceBuild(0),
  },
  tempestKirin: {
    kinds: ["Gale Prowler", "Nimbus Archer", "Skyguard Colossus", "Thunder Reaper", "Tempest Oracle"],
    build: lateMapReferenceBuild(1),
  },
  miremaw: {
    kinds: ["Fen Prowler", "Glowcap Archer", "Bog Colossus", "Moonmire Reaper", "Wisp Oracle"],
    build: lateMapReferenceBuild(2),
  },
  prismshell: {
    kinds: ["Shard Hopper", "Crystal Spitter", "Geode Guardian", "Prism Reaver", "Hollow Oracle"],
    build: lateMapReferenceBuild(3),
  },
} as const satisfies Record<keyof typeof BOSS_DAMAGE_PROFILES, {
  kinds: readonly EnemyKind[];
  build: { maxHp: number; armor: number };
}>;

describe("boss incoming damage", () => {
  it("anchors every encounter to the strongest regular enemy in its own map", () => {
    for (const [boss, encounter] of Object.entries(encounters) as Array<[
      keyof typeof encounters,
      (typeof encounters)[keyof typeof encounters],
    ]>) {
      expect(BOSS_DAMAGE_REFERENCE[boss]).toBe(Math.max(...encounter.kinds.map((kind) => ENEMY_TYPES[kind].damage)));
    }
  });

  it("keeps telegraphed abilities in the intended post-armor range for each tier", () => {
    for (const [boss, encounter] of Object.entries(encounters) as Array<[
      keyof typeof encounters,
      (typeof encounters)[keyof typeof encounters],
    ]>) {
      const abilityDamage = Object.entries(BOSS_DAMAGE_PROFILES[boss])
        .filter(([attack]) => attack !== "contact")
        .map(([, damage]) => damage);
      const strongestHit = Math.max(...abilityDamage);
      const hitPercent = damageAfterArmor(strongestHit, encounter.build.armor) / encounter.build.maxHp * 100;
      const late = ["koiShogun", "tempestKirin", "miremaw", "prismshell"].includes(boss);
      expect(hitPercent, `${boss} strongest ability`).toBeGreaterThanOrEqual(late ? 32 : 8);
      expect(hitPercent, `${boss} strongest ability`).toBeLessThanOrEqual(late ? 60 : 20);

      const contactPercent = damageAfterArmor(
        BOSS_DAMAGE_PROFILES[boss].contact,
        encounter.build.armor,
      ) / encounter.build.maxHp * 100;
      expect(contactPercent, `${boss} contact`).toBeLessThanOrEqual(35);
    }
  });

  it("keeps overlapping late-boss hazards below the heavy strike", () => {
    for (const boss of ["koiShogun", "tempestKirin", "miremaw", "prismshell"] as const) {
      const [heavy, area, contact] = Object.values(BOSS_DAMAGE_PROFILES[boss]);
      expect(area / heavy).toBeCloseTo(.7);
      expect(contact / heavy).toBeCloseTo(.5);
    }
  });

  it("makes Frostclaw categorically safer than a Night Forest enemy", () => {
    const weakestNightHit = Math.min(...encounters.gloomroot.kinds.map((kind) => ENEMY_TYPES[kind].damage));
    expect(Math.max(...Object.values(BOSS_DAMAGE_PROFILES.frostclaw))).toBeLessThan(weakestNightHit);
  });
});
