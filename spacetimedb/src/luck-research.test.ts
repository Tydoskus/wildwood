import { describe, expect, it, vi } from "vitest";
import { crystalFixture, identity, server } from "../../tests/helpers/crystal-hollows-fixture";
import { ATTACK_BALANCE_VERSION, SPACETIME_AUTH_CLIENT_ID, SPACETIME_AUTH_ISSUER } from "../../shared/rules";
import { LUCK_RESEARCH_IDS, createEmptyResearchRanks } from "../../shared/research";
import { CARD_DROP_OUTCOMES } from "../../shared/cards";
import { TOWN_FEET_OFFSET, TOWN_SMITH_POSITION } from "../../shared/town";
import { awardCardDrops } from "./card-drops";
import { cardCount } from "./gear-cards";
import { awardRegularEnemyLoot } from "./enemy-loot-award";
import { awardKillGold, goldChanceMultiplier, goldFor } from "./gold";
import { publishItemDrop } from "./equipment-copies";
import { bowSkillRollFor } from "./bow-skills";
import { addOres, refineLevelFor, setRefineLevel } from "./item-refine";
vi.mock("spacetimedb/server", () => import("../../tests/helpers/spacetime-module"));

type Fixture = ReturnType<typeof crystalFixture>;
/** A player_research row: every rank but the luck ones, which have a table of their own. */
const research = (f: Fixture, ranks: Record<string, number>) => {
  const row: Record<string, unknown> = { identity: f.ctx.sender, frontierMastery: 0, ...createEmptyResearchRanks(), ...ranks };
  for (const id of LUCK_RESEARCH_IDS) delete row[id];
  f.seed("playerResearch", row);
};
const luck = (f: Fixture, ranks: Record<string, number>, who = f.ctx.sender) =>
  f.seed("playerLuckResearch", { identity: who, cardLuck: 0, gearLuck: 0, miningLuck: 0, skillLuck: 0, refineLuck: 0, ...ranks });
const switchedOff = (f: Fixture, off: string) => f.seed("playerBonusToggle", { identity: f.ctx.sender, off });
const always = (f: Fixture, value: number, integer = 1) => {
  Object.assign(f.ctx, { random: Object.assign(() => value, { integerInRange: () => integer }) });
};

