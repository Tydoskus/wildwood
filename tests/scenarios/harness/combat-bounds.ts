// The server harness first: it swaps the host-only SDK in before any server module loads.
import { scenarioWorld } from "./server";
import { bowSkillKey } from "../../../spacetimedb/src/bow-skills";
import { swordSkillKey } from "../../../spacetimedb/src/sword-skills";
import { staffSkillKey } from "../../../spacetimedb/src/staff-skills";
import { withDefeatClock } from "../../../spacetimedb/src/enemy-defeats";
import { weaponRollLevels } from "../../../shared/items";
import type { SimPlayer } from "./sim";

/** The kills a sim claims over `seconds` of play, as its kill report would send them. */
export async function killsWhilePlaying(sim: SimPlayer, seconds: number) {
  const before = sim.parts.claims();
  await sim.play(seconds);
  const after = sim.parts.claims();
  return Object.fromEntries(Object.entries(after).map(([enemy, count]) => [enemy, count - (before[enemy] ?? 0)]).filter(([, count]) => Number(count) > 0)) as Record<string, number>;
}

export type ClaimBuild = { mapId: string; weapon: string; damage: number; attackRate: number; maxHp?: number;
  skills?: Record<string, number> };

/**
 * The real server's answer to a fight: a character with this build on this map, who played
 * `seconds` of game time in `realSeconds` of real time (the same, for an honest tab), reports these kills.
 * Returns the kills the server paid.
 */
export function serverPays(build: ClaimBuild, kills: Record<string, number>, seconds: number, realSeconds = seconds) {
  const world = scenarioWorld();
  const ann = world.join("Ann");
  ann.patch("playerProgress", { equippedRightHand: build.weapon, inventoryJson: JSON.stringify([build.weapon]), damage: build.damage,
    attackRate: build.attackRate, maxHp: build.maxHp ?? 1e9, desertUnlocked: true, snowlandsUnlocked: true, bossRewardClaims: 3 });
  ann.patch("player", { mapId: build.mapId });
  if (build.skills) world.setup(ctx => {
    const db = ctx.db as any;
    const skills = build.skills!;
    if ("arrowStorm" in skills) db.playerBowSkill.insert({ key: bowSkillKey(ann.identity, build.weapon), identity: ann.identity, itemId: build.weapon, arrowStorm: 0, ricochet: 0, piercingShot: 0, ...skills });
    else if ("whirlwind" in skills) db.playerSwordSkill.insert({ key: swordSkillKey(ann.identity, build.weapon), identity: ann.identity, itemId: build.weapon, whirlwind: 0, deflect: 0, shockwave: 0, ...skills });
    // A dagger's skills ride in its weapon roll row, beside its speed and crit: those at the middle of their range,
    // as a sim's weapon with no roll known plays them.
    else if ("backstab" in skills) {
      const middle = weaponRollLevels(build.weapon, 0, "attackSpeed");
      db.playerWeaponStat.insert({ key: `${ann.identity.toHexString()}:${build.weapon}`, identity: ann.identity, itemId: build.weapon,
        copyId: 0n, offerId: 0n, attackSpeed: middle, critDamage: middle, backstab: 0, poison: 0, dodge: 0, ...skills });
    }
    else db.playerStaffSkill.insert({ key: staffSkillKey(ann.identity, build.weapon), identity: ann.identity, itemId: build.weapon, copyId: 0n, offerId: 0n, meteor: 0, chain: 0, frostNova: 0, ...skills });
  });
  // She has been playing a while: her clocks have nothing banked, so this fight's own time pays for its kills.
  world.setup(ctx => {
    const empty = { identity: ann.identity, reportTokens: 0, reportAt: 0n, simTokens: 0, simAt: 0n, combatTokens: 0, combatAt: 0n, rateTokens: 0, rateAt: 0n };
    const at = ctx.timestamp.microsSinceUnixEpoch;
    (ctx.db as any).playerDefeatClock.insert(withDefeatClock(withDefeatClock(empty, "combat", 0, at), "sim", 0, at));
  });
  const lifetime = () => Number(ann.row("playerLifetime")?.enemyKills ?? 0n);
  const before = lifetime();
  world.advance(realSeconds * 1000);
  const error = ann.refusal("reportEnemyDefeats", { streamId: "scenario-kill-stream-1", sequence: 1n, mapId: build.mapId, simulatedMillis: Math.round(seconds * 1000),
    enemies: Object.entries(kills).map(([enemy, count]) => ({ enemy, count })) });
  return { paid: lifetime() - before, error };
}
