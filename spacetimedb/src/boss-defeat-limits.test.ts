import { fillDefeatBudget, reportKills } from "../../tests/helpers/enemy-defeat";
import { STARTER_BOW } from "../../shared/items";
import { describe, expect, it, vi } from "vitest";
import { Timestamp } from "spacetimedb";
import { bossDefeatLimits } from "./boss-defeat-limits";
import { beginBossTimeBudget, combatTimeKey } from "./enemy-defeats";
import { crystalFixture, server } from "../../tests/helpers/crystal-hollows-fixture";
import { itemDamageMultiplierBonus } from "../../shared/items";
import { personalBossDefinition } from "../../shared/personal-bosses";
vi.mock("spacetimedb/server", () => import("../../tests/helpers/spacetime-module"));
// This suite probes the arithmetic repeatedly on one clock, including rejected
// claims. Session enforcement is covered separately in defeat-session.test.ts.
vi.mock("./enemy-defeats", async importOriginal => {
  const original = await importOriginal<typeof import("./enemy-defeats")>();
  return { ...original, acceptEnemyDefeats: (...args: Parameters<typeof original.acceptEnemyDefeats>) => {
    const result = original.acceptEnemyDefeats(...args);
    return result ? { ...result, violations: [] } : result;
  } };
});

function fixture(mapId = "tutorial_forest", fightSeconds = 100) {
  const f = crystalFixture();
  f.patch("player", { mapId });
  f.patch("playerProgress", { equippedRightHand: STARTER_BOW, inventoryJson: '["starter_bow"]', damage: 1e15 });
  // Account for the equipped bow multiplier; one shot/s, one projectile. The first
  // shot allowance makes this exactly fightSeconds of required combat time.
  const stats = { damage: personalBossDefinition(mapId)!.hp / (fightSeconds + 1) / (1 + itemDamageMultiplierBonus("starter_bow")),
    attackRate: 1, projectileCount: 1, inventoryJson: '["starter_bow"]', equippedRightHand: "starter_bow" };
  f.patch("playerProgress", stats);
  const start = f.ctx.timestamp.microsSinceUnixEpoch;
  let sequence = 0n;
  return { ...f, stats,
    begin: () => f.run(ctx => beginBossTimeBudget(ctx, mapId)),
    at: (seconds: number) => { f.ctx.timestamp = new Timestamp(start + BigInt(Math.round(seconds * 1e6))); },
    claim: (count = 1, freshStream = false) => {
      sequence++;
      reportKills(f, { mapId, streamId: freshStream ? `boss-validation-stream-${sequence}` : "boss-validation-stream-01",
        sequence: freshStream ? 1n : sequence, enemies: [{ enemy: "boss", count }] });
    },
    kills: () => f.db.playerLifetime.identity.find(f.ctx.sender)?.enemyKills ?? 0n,
  };
}

