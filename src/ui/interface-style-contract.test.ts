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

  it("stacks the full-width minimized chat between the canvas and toolbar", () => {
    const chat = cssRule("#chatPanel {");
    expect(chat).toContain("top: auto");
    expect(chat).toContain("bottom: var(--toolbar-height)");
    expect(chat).toContain("width: 100vw");
    expect(chat).toContain("height: var(--mini-chat-height)");
    expect(chat).toContain("border-bottom: 0");
    const compactChat = cssRule("#chatPanel:not(.is-large) {");
    expect(compactChat).toContain("min-height: var(--mini-chat-height)");
    expect(compactChat).toContain("max-height: var(--mini-chat-height)");
    expect(compactChat).toContain("linear-gradient");
    expect(cssRule("canvas#game {")).toContain("bottom: var(--gameplay-bottom-inset)");
    expect(cssRule("#chatPanel.is-large {")).toContain("var(--toolbar-height)");
    expect(cssRule(".card.settings-panel")).toContain("inset: 0 0 var(--toolbar-height)");
    expect(cssRule(".card.settings-panel")).toContain("z-index: 10");
    expect(cssRule(".card.inventory-panel")).toContain("inset: 0 0 var(--toolbar-height)");
    expect(cssRule(".card.inventory-panel")).toContain("z-index: 10");
  });

  it("places the unbordered Gem balance beneath the player HUD", () => {
    const chat = html.indexOf('id="chatPanel"');
    const wallet = html.indexOf('id="hudGemWallet"');
    const profile = html.indexOf('id="playerProfile"');
    expect(wallet).toBeGreaterThan(chat);
    expect(wallet).toBeLessThan(profile);
    expect(html).not.toContain('id="profileGemWallet"');
    expect(html).not.toContain('class="profile-gem-label"');
    expect(html).toContain('src="assets/wildwood/gems/gem-icon.png"');
    const counter = cssRule(".hud-gem-wallet {");
    expect(counter).toContain("top: calc(var(--hud-row-height) + 4px)");
    expect(counter).toContain("left: 6px");
    expect(counter).toContain("border: 0");
    expect(counter).toContain("background: rgba(");
    expect(counter).not.toContain("background: transparent");
    const icon = cssRule(".hud-gem-icon {");
    expect(icon).not.toContain("gradient");
    expect(icon).not.toContain("box-shadow");
    expect(icon).not.toContain("clip-path");
  });

  it("uses the existing cosmetic slots for the wear-nothing state", () => {
    expect(cssRule(".equipment-slot.is-cosmetic-inherited {")).toContain("cursor: pointer");
    expect(cssRule(".equipment-slot.is-cosmetic-hidden {")).toContain("cursor: pointer");
    expect(cssRule(".cosmetic-hidden-icon::after {")).toContain("transform: rotate(-36deg)");
  });

  it("defines and applies the 11px functional-text floor", () => {
    expect(css).toMatch(/--font-readable-min:\s*11px/);
    expect(css).toContain("-webkit-text-size-adjust: 100%");
    expect(css).toContain("@media (prefers-contrast: more)");
    expect(css).toMatch(/\.toolbar-label,[\s\S]*#hpText,[\s\S]*font-size:\s*var\(--font-readable-min\)/);
  });
});
