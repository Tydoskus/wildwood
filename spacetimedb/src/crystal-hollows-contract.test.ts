import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { CRYSTAL_HOLLOWS_MAP_ID, MAP_IDS, PROTOCOL_VERSION } from "../../shared/rules";

const source = readFileSync(new URL("./index.ts", import.meta.url), "utf8");
function section(start: string, end: string) {
  const from = source.indexOf(start);
  const to = source.indexOf(end, from + start.length);
  if (from < 0 || to < 0) throw new Error(`Missing server contract section: ${start} → ${end}`);
  return source.slice(from, to);
}

describe("Crystal Hollows server integration", () => {
  it("appends a default-false unlock without accepting it from client saves", () => {
    const schema = section("const playerProgress = table(", "const playerResearch");
    expect(schema).toContain("crystalHollowsUnlocked: t.bool().default(false)");
    expect(schema.indexOf("crystalHollowsUnlocked:")).toBeGreaterThan(schema.indexOf("moonfenUnlocked:"));
    const save = section("export const savePlayerProgress", "export const resetPlayerProgress");
    expect(save).toContain("crystalHollowsUnlocked: base.crystalHollowsUnlocked");
    expect(save).not.toContain("crystalHollowsUnlocked: progress.crystalHollowsUnlocked");
    expect(MAP_IDS).toContain(CRYSTAL_HOLLOWS_MAP_ID);
    expect(PROTOCOL_VERSION).toBe(85);
  });

  it("requires Miremaw's recorded victory, not stats or the previous boss, to open the new map", () => {
    expect(section("function rewardMiremawContributor", "function rewardPrismshellContributor")).toContain("crystalHollowsUnlocked: true");
    expect(section("function rewardTempestKirinContributor", "function rewardMiremawContributor")).not.toContain("crystalHollowsUnlocked");
    const migration = section("if (currentVersion < 21)", "const next = { id: 0, version: MODULE_MIGRATION_VERSION }");
    expect(migration).toContain("ctx.db.miremawResult.id.find(MIREMAW_ID)");
    expect(migration).toContain("resultIncludesContributor(result, progress.identity)");
    expect(migration).toContain("{ ...progress, crystalHollowsUnlocked: true }");
    expect(migration).not.toMatch(/progress\.(damage|maxHp|armor|regen)/);
    const travel = section("export const changeMap", "export const setSpeed");
    expect(travel).toContain("mapId === CRYSTAL_HOLLOWS_MAP_ID && !currentProgress?.crystalHollowsUnlocked");
    expect(travel).toContain("Defeat Miremaw before entering");
    expect(travel.indexOf("!currentProgress?.crystalHollowsUnlocked")).toBeLessThan(travel.indexOf("transitionPlayerMap("));
  });

  it("uses the existing controlling-player, map, range, cadence and projectile checks for boss damage", () => {
    const damage = section("function applyPrismshellDamage", "export const damageMiremawFromPosition");
    for (const guard of [
      "requireControllingPlayer(ctx)", "activeDuelFor(ctx, ctx.sender)",
      "activePlayer.mapId !== CRYSTAL_HOLLOWS_MAP_ID", "!prismshell.alive || prismshell.hp <= 0",
      "every(Number.isFinite)", "centerDistance - PRISMSHELL_RADIUS > progress.attackRange",
      "attackIntervalForProgress(ctx, ctx.sender, progress)", "progress.projectileCount - currentWindow.hits",
      "researchedDamage(ctx, ctx.sender, progress.damage)", "finishPrismshellEncounter(ctx, nextPrismshell)",
    ]) expect(damage).toContain(guard);
    const reducer = readFileSync(new URL("../../src/module_bindings/damage_prismshell_from_position_reducer.ts", import.meta.url), "utf8");
    expect(reducer).not.toMatch(/damage:|reward:|identity:|timestamp:|hp:/);
    expect(reducer).toContain("hits:");
  });

  it("rewards positive contributors in the current encounter and resets combat rows on respawn", () => {
    const finish = section("function finishPrismshellEncounter", "function clearDragonCombatRows");
    expect(finish).toContain("row.encounter === prismshell.encounter && row.damage > 0");
    expect(finish).toContain("for (const row of contributions) rewardPrismshellContributor(ctx, row.identity)");
    expect(finish).toContain("hp: 0, alive: false, respawnAtMicros");
    expect(finish).toContain("ctx.db.prismshellRespawnSchedule.insert");
    const respawn = section("export const respawnPrismshell", "function applyDragonDamage");
    expect(respawn).toContain("prismshell.encounter !== schedule.encounter");
    expect(respawn).toContain("clearPrismshellCombatRows(ctx)");
    expect(respawn).toContain("encounter: prismshell.encounter + 1n");
  });

  it("includes the new rows in guest merging, name updates, and complete player cleanup", () => {
    expect(section("export const claimGuestAccount", "export const savePlayerProgress")).toContain("[ctx.db.prismshellContribution, ctx.db.prismshellAttackWindow]");
    expect(section("function syncDisplayNamePresentation", "function defaultPlayerProgress")).toContain("ctx.db.prismshellContribution");
    for (const cleanup of [
      section("function removeVirtualPlayerData", "function removePlayerIdentityData"),
      section("function removePlayerIdentityData", "function clearVirtualPlayersForOwner"),
    ]) {
      expect(cleanup).toContain("ctx.db.prismshellContribution.identity.delete(identity)");
      expect(cleanup).toContain("ctx.db.prismshellAttackWindow.identity.delete(identity)");
    }
  });
});
