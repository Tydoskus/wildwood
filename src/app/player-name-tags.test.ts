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
  game.bindPlayerNameTags({ prefix: networking.playerNamePrefix, revision: networking.playerNameTagsRevision, prestigeLevel: () => 0 });
  networking.updatePlayerNameTag(DEVELOPER_IDENTITY, { guildTag: "TheG", showDevTag: true });
  expect(game.playerNamePrefix(DEVELOPER_IDENTITY)).toBe("[dev][TheG]");
  const before = game.playerNameTagsRevision();
  networking.updatePlayerNameTag(DEVELOPER_IDENTITY, { guildTag: "TheG", showDevTag: false });
  expect(game.playerNamePrefix(DEVELOPER_IDENTITY)).toBe("[TheG]");
  expect(game.playerNameTagsRevision()).toBeGreaterThan(before);
  networking.clearPlayerNameTags();
});

it("puts the prestige shield after the name, carrying the level inside it", async () => {
  const { parseHTML } = await import("linkedom");
  const { document } = parseHTML("<html><body></body></html>");
  (globalThis as { document?: unknown }).document = document;
  vi.resetModules();
  const tags = await import("./player-name-tags");
  let level = 0;
  tags.bindPlayerNameTags({ prefix: () => "[GUILD]", revision: () => 0, prestigeLevel: () => level });

  // The tag slot no longer carries it: the shield is its own call, made after
  // the name so it can never land past the "(guest)" suffix.
  const tagsOnly = document.createElement("span");
  tags.appendPlayerNameTags(tagsOnly, DEVELOPER_IDENTITY);
  expect(tagsOnly.querySelector(".player-prestige-badge")).toBeNull();

  const unprestiged = document.createElement("span");
  expect(tags.appendPrestigeBadge(unprestiged, DEVELOPER_IDENTITY)).toBeNull();
  expect(unprestiged.children).toHaveLength(0);

  level = 7;
  const badged = document.createElement("span");
  const shield = tags.appendPrestigeBadge(badged, DEVELOPER_IDENTITY);
  // The level is the digit inside the shield, not a second element beside it.
  expect(shield?.textContent).toBe("7");
  expect(shield?.getAttribute("aria-label")).toBe("Prestige 7");
  expect([...badged.children].map(child => child.className)).toEqual(["player-prestige-badge"]);
});
