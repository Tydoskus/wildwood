import { expect, it } from "vitest";
import { parseHTML } from "linkedom";
import { createPrestigeExpansionNotice } from "./prestige-expansion-notice";
import { prestigeExpansionUnlocked } from "../../shared/prestige-expansion";

it("shows the shared countdown and unlock without restarting on reload", () => {
  const { document } = parseHTML("<html><body></body></html>");
  const deadline = 1_800_100;
  let now = 100;
  const d = { root: document as unknown as Document, unlocksAt: () => deadline, now: () => now, visible: () => true };
  const notice = createPrestigeExpansionNotice(d); notice.tick();
  expect(document.body.textContent).toContain("Prestige 20 uncapped in 30 min");
  now += 600_000;
  const reloaded = createPrestigeExpansionNotice(d); reloaded.tick();
  expect(document.body.lastElementChild?.textContent).toContain("20 min");
  expect(notice.unlocked()).toBe(false);
  now = deadline; reloaded.tick();
  expect(reloaded.unlocked()).toBe(true);
  expect(document.body.lastElementChild?.textContent).toContain("New perks available");
  now += 300_000; reloaded.tick();
  expect((document.body.lastElementChild as unknown as HTMLElement).hidden).toBe(true);
  expect(prestigeExpansionUnlocked(null, now)).toBe(false);
});
