import { afterEach, expect, it, vi } from "vitest";
import { beginHomeTeleport, drawHomeTeleport, endHomeTeleport } from "./home-teleport";

afterEach(() => { endHomeTeleport(); vi.restoreAllMocks(); });

it("restores a player if departure never receives arrival or cleanup", () => {
  let now = 0;
  vi.spyOn(performance, "now").mockImplementation(() => now);
  const player = vi.fn();
  beginHomeTeleport();
  now = 700;
  drawHomeTeleport({} as CanvasRenderingContext2D, 0, 0, player);
  expect(player).not.toHaveBeenCalled();
  now = 30_000;
  drawHomeTeleport({} as CanvasRenderingContext2D, 0, 0, player);
  expect(player).toHaveBeenCalledOnce();
});

it.each(["arrival", "cancel"])("restores normal drawing after %s", mode => {
  let now = 100;
  vi.spyOn(performance, "now").mockImplementation(() => now);
  const player = vi.fn();
  beginHomeTeleport(mode === "arrival");
  if (mode === "cancel") endHomeTeleport();
  now += 650;
  drawHomeTeleport({} as CanvasRenderingContext2D, 0, 0, player);
  expect(player).toHaveBeenCalledOnce();
});
