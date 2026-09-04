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
    expect(Buffer.byteLength(entryHtml)).toBeLessThan(24_000);
    for (const id of ["start", "gameUpdateGate", "dailyGemBonus", "gameOver", "playerProfile", "techTreeOverlay"]) {
      expect(doc.getElementById(id), id).not.toBeNull();
    }
    const before = doc.querySelectorAll("[id]").length;
    installGameShell(doc);
    const ids = [...doc.querySelectorAll("[id]")].map((node) => node.id);
    expect(ids).toHaveLength(before);
    expect(new Set(ids).size).toBe(ids.length);
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

  it("keeps boss defeats as nonblocking status notices", () => {
    const notice = doc.getElementById("dragonWorldNotice")!;
    expect(notice.getAttribute("role")).toBe("status");
    expect(notice.querySelector('[role="dialog"]')).toBeNull();
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

  it("lets profile content grow without a fixed-height nested scroller", () => {
    expect(declarations("#profileStatsPanel")).toMatchObject({ height: "auto", "max-height": "none", overflow: "visible" });
    expect(declarations(".profile-stat-grid")["align-items"]).toBe("start");
    expect(declarations(".modal.player-profile-modal")["overflow-y"]).toBe("auto");
  });

  it("allows settings and bag content to scroll independently", () => {
    expect(declarations(".settings-panel > .settings-content")["overflow-y"]).toBe("auto");
    expect(declarations(".inventory-items")["overflow-y"]).toBe("auto");
    expect(declarations(".inventory-items")["touch-action"]).toBe("pan-y");
  });
});
