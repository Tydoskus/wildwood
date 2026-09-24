import { describe, expect, it, vi } from "vitest";
import { parseHTML } from "linkedom";
import { bindGameInteractionListeners } from "./game-interaction-bindings";

function bind() {
  const { document, Event } = parseHTML(`<html><body>
    <div class="card player-hud-card">
      <button id="playerHudProfileIcon"></button>
      <div class="player-summary"><div id="playerPower">30</div>
        <button id="playerHudProfileGear"><img id="gearIcon"></button></div>
      <div id="hpText">30 / 30</div>
    </div>
    <button id="replay"></button><button id="profileIcon"></button><button id="closePicker"></button>
  </body></html>`);
  const element = (id: string) => document.getElementById(id)! as unknown as HTMLElement;
  const onOpenOwnProfile = vi.fn();
  bindGameInteractionListeners({
    hpText: element("hpText"), watchDuelReplay: element("replay"), playerHudProfile: element("playerHudProfileIcon"),
    playerHudProfileGear: element("playerHudProfileGear"),
    playerProfileIcon: element("profileIcon"), closeProfileIconPicker: element("closePicker"),
    onOpenOwnProfile,
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

  it("opens the profile from the gear too, including a tap that lands on its icon", () => {
    // The gear is the sign that the card is a button, so it does what the card
    // does. Settings keeps its own gear inside the profile window.
    const h = bind();
    h.click("playerHudProfileGear");
    expect(h.onOpenOwnProfile).toHaveBeenCalledTimes(1);
    h.click("gearIcon");
    expect(h.onOpenOwnProfile).toHaveBeenCalledTimes(2);
  });

  it("still opens the profile from the icon button, which is what it is for", () => {
    const h = bind();
    h.click("playerHudProfileIcon");
    expect(h.onOpenOwnProfile).toHaveBeenCalledTimes(1);
  });
});
