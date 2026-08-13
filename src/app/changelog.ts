export const RELEASE_NOTES: Record<string, string[]> = {
  "0.277": [
    "Live duel attacks now use the same server-recorded timeline as duel replays",
    "Guest account links now preserve the earliest character join date",
  ],
  "0.275": [
    "Duel replay buttons now have their own chat column and no longer overlap message timestamps",
  ],
  "0.274": [
    "Enemies now collide with players instead of standing directly on top of them",
  ],
  "0.273": [
    "Duel replay buttons in World Chat now use a larger two-line tap target",
    "Live duels now show the challenged player's correct name immediately",
    "Enemies now respawn on schedule even when a player remains near their spawn",
    "Enemy score values and death-screen score and kill totals were removed",
  ],
  "0.272": [
    "Player profiles now include a Duel button",
    "Duels start immediately against any player from anywhere without requiring acceptance",
    "Duel targets keep playing normally while their saved stats are used for the duel simulation",
    "A visible two-minute cooldown now follows every duel",
  ],
  "0.271": [
    "Armor now reduces damage by percentage, with 1,000 armor reducing 9% and 1 million reducing 90%",
    "Player profiles now show armor reduction and online map location",
    "Damage numbers are larger and appear higher above combatants",
    "A third Blight Oracle guards Oracle Mesa and Wastes Reaper moved near the desert damage camp",
    "Returning from a background tab now reconnects more reliably",
  ],
  "0.270": [
    "An empty future portal archway now stands beside the Tutorial Forest portal in Beginner Desert",
  ],
  "0.269": [
    "Tutorial Forest portal unlocks after you help defeat the Dragon",
    "Active portals now show their destination above the archway",
    "Damaged bosses regenerate after three minutes without being attacked",
    "World Chat player count now reads Players Online",
  ],
  "0.268": [
    "Two Blight Oracles now guard Oracle Mesa in the top-right desert",
  ],
  "0.267": [
    "Desert Spider boss added with 150 million health and unique web and venom attacks",
    "Desert Spider contributors earn 100,000 max health",
    "Desert enemies deal twice the damage and Dune Archers now attack as a group",
    "Blight Oracle elite added with a +22 health regeneration reward",
    "Beginner Desert now has its own music and desert deaths respawn at the desert entrance",
  ],
  "0.266": [
    "Beginner Desert now has its own goblin and venom skeleton enemies",
    "Desert enemies offer much stronger combat with high health and damage",
  ],
  "0.265": [
    "Beginner Desert added as Wildwood's second multiplayer map",
    "Forest portal now travels between maps with a fade transition",
    "Beginner Desert adds dunes, roads, cacti, rocks, and enemy camps",
    "Dragon body collision now deals 1,000 contact damage",
  ],
  "0.264": [
    "Portal position and archway collision refined",
  ],
  "0.263": [
    "Portal swirl enlarged and archway collision aligned",
  ],
  "0.262": [
    "Tutorial Forest enemies now wander near their camps and face their target",
    "Portal arch enlarged and given solid pillar collision",
    "Overhead player labels simplified",
  ],
  "0.261": [
    "Account sessions now reliably detect another active tab",
    "Sign In Anyway securely transfers play to the current tab",
    "Displaced tabs stop gameplay and cannot change account data",
  ],
  "0.260": [
    "Portal placement and animation improved",
    "Dragon moved farther west",
  ],
  "0.259": [
    "New animated portal and cleaner static Tutorial Forest trees",
    "Time Played leaderboard added",
    "Player HUD, profiles, chat, and gameplay windows refined",
    "Dragon moved deeper into the forest",
    "New Wildwood app icon and settings icon added",
  ],
  "0.258": [
    "World Chat keeps your place while reading older messages",
  ],
  "0.257": [
    "Sign-in and loading panel frames removed",
    "Extra mobile World Chat bottom spacing added",
  ],
  "0.256": [
    "World Chat header spacing tightened",
  ],
  "0.255": [
    "Sign-in now recovers cleanly when saved account tokens expire",
    "Sign-in options and update history layout improved",
    "World Chat now respects phone safe areas and keeps one row layout at every size",
    "Spitter health reduced to 24",
  ],
  "0.254": [
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
