import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { chatFixture, mountChat } from "../../tests/helpers/chat-controller";

const unreadRefreshes = vi.hoisted(() => ({ count: 0 }));
vi.mock("./chat-unread", async importOriginal => {
  const actual = await importOriginal<typeof import("./chat-unread")>();
  return {
    ...actual,
    createChatUnreadTracker: (...args: Parameters<typeof actual.createChatUnreadTracker>) => {
      const tracker = actual.createChatUnreadTracker(...args);
      return { ...tracker, refresh: (...refreshArgs: Parameters<typeof tracker.refresh>) => { unreadRefreshes.count++; return tracker.refresh(...refreshArgs); } };
    },
  };
});

beforeEach(() => { unreadRefreshes.count = 0; });
afterEach(() => vi.unstubAllGlobals());

function mount(large: boolean) {
  const fixture = chatFixture();
  const mounted = mountChat(fixture.coop);
  if (large) mounted.elements.sizeToggle.dispatchEvent(new mounted.window.Event("click"));
  mounted.chat.refresh();
  const measure = (change: () => void) => {
    change();
    fixture.resetCounts(); mounted.layoutReads.count = 0; mounted.created.count = 0; unreadRefreshes.count = 0;
    mounted.chat.refresh();
    return { layoutReads: mounted.layoutReads.count, created: mounted.created.count, unread: unreadRefreshes.count, calls: Object.fromEntries(fixture.counts) };
  };
  return { fixture, ...mounted, measure };
}

it.each([false, true])("a profile or portrait row that changes no drawn row does no row or layout work (large=%s)", large => {
  const { fixture, measure } = mount(large);
  expect(measure(() => fixture.touchChatPresentation())).toMatchObject({ layoutReads: 0, created: 0, unread: 0 });
});

it.each([false, true])("a social hub update skips the unread recount and the row work (large=%s)", large => {
  const { fixture, measure } = mount(large);
  expect(measure(() => fixture.touchSocial())).toMatchObject({ layoutReads: 0, created: 0, unread: 0 });
});

it("a message in another channel recounts unread without touching the drawn rows", () => {
  const { fixture, measure, document } = mount(false);
  expect(measure(() => fixture.addGuildMessage("from the guild"))).toMatchObject({ layoutReads: 0, created: 0, unread: 1 });
  expect(document.getElementById("chatUnreadBadge")?.textContent).toBe("1");
  // The count holds through unrelated updates, and moves again on the next message.
  measure(() => fixture.touchSocial());
  expect(document.getElementById("chatUnreadBadge")?.textContent).toBe("1");
  measure(() => fixture.addGuildMessage("again"));
  expect(document.getElementById("chatUnreadBadge")?.textContent).toBe("2");
});

it.each([false, true])("a new message in the open channel is still drawn (large=%s)", large => {
  const { fixture, measure, elements } = mount(large);
  const work = measure(() => fixture.addPublicMessage("hello there"));
  expect(work.created).toBeGreaterThan(0);
  expect(work.layoutReads).toBeGreaterThan(0);
  expect(elements.messages.textContent).toContain("hello there");
});

it.each([false, true])("a presentation change that alters a drawn row redraws that row (large=%s)", large => {
  const { fixture, measure, elements } = mount(large);
  const newest = fixture.state.publicRows[fixture.state.publicRows.length - 1];
  const before = elements.messages.querySelector(`[data-message-id="${newest.id}"]`);
  fixture.coop.isGuest = sender => sender === newest.sender;
  expect(measure(() => fixture.touchChatPresentation()).created).toBeGreaterThan(0);
  const after = elements.messages.querySelector(`[data-message-id="${newest.id}"]`);
  expect(after).not.toBe(before);
  expect(after?.textContent).toContain("(guest)");
});

it("typing and scrolling in the expanded chat both count as interaction", () => {
  for (const [target, type] of [["input", "keydown"], ["input", "input"], ["messages", "scroll"]] as const) {
    const { elements, window, chat } = mount(true);
    expect(chat.isInteracting()).toBe(false);
    elements[target].dispatchEvent(new window.Event(type, { bubbles: true }));
    expect(chat.isInteracting()).toBe(true);
  }
});
