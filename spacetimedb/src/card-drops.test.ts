import { describe, expect, it, vi } from "vitest";
import { Timestamp } from "spacetimedb";
import { crystalFixture } from "../../tests/helpers/crystal-hollows-fixture";
import { fillDefeatBudget, reportEnemy } from "../../tests/helpers/enemy-defeat";
import { awardCardDrops, awardTreeCardDrops } from "./card-drops";
import { cardCount } from "./gear-cards";
import { publishItemDrop } from "./equipment-copies";
import { CARD_DROP_OUTCOMES, cardDefinition, cardKillChance, cardMeterFull, cardSureByKills } from "../../shared/cards";
import { cardStatFactors } from "../../shared/card-effects";
import { setActiveCards } from "../../tests/helpers/active-cards";
import { activeCardTotalsFor } from "./active-cards";
import { BLACK_BOOTS, IRON_BOW } from "../../shared/items";
vi.mock("spacetimedb/server", () => import("../../tests/helpers/spacetime-module"));

type Fixture = ReturnType<typeof crystalFixture>;
/** ctx.random answering `value` every time; loot's integer rolls lose unless `lootWins`. */
const always = (f: Fixture, value: number, lootWins = false) => {
  Object.assign(f.ctx, { random: Object.assign(() => value, { integerInRange: (min: number, max: number) => lootWins ? min : max }) });
};
const award = (f: Fixture, mapId: string, kills: { enemy: string; count: number }[], bossKills = 0, multiplier = 1) =>
  f.transaction(() => awardCardDrops(f.ctx, f.ctx.sender, mapId, kills, bossKills, multiplier));
const cards = (f: Fixture, cardId: string) => cardCount(f.ctx, f.ctx.sender, cardId);

