import { afterEach, expect, it } from "vitest";
import { parseHTML } from "linkedom";
import { renderPlayerHud } from "./hud";

const original = globalThis.document;
afterEach(() => { globalThis.document = original; });

it("slides the health bar and changes only the power number, so neither re-lays out the HUD", () => {
  const { document } = parseHTML(`<html><body><div id="fill"></div><div id="text"></div><div id="power"></div></body></html>`);
  globalThis.document = document as unknown as Document;
  const elements = {
    hpFill: document.getElementById("fill") as unknown as HTMLElement,
    hpText: document.getElementById("text") as unknown as HTMLElement,
    playerPower: document.getElementById("power") as unknown as HTMLElement,
    playerName: null, coopStatus: null, minimapPlayers: null,
  };
  renderPlayerHud(elements, { hp: 60, maxHp: 100 }, "Ryan", 1, 105);
  expect(elements.hpFill.style.transform).toBe("translateX(-40.0%)");
  expect(elements.hpFill.style.width || "").toBe("");
  const icon = elements.playerPower.querySelector(".power-icon");
  renderPlayerHud(elements, { hp: 100, maxHp: 100 }, "Ryan", 1, 106);
  expect(elements.hpFill.style.transform).toBe("translateX(0.0%)");
  expect(elements.playerPower.querySelector(".power-icon")).toBe(icon);
  expect(elements.playerPower.querySelector(".power-value")!.textContent).toBe("106");
});
