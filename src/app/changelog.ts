export const RELEASE_NOTES: Record<string, string[]> = {
  "0.253": [
    "Armor and Regen leaderboards added",
    "Account linking now preserves leaderboard placement immediately",
    "Profile portraits now open player profiles throughout the game",
    "World Chat, inventory, profile spacing, and update history improved",
  ],
  "0.252": [
    "Player profiles scale better and preserve full usernames",
    "Your own character now opens your player profile",
    "Minimap and toolbar presentation improved",
  ],
  "0.251": [
    "Leaderboard profile portraits corrected",
    "Mobile HUD and World Chat layout improved",
    "Player profiles now show online or last-seen status",
    "Update notes now close only from their close button",
  ],
  "0.250": [
    "Profile portrait grid math corrected",
  ],
  "0.249": [
    "Profile portrait caching and alignment fixed",
    "Neutral default profile portrait added",
  ],
  "0.248": [
    "Profile portrait alignment corrected",
    "Profile portraits added to leaderboard",
  ],
  "0.247": [
    "Tutorial Forest map-wide player visibility added",
    "Sign-in now requires an explicit button press",
    "Mobile inventory and item actions improved",
    "Player profile icons added",
  ],
  "0.246": [
    "Developer button visibility fixed",
    "Developer player-save editor added",
  ],
  "0.245": [
    "Private account access auditing added",
    "Developer account badge and audit panel added",
  ],
  "0.244": [
    "Nearby players now appear reliably as they enter your area",
  ],
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

export function recentReleaseNotes(limit = 10) {
  return Object.entries(RELEASE_NOTES)
    .sort(([a], [b]) => b.localeCompare(a, undefined, { numeric: true }))
    .slice(0, Math.max(0, limit))
    .map(([version, notes]) => ({ version, notes }));
}
