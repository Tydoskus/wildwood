import { expect, it, vi } from "vitest";

const created = vi.hoisted(() => ({ options: null as any }));
vi.mock("./prestige-panel", async (original) => ({
  ...(await original<typeof import("./prestige-panel")>()),
  createPrestigeController: (options: unknown) => { created.options = options; return {}; },
}));

it("hands the prestige window every option the panel reads", async () => {
  const { createPrestigePanel } = await import("./game-ui-runtime");
  const fns = Object.fromEntries(["prestige", "unlocked", "completed", "runPrestige", "perks", "spendPerk", "respec", "expanded",
    "expansionCountdown", "challenge", "challengeGoal", "challengesWon", "freeRespec", "freeRespecAvailable", "showMessage", "beforeOpen"]
    .map(name => [name, () => name]));
  createPrestigePanel({ ...fns, e: {} });
  // Each of these was once dropped on the way in, and the window ran without it.
  for (const name of ["challengeGoal", "challengesWon", "freeRespec", "freeRespecAvailable", "respec", "challenge"]) {
    expect(created.options[name], name).toBe(fns[name]);
  }
});
