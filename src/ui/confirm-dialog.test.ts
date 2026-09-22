import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { parseHTML } from "linkedom";
import { createConfirmDialog } from "./confirm-dialog";

function harness() {
  const { document } = parseHTML("<!doctype html><html><body></body></html>");
  const dialog = createConfirmDialog(document as unknown as Document);
  const overlay = document.querySelector("#gameConfirm") as unknown as HTMLElement;
  const pick = (selector: string) => overlay.querySelector(selector) as unknown as HTMLElement;
  const view = document.defaultView as unknown as { Event: typeof Event };
  const click = (element: HTMLElement) => element.dispatchEvent(new view.Event("click", { bubbles: true }));
  return { dialog, overlay, pick, click, document };
}

describe("in-game confirmation", () => {
  it("answers true only when the affirmative button is pressed", async () => {
    const h = harness();
    const yes = h.dialog.confirm({ message: "Destroy it?" });
    expect(h.overlay.hidden).toBe(false);
    expect(h.pick(".game-confirm-message").textContent).toBe("Destroy it?");
    h.click(h.pick(".game-confirm-accept"));
    expect(await yes).toBe(true);
    expect(h.overlay.hidden).toBe(true);

    const no = h.dialog.confirm({ message: "Destroy it?" });
    h.click(h.pick(".game-confirm-cancel"));
    expect(await no).toBe(false);
  });

  it("shows what a spend costs and what it leaves", async () => {
    const h = harness();
    const answer = h.dialog.confirm({
      message: "Spend 12 Gems to finish this research now?",
      details: [
        { label: "Cost", value: "12 Gems", kind: "cost" },
        { label: "Your Gems", value: "40 Gems", kind: "balance" },
        { label: "After", value: "28 Gems", kind: "after" },
      ],
    });
    const rows = [...h.overlay.querySelectorAll(".game-confirm-detail")].map(row => [
      row.querySelector(".game-confirm-detail-label")?.textContent,
      row.querySelector(".game-confirm-detail-value")?.textContent,
    ]);
    expect(rows).toEqual([["Cost", "12 Gems"], ["Your Gems", "40 Gems"], ["After", "28 Gems"]]);
    h.click(h.pick(".game-confirm-cancel"));
    expect(await answer).toBe(false);
  });

  it("defaults the buttons to OK and Cancel, and reddens a destructive prompt", async () => {
    const h = harness();
    const plain = h.dialog.confirm({ message: "Go on?" });
    expect(h.pick(".game-confirm-accept").textContent).toBe("OK");
    expect(h.pick(".game-confirm-cancel").textContent).toBe("Cancel");
    expect(h.pick(".game-confirm-modal").classList.contains("is-danger")).toBe(false);
    h.click(h.pick(".game-confirm-cancel"));
    await plain;

    const danger = h.dialog.confirm({ message: "Destroy it?", confirmLabel: "Destroy", danger: true });
    expect(h.pick(".game-confirm-accept").textContent).toBe("Destroy");
    expect(h.pick(".game-confirm-modal").classList.contains("is-danger")).toBe(true);
    h.click(h.pick(".game-confirm-cancel"));
    expect(await danger).toBe(false);
  });

  it("answers a prompt that a second one replaces, so nothing is left waiting", async () => {
    const h = harness();
    const first = h.dialog.confirm({ message: "First?" });
    const second = h.dialog.confirm({ message: "Second?" });
    expect(await first).toBe(false);
    expect(h.pick(".game-confirm-message").textContent).toBe("Second?");
    h.click(h.pick(".game-confirm-accept"));
    expect(await second).toBe(true);
  });

  it("treats a click on the surround as a dismissal, but not one inside the frame", async () => {
    const h = harness();
    const answer = h.dialog.confirm({ message: "Go on?" });
    h.click(h.pick(".game-confirm-message"));
    expect(h.overlay.hidden).toBe(false);
    h.click(h.overlay);
    expect(await answer).toBe(false);
  });
});

describe("confirmation stacking", () => {
  const css = readFileSync(new URL("../../public/assets/wildstat/game.css", import.meta.url), "utf8");
  const layer = (selector: string) => {
    const found = [...css.matchAll(new RegExp(`${selector.replace(/[.#]/g, "\\$&")}[^{},]*\\{[^}]*z-index:\\s*(\\d+)`, "g"))]
      .map(match => Number(match[1]));
    return found.at(-1);
  };

  it("sits above every window a prompt can be raised from", () => {
    // It was behind the item inspector and the gift window at first, because
    // it inherited the ordinary window layer.
    const confirm = layer("#gameConfirm")!;
    for (const selector of [".item-inspection-panel", "#prestigeOverlay", ".daily-gem-bonus", ".onboarding-tutorial", "#techTreeOverlay", "#profileNameEditor"]) {
      expect(layer(selector), selector).toBeLessThan(confirm);
    }
  });

  it("stays under the overlays that should cover a prompt", () => {
    expect(layer("#gameConfirm")!).toBeLessThan(layer("#reconnectOverlay")!);
  });
});
