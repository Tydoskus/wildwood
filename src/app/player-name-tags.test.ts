import { afterEach, expect, it, vi } from "vitest";
import { parseHTML } from "linkedom";
import { DEVELOPER_IDENTITY, isDeveloperIdentity } from "./developer";
import { appendPlayerNameTags, clearPlayerNameTags, developerNameTagVisible, playerNamePrefix, updatePlayerNameTag } from "./player-name-tags";

afterEach(() => { clearPlayerNameTags(); vi.unstubAllGlobals(); });
it("orders tags without spaces and preserves developer access when its badge is hidden", () => {
  updatePlayerNameTag(DEVELOPER_IDENTITY, { guildTag: "TheG", showDevTag: true });
  expect(`${playerNamePrefix(DEVELOPER_IDENTITY)}rymel`).toBe("[dev][TheG]rymel");
  updatePlayerNameTag(DEVELOPER_IDENTITY, { guildTag: "TheG", showDevTag: false });
  expect(`${playerNamePrefix(DEVELOPER_IDENTITY)}rymel`).toBe("[TheG]rymel");
  expect(developerNameTagVisible(DEVELOPER_IDENTITY)).toBe(false);
  expect(isDeveloperIdentity(DEVELOPER_IDENTITY)).toBe(true);
  updatePlayerNameTag("member", { guildTag: "Fire", showDevTag: true });
  expect(playerNamePrefix("member")).toBe("[Fire]");
  expect(playerNamePrefix("outsider")).toBe("");
});
it("renders tag text safely and clears guild tags on session reset", () => {
  const { document } = parseHTML("<html><body></body></html>");
  vi.stubGlobal("document", document);
  const name = document.createElement("span");
  updatePlayerNameTag(DEVELOPER_IDENTITY, { guildTag: "TheG", showDevTag: true });
  appendPlayerNameTags(name as unknown as HTMLElement, DEVELOPER_IDENTITY);
  name.append(document.createTextNode("rymel"));
  expect(name.textContent).toBe("[dev][TheG]rymel");
  expect(name.querySelector(".dev-badge")?.textContent).toBe("[dev]");
  clearPlayerNameTags();
  expect(playerNamePrefix(DEVELOPER_IDENTITY)).toBe("[dev]");
});


it("reads live tags across the separately built networking and game modules", async () => {
  vi.resetModules();
  const networking = await import("./player-name-tags");
  vi.resetModules();
  const game = await import("./player-name-tags");
  game.bindPlayerNameTags({ prefix: networking.playerNamePrefix, revision: networking.playerNameTagsRevision });
  networking.updatePlayerNameTag(DEVELOPER_IDENTITY, { guildTag: "TheG", showDevTag: true });
  expect(game.playerNamePrefix(DEVELOPER_IDENTITY)).toBe("[dev][TheG]");
  const before = game.playerNameTagsRevision();
  networking.updatePlayerNameTag(DEVELOPER_IDENTITY, { guildTag: "TheG", showDevTag: false });
  expect(game.playerNamePrefix(DEVELOPER_IDENTITY)).toBe("[TheG]");
  expect(game.playerNameTagsRevision()).toBeGreaterThan(before);
  networking.clearPlayerNameTags();
});
