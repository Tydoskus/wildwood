import { expect, it } from "vitest";
import { createChatInputSizer } from "./chat-input-size";

/** A textarea whose content is one 18px line per 20 characters plus 24px of
 * padding, with a 1px border, a 44px minimum and border-box sizing. */
function textarea(width = 200) {
  const log: string[] = [];
  let height = "", value = "";
  const natural = () => Math.max(1, Math.ceil(value.length / (width / 10))) * 18 + 24;
  const box = () => height === "auto" || !height ? Math.max(44, natural() + 2) : Math.max(44, parseFloat(height));
  const input = {
    get value() { return value; }, set value(next: string) { value = next; },
    get clientWidth() { return width; },
    get clientHeight() { log.push("read"); return box() - 2; },
    get scrollHeight() { log.push("read"); return Math.max(natural(), box() - 2); },
    style: { get height() { return height; }, set height(next: string) { log.push(`height=${next}`); height = next; } },
  };
  return { input, log, resize(next: number) { width = next; } };
}

it("sizes the first keystroke, then only reads while appended text still fits", () => {
  const { input, log } = textarea();
  const size = createChatInputSizer(input);
  input.value = "h"; size();
  expect(input.style.height).toBe("42px");
  log.length = 0;
  input.value = "hello"; size();
  expect(log.some(entry => entry.startsWith("height="))).toBe(false);
  expect(input.style.height).toBe("42px");
});

it("grows when appended text wraps and holds at the cap without measuring", () => {
  const { input, log } = textarea();
  const size = createChatInputSizer(input);
  input.value = "h"; size();
  input.value = "x".repeat(25); size();
  expect(input.style.height).toBe("54px");
  log.length = 0;
  input.value = "x".repeat(80); size();
  expect(log).toEqual([]);
  expect(input.style.height).toBe("54px");
});

it("measures from scratch after a deletion, an outside reset or a resize", () => {
  const { input, resize } = textarea();
  const size = createChatInputSizer(input);
  input.value = "x".repeat(25); size();
  expect(input.style.height).toBe("54px");
  input.value = "x"; size();
  expect(input.style.height).toBe("42px");
  input.value = "x".repeat(25); size();
  input.style.height = "28px"; input.value = ""; // What sending a message does.
  input.value = "y"; size();
  expect(input.style.height).toBe("42px");
  input.value = "y".repeat(25); size();
  resize(400);
  input.value = "y".repeat(26); size();
  expect(input.style.height).toBe("42px");
});