describe("luck research on the server", () => {
  it("starts and completes a luck research into player_luck_research, leaving player_research's columns alone", () => {
    const f = crystalFixture();
    f.standAtResearch();
    research(f, { inventorySlots: 1 });
    f.run(server.startResearch, { researchId: "gearLuck" });
    const active = f.db.activeResearch.identity.find(f.ctx.sender);
    f.ctx.timestamp = active.completesAt;
    f.run(server.completeResearch, { schedule: [...f.db.researchCompletionSchedule.iter()][0] });
    expect(f.db.playerLuckResearch.identity.find(f.ctx.sender)).toMatchObject({ gearLuck: 1, cardLuck: 0 });
    expect(f.db.playerResearch.identity.find(f.ctx.sender)).not.toHaveProperty("gearLuck");
    // Mining Luck reads the stored Gear Luck rank to open.
    expect(() => f.run(server.startResearch, { researchId: "miningLuck" })).not.toThrow();
  });

  it("refuses a luck research whose prerequisites are not met", () => {
    const f = crystalFixture();
    f.standAtResearch();
    research(f, { inventorySlots: 1 });
    expect(() => f.run(server.startResearch, { researchId: "refineLuck" })).toThrow("Research prerequisites not met.");
  });

  it("raises card drops with Card Luck, unless switched off", () => {
    const f = crystalFixture();
    const award = () => f.transaction(() => awardCardDrops(f.ctx, f.ctx.sender, "tutorial_forest", [{ enemy: "Needle", count: 1 }], 0));
    always(f, 1.4 / CARD_DROP_OUTCOMES.regular);
    award();
    expect(cardCount(f.ctx, f.ctx.sender, "needle_card")).toBe(0);
    luck(f, { cardLuck: 10 });
    switchedOff(f, "research.cardLuck");
    award();
    expect(cardCount(f.ctx, f.ctx.sender, "needle_card")).toBe(0);
    f.db.playerBonusToggle.identity.delete(f.ctx.sender);
    award();
    expect(cardCount(f.ctx, f.ctx.sender, "needle_card")).toBe(1);
  });

  it("raises the gold drop chance with Gold Luck, and drops no gear", () => {
    const f = crystalFixture();
    // Gold drops on 10% of kills: a draw of .11 misses, and lands at Gold Luck 5's 12.5%.
    always(f, .11, 1);
    const gold = () => { f.transaction(() => awardKillGold(f.ctx, f.ctx.sender, 1, false)); return goldFor(f.ctx, f.ctx.sender); };
    expect(gold()).toBe(0n);
    luck(f, { gearLuck: 5 });
    expect(goldChanceMultiplier(f.ctx, f.ctx.sender)).toBeCloseTo(1.25, 9);
    expect(gold()).toBe(3n);
    switchedOff(f, "research.gearLuck");
    expect(goldChanceMultiplier(f.ctx, f.ctx.sender)).toBe(1);
    f.transaction(() => awardRegularEnemyLoot(f.ctx as any, "advanced_lava_wastes", 1, null));
    expect([...f.db.playerItemDrop.iter()]).toEqual([]);
  });

  it("raises a dropped weapon's skill chance with Skill Luck", () => {
    const f = crystalFixture();
    // Appearance draws of .4 miss a third, and land under 5/12.
    always(f, .4);
    f.transaction(() => publishItemDrop(f.ctx as any, f.ctx.sender, "sky_bow", false));
    expect(Object.values(bowSkillRollFor(f.ctx as any, f.ctx.sender, "sky_bow")).every(value => value === 0)).toBe(true);
    luck(f, { skillLuck: 5 });
    f.transaction(() => publishItemDrop(f.ctx as any, f.ctx.sender, "ion_bow", false));
    expect(Object.values(bowSkillRollFor(f.ctx as any, f.ctx.sender, "ion_bow")).every(value => value > 0)).toBe(true);
  });

  it("raises a risky refine with Refine Luck", () => {
    const f = crystalFixture();
    f.patch("player", { mapId: "town", x: TOWN_SMITH_POSITION.x, y: TOWN_SMITH_POSITION.y - TOWN_FEET_OFFSET });
    f.patch("playerProgress", { inventoryJson: JSON.stringify(["ion_bow"]), equippedRightHand: "ion_bow" });
    addOres(f.ctx, f.ctx.sender, "adamant_ore", 10);
    const refine = () => f.run(server.refineItem, { itemId: "ion_bow", copyId: 0n, expectedLevel: refineLevelFor(f.ctx, f.ctx.sender, "ion_bow", 0n) });
    // Ion Bow +4 to +5 is 60%; Refine Luck 5 makes it 66%.
    setRefineLevel(f.ctx, f.ctx.sender, "ion_bow", 0n, 4);
    always(f, .63);
    refine();
    expect(refineLevelFor(f.ctx, f.ctx.sender, "ion_bow", 0n)).toBe(4);
    luck(f, { refineLuck: 5 });
    refine();
    expect(refineLevelFor(f.ctx, f.ctx.sender, "ion_bow", 0n)).toBe(5);
  });

  it("moves a guest's luck ranks to the account it links to, with the rest of its research", () => {
    const f = crystalFixture();
    const guest = identity("2");
    luck(f, { gearLuck: 4 });
    f.seed("playerResearch", { identity: guest, frontierMastery: 0, inventorySlots: 2 });
    luck(f, { cardLuck: 3 }, guest);
    f.db.playerProgress.identity.delete(f.ctx.sender);
    f.progress(guest);
    f.seed("playerBalanceVersion", { identity: guest, version: ATTACK_BALANCE_VERSION });
    f.seed("accountLink", { code: "luck-link", guest, createdAt: f.ctx.timestamp });
    f.ctx.senderAuth = { jwt: { issuer: SPACETIME_AUTH_ISSUER, audience: [SPACETIME_AUTH_CLIENT_ID] } };
    f.run(server.claimGuestAccount, { code: "luck-link" });
    expect(f.db.playerLuckResearch.identity.find(f.ctx.sender)).toMatchObject({ cardLuck: 3, gearLuck: 0 });
    expect(f.db.playerLuckResearch.identity.find(guest)).toBeFalsy();
  });
});
