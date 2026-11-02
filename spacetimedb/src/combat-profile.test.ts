import { expect, it, vi } from "vitest";
import { crystalFixture, server } from "../../tests/helpers/crystal-hollows-fixture";
import { reportEnemy } from "../../tests/helpers/enemy-defeat";
import { writeResearchRanks } from "./research-runtime";
vi.mock("spacetimedb/server", () => import("../../tests/helpers/spacetime-module"));

const stamp = (f: any) => f.db.playerCombatStamp.identity.find(f.ctx.sender)?.version;

it("keeps a kill report's combat profile only until something it reads may have changed", () => {
  const f = crystalFixture();
  reportEnemy(f);
  const kept = stamp(f);
  expect(kept).toBeDefined();
  // Marked reducers leave it, and so does the next report.
  f.run(server.setPlayerMotionInterest, { networkIds: [] });
  reportEnemy(f);
  expect(stamp(f)).toBe(kept);
  // Any other reducer moves it.
  f.run(server.setBonusToggleState, { off: "" });
  expect(stamp(f)).toBe(kept + 1);
  // Research the scheduler finishes moves it too.
  if (!f.db.playerResearch.identity.find(f.ctx.sender)) f.seed("playerResearch", { identity: f.ctx.sender, warcraft: 0 });
  const research = f.db.playerResearch.identity.find(f.ctx.sender);
  f.transaction(() => writeResearchRanks(f.ctx, f.ctx.sender, { ...research, warcraft: research.warcraft + 1 }, "warcraft"));
  expect(stamp(f)).toBe(kept + 2);
});
