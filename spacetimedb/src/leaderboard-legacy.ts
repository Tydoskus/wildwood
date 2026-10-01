import { table, t } from "spacetimedb/server";
import { PLAYER_GENDER_UNSET } from "../../shared/player-gender";
import { STARTER_STONE } from "../../shared/items";

// The ranking snapshot before 0.856, with f32 stat columns. Emptied into
// leaderboard_entry_v2 by migration 50 and otherwise unused; kept because a
// table must be emptied before it can be dropped.
export const leaderboardEntryLegacy = table(
  { name: "leaderboard_entry", public: true },
  {
    identity: t.identity().primaryKey(),
    displayName: t.string(),
    damage: t.f32(),
    maxHp: t.f32(),
    isGuest: t.bool(),
    power: t.u32().default(0),
    armor: t.f32().default(0),
    regen: t.f32().default(0),
    playedMicros: t.u64().default(0n),
    profileIcon: t.u32().default(0),
    powerLevel: t.f64().default(0),
    gender: t.u8().default(PLAYER_GENDER_UNSET),
    skinTone: t.u32().default(3),
    headItem: t.string().default(""),
    chestItem: t.string().default(""),
    feetItem: t.string().default(""),
    rightHandItem: t.string().default(STARTER_STONE),
    leftHandItem: t.string().default(""),
  },
);
