import { expect, it, vi } from "vitest";
import { parseHTML } from "linkedom";
import { createChatGuildCrests } from "./chat-guild-crests";

function body(text: string) {
  const { document } = parseHTML("<!doctype html><html><body></body></html>");
  const span = document.createElement("span");
  span.textContent = text;
  document.body.append(span);
  return span as unknown as HTMLElement;
}
const settle = async () => { for (let i = 0; i < 4; i++) await Promise.resolve(); };

it("puts each guild's crest beside its name, its chosen badge or else its name's", async () => {
  const fetch = vi.fn(async () => [{ name: "OAKS", emblem: 16 }, { name: "ELMS", emblem: -1 }]);
  const decorate = createChatGuildCrests(() => fetch);
  const line = body("[OAKS] defeated [ELMS]");
  decorate(line, "7:3");
  await settle();
  const crests = line.querySelectorAll(".chat-guild-crest");
  expect(crests).toHaveLength(2);
  // OAKS chose the turtle (on the second sheet); ELMS never chose, so its name picks from the first.
  expect(crests[0].classList.contains("guild-emblem--sheet-2")).toBe(true);
  expect(crests[1].classList.contains("guild-emblem--sheet-2")).toBe(false);
  expect(line.textContent).toBe("[OAKS] defeated [ELMS]");
  expect(fetch).toHaveBeenCalledWith("7:3");
});

it("asks the server once per battle however often chat redraws it, and again after a failure", async () => {
  const fetch = vi.fn().mockRejectedValueOnce(new Error("offline")).mockResolvedValue([{ name: "OAKS", emblem: 2 }, { name: "ELMS", emblem: 5 }]);
  const decorate = createChatGuildCrests(() => fetch);
  decorate(body("[OAKS] × [ELMS] · Draw"), "7:4");
  await settle();
  for (let i = 0; i < 3; i++) { decorate(body("[OAKS] × [ELMS] · Draw"), "7:4"); await settle(); }
  expect(fetch).toHaveBeenCalledTimes(2);
});

it("leaves a line alone when the server has no badges for it", async () => {
  const decorate = createChatGuildCrests(() => async () => { throw new Error("This battle was not shared."); });
  const line = body("[OAKS] defeated [ELMS]");
  decorate(line, "7:5");
  await settle();
  expect(line.querySelectorAll(".chat-guild-crest")).toHaveLength(0);
});