describe("boss time validation", () => {
  it("bounds a one-minute batch using HP, DPS, and the actual respawn delay", () => {
    // A 99-second fight plus a 45-second respawn does not fit one minute of credit; one kill is the floor.
    expect(bossDefeatLimits(100_000, 1_000, 1, 45)?.windowKills).toBe(1);
    // Instant kills: 105 seconds of credit over a 45-second cycle, then a 60-second one.
    expect(bossDefeatLimits(1, 1_000, 1, 45)?.windowKills).toBe(2);
    expect(bossDefeatLimits(1, 1_000, 1, 60)?.windowKills).toBe(2);
    for (const dps of [0, -1, NaN, Infinity]) expect(bossDefeatLimits(100, dps, 1, 45)).toBeNull();
  });

  it("rejects the dev-browser exploit: one or twenty impossible Endless kills grant nothing", () => {
    const f = fixture("endless_11", 50_000);
    const before = f.db.playerProgress.identity.find(f.ctx.sender);
    f.claim(1); f.claim(20, true);
    expect(f.kills()).toBe(0n);
    expect(f.db.playerProgress.identity.find(f.ctx.sender)).toEqual(before);
    expect(f.db.proceduralProgress.identity.find(f.ctx.sender)).toBeNull();
    expect(() => f.run(server.changeMap, { mapId: "home_exterior", x: 600, y: 700 })).not.toThrow();
  });

  it("does not reset earned combat time between batches, fresh streams, and reconnects", () => {
    const f = fixture();
    f.begin(); f.at(300);
    // Credit caps at one 145-second cycle, so a twenty-kill claim pays one.
    f.claim(20, true);
    expect(f.kills()).toBe(1n);
    // Restore this test's DPS after legitimate rewards to isolate time limits.
    f.patch("playerProgress", f.stats);
    f.begin(); f.claim(20, true);
    expect(f.kills()).toBe(1n);
    f.at(444); f.claim(20, true); expect(f.kills()).toBe(1n);
    f.at(445); f.claim(20, true);
    expect(f.kills()).toBe(2n);
  });

  it("requires elapsed combat time on a newly entered map", () => {
    const f = fixture();
    f.begin();
    f.claim(); expect(f.kills()).toBe(0n);
    f.at(99); f.claim(); expect(f.kills()).toBe(0n);
    f.at(100); f.claim(); expect(f.kills()).toBe(1n);
    f.patch("playerProgress", f.stats);
    f.at(244); f.claim(); expect(f.kills()).toBe(1n);
    f.at(245); f.claim(); expect(f.kills()).toBe(2n);
  });

  it("carries time for a slow fight without granting a free first kill or reset credit", () => {
    const f = fixture("tutorial_forest", 600);
    f.begin();
    f.at(300); f.claim(); expect(f.kills()).toBe(0n);
    f.at(599); f.begin(); f.claim(); expect(f.kills()).toBe(0n);
    f.at(600); f.claim(); expect(f.kills()).toBe(1n);
    f.patch("playerProgress", f.stats);
    f.at(900); f.claim(); expect(f.kills()).toBe(1n);
    f.at(1245); f.claim(); expect(f.kills()).toBe(2n);
  });

  it("reads a blank weapon slot as the best usable weapon, and cannot turn projectile count into sword DPS", () => {
    // A blank hand is an ordinary saved state, and the client fights with the
    // weapon it resolves to, so the bound does too: exactly the starter bow's.
    const kills = (rightHand: string) => {
      const f = fixture();
      f.patch("playerProgress", { equippedRightHand: rightHand });
      f.begin(); f.at(100); f.claim();
      return f.kills();
    };
    expect(kills("")).toBe(1n);
    expect(kills("")).toBe(kills(STARTER_BOW));
    const sword = fixture("endless_11", 50_000);
    sword.patch("playerProgress", { inventoryJson: '["wooden_sword"]', equippedRightHand: "wooden_sword", projectileCount: 100 });
    sword.claim(); expect(sword.kills()).toBe(0n);
  });

  it("ignores locked gear even if a stale server row still contains it", () => {
    const f = fixture("tutorial_forest", 600);
    f.patch("playerProgress", { inventoryJson: '["starter_bow","ion_bow","ion_helmet","ion_armor"]',
      equippedHead: "ion_helmet", equippedChest: "ion_armor", ionCitadelUnlocked: false });
    f.begin(); f.at(300); f.claim();
    expect(f.kills()).toBe(0n);
    expect(f.db.playerProgress.identity.find(f.ctx.sender).desertUnlocked).not.toBe(true);
    f.at(600); f.claim();
    expect(f.kills()).toBe(1n);
    expect(f.db.playerProgress.identity.find(f.ctx.sender).desertUnlocked).toBe(true);
    // A locked bow in hand fights as the best usable weapon (the starter bow),
    // never with the ion bow's damage: the next kill still takes the full fight.
    f.patch("playerProgress", { ...f.stats, equippedRightHand: "ion_bow" });
    f.at(1200); f.claim();
    expect(f.kills()).toBe(1n);
    f.at(1245); f.claim();
    expect(f.kills()).toBe(2n);
  });

  it("honors server research, ranged volleys, and possible Endless criticals", () => {
    const ranged = fixture("endless_11", 100);
    ranged.claim(); expect(ranged.kills()).toBe(0n);
    ranged.patch("playerProgress", { projectileCount: 2 });
    // Rejected claims retain the already-earned time, so the stronger build
    // can now legitimately fit a kill into the available one-minute credit.
    ranged.claim(); expect(ranged.kills()).toBe(1n);
    const researched = fixture("endless_11", 100);
    researched.claim(); expect(researched.kills()).toBe(0n);
    researched.seed("playerResearch", { identity: researched.ctx.sender, warcraft: 50,
      criticalChance: 1, criticalDamage: 20 });
    researched.claim(); expect(researched.kills()).toBe(1n);
  });

  it("clamps legacy attack intervals to the actual attack-speed cap", () => {
    const f = fixture("endless_11", 1_000);
    f.patch("playerProgress", { attackRate: .000001 });
    f.claim(20); expect(f.kills()).toBe(0n);
  });

  it("includes validated regular-kill gains in the same save, regardless of entry order", () => {
    const f = fixture();
    f.patch("playerProgress", { damage: 105 / (1 + itemDamageMultiplierBonus("starter_bow")) });
    f.claim(); expect(f.kills()).toBe(0n);
    f.patch("playerProgress", { equippedRightHand: STARTER_BOW, inventoryJson: '["starter_bow"]', damage: 1e15 });
    // A player who has been on this map long enough to bank the allowance; the
    // arrival bank is not what this test is about.
    fillDefeatBudget(f, "tutorial_forest", "Cindermaw");
    reportKills(f, { mapId: "tutorial_forest", streamId: "mixed-boss-save-window-01", sequence: 1n,
      // Sixty Cindermaw sit inside what one projectile a second can plausibly kill in a minute.
      enemies: [{ enemy: "boss", count: 1 }, { enemy: "Cindermaw", count: 60 }] });
    expect(f.kills()).toBe(61n);
    expect(f.db.playerProgress.identity.find(f.ctx.sender).desertUnlocked).toBe(true);
  });
});


