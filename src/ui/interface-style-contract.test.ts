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
  it("keeps item inspection in a standalone fullscreen window outside the bag", () => {
    const bagStart = html.indexOf('<section class="bag-section"');
    const bagEnd = html.indexOf("</section>", bagStart);
    const detail = html.indexOf('id="itemInspectionPanel"');
    const upgradeBench = html.indexOf('id="upgradeBenchPanel"');

    expect(bagStart).toBeGreaterThanOrEqual(0);
    expect(detail).toBeGreaterThan(bagEnd);
    expect(detail).toBeLessThan(upgradeBench);
    expect(html).not.toContain('id="inventoryDetail"');
    expect(cssRule(".inventory-content")).toContain("overflow: hidden");
    expect(cssRule(".item-inspection-panel")).toContain("position: fixed");
    expect(cssRule(".item-inspection-panel")).toContain("var(--toolbar-height)");
    expect(cssRule(".item-inspection-panel[hidden]")).toContain("display: none");
    expect(css).not.toContain(".inventory-detail");
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

  it("uses wide volume tracks with exact 44px slider thumbs", () => {
    const range = cssRule('.volume-control input[type="range"] {');
    const webkitThumb = cssRule('.volume-control input[type="range"]::-webkit-slider-thumb');
    const firefoxThumb = cssRule('.volume-control input[type="range"]::-moz-range-thumb');

    expect(range).toContain("max-width: 260px");
    expect(range).toContain("height: 44px");
    expect(webkitThumb).toContain("width: 44px");
    expect(webkitThumb).toContain("height: 44px");
    expect(firefoxThumb).toContain("width: 44px");
    expect(firefoxThumb).toContain("height: 44px");
  });

  it("anchors minimized chat directly below the player HUD", () => {
    const chat = cssRule("#chatPanel {");
    expect(chat).toContain("top: var(--hud-row-height)");
    expect(chat).toContain("bottom: auto");
    expect(cssRule("#chatPanel.is-large {")).toContain("var(--toolbar-height)");
  });

  it("uses the flat pink Gem asset in the private profile balance", () => {
    expect(html).toContain('id="profileGemWallet"');
    expect(html).toContain('src="assets/wildwood/gems/gem-icon.png"');
    const icon = cssRule(".profile-gem-icon {");
    expect(icon).not.toContain("gradient");
    expect(icon).not.toContain("box-shadow");
    expect(icon).not.toContain("clip-path");
  });

  it("defines and applies the 11px functional-text floor", () => {
    expect(css).toMatch(/--font-readable-min:\s*11px/);
    expect(css).toContain("-webkit-text-size-adjust: 100%");
    expect(css).toContain("@media (prefers-contrast: more)");
    expect(css).toMatch(/\.toolbar-label,[\s\S]*#hpText,[\s\S]*font-size:\s*var\(--font-readable-min\)/);
  });
});
