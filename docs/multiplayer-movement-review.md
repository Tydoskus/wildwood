# Multiplayer movement timing review

The receiver now spaces movement samples using their server publication times.
Late delivery no longer stretches movement time and creates a correction for an
otherwise correct prediction. An earlier arrival can improve the local clock
offset; that adjustment preserves the displayed position through the existing
bounded correction. Sender simulation ticks still identify duplicate samples,
but no longer act as a second clock for positions sampled by the server.

Corrections also apply to every row in a delivery burst. The former 8 ms bypass
exposed intermediate predictions as jumps. Stationary history remains a short
restart anchor without discarding the learned clock offset. The unused expected
packet-rate estimate was removed.

The sender, wire format, 3 Hz publication rate, five-player interest limit,
200–320 ms presentation buffer, 1.5-second prediction horizon, motion-epoch
resets, and server-time gameplay sampling remain unchanged.

## Replay evidence

Run `npx tsx scripts/profiling/remote-motion.ts`. An optional absolute path to a
saved interpolation module compares both implementations on identical traces.
The baseline below includes the first 333 ms burst-spacing fix, before the
stable-timeline rework.

These are deterministic receiver simulations, not live-network measurements.
Each trace runs for ten seconds with 180 px/s movement, 3 Hz publications, an
initial 80 ms transport delay, and 60 FPS rendering. Measurements exclude the
first second and subtract the intentional presentation delay. Turns and stops
occur between publication times. The tests also replay at 30 and 144 FPS.

| Scenario | Position error RMS, before → after (px) | Largest packet-induced jump, before → after (px) |
| --- | --- | --- |
| Straight movement, steady delivery | 0 → 0 | 0 → 0 |
| Straight movement, 0–150 ms added jitter | 8.51 → <0.01 | 0 → 0 |
| Straight movement, three-row bursts | 23.04 → <0.01 | 60 → <0.01 |
| Turns, added jitter | 9.28 → 3.83 | 0 → 0 |
| Turns, three-row bursts | 22.41 → 3.27 | 60 → <0.01 |
| Stop/restart, added jitter | 8.35 → 1.86 | 0 → 0 |
| Turns, two-second delivery stall | 86.40 → 107.14 | 60 → 0.01 |
| Stop/restart, three-row bursts | 23.35 → 25.00 | 60 → <0.01 |
| Stop/restart, two-second delivery stall | 17.12 → 27.24 | 60 → <0.01 |

The recovery tradeoff is deliberate: when a turn or restart was unavailable
during a stall, preserving continuity takes longer to converge than jumping to
the new path. For the stalled turn, velocity error RMS falls from 606.20 to
114.67 px/s while position error rises. Confirmed stops still remove forward
overshoot. A sustained increase in latency can also leave more turns outside the
bounded presentation buffer; no receiver can predict an unreceived input change.

This rework improves ordinary jitter and burst smoothness without adding network
traffic. It does not claim lower bandwidth, universal accuracy improvements, or
completed visual QA. The user owns visual movement review.
