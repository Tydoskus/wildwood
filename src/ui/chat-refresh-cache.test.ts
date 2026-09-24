import { expect, it } from "vitest";
import { chatListFingerprint, createChatInputMemo, sameChatRows, setChatAttribute, setChatHidden, setChatText } from "./chat-refresh-cache";

it("fingerprints a list by length and edge ids, ignoring edits to a row", () => {
  const rows = [{ id: 3n, text: "a" }, { id: 5n, text: "b" }];
  const edited = [{ id: 3n, text: "edited" }, { id: 5n, text: "b" }];
  expect(chatListFingerprint(rows)).toBe(chatListFingerprint(edited));
  expect(chatListFingerprint(rows)).not.toBe(chatListFingerprint([...rows, { id: 6n, text: "new" }]));
  expect(chatListFingerprint(rows)).not.toBe(chatListFingerprint([rows[1]]));
  expect(chatListFingerprint([])).toBe("0::");
});

it("compares message lists by the objects they hold", () => {
  const a = { id: 1n }, b = { id: 2n };
  expect(sameChatRows([a, b], [a, b])).toBe(true);
  expect(sameChatRows([a, b], [a, { ...b }])).toBe(false);
  expect(sameChatRows([a, b], [a])).toBe(false);
});

it("reports a change only when an input differs by identity", () => {
  const memo = createChatInputMemo(), list: number[] = [];
  expect(memo.changed([list, "guild"])).toBe(true);
  expect(memo.changed([list, "guild"])).toBe(false);
  expect(memo.changed([[...list], "guild"])).toBe(true);
  memo.reset();
  expect(memo.changed([list, "guild"])).toBe(true);
});

it("writes text, attributes and visibility only when they change", () => {
  let writes = 0, text = "3", hidden = false;
  const attributes = new Map([["aria-label", "3 unread"]]);
  const element = {
    get textContent() { return text; }, set textContent(value: string) { writes++; text = value; },
    get hidden() { return hidden; }, set hidden(value: boolean) { writes++; hidden = value; },
    getAttribute: (name: string) => attributes.get(name) ?? null,
    setAttribute: (name: string, value: string) => { writes++; attributes.set(name, value); },
  };
  setChatText(element, "3"); setChatHidden(element, false); setChatAttribute(element, "aria-label", "3 unread");
  expect(writes).toBe(0);
  setChatText(element, "4"); setChatHidden(element, true); setChatAttribute(element, "aria-label", "4 unread");
  expect(writes).toBe(3);
  expect([text, hidden, attributes.get("aria-label")]).toEqual(["4", true, "4 unread"]);
});
