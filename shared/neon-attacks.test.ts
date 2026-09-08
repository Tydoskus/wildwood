import { describe, expect, it } from "vitest";
import { NEON_EMP, NEON_LASER, neonEmpHits, neonEmpRadius, neonLaserHits } from "./neon-attacks";
describe("Voltwarden attack geometry", () => {
  it("hits the three laser lanes but leaves safe corridors and space behind the boss", () => {
    for (const lane of NEON_LASER.lanes) expect(neonLaserHits(500, lane, 0)).toBe(true);
    expect(neonLaserHits(500, 95, 0)).toBe(false);
    expect(neonLaserHits(500, -95, 0)).toBe(false);
    expect(neonLaserHits(-200, 0, 0)).toBe(false);
    expect(neonLaserHits(1000, 0, 0)).toBe(false);
    expect(neonLaserHits(-190, 500, Math.PI / 2)).toBe(true);
  });
  it("damages only a swept EMP ring, including a crossing between rendered frames", () => {
    expect(neonEmpHits(180, 0, 1)).toBe(false);
    expect(neonEmpHits(0, 1.2, 2)).toBe(false);
    const elapsed = NEON_EMP.windup + NEON_EMP.duration / 2;
    expect(neonEmpHits(neonEmpRadius(elapsed), elapsed - .1, elapsed + .1)).toBe(true);
    expect(neonEmpHits(800, elapsed - .1, elapsed + .1)).toBe(false);
    expect(neonEmpHits(300, 4, 4.1)).toBe(false);
  });
});