describe("card drops", () => {
  it("drops a regular enemy's card once in 10,000 kills, an elite's in 20,000, a boss's in 1,000 boss kills", () => {
    const f = crystalFixture();
    // ctx.random() < 1 / outcomes wins: just under 1 / outcomes wins, 1 / outcomes itself does not.
    always(f, .99 / CARD_DROP_OUTCOMES.regular);
    award(f, "tutorial_forest", [{ enemy: "Bramble", count: 3 }, { enemy: "King Slime", count: 1 }]);
    expect(cards(f, "bramble_card")).toBe(3);
    expect(cards(f, "king_slime_card")).toBe(0); // an elite's chance is half
    always(f, .99 / CARD_DROP_OUTCOMES.elite);
    award(f, "tutorial_forest", [{ enemy: "King Slime", count: 1 }], 1);
    expect(cards(f, "king_slime_card")).toBe(1);
    expect(cards(f, "dragon_card")).toBe(1);
    always(f, 1 / CARD_DROP_OUTCOMES.boss);
    award(f, "tutorial_forest", [{ enemy: "Bramble", count: 5 }], 3);
    expect([cards(f, "bramble_card"), cards(f, "dragon_card")]).toEqual([3, 1]);
  });

  it("raises every chance alike with a multiplier", () => {
    const f = crystalFixture();
    always(f, 1.5 / CARD_DROP_OUTCOMES.regular);
    award(f, "tutorial_forest", [{ enemy: "Bramble", count: 1 }]);
    expect(cards(f, "bramble_card")).toBe(0);
    award(f, "tutorial_forest", [{ enemy: "Bramble", count: 1 }], 0, 2);
    expect(cards(f, "bramble_card")).toBe(1);
  });

  it("drops nothing for an enemy that is not on the map", () => {
    const f = crystalFixture();
    always(f, 0);
    award(f, "beginner_desert", [{ enemy: "Bramble", count: 5 }]); // Bramble lives in the forest
    award(f, "tutorial_forest", [{ enemy: "Needle", count: 5 }]); // Needle's card drops on Endless only
    expect(f.db.playerCard.count()).toBe(0n);
    expect(f.db.playerCardDrop.count()).toBe(0n);
  });

  it("drops the Forest's Needle or Striker card from Endless 1's regular enemies", () => {
    const f = crystalFixture();
    always(f, 0);
    award(f, "endless_1", [{ enemy: "site:0", count: 1 }]);
    expect(cards(f, "needle_card") + cards(f, "striker_card")).toBe(1);
  });

  it("drops an Endless boss's Warden card by its band of ten maps, at the boss odds", () => {
    const f = crystalFixture();
    always(f, .99 / CARD_DROP_OUTCOMES.boss);
    award(f, "endless_10", [], 1);
    award(f, "endless_11", [], 1);
    award(f, "endless_201", [], 1);
    expect([cards(f, "warden_i_card"), cards(f, "warden_ii_card"), cards(f, "warden_vi_card")]).toEqual([1, 1, 1]);
    // Odds no better than a boss's lose.
    always(f, 1 / CARD_DROP_OUTCOMES.boss);
    award(f, "endless_25", [], 1);
    expect(cards(f, "warden_iii_card")).toBe(0);
  });

  it("drops a tree's card from felling it, at the tree's own odds and meter", () => {
    const f = crystalFixture();
    const oak = cardDefinition("oak_tree_card")!, elder = cardDefinition("elder_tree_card")!;
    always(f, .99 / 150);
    f.transaction(() => awardTreeCardDrops(f.ctx, f.ctx.sender, [{ kind: "elder" }, { kind: "oak" }, { kind: "pine" }]));
    expect([cards(f, "elder_tree_card"), cards(f, "oak_tree_card")]).toEqual([1, 0]);
    // Never lucky: the meter makes the oak's card sure by its 1,000th oak.
    always(f, .999);
    expect(cardSureByKills(oak)).toBe(1_000);
    expect(cardSureByKills(elder)).toBe(300);
    // One oak is on its meter already.
    f.transaction(() => awardTreeCardDrops(f.ctx, f.ctx.sender, Array.from({ length: 998 }, () => ({ kind: "oak" }))));
    expect(cards(f, "oak_tree_card")).toBe(0);
    f.transaction(() => awardTreeCardDrops(f.ctx, f.ctx.sender, [{ kind: "oak" }]));
    expect(cards(f, "oak_tree_card")).toBe(1);
  });

  it("tells the client what was found, counting every card", () => {
    const f = crystalFixture();
    always(f, 0);
    award(f, "tutorial_forest", [{ enemy: "Bramble", count: 2 }]);
    expect(f.db.playerCardDrop.identity.find(f.ctx.sender)).toMatchObject({ cardIds: ["bramble_card", "bramble_card"], sequence: 2n });
    award(f, "tutorial_forest", [{ enemy: "Brood", count: 1 }]);
    expect(f.db.playerCardDrop.identity.find(f.ctx.sender)).toMatchObject({ cardIds: ["brood_card"], sequence: 3n });
  });

  it("guarantees a card once its meter fills, at twice the average kills, and starts the meter again", () => {
    const f = crystalFixture();
    always(f, .999); // every roll loses
    const meter = () => f.db.playerCardMeter.key.find(`${f.ctx.sender.toHexString()}:bramble_card`)?.progress ?? 0;
    award(f, "tutorial_forest", [{ enemy: "Bramble", count: cardMeterFull("regular") - 1 }]);
    expect(cards(f, "bramble_card")).toBe(0);
    expect(meter()).toBe(cardMeterFull("regular") - 1);
    award(f, "tutorial_forest", [{ enemy: "Bramble", count: 1 }]);
    expect(cards(f, "bramble_card")).toBe(1);
    expect(meter()).toBe(0);
    // A lucky roll empties the meter too.
    award(f, "tutorial_forest", [{ enemy: "Bramble", count: 10 }]);
    always(f, 0);
    award(f, "tutorial_forest", [{ enemy: "Bramble", count: 1 }]);
    expect(meter()).toBe(0);
  });

  it("rolls a boss card at most once per boss respawn on each map, so a repeated boss claim rolls nothing", () => {
    const f = crystalFixture();
    always(f, 0); // every roll wins
    const at = (seconds: number) => { f.ctx.timestamp = new Timestamp(10_000_000n + BigInt(seconds * 1_000_000)); };
    at(0);
    award(f, "tutorial_forest", [], 5);
    expect(cards(f, "dragon_card")).toBe(1);
    // The Dragon respawns in 45 seconds; a claim well inside that rolls nothing, and the gate is not the card's to judge.
    at(20);
    award(f, "tutorial_forest", [], 1);
    expect(cards(f, "dragon_card")).toBe(1);
    // Another map's boss keeps its own timer.
    award(f, "beginner_desert", [], 1);
    expect(f.db.playerCard.count()).toBe(2n);
    at(34);
    award(f, "tutorial_forest", [], 1);
    expect(cards(f, "dragon_card")).toBe(2);
    // Boss Respawn research brings the boss back sooner, and its card with it.
    f.transaction(() => f.ctx.db.playerResearch.insert({ ...f.ctx.db.playerResearch.identity.find(f.ctx.sender), identity: f.ctx.sender, bossRespawn: 5 }));
    at(65);
    award(f, "tutorial_forest", [], 1);
    expect(cards(f, "dragon_card")).toBe(3);
  });

  it("rolls the cards of a paid kill report on Crystal Hollows", () => {
    const f = crystalFixture();
    f.patch("playerProgress", { damage: 1e15 });
    always(f, 0); // every card roll wins; gear loot loses
    fillDefeatBudget(f, "crystal_hollows", "Shard Hopper");
    reportEnemy(f, "Shard Hopper", 2);
    expect(cards(f, "shard_hopper_card")).toBe(2);
  });
});

