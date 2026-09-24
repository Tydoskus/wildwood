import { readFileSync } from "node:fs";
import postcss from "postcss";
import { beforeEach, describe, expect, it } from "vitest";
import { createGameDocument, entryHtml } from "../../tests/helpers/game-document";
import { installGameShell } from "./game-shell";

const stylesheet = postcss.parse(readFileSync(new URL("../../public/assets/wildstat/game.css", import.meta.url), "utf8"));

// Declaration contracts, not computed layout or visual QA. Later declarations
// of a selector win; formatting is irrelevant. Colors, spacing, and animation
// taste belong to user review; interaction behavior has controller tests.
function declarations(selector: string) {
  const values: Record<string, string> = {};
  stylesheet.walkRules((rule) => {
    if (rule.parent?.type !== "root" || !rule.selectors.includes(selector)) return;
    rule.walkDecls((declaration) => { values[declaration.prop] = declaration.value; });
  });
  return values;
}

describe("installed interface structure", () => {
  let doc: Document;
  beforeEach(() => { doc = createGameDocument(); });

  it("keeps startup small and installs the deferred shell exactly once", () => {
    // Allow the explicit mailbox stylesheet link and the settings row each
    // toggleable feature needs; keep the startup shell bounded.
    // Raised by 32 bytes for the "alpha" the three version labels now carry.
    // They are in the markup rather than set from script so the label is right
    // on the first paint, which is exactly when a new player reads it.
    // Raised again by one element: the card the sign-in copy sits in. Three
    // paragraphs cannot share a background without something to draw it on,
    // and the Discord invite in that copy is a link rather than a word. The
    // icon beside the mute button is built in script, where its path costs the
    // startup shell nothing.
    expect(Buffer.byteLength(entryHtml)).toBeLessThan(24_672);
    for (const id of ["start", "gameUpdateGate", "dailyGemBonus", "gameOver", "playerProfile", "techTreeOverlay", "guildBtn"]) {
      expect(doc.getElementById(id), id).not.toBeNull();
    }
    expect(doc.getElementById("journeyBtn")).toBeNull();
    const before = doc.querySelectorAll("[id]").length;
    installGameShell(doc);
    const ids = [...doc.querySelectorAll("[id]")].map((node) => node.id);
    expect(ids).toHaveLength(before);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it("puts a gear in the player HUD right of power, and leaves settings its own inside the profile", () => {
    const gear = doc.getElementById("playerHudProfileGear")!;
    expect(gear.previousElementSibling?.id).toBe("playerPower");
    expect(gear.closest(".player-summary")).not.toBeNull();
    expect(gear.hidden).toBe(false);
    // Only the entry page's byte budget keeps it out of index.html.
    expect(entryHtml).not.toContain("playerHudProfileGear");
    // The settings gear stays where it was, inside the profile window.
    expect(doc.getElementById("settingsBtn")!.closest("#playerProfile")).not.toBeNull();
    // No button moves under a press any more, and the HUD least of all: the
    // guard stays so a reintroduced drop cannot reach it.
    expect(declarations(".hud-settings-button:active").transform).toBe("none");
    expect(declarations("button").transform).toBeUndefined();
  });

  it("provides real targets for accessibility labels and tab controls", () => {
    for (const element of doc.querySelectorAll("[aria-controls], [aria-labelledby], [aria-describedby]")) {
      for (const attribute of ["aria-controls", "aria-labelledby", "aria-describedby"]) {
        for (const id of (element.getAttribute(attribute) ?? "").split(/\s+/).filter(Boolean)) {
          expect(doc.getElementById(id), element.id + ": " + attribute + "=" + id).not.toBeNull();
        }
      }
    }
  });

  it("keeps settings navigation outside scrolling content and preserves controls across tab changes", () => {
    const settings = doc.getElementById("settingsPanel")!;
    const content = settings.querySelector(".settings-content")!;
    const tabs = [...settings.querySelectorAll<HTMLButtonElement>('[role="tab"]')];
    const volume = doc.getElementById("musicVolume");
    expect(tabs.length).toBeGreaterThan(1);
    expect(content.contains(doc.getElementById("settingsTabs"))).toBe(false);
    expect(content.contains(doc.getElementById("closeSettingsBtn"))).toBe(false);
    for (const tab of tabs) {
      tab.click();
      expect(settings.querySelectorAll('[role="tab"][aria-selected="true"]')).toHaveLength(1);
      expect(settings.querySelectorAll('[role="tabpanel"]:not([hidden])')).toHaveLength(1);
      expect(doc.getElementById(tab.getAttribute("aria-controls")!)!.hidden).toBe(false);
    }
    expect(doc.getElementById("musicVolume")).toBe(volume);
  });

  it("keeps item inspection outside both bag and profile", () => {
    const inspection = doc.getElementById("itemInspectionPanel")!;
    expect(inspection).not.toBeNull();
    expect(inspection.closest(".bag-section, #playerProfile")).toBeNull();
    expect(inspection.querySelector("#itemInspectionBack")?.tagName).toBe("BUTTON");
  });

  it("exposes one inspectable button per profile equipment slot", () => {
    const slots = [...doc.querySelectorAll<HTMLButtonElement>("#playerProfile .profile-equipment-slot")];
    expect(slots.map((slot) => slot.dataset.slot).sort()).toEqual(["chest", "feet", "head", "right-hand"]);
    expect(slots.every((slot) => slot.tagName === "BUTTON")).toBe(true);
  });

  it("keeps safety tools in the profile and support/developer controls in Account settings", () => {
    for (const id of ["profileReportBtn", "profileBlockBtn"]) {
      const button = doc.getElementById(id)!;
      expect(button.closest("#playerProfile")).not.toBeNull();
      expect(button.closest(".window-back-footer")).toBeNull();
    }
    const account = doc.getElementById("settings-account-panel")!;
    expect(account.querySelector('a[href="mailto:support@wildstatmmo.com"]')).not.toBeNull();
    expect(account.contains(doc.getElementById("blockedPlayersSetting"))).toBe(true);
    expect(account.contains(doc.getElementById("devAuditBtn"))).toBe(true);
    expect(doc.getElementById("developerSettingsRow")!.hidden).toBe(true);
    expect(doc.getElementById("editPlayerSaveBtn")).toBeNull();
  });

  it("provides an exit from every primary game window", () => {
    const exits = {
      settingsPanel: "closeSettingsBtn", inventoryPanel: "closeInventoryBtn",
      playerProfile: "closePlayerProfileBtn", leaderboard: "closeLeaderboardBtn",
      techTreeOverlay: "closeTechTreeBtn", mapGuide: "mapGuideBack", upgradeBenchPanel: "upgradeBenchBack",
    };
    for (const [windowId, buttonId] of Object.entries(exits)) {
      const button = doc.getElementById(buttonId)!;
      const window = doc.getElementById(windowId);
      expect(window, windowId).not.toBeNull();
      expect(window!.contains(button), windowId).toBe(true);
      expect(button.tagName).toBe("BUTTON");
      expect(button.textContent?.trim().length).toBeGreaterThan(0);
    }
  });

  it("announces boss defeats through the stat reward popups, with no banner or dialog", () => {
    expect(doc.getElementById("dragonWorldNotice")).toBeNull();
    expect(doc.getElementById("dragonResult")).toBeNull();
  });
});

describe("functional stylesheet contracts (not visual QA)", () => {
  it("keeps inactive overlays and expandable panels hidden", () => {
    for (const selector of ["#playerProfile[hidden]", "#techTreeOverlay[hidden]", ".settings-tab-panel[hidden]", ".profile-stat-sources[hidden]", ".item-inspection-panel[hidden]"]) {
      expect(declarations(selector).display, selector).toBe("none");
    }
  });

  it("layers inspection and noninteractive notices above the profile", () => {
    const layer = (selector: string) => Number(declarations(selector)["z-index"]);
    expect(layer(".item-inspection-panel")).toBeGreaterThan(layer("#playerProfile"));
    expect(layer("#message")).toBeGreaterThan(layer(".item-inspection-panel"));
    expect(declarations("#message")["pointer-events"]).toBe("none");
  });

  it("keeps duel replays above fullscreen game windows", () => {
    const layer = (selector: string) => Number(declarations(selector)["z-index"]);
    expect(layer("#duelReplay")).toBeGreaterThan(layer("#techTreeOverlay"));
    expect(layer("#duelReplay")).toBeGreaterThan(layer(".gem-shop"));
  });

  it("keeps the profile frame stable and scrolls its content behind a fixed Back button", () => {
    expect(declarations("#profileStatsPanel")).toMatchObject({ height: "auto", "max-height": "none", overflow: "visible" });
    expect(declarations(".profile-stat-grid")["align-items"]).toBe("start");
    expect(declarations(".modal.player-profile-modal").overflow).toBe("hidden");
    expect(declarations(".modal.player-profile-modal").height).toContain("560px");
    expect(declarations(".player-profile-scroll")["overflow-y"]).toBe("auto");
    expect(declarations(".player-profile-scroll")["scrollbar-width"]).toBe("none");
  });

  it("keeps settings and the whole inventory body scrollable", () => {
    expect(declarations(".settings-panel > .settings-content")["overflow-y"]).toBe("auto");
    expect(declarations(".inventory-scroll")["overflow-y"]).toBe("auto");
    expect(declarations(".inventory-scroll")["touch-action"]).toBe("pan-y");
  });
});
