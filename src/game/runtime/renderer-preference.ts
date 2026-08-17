export const PIXI_RENDERER_PREFERENCE = ["webgl", "canvas"] as const;

export function pixiRendererPreference(search: string) {
  return new URLSearchParams(search).get("renderer") === "canvas"
    ? ["canvas"] as const
    : PIXI_RENDERER_PREFERENCE;
}
