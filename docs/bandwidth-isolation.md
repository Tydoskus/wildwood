# Multiplayer Bandwidth Isolation

The August 2026 100-client run averaged about 20.4 KB/s sent per client. That
number came from a deliberately broad `realistic` harness, so treat it as a
system total rather than proof that any one lane costs 20.4 KB/s.

## Protocol 72 budget

Detailed motion is now selected before fanout. Each client submits at most five
relevant network IDs, and the server emits one recipient-filtered frame at 2 Hz.
All other players remain available as 8-byte dots in the bounded 1 Hz map
snapshot.

At 100 visible players, the raw payload budget per client is:

| Lane | Calculation | Raw payload |
| --- | ---: | ---: |
| Detailed motion | 5 actors × 16 bytes × 2 Hz | 160 B/s |
| All-map dots | 100 actors × 8 bytes × 1 Hz | 800 B/s |
| Total | | 960 B/s |

Wire framing, subscription transactions, and the identity-scoped core tables
must fit in the remaining roughly 1.04 KB/s to meet the 2 KB/s target. Measure
that overhead rather than estimating it from application payloads. The stable
map presentation cache is a join-time snapshot plus rare appearance/stat
deltas; exclude its initial snapshot when calculating steady-state bytes/sec,
but report it separately as time-to-enter-world cost.

## Isolation profiles

Run each profile for the same duration and population on an otherwise quiet
database. Use the same connection ramp and map for every run.

```sh
npm run loadtest:virtual -- --count 100 --duration 600 --mode movement
npm run loadtest:virtual -- --count 100 --duration 600 --mode core
npm run loadtest:virtual -- --count 100 --duration 600 --mode map
npm run loadtest:virtual -- --count 100 --duration 600 --mode capped
npm run loadtest:virtual -- --count 100 --duration 600 --mode persistence
npm run loadtest:virtual -- --count 100 --duration 600 --mode realistic
npm run loadtest:virtual -- --count 100 --duration 600 --mode dense
```

- `movement` measures reducer ingress and acknowledgements without subscriptions.
- `core` adds the identity-scoped gameplay subscription baseline.
- `map` adds only the bounded all-map snapshot.
- `capped` adds the stable map-wide presentation cache and nearest-five detailed motion.
- `persistence` deliberately saves every 2.5 seconds to isolate the worst-case
  durable path.
- `realistic` uses capped motion and a representative 30-second dirty save.
- `dense` places every bot in one area and steers rapidly while retaining the
  five-actor cap.

Subtract adjacent steady-state rates to attribute a lane. Exclude startup and
cleanup buckets; subscription snapshots and mass disconnects are not steady
gameplay.

## Selection behavior

The client chooses from decoded all-map samples whose network IDs exist in its
stable presentation cache. Existing selections receive 20% distance hysteresis
so the fifth and sixth actors do not alternate every map snapshot. A newly
selected avatar is rendered only after its first addressed detail frame arrives;
all unselected players remain visible on the minimap.

Future relevance scoring can pin duel opponents, party members, attackers, or
interaction targets before filling remaining slots by distance. Keep the list
bounded and send it only when membership changes.

## Follow-up decisions

If steady traffic remains above 2 KB/s, use the isolation result:

1. High `core`: trim global/core subscriptions or large self-row updates.
2. High `map`: test 0.5 Hz map snapshots or delta markers while preserving a
   bounded periodic repair snapshot.
3. High `capped`: separate the one-time presentation snapshot from steady
   frames, then consider a revisioned presentation catalog or lower detail
   cadence only after mobile prediction-error traces stay bounded.
4. High `persistence`: split small counters from the full progress save and
   preserve the unchanged-row write guard.

Do not raise the five-actor cap or restore zone-wide hot frames to hide visual
jitter. Fix prediction, relevance selection, or frame cadence independently.
