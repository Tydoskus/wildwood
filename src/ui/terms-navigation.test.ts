import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const entryHtml = readFileSync(new URL("../../public/index.html", import.meta.url), "utf8");
const termsHtml = readFileSync(new URL("../../public/terms.html", import.meta.url), "utf8");

describe("standalone Terms navigation", () => {
  it("opens Terms in the app's current window", () => {
    const links = [...entryHtml.matchAll(/<a\b[^>]*href="terms\.html"[^>]*>/g)];
    expect(links).toHaveLength(2);
    for (const [link] of links) expect(link).not.toContain('target="_blank"');
  });

  it("offers a persistent return link without requiring browser controls or JavaScript", () => {
    expect(termsHtml).toContain('<a class="back-to-game" href="./">← Back to game</a>');
    expect(termsHtml).toMatch(/\.terms-navigation\s*\{[^}]*position: sticky;[^}]*top: 0;/);
    for (const base of ["https://wildstatmmo.com/", "https://tydoskus.github.io/wildwood/"]) {
      expect(new URL("./", new URL("terms.html", base)).href).toBe(base);
    }
  });
});
