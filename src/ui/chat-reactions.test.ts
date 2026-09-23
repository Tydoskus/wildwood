import { afterEach, expect, it, vi } from "vitest";
import { parseHTML } from "linkedom";
import { appendChatReactions } from "./chat-reactions";
afterEach(() => vi.unstubAllGlobals());
it("places reaction chips in insertion order with a count beside every emoji", () => {
  const { document } = parseHTML("<html><body></body></html>"); vi.stubGlobal("document", document);
  const bubble = document.createElement("span");
  appendChatReactions(bubble, JSON.stringify({ like: 1, laugh: 3, heart: 105, dislike: 0 }));
  expect(bubble.classList.contains("has-reactions")).toBe(true);
  expect([...bubble.querySelectorAll(".chat-reaction-count")].map(node => node.textContent)).toEqual(["1", "3", "99+"]);
  expect([...bubble.querySelectorAll(".chat-bubble-reaction")].map(node => node.getAttribute("aria-label"))).toEqual(["Thumbs up: 1", "Laugh: 3", "Heart: 105"]);
  const empty = document.createElement("span"); appendChatReactions(empty, "{}"); expect(empty.children).toHaveLength(0);
});

it("renders the gem heart art without a background inside its reaction chip", () => {
  const { document } = parseHTML("<html><body></body></html>"); vi.stubGlobal("document", document);
  const bubble = document.createElement("span");
  appendChatReactions(bubble, JSON.stringify({ gemHeart: 2 }));
  const icon = bubble.querySelector(".chat-bubble-reaction img");
  expect(icon?.getAttribute("src")).toBe("assets/wildstat/gems/gem-heart-reaction.webp");
  expect(bubble.querySelector(".chat-bubble-reaction")?.getAttribute("aria-label")).toBe("Gem heart: 2");
});
