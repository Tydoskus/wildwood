export const RELEASE_NOTES: Record<string, string[]> = {
  "0.243": [
    "Leaderboard rows simplified into a compact list",
    "Profile stats simplified into a compact grid",
    "Leaderboard names now open player profiles",
  ],
  "0.242": [
    "Accurate global online player count",
    "Chat renamed to World Chat",
    "Guest name labels made consistent",
  ],
  "0.241": [
    "Mobile leaderboard made more compact",
    "Update deployment waiting screen added",
  ],
  "0.240": [
    "Power leaderboard added",
    "Power now scales damage with attack speed",
    "Nearby and distant movement networking optimized",
    "Maximum attack speed now labeled in profiles",
    "Nearby chat now appears above players",
    "Auto attack now confirms enabled or disabled",
  ],
};

export function releaseNotes(version: string) {
  return RELEASE_NOTES[version] ?? [];
}