describe("gear drops", () => {
  const drop = (f: Fixture, itemId: string, alreadyOwned: boolean, quantity = 1) =>
    f.transaction(() => publishItemDrop(f.ctx, f.ctx.sender, itemId, alreadyOwned, quantity));

  it("roll no card slots: cards are switched on in the Cards tab", () => {
    const f = crystalFixture();
    always(f, .998);
    drop(f, IRON_BOW, false);
    drop(f, IRON_BOW, true, 3);
    drop(f, "snow_helmet", false);
    drop(f, BLACK_BOOTS, false);
    expect(f.db.playerGearSlots.count()).toBe(0n);
    expect(f.db.playerCopySlots.count()).toBe(0n);
  });
});

describe("the odds the Cards tab shows", () => {
  // Regular, elite and boss, with Signal Oracle's Card Hunter active and Card Luck at rank 4.
  for (const [cardId, enemy, boss] of [["bramble_card", "Bramble", 0], ["king_slime_card", "King Slime", 0], ["dragon_card", "", 1]] as const) {
    it(`match the server's roll for ${cardId}`, () => {
      const f = crystalFixture();
      f.transaction(() => setActiveCards(f.ctx, f.ctx.sender, ["signal_oracle_card"]));
      f.seed("playerLuckResearch", { identity: f.ctx.sender, cardLuck: 4, gearLuck: 0, miningLuck: 0, skillLuck: 0, refineLuck: 0 });
      const hunter = cardStatFactors(activeCardTotalsFor(f.ctx, f.ctx.sender)).cardHunter;
      expect(hunter).toBeCloseTo(.14, 9);
      const chance = cardKillChance(cardDefinition(cardId)!, hunter, 4);
      const kills = boss ? [] : [{ enemy, count: 1 }];
      always(f, chance * 1.0001);
      award(f, "tutorial_forest", kills, boss);
      expect(cards(f, cardId)).toBe(0);
      f.ctx.timestamp = new Timestamp(f.ctx.timestamp.microsSinceUnixEpoch + 10_000_000_000n);
      always(f, chance * .9999);
      award(f, "tutorial_forest", kills, boss);
      expect(cards(f, cardId)).toBe(1);
      // The meter guarantees it by the kills the detail shows: Card Hunter fills it, Card Luck does not.
      expect(cardSureByKills(cardDefinition(cardId)!, hunter)).toBe(Math.ceil(cardMeterFull(cardDefinition(cardId)!.rarity) / 1.14 - 1e-9));
    });
  }
});
