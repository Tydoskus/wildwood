import { describe, expect, it } from "vitest";
import { frameDeadlineReached } from "./game-session-controller";

function countScheduledFrames(callbackTimes: number[], targetFps: number) {
  const interval = 1_000 / targetFps;
  let nextFrameAt = 0;
  let frames = 0;

  for (const now of callbackTimes) {
    if (!frameDeadlineReached(now, nextFrameAt)) continue;
    frames += 1;
    nextFrameAt += interval;
    if (nextFrameAt < now) nextFrameAt = now + interval;
  }

  return frames;
}

describe("game session frame scheduling", () => {
  it("does not collapse 60 Hz rendering to every other callback when timestamps arrive slightly early", () => {
    const interval = 1_000 / 60;
    const callbacks = Array.from({ length: 120 }, (_, index) =>
      index === 0 ? 0 : index * interval - .25,
    );

    expect(countScheduledFrames(callbacks, 60)).toBe(120);
  });

  it("still limits a 120 Hz callback stream to approximately 60 FPS", () => {
    const callbacks = Array.from({ length: 121 }, (_, index) => index * (1_000 / 120));

    expect(countScheduledFrames(callbacks, 60)).toBe(61);
  });

  it("keeps Low Performance mode at approximately 30 FPS on a 60 Hz display", () => {
    const callbacks = Array.from({ length: 121 }, (_, index) => index * (1_000 / 60));

    expect(countScheduledFrames(callbacks, 30)).toBe(61);
  });
});
