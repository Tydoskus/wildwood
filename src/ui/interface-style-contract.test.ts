import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const css = readFileSync(new URL("../../public/assets/wildwood/game.css", import.meta.url), "utf8");
const html = readFileSync(new URL("../../public/index.html", import.meta.url), "utf8");

function cssRule(selector: string) {
  const selectorIndex = css.indexOf(selector);
  expect(selectorIndex, `Missing CSS selector: ${selector}`).toBeGreaterThanOrEqual(0);
  const declarationStart = css.indexOf("{", selectorIndex);
  const declarationEnd = css.indexOf("}", declarationStart);
  return css.slice(declarationStart + 1, declarationEnd);
}

describe("interface style contracts", () => {
  it("keeps item details inside the bag as a non-reflowing overlay", () => {
    const bagStart = html.indexOf('<section class="bag-section"');
    const bagEnd = html.indexOf("</section>", bagStart);
    const detail = html.indexOf('id="inventoryDetail"');

    expect(bagStart).toBeGreaterThanOrEqual(0);
    expect(detail).toBeGreaterThan(bagStart);
    expect(detail).toBeLessThan(bagEnd);
    expect(cssRule(".inventory-content")).toContain("overflow: hidden");
    expect(cssRule(".inventory-detail")).toContain("position: absolute");
    expect(cssRule(".inventory-detail")).toContain("display: none");
    expect(cssRule(".inventory-detail.has-selection")).toContain("display: grid");
    expect(cssRule(".inventory-detail.has-selection")).toContain("height: 190px");
    expect(css).not.toContain(".bag-section.has-detail .inventory-items");
  });

  it("makes only the slot grid scroll and hides its scrollbar", () => {
    const slots = cssRule(".inventory-items {");

    expect(slots).toContain("overflow-y: auto");
    expect(slots).toContain("scrollbar-width: none");
    expect(slots).toContain("touch-action: pan-y");
    expect(cssRule(".inventory-items::-webkit-scrollbar")).toContain("display: none");
  });

  it("keeps both inventory tabs at the 44px touch-target minimum", () => {
    expect(html).toContain('id="inventoryEquipmentTab"');
    expect(html).toContain('id="inventoryCosmeticsTab"');
    const tabs = cssRule(".inventory-tab {");
    expect(tabs).toContain("height: 44px");
    expect(tabs).toContain("min-height: 44px");
  });

  it("defines and applies the 11px functional-text floor", () => {
    expect(css).toMatch(/--font-readable-min:\s*11px/);
    expect(css).toContain("-webkit-text-size-adjust: 100%");
    expect(css).toContain("@media (prefers-contrast: more)");
    expect(css).toMatch(/\.toolbar-label,[\s\S]*#hpText,[\s\S]*font-size:\s*var\(--font-readable-min\)/);
  });
});
