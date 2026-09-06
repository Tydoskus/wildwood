# Guilds and asynchronous battles

## Membership

Guests and registered players can create a four-letter guild or join an open guild, up to twenty members. Names normalize Unicode and case for uniqueness. Guild management uses the controlling root connection; map instances and virtual load-test players cannot mutate guild membership.

Every member participates. There is no champion selection or build refresh. Each challenge captures both rosters' current persisted stats and equipment, including offline players. No client-supplied stats or results are accepted. A member who upgrades is included with the new saved build in the next battle; earlier replays remain unchanged.

Leaving or being removed starts a 24-hour cooldown before joining or creating another guild. Initial membership is immediately playable. Every attacking member retains the guild they attacked for that UTC day. A departing leader passes ownership to the longest-serving remaining member, with identity as a stable tie-breaker. Explicit transfer, removal, and challenges are leader-only operations.

Registering a guest transfers membership and leadership into the authenticated identity. An account that already belongs to a guild keeps that membership. Participation/cooldown history and indexed report references follow the account link. A reset keeps membership and uses the reset stats in future challenges. Deleting an account removes membership and anonymizes its identity/name in retained reports for both sides and previous guilds.

## Whole-guild combat and replay

Version 2 battles resolve one simultaneous fight with 1–20 members per side. Unequal rosters are allowed. Members advance from opposing formations, acquire nearby opponents, attack using their own interval, and retarget when an opponent falls. Regeneration, armor mitigation, and the existing deterministic duel damage calculation (including expected critical damage) use authoritative saved values. Soft actor spacing keeps groups readable.

The server and client share `shared/guild-combat.ts`: fixed 100ms ticks, simultaneous damage, a maximum of forty actors and 600 ticks. A knockout decides the winner. At sixty seconds, compare each guild's remaining HP as a fraction of its starting team HP; equal fractions draw. No stat normalization is applied.

Reports store the combat version, frozen fighters/appearance, outcome, duration and survivors, rather than hundreds of animation frames. The client computes a bounded timeline once when opening the replay and interpolates it while drawing. Future combat changes must increment the version and retain the old simulator for existing reports.

The replay opens directly after a challenge. It fits the entire battlefield in one canvas and provides pause, restart, scrub, 1×/2×/4× speed and name-label controls. Forty-member battles hide labels initially. The battlefield uses the forest grass/scenery assets and a ground cache at the display resolution. Characters draw through the full player/equipment renderer with smooth body composites, continuous aiming and throw clocks. Arrows and stones share the world projectile painters, and their flight ends at the authoritative damage timestamp. Replay drawing follows display frames at the actual device-pixel ratio. The canvas explicitly overrides the world canvas’s fixed positioning and pixel scaling. Sticky Back to battles controls and Escape return to the reports even after playback ends. The covered world does not redraw while the guild panel is open. Playback pauses in hidden tabs and releases callbacks, frames, and sprite caches when closed or replaced. The user owns visual QA.

Pre-version-2 reports retain their original round summaries. Existing legacy champion/build table columns remain inert to preserve deployed table rows; no client control or reducer uses them to choose teams.

## Competition and bounded storage

Leaders can challenge another guild once per UTC day, with three outgoing attacks per day. Victories award three weekly points, draws one, and defeats zero. Defensive matches consume no attacks and award no points. Ties sort by wins, fewer attacks, then guild creation ID. There are no battle item/gem payouts.

Weekly points roll over Monday at 00:00 UTC when reading or changing a guild, with no scheduled global maintenance. Each guild retains its ten latest reports. Up to forty indexed participant references accompany each report copy; pruning/disbanding removes those references too. Account deletion never scans unrelated histories.

The root snapshot returns the caller's roster, twenty directory entries, cached top fifty standings and at most ten reports. Opening, refreshing, pagination and completed actions fetch data; switching tabs reuses the snapshot and never starts background database polling. Closing or switching accounts discards late responses. Failed refresh after a committed action removes stale action controls.

Directory pagination reads twenty-one indexed records. Ranking updates include the changed guild separately, read fifty other committed candidates, then sort at most fifty-one entries. This accounts for the host chaining transaction-local rows before committed B-tree rows. Do not call multiple rank-changing scored operations in one transaction without revisiting that bound.

## Temporary opponent

`seedTemporaryGuild` is a one-shot root operator reducer for the requested `[temp]` guild. It selects twenty lowest-power leaderboard players who have persisted profiles/progress, no guild, and no active membership cooldown, excluding virtual players. It fails atomically if twenty are unavailable, never moves existing guild members, and makes a repeated invocation on a full `temp` guild a no-op. This operator-only setup performs one leaderboard scan; normal guild requests use bounded indexes.

## Verification

Guild combat tests cover simultaneous lethal hits, unequal rosters, deterministic mirrored 20v20 fights, exact replay ticks, payload/timeline bounds and timeout/invalid data. Service and root integration tests cover current authoritative builds, guests, real account linking, indexed erasure, membership lifecycle, scoring retries, rollover, report retention and ranking/directory bounds. Panel/replay tests cover controls, guest access, perspective, stale sessions and callback cleanup. Seed tests cover operator authorization, lowest-power selection, existing membership preservation and atomic/idempotent setup.
