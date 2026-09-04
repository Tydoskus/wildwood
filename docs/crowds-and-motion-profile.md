# Crowd and movement CPU profile

Local Node/tsx microbenchmark, September 4, 2026. Run `npm run profile:crowds-motion`.
Fixed synthetic populations; 100 warm-up calls, 25 timed batches. Reported medians
are milliseconds per invocation, not end-to-end frame times. Crowd timings include
position resets; movement timings include packet encoding. The script checks that
old and optimized movement publications produce identical bytes.

This does not include SpacetimeDB lookup/insertion/subscription overhead, transport,
rendering, or mobile hardware. No live server load was generated. Timing comparisons
use the old sampling kernel and the production optimized sampler in the same run.

## Changes

- Enemy center separation target: 0.72 → 0.80 times combined radii (11.1% wider).
  For two radius-18 enemies that means 25.92 → 28.8 world units. Both local and
  remote crowds use it. Two deterministic separation passes remain unchanged.
- Distant crowd pairs exit before full distance math and ownership checks.
- Movement packets sample only wire fields, avoiding full pose/zone objects.
- Nearby observers reuse a player's sample within one publication. A fresh cache
  is created for every publication; map and visibility checks still precede reuse.
- Existing packet formats, interest limits, and publication frequencies are unchanged.

## Crowd separation after changes

| Enemies | Clustered median ms | Spread median ms |
| --- | ---: | ---: |
| 16 | 0.015 | 0.005 |
| 64 | 0.165 | 0.098 |
| 128 | 0.664 | 0.419 |
| 256 | 2.757 | 1.853 |

This remains quadratic in active enemies. Normal-sized crowds are cheap here;
256 simultaneously active enemies deserve further attention on lower-powered
hardware. A spatial index would be a separate change requiring care to preserve
separation order as positions move during each pass.

## Movement sampling and encoding

Each synthetic observer watches five other players, with overlapping interests.
Database lookups are excluded. Unique sample calculations drop from 5N to N.

| Players | Previous median ms | Optimized median ms | Detail payload bytes/publication |
| --- | ---: | ---: | ---: |
| 16 | 0.154 | 0.006 | 1280 |
| 64 | 0.643 | 0.022 | 5120 |
| 256 | 2.602 | 0.097 | 20480 |
| 1000 | 10.240 | 0.458 | 80000 |

At 1,000 synthetic players the minimap compaction/encoding kernel took about
0.014 ms; it is not the CPU bottleneck in this test. Detail payload is still
80,000 bytes per publication, or 240,000 bytes/second at 3 Hz, before protocol
and transport overhead. The optimization reduces CPU work, not bandwidth.

## Validation

The sampler regression covers moving/stopped/stale/boundary-clamped anchors and
cache refresh across publications. Crowd tests cover deterministic exact overlap,
diagonal overlap, and ownership exclusion. User visual QA owns the final spacing feel.