it("rewards consecutive legitimate 100-second boss fights across save windows", () => {
  const f = fixture(); f.begin();
  for (const [index, seconds] of [100, 245, 390, 535, 680].entries()) {
    f.at(seconds); f.claim();
    expect(f.kills(), `kill at ${seconds}s`).toBe(BigInt(index + 1));
    f.patch("playerProgress", f.stats);
  }
});
it("lets Reflect's share of the player's health shorten a clear, and only for a player who has Reflect", () => {
  // A 100-second fight by damage alone. Reflect throws back at most half of
  // everything taken, which a player can take no more of than their health:
  // with health equal to the boss's, half the boss can come from Reflect.
  const clears = (riposte: number) => {
    const f = fixture(); f.begin();
    const stats = { ...f.stats, maxHp: personalBossDefinition("tutorial_forest")!.hp, regen: 0 };
    f.patch("playerProgress", stats);
    if (riposte) f.seed("playerPrestigePerk", { identity: f.ctx.sender, keenEdge: 0, doubleStrike: 0, splitShot: 0, riposte });
    for (const seconds of [60, 155, 250, 345]) { f.at(seconds); f.claim(); f.patch("playerProgress", stats); }
    return f.kills();
  };
  expect(clears(1)).toBe(4n);
  expect(clears(0)).toBeLessThan(4n);
});

it("scales Reflect's share of a clear by the player's armor, since it returns the hit before armor", () => {
  // Half the health of the test above, but armor that halves every hit: what
  // arrived before armor, and so what Reflect can return, is twice what got through.
  const clears = (armor: number) => {
    const f = fixture(); f.begin();
    const stats = { ...f.stats, maxHp: personalBossDefinition("tutorial_forest")!.hp / 2, regen: 0, armor };
    f.patch("playerProgress", stats);
    f.seed("playerPrestigePerk", { identity: f.ctx.sender, keenEdge: 0, doubleStrike: 0, splitShot: 0, riposte: 1 });
    for (const seconds of [60, 155, 250, 345]) { f.at(seconds); f.claim(); f.patch("playerProgress", stats); }
    return f.kills();
  };
  expect(clears(1_000)).toBe(4n);
  expect(clears(0)).toBeLessThan(4n);
});
it("does not treat delayed batch receipt times as the times bosses actually died", () => {
  // Five-second fights: two fit the 105 seconds of credit banked by t=300.
  const f = fixture("tutorial_forest", 5); f.begin();
  f.at(300); f.claim(2); expect(f.kills()).toBe(2n); f.patch("playerProgress", f.stats);
  f.at(390); f.claim(); expect(f.kills()).toBe(3n); f.patch("playerProgress", f.stats);
  f.at(535); f.claim(); expect(f.kills()).toBe(4n);
});


