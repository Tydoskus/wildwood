import { expect, it, vi } from "vitest";
import { Identity } from "spacetimedb";
import { DEVELOPER_IDENTITY } from "../../shared/developer-identity";
import { DIAMOND_GALAXY_ARMOR, DIAMOND_GALAXY_BOW, STARTER_STONE } from "../../shared/items";
import { PATREON_DIAMOND_ITEM_IDS } from "../../shared/patreon-cosmetics";
import { crystalFixture, server } from "../../tests/helpers/crystal-hollows-fixture";
import { lentLooksFor } from "./patreon";
vi.mock("spacetimedb/server", () => import("../../tests/helpers/spacetime-module"));

const DEVELOPER = Identity.fromString(DEVELOPER_IDENTITY);

function patron(tier: string, validForMs: number) {
  const f = crystalFixture();
  const now = Number(f.ctx.timestamp.microsSinceUnixEpoch / 1000n);
  f.patch("playerProgress", { inventoryJson: JSON.stringify([STARTER_STONE]) });
  f.seed("patreonLink", { identity: f.ctx.sender, userId: "1", accessToken: "access", refreshToken: "refresh", tier, frame: "none",
    validUntilMs: now + validForMs, checkedAtMs: now, attemptedAtMs: now });
  return { ...f, now };
}

/** Saves the player's progress wearing Diamond Galaxy armor and a bow, then reads back what was kept. */
function wearDiamond(f: ReturnType<typeof crystalFixture>) {
  const progress = f.db.playerProgress.identity.find(f.ctx.sender);
  f.run(server.savePlayerProgress, { ...progress, cosmeticChest: DIAMOND_GALAXY_ARMOR, cosmeticRightHand: DIAMOND_GALAXY_BOW, enemyKills: 0 });
  return f.db.playerProgress.identity.find(f.ctx.sender);
}

it("lets an active Diamond patron wear the Diamond Galaxy set, and shows it on their player", () => {
  const f = patron("diamond", 60_000);
  const saved = wearDiamond(f);
  expect(saved.cosmeticChest).toBe(DIAMOND_GALAXY_ARMOR);
  expect(saved.cosmeticRightHand).toBe(DIAMOND_GALAXY_BOW);
  // Lent, not owned: nothing is added to the bag or the bought looks.
  expect(JSON.parse(saved.inventoryJson)).not.toContain(DIAMOND_GALAXY_ARMOR);
  expect(JSON.parse(saved.cosmeticItemsJson)).toEqual([]);
});

it("strips the set from a lapsed Diamond patron at their next save", () => {
  const f = patron("diamond", 60_000);
  wearDiamond(f);
  const link = f.db.patreonLink.identity.find(f.ctx.sender);
  f.db.patreonLink.identity.update({ ...link, validUntilMs: f.now - 1 });
  const progress = f.db.playerProgress.identity.find(f.ctx.sender);
  f.run(server.savePlayerProgress, { ...progress, enemyKills: 0 });
  const saved = f.db.playerProgress.identity.find(f.ctx.sender);
  expect(saved.cosmeticChest).toBe("");
  expect(saved.cosmeticRightHand).toBe("");
});

it("refuses the set to Gold patrons and to players without a membership", () => {
  expect(wearDiamond(patron("gold", 60_000)).cosmeticChest).toBe("");
  const f = crystalFixture();
  expect(wearDiamond(f).cosmeticChest).toBe("");
});

it("lends developers the set whatever their Patreon status", () => {
  const f = crystalFixture();
  expect(lentLooksFor(f.ctx as never, DEVELOPER)).toEqual(PATREON_DIAMOND_ITEM_IDS);
  expect(lentLooksFor(f.ctx as never, f.ctx.sender)).toEqual([]);
});
