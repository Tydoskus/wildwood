import { describe, expect, it } from "vitest";
import { replayRemoteMotion, type MotionDelivery } from "../../../scripts/profiling/remote-motion-trace";

describe("remote movement under simulated network delivery", () => {
  for (const fps of [30, 60, 144]) {
    it.each<MotionDelivery>(["steady", "jitter", "burst", "higher-latency"])(`keeps straight movement stable through %s delivery at ${fps} FPS`, (delivery) => {
      const result = replayRemoteMotion("straight", delivery, fps);
      expect(result.positionRMSE).toBeLessThan(.01);
      expect(result.velocityRMSE).toBeLessThan(.01);
      expect(result.maxCorrection).toBeLessThan(.01);
      expect(result.maxPacketJump).toBeLessThan(.01);
    });

    it.each<MotionDelivery>(["steady", "jitter", "burst"])(`handles turns between published samples with %s delivery at ${fps} FPS`, (delivery) => {
      const result = replayRemoteMotion("turn", delivery, fps);
      expect(result.positionRMSE).toBeLessThan(5);
      expect(result.maxPositionError).toBeLessThan(25);
      expect(result.maxPacketJump).toBeLessThan(.02);
    });

    it(`recovers from a two-second delivery stall without packet jumps at ${fps} FPS`, () => {
      for (const path of ["straight", "turn", "stop"] as const) {
        const result = replayRemoteMotion(path, "stall", fps);
        expect(result.maxPacketJump).toBeLessThan(.02);
        expect(result.velocityRMSE).toBeLessThan(150);
      }
    });
  }
});
