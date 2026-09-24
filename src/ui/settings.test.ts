import { describe, expect, it, vi } from "vitest";
import { renderAccountStatus, renderConnectionStatus, renderLatencyStatus, renderVolume } from "./settings";

describe("settings volume rendering", () => {
  it("keeps the visible fill and accessible value synchronized with the slider", () => {
    const setProperty = vi.fn();
    const setAttribute = vi.fn();
    const input = { value: "", style: { setProperty }, setAttribute } as unknown as HTMLInputElement;
    const value = { textContent: "" } as HTMLElement;

    renderVolume(input, value, .42);

    expect(input.value).toBe("42");
    expect(setProperty).toHaveBeenCalledWith("--volume-percent", "42%");
    expect(setAttribute).toHaveBeenCalledWith("aria-valuetext", "42%");
    expect(value.textContent).toBe("42%");
  });
});

/** An element that counts every write, so a repeated render can be checked for none. */
function countingElement() {
  let text = "";
  let hidden = false;
  const classes = new Set<string>();
  const writes = { count: 0 };
  const element = {
    get textContent() { return text; },
    set textContent(value: string) { writes.count += 1; text = value; },
    get hidden() { return hidden; },
    set hidden(value: boolean) { writes.count += 1; hidden = value; },
    dataset: new Proxy({} as Record<string, string>, {
      set(target, key, value) { writes.count += 1; target[key as string] = value; return true; },
    }),
    classList: {
      contains: (name: string) => classes.has(name),
      toggle: (name: string, force: boolean) => { writes.count += 1; if (force) classes.add(name); else classes.delete(name); return force; },
    },
  };
  return { element: element as unknown as HTMLElement, writes, classes };
}

describe("app status rendering on the HUD tick", () => {
  it("writes the connection and account status once, then nothing while it is unchanged", () => {
    const connection = countingElement();
    const button = countingElement();
    const status = countingElement();
    const account = { signedIn: true, notice: "" };
    renderConnectionStatus(connection.element, false);
    renderAccountStatus(button.element, status.element, account);
    expect(connection.element.textContent).toBe("OFFLINE");
    expect(connection.classes.has("is-offline")).toBe(true);
    expect(status.element.textContent).toBe("SIGNED IN · ACCOUNT SAVE");
    expect(status.classes.has("is-signed-in")).toBe(true);
    const before = connection.writes.count + button.writes.count + status.writes.count;

    for (let tick = 0; tick < 10; tick += 1) {
      renderConnectionStatus(connection.element, false);
      renderAccountStatus(button.element, status.element, account);
    }
    expect(connection.writes.count + button.writes.count + status.writes.count).toBe(before);

    renderConnectionStatus(connection.element, true);
    expect(connection.element.textContent).toBe("ONLINE");
    expect(connection.classes.has("is-offline")).toBe(false);
    renderAccountStatus(button.element, status.element, { signedIn: true, notice: "SIGN-IN FAILED" });
    expect(status.classes.has("is-error")).toBe(true);
  });

  it("writes the ping only when the number or its quality changes", () => {
    const ping = countingElement();
    renderLatencyStatus(ping.element, true, 42.2, true);
    expect(ping.element.textContent).toBe("PING: 42MS");
    expect(ping.element.dataset.quality).toBe("good");
    const before = ping.writes.count;
    renderLatencyStatus(ping.element, true, 41.9, true);
    expect(ping.writes.count).toBe(before);
    renderLatencyStatus(ping.element, true, 120, true);
    expect(ping.element.dataset.quality).toBe("fair");
  });
});