it("charges a clear's fight to the account's combat clock after paying it, and never refuses one for it", () => {
  // The fight was time this player could not spend on regular enemies. Only
  // the boss's own clock decides whether a clear is paid; the shared one is
  // charged afterwards and stops at zero.
  const f = fixture(); f.begin();
  const key = combatTimeKey(f.ctx.sender);
  const setClock = (tokens: number) => {
    const row = { key, identity: f.ctx.sender, tokens, updatedAtMicros: f.ctx.timestamp.microsSinceUnixEpoch };
    if (f.db.enemyDefeatBudget.key.find(key)) f.db.enemyDefeatBudget.key.update(row); else f.db.enemyDefeatBudget.insert(row);
  };
  f.at(100); setClock(20);
  f.claim(); expect(f.kills()).toBe(1n);
  expect(f.db.enemyDefeatBudget.key.find(key).tokens).toBe(0);
  f.patch("playerProgress", f.stats);
  f.at(245); setClock(500);
  f.claim(); expect(f.kills()).toBe(2n);
  // Less the 100-second fight.
  expect(f.db.enemyDefeatBudget.key.find(key).tokens).toBeCloseTo(400, 6);
});

it("ignores the retired 20-boss cap while enforcing earned DPS time", () => {
  const f = fixture(); f.begin();
  const at = f.ctx.timestamp.microsSinceUnixEpoch;
  f.seed("bossDefeatWindow", { identity: f.ctx.sender, acceptedAtMicros: Array(20).fill(at) });
  f.seed("bossMapDefeatWindow", { identity: f.ctx.sender, acceptedAtMicros: Array(20).fill(at), acceptedMapIds: Array(20).fill("tutorial_forest") });
  f.claim(); expect(f.kills()).toBe(0n);
  f.at(100); f.claim(); expect(f.kills()).toBe(1n);
  expect(f.db.bossDefeatWindow.identity.find(f.ctx.sender).acceptedAtMicros).toHaveLength(20);
});

it("accepts Mal's starter-stone dragon defeat using saved guest equipment", () => {
  const f = fixture();
  f.patch("playerProgress", { damage: 299.91003, maxHp: 514.75, armor: 16.800001,
    regen: 46.600002, attackRate: 0.3809524, projectileCount: 1,
    inventoryJson: '["basic_paper_hat","starter_stone","trailblazer_boots","wooden_armor","forest_cap"]',
    equippedRightHand: "starter_stone", equippedLeftHand: "", equippedHead: "forest_cap", equippedChest: "" });
  f.seed("playerResearch", { identity: f.ctx.sender, warcraft: 5 });
  f.begin(); f.at(300); f.claim();
  expect(f.db.playerProgress.identity.find(f.ctx.sender).desertUnlocked).toBe(true);
});

it.each(['tutorial_forest', 'beginner_desert', 'intermediate_snowlands', 'advanced_lava_wastes',
  'infernal_depths', 'water_reach', 'samurai_garden', 'cloudspire', 'moonfen', 'crystal_hollows',
  'clockwork_ruins', 'duskfall_orchard', 'neon_bastion', 'verdant_catacombs', 'ion_citadel', 'endless_1'])
('accepts a legitimate first critical victory on %s and does not grant duplicate rewards', mapId => {
  const f = fixture(mapId, 600);
  f.seed('playerResearch', { identity: f.ctx.sender, criticalChance: 1, criticalDamage: 20 });
  f.begin();
  // Possible lucky crits are bounded by server-owned research, not average DPS.
  f.at(294); f.claim();
  expect(f.kills()).toBe(1n);
  f.claim(); expect(f.kills()).toBe(1n);
});
