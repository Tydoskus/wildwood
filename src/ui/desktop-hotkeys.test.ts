import { describe, expect, it, vi } from "vitest";
import { parseHTML } from "linkedom";
import { installDesktopHotkeys, pressTopBack } from "./desktop-hotkeys";

/** linkedom has no layout: each element gets a box, and a hit test returns the topmost listed box. */
function setup(html: string) {
  const { document, window } = parseHTML(`<html><body>${html}</body></html>`);
  const stack: Element[] = [];
  const place = (element: Element | null, x: number) => {
    (element as any).getBoundingClientRect = () => ({ left: x, top: 0, width: 10, height: 10 });
    stack.push(element!);
  };
  const cover = (element: Element) => stack.unshift(element);
  (document as any).elementFromPoint = (x: number) => [...stack].reverse().find(element => {
    const box = (element as any).getBoundingClientRect();
    return !(element as HTMLElement).hidden && !(element as HTMLElement).closest("[hidden]") && x >= box.left && x < box.left + box.width;
  }) ?? null;
  (window as any).requestAnimationFrame = (run: () => void) => run();
  const key = (code: string, extra: Record<string, unknown> = {}, target: EventTarget = document.body) => {
    const event = new window.Event("keydown", { bubbles: true, cancelable: true }) as KeyboardEvent;
    for (const [name, value] of Object.entries({ code, ctrlKey: false, metaKey: false, altKey: false, repeat: false, ...extra })) {
      Object.defineProperty(event, name, { value });
    }
    target.dispatchEvent(event);
    return event;
  };
  return { document, place, cover, key, pick: (selector: string) => document.querySelector(selector) as HTMLElement };
}

describe("PC keyboard", () => {
  it("Escape presses the Back of the window on top, never one hidden or underneath", () => {
    const s = setup(`<div id="a"><button id="backA">Back</button></div><div id="b"><button id="backB">Back</button></div><button id="yes">Yes</button>`);
    const clicks: string[] = [];
    for (const id of ["backA", "backB", "yes"]) s.pick(`#${id}`).addEventListener("click", () => clicks.push(id));
    s.place(s.pick("#backA"), 0); s.place(s.pick("#backB"), 20); s.place(s.pick("#yes"), 40);
    // B's window covers A's Back.
    s.cover(s.pick("#backA"));
    (s.pick("#backA") as any).getBoundingClientRect = () => ({ left: 20, top: 0, width: 10, height: 10 });
    expect(pressTopBack(s.document)).toBe(true);
    expect(clicks).toEqual(["backB"]);
    s.pick("#b").hidden = true;
    clicks.length = 0;
    expect(pressTopBack(s.document)).toBe(true);
    expect(clicks).toEqual(["backA"]);
    s.pick("#a").hidden = true;
    expect(pressTopBack(s.document)).toBe(false);
  });

  it("I opens the inventory like its button, and I again closes it", () => {
    const s = setup(`<button id="inventoryBtn" aria-label="Open inventory">Inventory</button><div id="panel" hidden><button id="close">Back</button></div>`);
    const open = s.pick("#inventoryBtn"), panel = s.pick("#panel"), close = s.pick("#close");
    open.addEventListener("click", () => { panel.hidden = false; });
    close.addEventListener("click", () => { panel.hidden = true; });
    s.place(open, 0); s.place(close, 20);
    installDesktopHotkeys(s.document);
    expect(open.title).toBe("Open inventory (I)");
    s.key("KeyI");
    expect(panel.hidden).toBe(false);
    s.key("KeyI");
    expect(panel.hidden).toBe(true);
  });

  it("ignores shortcuts while typing, with a modifier held, or when the button is covered", () => {
    const s = setup(`<input id="field"><button id="inventoryBtn">Inventory</button><div id="sheet"></div>`);
    const open = s.pick("#inventoryBtn");
    const click = vi.fn();
    open.addEventListener("click", click);
    s.place(open, 0);
    installDesktopHotkeys(s.document);
    s.key("KeyI", {}, s.pick("#field"));
    s.key("KeyI", { ctrlKey: true });
    s.key("KeyI", { repeat: true });
    expect(click).not.toHaveBeenCalled();
    s.place(s.pick("#sheet"), 0);
    s.key("KeyI");
    expect(click).not.toHaveBeenCalled();
  });

  it("Enter starts typing in chat with no window open, and Escape leaves the chat box", () => {
    const s = setup(`<textarea id="chatInput"></textarea><div id="w"><button id="back">Back</button></div>`);
    const chat = s.pick("#chatInput") as HTMLTextAreaElement;
    s.place(chat, 0); s.place(s.pick("#back"), 20);
    const focus = vi.fn(), blur = vi.fn();
    Object.assign(chat, { focus, blur });
    installDesktopHotkeys(s.document);
    s.key("Enter");
    expect(focus).not.toHaveBeenCalled();
    s.pick("#w").hidden = true;
    expect(s.key("Enter").defaultPrevented).toBe(true);
    expect(focus).toHaveBeenCalled();
    s.key("Escape", {}, chat);
    expect(blur).toHaveBeenCalled();
  });

  it("Enter opens a collapsed chat to type in, and Escape from the box closes it", () => {
    const s = setup(`<div id="chatPanel"></div><div id="large" hidden><textarea id="chatInput"></textarea><button id="chatBack">Back</button></div>`);
    const expand = s.pick("#chatPanel"), large = s.pick("#large"), chat = s.pick("#chatInput") as HTMLTextAreaElement;
    expand.addEventListener("click", () => { large.hidden = false; expand.classList.add("is-large"); });
    s.pick("#chatBack").addEventListener("click", () => { large.hidden = true; expand.classList.remove("is-large"); });
    s.place(expand, 0); s.place(chat, 20); s.place(s.pick("#chatBack"), 40);
    const focus = vi.fn();
    Object.assign(chat, { focus, blur: vi.fn() });
    installDesktopHotkeys(s.document);
    s.key("Enter");
    expect(large.hidden).toBe(false);
    expect(focus).toHaveBeenCalled();
    s.key("Escape", {}, chat);
    expect(large.hidden).toBe(true);
  });
});
