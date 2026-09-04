import assert from "node:assert/strict";
import { performance } from "node:perf_hooks";
import { separateEnemyCrowd, ENEMY_CROWD_SPACING_RATIO } from "../../src/game/runtime/enemy-crowd-separation";
import type { EnemyState } from "../../src/game/runtime/types";
import { analyticalPlayerMotionAt } from "../../shared/analytical-player-motion";
import { createPlayerMotionFrameSampler, type MotionSampleRow } from "../../shared/player-motion-sample";
import { encodePlayerMotionFrame, compactPlayerMapSamples, encodePlayerMapFrame } from "../../shared/player-motion-frame";
import { PLAYER_MOTION_INTEREST_LIMIT } from "../../shared/player-motion-interest";
import { WORLD_WIDTH, WORLD_HEIGHT } from "../../shared/rules";

// CPU microbenchmark, not a database/network load test. Reset/encoding costs
// are included. Fixed inputs, warm-up, and batch percentiles reduce timer noise.
let sink = 0;
function measure(run: () => void, iterations: number) {
  for (let i = 0; i < 100; i++) run();
  const batches: number[] = [];
  for (let batch = 0; batch < 25; batch++) {
    const start = performance.now();
    for (let i = 0; i < iterations; i++) run();
    batches.push((performance.now() - start) / iterations);
  }
  batches.sort((a, b) => a - b);
  return { medianMs: batches[12], p95BatchMs: batches[23] };
}
const crowds = [];
for (const count of [16, 64, 128, 256]) {
  for (const layout of ["clustered", "spread"]) {
    const positions = Array.from({ length: count }, (_, i) => ({
      x: 500 + (i % 16) * (layout === "clustered" ? 8 : 100),
      y: 500 + Math.floor(i / 16) * (layout === "clustered" ? 8 : 100),
    }));
    const enemies = positions.map((p, i) => ({ ...p, r: 18, siteId: i, dead: false })) as EnemyState[];
    crowds.push({ count, layout, ...measure(() => {
      for (let i = 0; i < count; i++) Object.assign(enemies[i], positions[i]);
      separateEnemyCrowd(enemies);
      sink += enemies[0].x;
    }, 100) });
  }
}
const now = 500_000n;
// Previous server path: full analytical pose, then select packet fields.
function legacySample(motion: MotionSampleRow) {
  const sampled = analyticalPlayerMotionAt({ x: motion.x, y: motion.y, vx: motion.vx, vy: motion.vy,
    moving: motion.moving, simulationTick: motion.simulationTick,
    anchoredAtMicros: motion.lastInputAt.microsSinceUnixEpoch }, now);
  const full = { ...motion, ...sampled, facing: sampled.vx < 0 ? Math.PI : 0,
    zoneX: Math.floor(sampled.x / 1000), zoneY: Math.floor(sampled.y / 1000) };
  return { networkId: full.networkId, x: full.x, y: full.y, vx: full.vx, vy: full.vy,
    simulationTick: full.simulationTick, motionEpoch: full.motionEpoch };
}
const movement = [];
for (const count of [16, 64, 256, 1000]) {
  const rows: MotionSampleRow[] = Array.from({ length: count }, (_, i) => ({
    networkId: i + 1, x: 100 + i % 20 * 100, y: 100 + Math.floor(i / 20) * 50,
    vx: 120, vy: 60, moving: true, simulationTick: 100, motionEpoch: 1,
    lastInputAt: { microsSinceUnixEpoch: 0n },
  }));
  const interests = rows.map((_, i) => Array.from({ length: PLAYER_MOTION_INTEREST_LIMIT }, (_, j) => rows[(i + j + 1) % count]));
  function publish(cached: boolean) {
    const sample = cached ? createPlayerMotionFrameSampler(now) : legacySample;
    return interests.map(nearby => encodePlayerMotionFrame(nearby.map(sample)));
  }
  assert.deepEqual(publish(true), publish(false));
  const baseline = measure(() => { sink += publish(false)[0].length; }, 20);
  const optimized = measure(() => { sink += publish(true)[0].length; }, 20);
  const minimap = measure(() => {
    sink += encodePlayerMapFrame(compactPlayerMapSamples(rows, WORLD_WIDTH, WORLD_HEIGHT)).length;
  }, 100);
  movement.push({ count, samplesBefore: count * PLAYER_MOTION_INTEREST_LIMIT, samplesAfter: count,
    payloadBytes: publish(true).reduce((sum, bytes) => sum + bytes.length, 0), baseline, optimized, minimap });
}
console.log(JSON.stringify({ spacingRatio: ENEMY_CROWD_SPACING_RATIO, crowds, movement, sink }, null, 2));
