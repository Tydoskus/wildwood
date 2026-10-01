import { beforeEach, expect, it } from "vitest";
import { forgetPlayerDirectory, playerDirectoryJson, PLAYER_DIRECTORY_ACTIVE_MICROS, PLAYER_DIRECTORY_REFRESH_MICROS } from "./player-directory";

const DAY = 86_400_000_000n;
const id = (hex: string) => ({ hex, toHexString: () => hex });
function fixture(now: bigint) {
  const lifetimes = [
    { identity: id("aa"), sessionStartedAt: { microsSinceUnixEpoch: now - DAY } },
    { identity: id("bb"), sessionStartedAt: { microsSinceUnixEpoch: now - PLAYER_DIRECTORY_ACTIVE_MICROS - DAY } },
    { identity: id("cc"), sessionStartedAt: { microsSinceUnixEpoch: now } },
    { identity: id("dd"), sessionStartedAt: { microsSinceUnixEpoch: now } },
  ];
  const names: Record<string, string> = { aa: "Zed", bb: "Gone", cc: "Ann", dd: "Bot" };
  const scans = { count: 0 };
  const ctx = {
    timestamp: { microsSinceUnixEpoch: now },
    db: {
      playerLifetime: { iter: () => { scans.count += 1; return lifetimes; } },
      playerProfile: { identity: { find: (who: { hex: string }) => names[who.hex] ? { displayName: names[who.hex] } : undefined } },
    },
  };
  return { ctx, names, scans };
}
const isBot = (_ctx: unknown, who: { hex: string }) => who.hex === "dd";
beforeEach(forgetPlayerDirectory);

it("lists recently active real players by name, leaving out the long gone and the virtual", () => {
  const { ctx } = fixture(100n * DAY);
  expect(JSON.parse(playerDirectoryJson(ctx, isBot))).toEqual([["cc", "Ann"], ["aa", "Zed"]]);
});

it("builds the list once for everyone until the refresh is due", () => {
  const { ctx, names, scans } = fixture(100n * DAY);
  playerDirectoryJson(ctx, isBot);
  names.cc = "Anna";
  ctx.timestamp.microsSinceUnixEpoch += PLAYER_DIRECTORY_REFRESH_MICROS - 1n;
  expect(JSON.parse(playerDirectoryJson(ctx, isBot))[0][1]).toBe("Ann");
  expect(scans.count).toBe(1);
  ctx.timestamp.microsSinceUnixEpoch += 1n;
  expect(JSON.parse(playerDirectoryJson(ctx, isBot))[0][1]).toBe("Anna");
  expect(scans.count).toBe(2);
});
