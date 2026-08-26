# Mobile performance notes

This document records measured client bottlenecks, protections already present,
and follow-up work that should be driven by a comparable browser trace. It is
not a substitute for testing on a low-end phone.

## August 2026 trace baseline

A 24.9-second login, world-entry, and gameplay capture held 59.8 FPS with no
steady frame gaps over 20 ms after the first five seconds. Main-thread use was
4.1% during steady play, animation-frame work averaged 0.26 ms, and combined
WebSocket traffic was about 1.5 KB/s. The steady simulation and network paths
were not bottlenecks.

The two actionable findings were:

- Graphics memory peaked near 335 MiB and settled near 259–268 MiB. The trace
  repeatedly allocated 1,638,400-byte surfaces, exactly one 640 × 640 RGBA
  static tile.
- The final startup stage accidentally rescheduled a zero-delay timer forever.
  Browser timer nesting clamped it to about 4 ms, producing roughly 220–230
  callbacks per second after startup.

## Implemented protections

- Startup loading completion is idempotent. Once the final stage completes,
  `refreshLoading()` cannot schedule another timer or emit completion again.
- Static tiles retain the existing LRU working-set limit: the visible view, one
  movement-edge preload ring, and four cache entries of slack.
- Pending worker tiles share one 1 × 1 ground-color placeholder instead of
  allocating one 640 × 640 placeholder canvas per tile.
- The static-tile worker runs at most two paint requests concurrently, gives
  visible tiles priority, fills the movement ring afterward, and stops
  dispatching queued work while the document is hidden.
- Only visible tiles are passed to the WebGL renderer. Its defensive viewport
  check happens before texture creation, so an offscreen preload source cannot
  allocate a GPU texture.
- Evicted `ImageBitmap` objects are closed, WebGL textures are deleted, and
  evicted Canvas2D fallback tiles are resized to zero to release their backing
  stores without waiting for garbage collection.

## Mobile motion pipeline

The original frame loop requested animation frames but then manually admitted
only 60 of them per second. That is evenly divisible on 60 and 120 Hz panels,
but it produces alternating frame gaps on common 90 and 144 Hz displays. The
simulation also had a fixed-step accumulator without render interpolation, so
high-refresh panels repeated a simulation pose and then jumped to the next one.

The presentation path now:

- keeps gameplay deterministic at a fixed 60 Hz;
- renders every browser animation callback in normal mode and retains the
  explicit 30 FPS cap in Low Performance mode;
- interpolates the camera, local actors, enemies, projectiles, bosses, hazards,
  particles, and damage numbers using the accumulator remainder;
- restores authoritative simulation transforms immediately after each
  synchronous render, including when drawing throws;
- refuses to interpolate large transform jumps so portals, respawns, pooled
  effects, and world transitions cannot streak across the map;
- uses the same zoom-and-DPR physical-pixel snapping rule for static tiles,
  Canvas2D actors, WebGL projectile/particle batches, bosses, effects, and
  dynamic decor; and
- avoids per-actor snapshot allocation in the steady render path so smoothing
  does not introduce garbage-collection stutter.

Touch input now has an eight-pixel radial dead zone and ramps analog magnitude
between that boundary and the outer joystick radius. The local movement and
compact multiplayer motion protocol both preserve magnitudes below one, while
combined keyboard/touch input remains capped at full speed. One-pixel finger
noise therefore no longer becomes full-speed movement.

Window and `visualViewport` resize events are coalesced to one animation frame.
The Canvas2D backing store, CSS dimensions, and transform are only rewritten
when their values change; duplicate mobile viewport events no longer clear and
reallocate an identical canvas.

The removed per-tile placeholders alone avoid about 1.56 MiB of graphics
allocation per pending tile (about 69 MiB for the 44-tile burst in the captured
trace). Avoiding textures for the preload ring removes another device- and
viewport-dependent group of same-sized allocations.

## Measure before changing further

Capture the same login, world-entry, and movement route after deployment. Check
that the continuous 4 ms timer is absent, worker paint tasks arrive in small
batches, the 44-surface placeholder burst is gone, and steady graphics memory
falls. On a high-refresh phone, presentation FPS should now match the panel
while simulation remains 60 Hz. Inspect frame-gap variance rather than treating
a higher presentation-frame count as extra gameplay work. Use the new trace to
decide whether any of the following remains worth its visual or architectural
cost:

1. Lazy-load boss sheets by current or next biome. This can remove roughly
   6.9 MiB from an early cold visit, but map transitions need an explicit
   prefetch point and a deliberate loading/fallback presentation.
2. Lazy-load portal variants and profile imagery. Portal art should follow the
   current and adjacent maps; profile art must still be ready for chat and
   account UI. Do not trade a smaller initial request set for visible pop-in.
3. Move remaining sprite pixel preprocessing to build time. The worker already
   keeps it off the main thread, but runtime preprocessing still consumes CPU,
   memory, and mobile-core bandwidth during entry.
4. Add an adaptive render-DPR ceiling. The current cap is 3. A lower phone cap
   can reduce framebuffer memory substantially, but choose it only after
   comparing text, pixel art, and screenshots across representative DPR 2–4
   devices.
5. Budget WebGL tile uploads per frame if a new trace still shows upload tasks
   above roughly 2 ms. The renderer now excludes offscreen tiles, so measure
   the smaller visible-only batch before accepting temporary tile pop-in.
6. Revisit tile resolution or atlas packing only if completed-tile memory is
   still the dominant steady allocation. Tile dimensions affect invalidation,
   culling, worker cost, and visual seams, so this is not a first-line change.
7. Consider transferring ownership from completed `ImageBitmap` tiles to the
   WebGL texture cache to avoid retaining both representations. This requires a
   designed Canvas2D fallback and context-loss recovery path; closing bitmaps
   immediately after upload is unsafe with the current renderer contract.
8. If native-refresh rendering is too expensive on a measured device, add an
   explicit adaptive presentation tier (for example, native / 60 / 30) with a
   cadence algorithm that spaces frames evenly for the detected panel. Do not
   restore the old fixed 60 Hz deadline filter on arbitrary refresh rates.
9. Standard fixed-step interpolation intentionally presents local motion up to
   one simulation tick behind. If controlled tests show input latency rather
   than uneven cadence is the remaining problem, evaluate short local-player
   extrapolation while leaving camera/world interpolation buffered. It needs
   collision and portal guards and should not mutate simulation state.
10. Profile steady-frame allocation before micro-optimizing the renderer. Known
    candidates include the per-frame WebGL retained-tile `Set`, sprite batch
    vertex arrays, and repeated remote-player view objects. Pooling these is
    worthwhile only if a new trace shows garbage-collection pauses.
11. Keep presentation snapshots render-only. Network corrections, collision,
    auto-attack targeting, portal detection, and saved positions must continue
    to use the current fixed-step state rather than interpolated coordinates.

## Trace interpretation rules

- A stable count of one active recursive timer is a busy loop, not a growing
  handle leak. A growing active-timer count is a leak.
- Allocation count is not resident memory. Verify that eviction lowers the
  graphics-memory counter; do not infer residency from total allocation events.
- Do not replace one-shot UI timing with the game loop. Movement and simulation
  already use `requestAnimationFrame` with a fixed-step accumulator; startup
  stage pacing is correctly modeled as a finite one-shot timeout.
