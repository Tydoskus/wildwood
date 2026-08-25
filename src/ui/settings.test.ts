import { describe, expect, it, vi } from "vitest";
import { renderVolume } from "./settings";

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
