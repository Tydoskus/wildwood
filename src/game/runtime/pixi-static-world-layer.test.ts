import { describe, expect, it } from "vitest";
import { pixiRendererPreference } from "./renderer-preference";

describe("Pixi renderer preference", () => {
  it("tries WebGL before Canvas by default", () => {
    expect(pixiRendererPreference("")).toEqual(["webgl", "canvas"]);
  });

  it("supports forcing Canvas for compatibility testing", () => {
    expect(pixiRendererPreference("?renderer=canvas")).toEqual(["canvas"]);
  });
});
