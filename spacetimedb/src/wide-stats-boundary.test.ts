import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";
import { expect, it } from "vitest";

/**
 * Stats past f32 live in player_wide_stats, laid over player_progress by
 * readPlayerProgress. A direct read would see the clamp, and writing that row
 * back would throw the real value away, so every read goes through the helper.
 */
it("reads player_progress only through readPlayerProgress and iterPlayerProgress", () => {
  const dir = join(__dirname);
  const offenders = readdirSync(dir).filter(file => file.endsWith(".ts") && !file.endsWith(".test.ts") && file !== "wide-stats.ts")
    .filter(file => /\.db\.playerProgress\.(identity\.find|iter)\(/.test(readFileSync(join(dir, file), "utf8")));
  expect(offenders).toEqual([]);
});
