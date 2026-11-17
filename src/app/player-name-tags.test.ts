import { afterEach, expect, it, vi } from "vitest";
import { parseHTML } from "linkedom";
import { DEVELOPER_IDENTITY, isDeveloperIdentity } from "./developer";
import { appendPlayerNameTags, clearPlayerNameTags, developerNameTagVisible, playerNamePrefix, setGuildTagsVisible, updatePlayerNameTag } from "./player-name-tags";

afterEach(() => { clearPlayerNameTags(); setGuildTagsVisible(false); vi.unstubAllGlobals(); });
it("orders tags without spaces and preserves developer access when its badge is hidden", () => {
  setGuildTagsVisible(true);
  updatePlayerNameTag(DEVELOPER_IDENTITY, { guildTag: "TheG", showDevTag: true });
  expect(`${playerNamePrefix(DEVELOPER_IDENTITY)}rymel`).toBe("[dev][TheG]rymel");
  updatePlayerNameTag(DEVELOPER_IDENTITY, { guildTag: "TheG", showDevTag: false });
  expect(`${playerNamePrefix(DEVELOPER_IDENTITY)}rymel`).toBe("[TheG]rymel");
  expect(developerNameTagVisible(DEVELOPER_IDENTITY)).toBe(false);
  expect(isDeveloperIdentity(DEVELOPER_IDENTITY)).toBe(true);
  updatePlayerNameTag("member", { guildTag: "Fire", showDevTag: true });
  expect(playerNamePrefix("member")).toBe("[Fire]");
  expect(playerNamePrefix("outsider")).toBe("");
  // Show Guild Tags off drops only the guild's, even one named like the developer badge.
  setGuildTagsVisible(false);
  updatePlayerNameTag(DEVELOPER_IDENTITY, { guildTag: "dev", showDevTag: true });
  expect(playerNamePrefix(DEVELOPER_IDENTITY)).toBe("[dev]");
  expect(playerNamePrefix("member")).toBe("");
});
it("renders tag text safely and clears guild tags on session reset", () => {
  const { document } = parseHTML("<html><body></body></html>");
  vi.stubGlobal("document", document);
  setGuildTagsVisible(true);
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
  game.bindPlayerNameTags({ prefix: networking.fullPlayerNamePrefix, revision: networking.playerNameTagsRevision, prestigeLevel: () => 0, guildTag: networking.playerGuildTag });
  game.setGuildTagsVisible(true);
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

  // The tag slot does not carry it: the shield is its own call, made after
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
  const threeDigits = tags.appendPrestigeBadge(badged, DEVELOPER_IDENTITY, 101)!;
  expect(threeDigits.getAttribute("aria-label")).toBe("Prestige 101");
  expect(Number(threeDigits.style.getPropertyValue("--prestige-width-ratio"))).toBeGreaterThan(2);
  threeDigits.remove();
  expect([...badged.children].map(child => child.className)).toEqual(["player-prestige-badge"]);
});
