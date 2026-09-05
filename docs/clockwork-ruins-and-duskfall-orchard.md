# Clockwork Ruins and Duskfall Orchard

Two campaign regions follow Crystal Hollows. Each has five camps, 30 spawn sites,
a separate exported enemy family, an authoritative multiplayer boss, and editable
terrain. Both retain the existing 3× tier progression and repeatable boss rewards.

| Region | Entry unlock | Enemy family | Boss |
| --- | --- | --- | --- |
| Clockwork Ruins | Defeat Prismshell | Mechanical raptors | Ironhorn |
| Duskfall Orchard | Defeat Ironhorn | Orange pumpkins | Dreadreaper |

## Terrain and encounters

Clockwork Ruins uses a brass and slate foundry route with procedural gears,
stone debris, a central thoroughfare, and a return loop. Its camps are Foundry
Gate, Rivet Arcade, Ironworks, Scrap Yard, and Dynamo Vault. Ironhorn alternates
a 1,100-unit narrow shockwave with six falling-scrap zones arranged in two
staggered rows. The rows rotate between attacks, leaving escape lanes.

Duskfall Orchard uses violet ground, amber pumpkins, dead trees, and branching
orchard terraces. Its camps are Lantern Landing, Seedling Rows, Hollow Trunk,
Briar Patch, and Harvest Shrine. Dreadreaper alternates a broad 650-unit scythe
wave with ten staggered hazards around its target. The ring leaves the center
safe. Both bosses retain telegraphed attacks, shared encounter timing, server
hit limits, contribution rewards, and 30-second respawns.

Only current, positive contributors earn boss rewards and the next map unlock.
Existing Prismshell clear bits, or its latest recorded contribution result,
backfill Clockwork Ruins access without granting stats again. Saved gates remain
server-owned; ordinary client saves cannot forge them.

## Sprite exporter captures

Captured through the installed **WildStat Sprites** Unity exporter in Unity
6000.4.9f1, using the existing Layer Lab EnemyMonster 3 prefabs:

- `Raptor/Raptor_Mechanic`: 33 frames, regular Clockwork family.
- `Pumpkin/Pumpkin_Orange`: 34 frames, regular Orchard family.
- `Rhino/Rhino_Armor`: 33 frames, Ironhorn.
- `Reaper/Reaper_Death`: 37 frames, Dreadreaper.

All captures use 256px frames at 12 FPS, with idle/walk/attack clips. The runtime
import verifies sheet dimensions and unchanged alpha while converting to WebP.
Enemy families load only for their map; bosses load idle and attack pages only.
The source capture directories remain under ignored `art-source/generated/unity-sprites`.
Runtime files are under `public/assets/wildstat/enemies` and
`src/game/enemy-atlases`. Dead-tree assets are loaded as a focused Orchard group.

## Compatibility and validation

Protocol 89 and module migration 25 accompany this expansion. Both new unlock
columns are appended after the existing clear ledger, with false defaults.
Root and map modules require the same updated bundle before releasing the client.
Released in 0.627, with the root and regional modules published before the client.

Regression coverage includes map topology and spawn rosters, atlas bounds and
budgets, boss attack shapes, contribution filtering, respawn cleanup, gate
migration, repeated forward/return portal travel, and map-specific depth sorting.
The user owns in-game visual review and subjective encounter tuning.
