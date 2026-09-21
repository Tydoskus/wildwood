import { describe, expect, it, vi } from "vitest";
import { parseHTML } from "linkedom";
import { bindGameInteractionListeners } from "./game-interaction-bindings";

function bind() {
  const { document, Event } = parseHTML(`<html><body>
    <div class="card player-hud-card">
      <button id="playerHudProfileIcon"></button>
      <div class="player-summary"><div id="playerPower">30</div>
        <button id="settingsBtn"><img id="gearIcon"></button></div>
      <div id="hpText">30 / 30</div>
    </div>
    <button id="dragon"></button><button id="snow"></button><button id="lava"></button>
    <button id="replay"></button><button id="profileIcon"></button><button id="closePicker"></button>
  </body></html>`);
  const element = (id: string) => document.getElementById(id)! as unknown as HTMLElement;
  const onOpenOwnProfile = vi.fn();
  bindGameInteractionListeners({
    triggerDragonCutscene: element("dragon"), triggerSnowlandsCutscene: element("snow"), triggerLavaCutscene: element("lava"),
    hpText: element("hpText"), watchDuelReplay: element("replay"), playerHudProfile: element("playerHudProfileIcon"),
    playerProfileIcon: element("profileIcon"), closeProfileIconPicker: element("closePicker"),
    onDragonCutscene: vi.fn(), onSnowlandsCutscene: vi.fn(), onLavaCutscene: vi.fn(), onOpenOwnProfile,
    replayId: () => 0n, onWatchReplay: vi.fn(), canOpenProfileIconPicker: () => false,
    openProfileIconPicker: vi.fn(), closeIconPicker: vi.fn(),
  });
  return { onOpenOwnProfile, click: (id: string) => document.getElementById(id)!.dispatchEvent(new Event("click", { bubbles: true })) };
}

describe("the player HUD card", () => {
  it("opens your profile when the card itself is tapped", () => {
    const h = bind();
    h.click("hpText");
    expect(h.onOpenOwnProfile).toHaveBeenCalledTimes(1);
  });

  it("leaves the settings gear to settings, including a tap that lands on its icon", () => {
    const h = bind();
    h.click("settingsBtn");
    h.click("gearIcon");
    expect(h.onOpenOwnProfile).not.toHaveBeenCalled();
  });

  it("still opens the profile from the icon button, which is what it is for", () => {
    const h = bind();
    h.click("playerHudProfileIcon");
    expect(h.onOpenOwnProfile).toHaveBeenCalledTimes(1);
  });
});
