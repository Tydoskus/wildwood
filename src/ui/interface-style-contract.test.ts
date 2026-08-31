import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const css = readFileSync(new URL("../../public/assets/wildwood/game.css", import.meta.url), "utf8");
const entryHtml = readFileSync(new URL("../../public/index.html", import.meta.url), "utf8");
const gameShell = readFileSync(new URL("./game-shell.ts", import.meta.url), "utf8");
const html = `${entryHtml}\n${gameShell}`;
const coopEntry = readFileSync(new URL("../wildwood-coop.ts", import.meta.url), "utf8");
const playerInputController = readFileSync(new URL("../game/runtime/player-input-controller.ts", import.meta.url), "utf8");
const chatController = readFileSync(new URL("./chat.ts", import.meta.url), "utf8");

function cssRule(selector: string) {
  const selectorIndex = css.indexOf(selector);
  expect(selectorIndex, `Missing CSS selector: ${selector}`).toBeGreaterThanOrEqual(0);
  const declarationStart = css.indexOf("{", selectorIndex);
  const declarationEnd = css.indexOf("}", declarationStart);
  return css.slice(declarationStart + 1, declarationEnd);
}

describe("interface style contracts", () => {
  it("keeps the initial HTML response below 24 KB", () => {
    expect(Buffer.byteLength(entryHtml, "utf8")).toBeLessThan(24_000);
    expect(entryHtml).toContain('id="start"');
    expect(entryHtml).toContain('id="gameUpdateGate"');
    expect(gameShell).toContain('id="dailyGemBonus"');
    expect(gameShell).toContain('id="gameOver"');
    expect(coopEntry.startsWith('import "./ui/game-shell";')).toBe(true);

    const ids = [...html.matchAll(/\bid="([^"]+)"/g)].map((match) => match[1]);
    expect(new Set(ids).size).toBe(ids.length);
  });

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
    expect(cssRule(".item-inspection-panel")).toContain("grid-template-rows: auto minmax(0, 1fr) auto");
    expect(cssRule(".item-inspection-panel[hidden]")).toContain("display: none");
    expect(html).toContain('id="itemInspectionBack" class="item-inspection-back window-back-button" type="button">Back</button>');
    expect(cssRule(".item-inspection-actions { ")).toContain("justify-content: center");
    expect(cssRule(".item-inspection-actions { ")).toContain("repeat(auto-fit");
    expect(cssRule(".window-back-footer {")).toContain("place-items: center");
    expect(css).not.toContain(".inventory-detail");
  });

  it("makes only the slot grid scroll and hides its scrollbar", () => {
    const slots = cssRule(".inventory-items {");

    expect(slots).toContain("overflow-y: auto");
    expect(slots).toContain("grid-auto-rows: var(--inventory-slot-row-size)");
    expect(slots).toContain("scrollbar-width: none");
    expect(slots).toContain("touch-action: pan-y");
    expect(cssRule(".inventory-items::-webkit-scrollbar")).toContain("display: none");
    expect(cssRule(".inventory-items > .inventory-item {")).toContain("height: 100%");
    expect(cssRule(".bag-section { ")).toContain("container-type: inline-size");
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
    const root = cssRule(":root {");
    expect(root).toContain("--mini-chat-height: 58px");
    expect(root).toContain("--gameplay-bottom-inset: var(--toolbar-height)");
    expect(compactChat).toContain("min-height: var(--mini-chat-height)");
    expect(compactChat).toContain("max-height: var(--mini-chat-height)");
    expect(compactChat).toContain("rgba(61, 63, 64, .62)");
    expect(compactChat).toContain("linear-gradient");
    expect(compactChat).toContain("cursor: pointer");
    const compactMessages = cssRule("#chatPanel:not(.is-large) #chatMessages {");
    expect(compactMessages).toContain("padding: 0 3px 0 43px");
    expect(compactMessages).toContain('url("icons/Icon_Misc_ETC_Chat01.png")');
    expect(compactMessages).toContain("38px 38px");
    expect(cssRule("#chatPanel:not(.is-large) .chat-header {")).toContain("display: none");
    expect(cssRule("#chatPanel.is-large .chat-header {")).toContain("display: none");
    expect(cssRule("canvas#game {")).toContain("bottom: var(--gameplay-bottom-inset)");
    const fullscreenChat = cssRule("#chatPanel.is-large {");
    expect(fullscreenChat).toContain("inset: 0");
    expect(fullscreenChat).toContain("z-index: 8");
    expect(fullscreenChat).toContain("grid-template-rows: minmax(0, 1fr) auto");
    expect(fullscreenChat).toContain("row-gap: 6px");
    expect(fullscreenChat).toContain("max(8px, env(safe-area-inset-top))");
    expect(fullscreenChat).toContain("overflow: hidden");
    expect(fullscreenChat).toContain("#2e2c29, #1c1b19 88%");
    expect(cssRule(".card.settings-panel")).toContain("inset: 0 0 var(--toolbar-height)");
    expect(cssRule(".card.settings-panel")).toContain("z-index: 10");
    expect(cssRule(".card.inventory-panel")).toContain("inset: 0 0 var(--toolbar-height)");
    expect(cssRule(".card.inventory-panel")).toContain("z-index: 10");
  });

  it("uses only the real device safe area beneath the in-game toolbar", () => {
    const root = cssRule(":root {");
    expect(root).toContain("--toolbar-height: calc(var(--toolbar-button-height) + env(safe-area-inset-bottom, 0px))");
    expect(root).not.toContain("--toolbar-bottom-padding");
    expect(cssRule(".settings-button {")).toContain("padding: 0 0 env(safe-area-inset-bottom, 0px)");
    expect(cssRule(".settings-button {")).toContain("border-radius: 0");
    expect(css).not.toContain("border-top-left-radius: 8px");
    expect(css).not.toContain("border-top-right-radius: 8px");
  });

  it("keeps the touch joystick composited but invisible between touches", () => {
    const joystick = cssRule("#joystick {");
    expect(joystick).toContain("display: block");
    expect(joystick).toContain("opacity: 0");
    expect(joystick).toContain("transform: translate3d(");
    expect(joystick).toContain("will-change: transform, opacity");
    expect(joystick).toContain("contain: layout paint");
    expect(joystick).not.toContain("bottom:");
    expect(cssRule("#stick {")).toContain("will-change: transform");
    expect(playerInputController).toContain('joystick.style.opacity = "1"');
    expect(playerInputController).toContain('joystick.style.opacity = "0"');
    expect(playerInputController).toContain("joystick.style.transform = `translate3d(");
    expect(playerInputController).not.toContain("joystick.style.display");
    expect(playerInputController).not.toContain("joystick.style.left");
    expect(playerInputController).not.toContain("joystick.style.top");
    expect(playerInputController).not.toContain("joystick.style.bottom");
  });

  it("stacks the native WebGL terrain beneath the transparent game canvas", () => {
    expect(cssRule("#gameGpu { ")).toContain("z-index: 0");
    expect(cssRule("#gameGpu { ")).toContain("pointer-events: none");
    expect(cssRule("#game { ")).toContain("z-index: 1");
    expect(cssRule("body.has-webgl-world #game { ")).toContain("background: transparent");
  });

  it("uses true black for every page-level fallback background", () => {
    expect(html).toContain("html, body { min-height: 100vh; min-height: 100dvh; background: #000; }");
    expect(cssRule("html, body {")).toContain("background: #000");
    expect(cssRule("canvas {")).toContain("background: #000");
    expect(cssRule("#start,\n  #gameUpdateGate {")).toContain("background-color: #000");
    expect(cssRule(":fullscreen,\n  :-webkit-full-screen {")).toContain("background: #000");
  });

  it("keeps notifications above normal fullscreen windows", () => {
    const message = cssRule("#message {");
    expect(message).toContain("z-index: 16");
    expect(message).toContain("pointer-events: none");
  });

  it("renders chat messages with the same font treatment as usernames", () => {
    const username = cssRule("\n  .chat-name {");
    const message = cssRule("\n  .chat-text {");

    expect(username).toContain("font-family: var(--player-name-font)");
    expect(username).toContain("font-weight: 900");
    expect(message).toContain("font-family: var(--player-name-font)");
    expect(message).toContain("font-weight: 900");
    expect(cssRule(".chat-text.is-moderated .chat-message-body { ")).toContain("font-style: italic");
    const fullscreenMessages = cssRule("#chatPanel.is-large #chatMessages {");
    expect(fullscreenMessages).toContain("grid-row: 1");
    expect(fullscreenMessages).toContain("display: flex");
    expect(fullscreenMessages).toContain("flex-direction: column");
    expect(fullscreenMessages).toContain("height: auto");
    expect(fullscreenMessages).toContain("overflow: hidden auto");
    expect(fullscreenMessages).toContain("align-self: stretch");
    const fullscreenLine = cssRule("#chatPanel.is-large .chat-line {");
    expect(fullscreenLine).toContain("flex: 0 0 auto");
    expect(fullscreenLine).toContain("grid-template-columns: 66px minmax(0, 1fr)");
    expect(fullscreenLine).toContain("grid-template-rows: auto auto");
    expect(fullscreenLine).toContain("min-height: 93px");
    expect(fullscreenLine).toContain("padding: 7px 0 0");
    expect(fullscreenLine).toContain("row-gap: 6px");
    const fullscreenContent = cssRule("#chatPanel.is-large .chat-message-content {");
    expect(fullscreenContent).toContain("flex-direction: column");
    expect(fullscreenContent).toContain("gap: 2px");
    expect(cssRule("#chatPanel.is-large .chat-profile-icon {")).toContain("width: 66px");
    const fullscreenMessage = cssRule("#chatPanel.is-large .chat-text {");
    expect(fullscreenMessage).toContain("height: auto");
    expect(fullscreenMessage).toContain("width: fit-content");
    expect(fullscreenMessage).toContain("max-width: calc(100% - 50px)");
    expect(fullscreenMessage).toContain("margin: 0 0 10px");
    expect(fullscreenMessage).toContain("padding: 6px 12px");
    expect(fullscreenMessage).toContain("font-size: 15px");
    const fullscreenTime = cssRule("#chatPanel.is-large .chat-time {");
    expect(fullscreenTime).toContain("grid-column: 1 / -1");
    expect(fullscreenTime).toContain("justify-self: center");
    const fullscreenForm = cssRule("#chatPanel.is-large #chatForm {");
    expect(fullscreenForm).toContain("grid-row: 2");
    expect(fullscreenForm).toContain('grid-template-areas: "reply reply" "input send" "back back"');
    expect(fullscreenForm).toContain("grid-template-rows: max-content max-content max-content");
    expect(fullscreenForm).toContain("align-content: start");
    expect(fullscreenForm).toContain("env(safe-area-inset-bottom)");
    expect(cssRule("#chatPanel.is-large #chatBackBtn {")).toContain("grid-area: back");
    expect(cssRule("#chatPanel.is-large #chatMessages::before")).toContain("margin-top: auto");
    expect(html).toContain('id="chatReplyComposer"');
    expect(cssRule("\n  .chat-reply-preview { ")).toContain("rgba(235,232,226,.58)");
    expect(cssRule("\n  .chat-reply-preview { ")).toContain("text-overflow: ellipsis");
  });

  it("opens a lightweight message drawer without making usernames interactive", () => {
    expect(html).toContain('id="chatMessageActions"');
    expect(html).toContain('id="chatMessageWatchReplayBtn"');
    expect(html).toContain('id="chatMessageCopyBtn"');
    expect(html).toContain('id="chatMessageReplyBtn"');
    expect(html).toContain('id="chatMessageReportBtn"');
    expect(cssRule(".chat-message-actions {")).toContain("z-index: 17");
    expect(cssRule(".chat-message-action-sheet {")).toContain("40dvh");
    expect(cssRule(".chat-message-action-sheet {")).toContain("translate3d(0, 100%, 0)");
    expect(cssRule(".chat-message-action-drag {")).toContain("touch-action: none");
    expect(cssRule("\n  .chat-name {")).toContain("cursor: default");
    expect(cssRule("#chatPanel.is-large .chat-text.is-actionable {")).toContain("cursor: pointer");
    expect(chatController).toContain('icon.addEventListener("click", openPlayer)');
    expect(chatController).toContain('line.addEventListener("click", openMessageActions)');
    expect(chatController).toContain('replay.addEventListener("click", openMessageActions)');
    expect(chatController).not.toContain('name.addEventListener("click", openPlayer)');
  });

  it("keeps the profile window to Stats and Info without ranking code", () => {
    expect(html).toContain('id="profileStatsTab"');
    expect(html).toContain('id="profileOverviewTab"');
    expect(html).not.toContain('id="profileRankingTab"');
    expect(html).not.toContain('id="profileRankingPanel"');
    expect(css).not.toContain(".profile-leaderboard-");
  });

  it("places the Gem balance beneath the player HUD on the same framed surface", () => {
    const chat = html.indexOf('id="chatPanel"');
    const wallet = html.indexOf('id="hudGemWallet"');
    const profile = html.indexOf('id="playerProfile"');
    expect(wallet).toBeGreaterThan(chat);
    expect(wallet).toBeLessThan(profile);
    expect(html).not.toContain('id="profileGemWallet"');
    expect(html).not.toContain('class="profile-gem-label"');
    expect(html).toContain('src="assets/wildwood/gems/gem-icon.png"');
    const counter = cssRule(".hud-gem-wallet {");
    const playerHud = cssRule(".player-hud-card {");
    expect(counter).toContain("position: fixed");
    expect(counter).toContain("top: calc(var(--hud-safe-top) + var(--player-hud-height) + 6px)");
    expect(counter).toContain("left: var(--hud-safe-left)");
    expect(counter).toContain("border: 2px solid var(--hud-frame)");
    expect(counter).toContain("border-radius: var(--hud-radius-small)");
    expect(counter).toContain("background: var(--hud-surface)");
    expect(playerHud).toContain("border-radius: var(--hud-radius)");
    expect(playerHud).toContain("background: var(--hud-surface)");
    const icon = cssRule(".hud-gem-icon {");
    expect(icon).not.toContain("gradient");
    expect(icon).not.toContain("box-shadow");
    expect(icon).not.toContain("clip-path");
  });

  it("places the compact FPS readout beneath the player HUD", () => {
    expect(html).toContain('id="gameFpsStatus">FPS: --</span>');
    expect(html).not.toContain('id="onePercentLowFpsStatus"');
    expect(html).not.toContain('id="workFpsStatus"');
    const status = cssRule(".fps-status {");
    expect(status).toContain("position: fixed");
    expect(status).toContain("top: calc(var(--hud-safe-top) + var(--player-hud-height) + 40px)");
    expect(status).toContain("bottom: auto");
  });

  it("uses titleless windows with one shared bottom Back control", () => {
    for (const id of ["closeSettingsBtn", "closeInventoryBtn", "closePlayerProfileBtn", "closeLeaderboardBtn", "closeTechTreeBtn"]) {
      expect(html).toMatch(new RegExp(`id="${id}" class="window-back-button"[^>]*>Back</button>`));
    }
    expect(entryHtml).not.toContain('class="settings-title window-title"');
    for (const titleId of ["leaderboardTitle", "techTreeTitle", "techTreeDetailTitle", "devAuditTitle", "profileIconPickerTitle"]) {
      expect(gameShell).not.toContain(`id="${titleId}"`);
    }
    expect(html).not.toContain('class="profile-close-button');
    expect(entryHtml).not.toContain('id="antiAliasingToggle"');
    const back = cssRule(".window-back-button {");
    expect(back).toContain("width: min(150px, 44vw)");
    expect(back).toContain("height: 44px");
    expect(back).toContain("background: linear-gradient(#c85050, #842f34)");
  });

  it("frames the health bar with a rounded two-tone track and fill", () => {
    const track = cssRule(".bar {");
    const fill = cssRule("#hpFill {");
    const card = cssRule(".player-hud-card {");
    const content = cssRule(".player-hud-content {");
    const portrait = cssRule(".profile-icon-button {");
    expect(track).toContain("border: 2px solid var(--hud-frame)");
    expect(track).toContain("border-radius: var(--hud-radius-small)");
    expect(track).toContain("linear-gradient");
    expect(fill).toContain("border-radius: 5px");
    expect(fill).toContain("linear-gradient(to bottom, #83f087 0 49%, #2fbf4b 50% 100%)");
    expect(fill).toContain("box-shadow: none");
    expect(fill).not.toContain("#55d963");
    expect(card).toContain("display: grid");
    expect(css).toContain("--hud-map-size: calc(var(--hud-row-height) * 2)");
    expect(css).toContain("--player-hud-height: calc(var(--hud-row-height) + 16px)");
    expect(card).toContain("grid-template-columns: var(--hud-row-height) minmax(0, 1fr)");
    expect(card).toContain("column-gap: 8px");
    expect(content).toContain("grid-template-rows: repeat(2, minmax(0, 1fr))");
    expect(content).toContain("gap: 4px");
    expect(portrait).toContain("width: 100%");
    expect(portrait).toContain("height: 100%");
    expect(portrait).toContain("align-self: stretch");
    expect(track).toContain("height: 100%");
    expect(html).toContain('id="playerPower"');
  });

  it("centers profile equation operators in dedicated columns", () => {
    expect(cssRule(".profile-stat-summary {")).toContain("minmax(0, 1fr) 20px minmax(0, 1fr) 20px minmax(0, 1fr)");
    expect(cssRule(".profile-stat-multiply {")).toContain("grid-column: 2");
    expect(cssRule(".profile-stat-equals {")).toContain("grid-column: 4");
    expect(cssRule(".profile-stat-total-group {")).toContain("grid-column: 5");
  });

  it("keeps sign-in artwork present and stable through authentication transitions", () => {
    expect(html).toContain('name="viewport" content="width=device-width,initial-scale=1,maximum-scale=1,user-scalable=no,viewport-fit=cover"');
    expect(html).toContain('<link rel="preload" as="image" href="assets/wildwood/signin/signin-progression-mobile-v2.png" type="image/png" fetchpriority="high"');
    expect(html).toContain('<link rel="preload" as="image" href="assets/wildwood/wildstat-wordmark.png" type="image/png" fetchpriority="high"');
    expect(html).toContain('--signin-preview: url("data:image/jpeg;base64,');
    expect(css).toContain("height: calc(100dvh + 30px)");
    expect(css).toContain("var(--signin-preview, none)");
    const stableStartupWindow = cssRule(".modal.connection-modal,\n  .modal.account-choice-modal,\n  .modal.legal-gate-modal {");
    expect(stableStartupWindow).toContain("top: 50dvh");
    expect(stableStartupWindow).toContain("transform: translate(-50%, -50%)");
    expect(stableStartupWindow).toContain("height: min(586px, calc(100svh - 24px))");
    expect(stableStartupWindow).toContain("width: min(430px, calc(100vw - 36px))");
    expect(cssRule(".account-choice-modal.is-signing-in #signInFromStartBtn,")).toContain("visibility: hidden");
    expect(entryHtml).toContain('id="connectionPanel" class="modal connection-modal" role="status" aria-live="polite" hidden');
    expect(entryHtml).toContain('id="accountChoicePanel" class="modal account-choice-modal" role="dialog" aria-modal="true" aria-labelledby="accountChoiceTitle">');
    expect(html).toContain('id="wildwoodCoopScript"');
    expect(html).toContain('data-game-src="assets/wildwood/game.js?v=');
    expect(html).not.toContain('<script src="assets/wildwood/game.js');
  });

  it("shows the complete Wildstat wordmark across all startup screens", () => {
    const wordmark = readFileSync(new URL("../../public/assets/wildwood/wildstat-wordmark.png", import.meta.url));
    const width = wordmark.readUInt32BE(16);
    const height = wordmark.readUInt32BE(20);
    const images = [...entryHtml.matchAll(/<img src="assets\/wildwood\/wildstat-wordmark\.png"[^>]*>/g)];

    expect(width / height).toBe(3);
    expect(images).toHaveLength(5);
    for (const [image] of images) expect(image).toContain(`width="${width}" height="${height}"`);
    expect(entryHtml).not.toContain("wildwood-wordmark.png");
    expect(entryHtml).not.toContain('aria-label="Wildwood');
    expect(entryHtml).toContain("<title>Wildstat</title>");
    expect(entryHtml).toContain("CONNECTING TO WILDSTAT");
    expect(entryHtml).toContain('aria-label="Welcome to Wildstat"');
    expect(cssRule(".wildwood-wordmark-frame {")).toContain("aspect-ratio: 3 / 1");
    expect(cssRule(".wildwood-wordmark-frame {")).not.toContain("overflow: hidden");
    expect(cssRule(".wildwood-wordmark-frame img {")).toContain("object-fit: contain");
    expect(cssRule(".wildwood-wordmark-frame img {")).not.toContain("position: absolute");
  });

  it("defers profile portraits and gender icons until the game loading screen", () => {
    expect(cssRule(".profile-icon {")).not.toContain("background-image");
    expect(css).toContain("body.is-loading-game-assets .profile-icon");
    expect(gameShell).toContain('data-game-src="assets/wildwood/gender/male.png"');
    expect(gameShell).toContain('data-game-src="assets/wildwood/gender/female.png"');
    expect(gameShell).not.toContain('<img src="assets/wildwood/gender/male.png"');
    expect(gameShell).not.toContain('<img src="assets/wildwood/gender/female.png"');
  });

  it("shows the death message above the fallen player without covering the game", () => {
    expect(cssRule("#gameOver {")).toContain("background: transparent");
    expect(cssRule(".death-screen {")).toContain("transform: translateY(-25dvh)");
    expect(cssRule(".death-countdown {")).toContain("color: #fff");
  });

  it("turns the full minimap into a help target with a fullscreen map guide", () => {
    expect(html).toContain('id="minimapButton"');
    expect(html).toContain('id="minimapPlayers" class="minimap-players">players online: 0</div>');
    expect(html).toContain('class="minimap-help-mark" aria-hidden="true">?</span>');
    expect(html).toContain('id="mapGuideCanvas"');
    expect(html).toContain('id="mapGuideDropItems"');
    expect(html).toContain('id="mapGuideBack" class="map-guide-back window-back-button" type="button">Back</button>');
    const minimap = cssRule(".minimap-button {");
    expect(minimap).toContain("width: var(--hud-map-size)");
    expect(minimap).toContain("height: var(--hud-map-size)");
    expect(minimap).toContain("top: var(--hud-safe-top)");
    expect(minimap).toContain("right: var(--hud-safe-right)");
    expect(minimap).toContain("border: 2px solid var(--hud-frame)");
    expect(minimap).toContain("border-radius: var(--hud-radius)");
    expect(minimap).toContain("pointer-events: auto");
    expect(css).toContain("body:is(.is-dueling, .is-replaying) .minimap-button");
    expect(cssRule(".minimap-players {")).toContain("font: 900 10px/12px");
    expect(cssRule(".minimap-version {")).toContain("font: 900 9px/11px");
    const guide = cssRule("#mapGuide {");
    expect(guide).toContain("inset: 0 0 var(--toolbar-height)");
    expect(cssRule(".map-guide-map-frame {")).toContain("width: min(75%, 420px)");
    expect(cssRule(".map-guide-scroll {")).toContain("touch-action: pan-y");
    expect(cssRule(".window-back-button {")).toContain("width: min(150px, 44vw)");
  });

  it("uses the existing cosmetic slots for the wear-nothing state", () => {
    expect(cssRule(".equipment-slot.is-cosmetic-inherited {")).toContain("cursor: pointer");
    expect(cssRule(".equipment-slot.is-cosmetic-hidden {")).toContain("cursor: pointer");
    expect(cssRule(".cosmetic-hidden-icon::after {")).toContain("transform: rotate(-36deg)");
  });

  it("presents the daily Gem reward as a centered Claim window", () => {
    expect(html).toContain('id="dailyGemBonus"');
    expect(html).toContain('id="dailyGemClaimBtn"');
    expect(html).toContain('>CLAIM</button>');
    expect(cssRule(".daily-gem-bonus {")).toContain("place-items: center");
    expect(cssRule(".daily-gem-bonus-card {")).toContain("background: radial-gradient(circle at 50% 32%, #352a31, #252125 72%)");
    expect(cssRule(".daily-gem-claim-button {")).toContain("justify-self: center");
  });

  it("presents the one-time balance apology as a pending Gem window", () => {
    expect(html).toContain('id="balanceApologyGift"');
    expect(html).toContain('id="balanceApologyGiftTitle">+10 GEMS</h2>');
    expect(html).toContain("WE’RE SORRY FOR THE RECENT MAJOR BALANCE CHANGES.");
    expect(html).toContain('id="balanceApologyContinueBtn"');
    expect(cssRule(".balance-apology-gift { ")).toContain("z-index: 19");
  });

  it("opens the Upgrade Bench on two slots and orders active-job actions clearly", () => {
    const slotOne = html.indexOf('id="upgradeBenchSlot"');
    const slotTwo = html.indexOf('id="upgradeBenchSlotTwo"');
    const cancel = html.indexOf('id="upgradeBenchAction"');
    const finishNow = html.indexOf('id="upgradeBenchSpeedUp"');
    const back = html.indexOf('id="upgradeBenchBack"');
    expect(slotOne).toBeGreaterThanOrEqual(0);
    expect(slotTwo).toBeGreaterThan(slotOne);
    expect(html.slice(slotTwo, cancel)).toContain("150");
    expect(finishNow).toBeGreaterThan(cancel);
    expect(back).toBeGreaterThan(finishNow);
    expect(html).toContain('id="upgradeBenchSpeedUp" class="upgrade-bench-action upgrade-bench-speed-up" type="button" disabled hidden>Finish Now</button>');
    expect(html).toContain('id="upgradeBenchBack" class="upgrade-bench-back window-back-button" type="button">Back</button>');
    expect(cssRule(".upgrade-bench-slots {")).toContain("justify-content: center");
    const actionStyle = cssRule(".upgrade-bench-action {");
    expect(actionStyle).toContain("align-items: center");
    expect(actionStyle).toContain("padding: 0 8px 2px");
    const backStyle = cssRule(".upgrade-bench-back {");
    expect(backStyle).toContain("position: absolute");
    expect(backStyle).toContain("bottom: max(14px, env(safe-area-inset-bottom))");
    expect(backStyle).toContain("align-items: center");
    expect(backStyle).toContain("padding: 0 8px 2px");
  });

  it("shows five Upgrade Bench choices before scrolling and hides the scrollbar", () => {
    expect(cssRule(".upgrade-bench-picker-sheet { ")).toContain("minmax(0, 388px)");
    const pickerItems = cssRule(".upgrade-bench-picker-items { ");
    expect(pickerItems).toContain("min-height: 0");
    expect(pickerItems).toContain("overflow-y: auto");
    expect(pickerItems).toContain("scrollbar-width: none");
    expect(cssRule(".upgrade-bench-picker-items::-webkit-scrollbar")).toContain("display: none");
    expect(cssRule(".upgrade-bench-picker-item { ")).toContain("height: 72px");
  });

  it("renders the next paid Bag slot as a compact lock inside the scrollable grid", () => {
    expect(cssRule(".inventory-item.is-locked { ")).toContain("place-items: center");
    expect(cssRule(".inventory-slot-unlock-cost img { ")).toContain("width: 15px");
  });

  it("centers every research action state in the detail card", () => {
    const action = cssRule(".tech-tree-action {");
    expect(action).toContain("justify-self: center");
    expect(action).toContain("text-align: center");
  });

  it("marks completed research nodes gold with plain green Max text", () => {
    expect(cssRule(".tech-tree-node.is-complete {")).toContain("border-color: #f0c44f");
    const badge = cssRule(".tech-tree-node.is-complete::after {");
    expect(badge).toContain('content: "Max"');
    expect(badge).toContain("color: #65d66d");
    expect(badge).toContain("text-shadow:");
    expect(badge).not.toContain("background:");
    expect(badge).not.toContain("border:");
  });

  it("defines and applies the 11px functional-text floor", () => {
    expect(css).toMatch(/--font-readable-min:\s*11px/);
    expect(css).toContain("-webkit-text-size-adjust: 100%");
    expect(css).toContain("@media (prefers-contrast: more)");
    expect(css).toMatch(/#hpText,[\s\S]*font-size:\s*var\(--font-readable-min\)/);
  });

  it("uses compact Camel Case toolbar labels for five-button layouts", () => {
    expect(cssRule(".toolbar-label")).toContain("font: 900 10px/1");
    for (const label of ["Leaderboard", "Tech Tree", "Inventory", "Dev", "Settings"]) {
      expect(html).toContain(`<span class="toolbar-label">${label}</span>`);
    }
  });
});
