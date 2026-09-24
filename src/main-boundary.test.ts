import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

// src/main.ts has no exports and nothing imports it, so no behavioural test can
// cover its wiring. This ratchet is the only automated pressure on its size.
//
// ENGINEERING.md and AGENTS.md set the real target at 1,000 lines. The file
// reached 2,224 before anything watched it, and the remaining distance runs
// through the combat, render and coop-sync wiring, where a mistake is only
// visible in play. So this guard enforces the one property that can be checked
// mechanically: the facade never grows again.
//
// Lower MAX_LINES as extractions land. Raising it means a feature's wiring
// genuinely belongs here after its own module took everything it could, and
// the raise is the wiring alone. Growth without an extraction first is the
// drift this guard exists to stop.
// Do not satisfy it by minifying or removing useful comments/whitespace.
// 2_173: one line wiring the gem-drop pop-up, the same shape as the item-drop
// wiring beside it. Its logic lives in the HUD controller and the coop service.
// 2_193: the prestige badge's level lookup, which only the composition root can
// answer because it reads the coop session. The badge image, its measurement
// and both draw paths live in the identity renderer, which loads the asset
// itself rather than being handed it.
// 2_197: the offline-progress summary's construction, which only the
// composition root can supply with the coop session, the pause registry and
// whether the world is playable yet. Its formatting, its dialog and its
// show-once rule live in offline-progress-summary.ts.
// 2_201: the offline-progress setting's wiring. It is an account preference,
// so only the composition root can hand it the coop session, and only the HUD
// tick knows when a subscription has changed it. The button, its busy state
// and its rendering live in offline-progress-setting.ts.
// 2_202: the leaderboard's locked state. Only the composition root knows both
// the toolbar controller and whether this save has the Dragon's credit.
// 2_204: the upgrade bench's two slot-tier lookups. Tiers belong to equipment
// slots now, and only the composition root can say which coop session holds
// them and what is equipped in each slot. The bench's own logic is unchanged.
// 2_205: one line asking the developer panel whether to draw boss hitboxes.
// The toggle, its storage and its row live in boss-hitbox-overlay-control.ts
// and the drawing lives in the boss renderer; only the composition root holds
// both the panel and the render runtime.
// 2_205, not raised: the prestige unlock popup's wiring took the four lines of
// slack below it. Its construction, the HUD-tick poll and the developer
// preview hook need the coop session, the pause registry and the dev panel,
// which only the composition root holds; the logic is prestige-unlock-popup.ts.
// 2_195: the boss-defeated banner and its wiring were removed.
// 2_187: the item-drop reveal's colour table moved to item-drop-color.ts, which
// the duplicate-equipment offer window shares. That window's construction takes
// one line of the room, with its note: only the composition root holds the coop
// session, the local bag and whether the world is running.
// 2_188: one line handing the map window the coop session for its Loot
// filter window. The chips, the switches and their saving live in
// loot-filter-window.ts; only the composition root holds the session.
// 2_193: auto equip. Two lines construct and import the feedback that takes
// gear the server put on into the local bag (auto-equip-feedback.ts holds the
// logic); only the composition root holds the coop session, the bag and the
// player. Three more let Equip best rank bows by their skills: the local
// power function takes the coop session's rolls when comparing, and says so.
// The comparison itself lives in shared/equip-best.ts.
// 2_169: the rewarded respawn boost went (0.807). Its bank, its drain, its
// save-on-hide and the pending-timer rewrite for the switch left with it; the
// ad's Gem claim is three dependency lines handed to the HUD timer column.
const MAX_LINES = 2_169;
const TARGET_LINES = 1_000;

describe("game composition boundary", () => {
  it("never grows past its last recorded size", () => {
    const source = readFileSync(new URL("./main.ts", import.meta.url), "utf8");
    const lineCount = source.split(/\r?\n/).length - Number(source.endsWith("\n"));

    expect(lineCount).toBeLessThanOrEqual(MAX_LINES);
  });

  it("records how far the facade still is from the documented target", () => {
    // Fails once the facade reaches 1,000 lines, as a prompt to replace this
    // ratchet with the strict sub-1,000 assertion that wildstat-coop.ts uses.
    expect(MAX_LINES).toBeGreaterThan(TARGET_LINES);
  });
});
