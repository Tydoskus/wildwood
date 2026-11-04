import { expect, it, vi } from "vitest";
import { crystalFixture, identity, server } from "../../tests/helpers/crystal-hollows-fixture";
import { progressOf } from "../../tests/helpers/progress";
import { DEFAULT_ATTACK_INTERVAL } from "../../shared/rules";
import { challengeAttackInterval } from "../../shared/prestige-challenge";
import { MODULE_MIGRATION_VERSION } from "./module-migrations";
import { GRADE_ROLL_RANGE } from "../../shared/gear-grades";
vi.mock("spacetimedb/server", () => import("../../tests/helpers/spacetime-module"));

it("migration 68 puts every run's own attack speed and crit back to base, keeping Reflect Only wins and quest progress, and rolls weapons held", () => {
  const f = crystalFixture();
  f.seed("moduleMigrationState", { id: 0, version: 67 });
  // A main run with two Reflect Only wins and map-earned speed and crit.
  f.patch("playerProgress", { attackRate: .45, critRating: 40, equippedRightHand: "rare_bow", inventoryJson: '["rare_bow"]' });
  f.seed("playerPrestigeChallenge", { identity: f.ctx.sender, active: false, completed: 2 });
  f.seed("playerDailyQuest", { identity: f.ctx.sender, day: 1, bonus: 1, guildPoints: 0, guildName: "",
    questsJson: JSON.stringify([{ mapId: "tutorial_forest", stat: "speed", target: 40, progress: 12 }, { mapId: "tutorial_forest", stat: "damage", target: 40, progress: 3 }]) });
  // Another player in a Reflect Only run, one win so far, the main run saved aside.
  const other = identity("2");
  f.progress(other, { attackRate: .5, critRating: 25 });
  f.seed("playerPrestigeChallenge", { identity: other, active: true, completed: 1 });
  f.seed("prestigeChallengeBackup", { identity: other, progressJson: JSON.stringify({ maxHp: 100, damage: 9, armor: 0, regen: 0, attackRate: .4, critRating: 30 }),
    completedEndless: 0, mapId: "tutorial_forest", x: 0, y: 0 });

  f.ctx.connectionId = null;
  f.run(server.onConnect);
  expect(f.db.moduleMigrationState.id.find(0).version).toBe(MODULE_MIGRATION_VERSION);

  const twoWins = challengeAttackInterval(DEFAULT_ATTACK_INTERVAL, { active: false, completed: 2 });
  expect(progressOf(f)).toMatchObject({ attackRate: twoWins, critRating: 0 });
  expect(progressOf(f, other)).toMatchObject({ attackRate: DEFAULT_ATTACK_INTERVAL, critRating: 0 });
  const saved = JSON.parse(f.db.prestigeChallengeBackup.identity.find(other).progressJson);
  expect(saved).toMatchObject({ attackRate: challengeAttackInterval(DEFAULT_ATTACK_INTERVAL, { active: false, completed: 1 }), critRating: 0, damage: 9 });
  // The bow already held rolls its speed and crit, each somewhere in a Rare's range.
  const roll = f.db.playerWeaponStat.key.find(`${f.ctx.sender.toHexString()}:rare_bow`);
  for (const value of [roll.attackSpeed, roll.critDamage]) {
    expect(value).toBeGreaterThanOrEqual(GRADE_ROLL_RANGE.rare.min - 1e-6);
    expect(value).toBeLessThanOrEqual(GRADE_ROLL_RANGE.rare.max + 1e-6);
  }
  // The speed quest is now on another Forest stat, its progress kept.
  const [moved, kept] = JSON.parse(f.db.playerDailyQuest.identity.find(f.ctx.sender).questsJson);
  expect(moved).toMatchObject({ mapId: "tutorial_forest", target: 40, progress: 12 });
  expect(["health", "armor", "regen"]).toContain(moved.stat);
  expect(kept).toMatchObject({ stat: "damage", progress: 3 });
});
