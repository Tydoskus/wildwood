import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { expect, it } from "vitest";

/**
 * The game's interface is neutral black and grey; green is an accent (buttons,
 * picked states, ready text), never a surface. Dark, barely saturated greens
 * kept coming back as panel, HUD and window backgrounds, copied from older
 * styles, and read as a green tint over the game. Saturated greens pass.
 */
const tinted = (r: number, g: number, b: number) => g > r + 5 && g >= b && Math.max(r, g, b) < 70 && Math.max(r, g, b) - Math.min(r, g, b) <= 17;
const COLOR = /rgba?\(\s*(\d+)\s*,\s*(\d+)\s*,\s*(\d+)[^)]*\)|#([0-9a-fA-F]{6})(?:[0-9a-fA-F]{2})?\b/g;

function tintedColors(path: string) {
  const found: string[] = [];
  readFileSync(path, "utf8").split("\n").forEach((line, index) => {
    for (const match of line.matchAll(COLOR)) {
      const [r, g, b] = match[1] ? [match[1], match[2], match[3]].map(Number)
        : [0, 2, 4].map(at => parseInt(match[4].slice(at, at + 2), 16));
      if (tinted(r, g, b)) found.push(`${path}:${index + 1} ${match[0]}`);
    }
  });
  return found;
}

it("keeps green-tinted greys out of the interface's surfaces", () => {
  const styles = "public/assets/wildstat";
  const files = [
    ...readdirSync(styles).filter(name => name.endsWith(".css") && !name.startsWith("balance")).map(name => join(styles, name)),
    ...readdirSync("src/ui").filter(name => name.endsWith(".ts") && !name.endsWith(".test.ts")).map(name => join("src/ui", name)),
    "public/index.html",
  ];
  expect(files.flatMap(tintedColors)).toEqual([]);
});
