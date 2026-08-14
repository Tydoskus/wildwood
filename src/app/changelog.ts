export const RELEASE_NOTES: Record<string, string[]> = {
  "0.391": [
    "Moving across maps now keeps visible world tiles cached, and the performance panel reports real frame cadence.",
  ],
  "0.390": [
    "Player profiles now have a dedicated Ranking tab, and today’s updates show the correct Aug 14 date.",
  ],
  "0.389": [
    "Tech Tree now scrolls through future nodes and signals idle or claim-ready research from the toolbar.",
  ],
  "0.388": [
    "Tech Tree toolbar icon now uses a plain white node-outline layout.",
  ],
  "0.387": [
    "Tech Tree now has a simpler empty-node toolbar icon.",
  ],
  "0.386": [
    "Tech Tree now starts with Stat Gain, adds Armor and Critical Chance research, and has clearer research timers.",
  ],
  "0.385": [
    "Tech Tree now uses square neutral nodes and opens research details in its own window.",
  ],
  "0.384": [
    "Added the Tech Tree: server-timed research unlocks permanent combat, reward, health, and range upgrades.",
  ],
  "0.383": [
    "Enemy reward labels now use compact formatted numbers for large stat gains.",
  ],
  "0.382": [
    "Tutorial Forest tree shadows now size from canopy bounds and sit slightly inside each canopy.",
  ],
  "0.381": [
    "Tutorial Forest tree shadows now use each tree's full canopy width for consistent grounded shade.",
  ],
  "0.380": [
    "Damage popups are smaller, and player names with health bars sit higher above characters.",
  ],
  "0.379": [
    "Archer hands now render over their bow grips, and Tutorial Forest tree shadows are much larger.",
    "Developer badges now use lowercase text, and browser pinch zoom is blocked on desktop and mobile.",
  ],
  "0.378": [
    "Player and enemy health bars are slightly larger with cleaner centered health text.",
    "Two-finger canvas zoom is blocked on mobile.",
  ],
  "0.377": [
    "Desert and Snowlands return portals now show their correct destinations.",
  ],
  "0.376": [
    "Snowlands now has its own enemy tier with scaled rewards and combat values.",
  ],
  "0.375": [
    "Profile presence display refinements.",
  ],
  "0.374": [
    "Profile display refinements.",
  ],
  "0.373": [
    "World labels use stronger outlines, and damage popups are larger above combatants.",
  ],
  "0.372": [
    "Intermediate Snowlands now unlocks from your first Desert Spider defeat.",
  ],
  "0.371": [
    "The Snowlands portal activation now plays immediately after your first Desert Spider defeat.",
  ],
  "0.370": [
    "Improved sign-in update history spacing and readability.",
    "Compact large-number displays now retain trailing zeroes.",
  ],
  "0.369": [
    "Added more space between recent version updates on sign-in.",
  ],
  "0.368": [
    "Sign-in update notes use clearer version text with right-aligned dates.",
  ],
  "0.367": [
    "Rendering is capped at 60 FPS, with an optional Low Performance setting for 30 FPS.",
    "Sign-in update history now includes every release from the last two calendar days.",
  ],
  "0.366": [
    "Player HUD health text now uses a crisp fixed black shadow and outline.",
    "Chat messages now use the game font.",
  ],
  "0.365": [
    "Windows now stay open when you tap outside them; centered Settings and Inventory each include an X close button.",
  ],
  "0.364": [
    "Sign-in update notes are larger, show two recent releases, and place the release date beside the version.",
    "Default paper hats now persist to public appearance rows for new players.",
  ],
  "0.363": [
    "Display resolution is capped at 3x again, static enemy labels are cached for smoother crowded scenes, and skin-tone choices no longer close during profile refreshes.",
    "Remote players now reliably show their default paper hat, and music pauses when the app is backgrounded.",
  ],
  "0.362": [
    "Open game tabs now check for a new release every two minutes.",
  ],
  "0.361": [
    "Enemy floating labels now appear slightly earlier as you approach.",
  ],
  "0.360": [
    "Fixed the startup worker path on GitHub Pages.",
    "Enemy reward numbers are white, stat names are colored, and labels now clear each enemy's actual art bounds.",
  ],
  "0.359": [
    "Moving straight up or down now keeps your character facing the previous left or right direction.",
  ],
  "0.358": [
    "Developer tools now include live frame timing, runtime counts, memory, and subscription diagnostics.",
    "Speech bubble text is cached between chat changes, while sprite cleanup and tree-bound analysis run outside frame-critical work.",
  ],
  "0.357": [
    "Duel replay loading now releases its one-time subscription after the replay arrives.",
    "HUD, multiplayer rendering, chat bubbles, and canvas resolution now use less device memory and per-frame work.",
  ],
  "0.356": [
    "Static tree, cactus, and snow-pine shadows now render from the nearby tile cache.",
    "Mobile rendering resolution cap is restored to 3x.",
  ],
  "0.355": [
    "Mobile rendering resolution cap is restored to 3x.",
  ],
  "0.354": [
    "Mobile player HUD now uses the same translucent background as fullscreen.",
  ],
  "0.353": [
    "Mobile rendering resolution is now capped at 2.25x for a sharper image with the new static tile cache.",
  ],
  "0.352": [
    "Mobile now uses the same player HUD proportions and text scale as fullscreen.",
  ],
  "0.351": [
    "Ground paths and procedural map decor now render from a small nearby tile cache instead of redrawing every frame.",
  ],
  "0.350": [
    "Beta Tester Golden Helmet now remains valid when equipped and updates correctly for nearby players.",
  ],
  "0.349": [
    "Equipping cosmetics now syncs immediately to nearby players.",
    "Phone rendering is capped at 2x resolution to reduce heat and frame load.",
  ],
  "0.348": [
    "Players now show their equipped head, chest, and feet cosmetics to everyone on the map.",
  ],
  "0.347": [
    "Superior Golden Helmet is now Beta Tester Golden Helmet, a no-stat cosmetic for players active within the last 120 hours.",
  ],
  "0.346": [
    "Intermediate Snowlands is now the canonical map ID; old Frostwind Expanse saves migrate on sign-in.",
    "Entering Intermediate Snowlands now plays the centered portal activation cutscene once.",
    "Developer tools now include a private terminal-style bug report queue with clear controls.",
    "Profile previews show every viewed player's equipped cosmetics, and remote players render solid.",
  ],
  "0.345": [
    "Frostwind Expanse has been renamed Intermediate Snowlands.",
  ],
  "0.344": [
    "Intermediate Snowlands is open as Wildwood's third map through the second portal in Beginner Desert.",
    "The new winter region includes snow terrain, icy roads, snow pines, frosted ground cover, camps, and a snow minimap.",
  ],
  "0.343": [
    "Developer inventory now includes Legendary White Gold Armor, a no-stat chest cosmetic that can be equipped.",
    "Player profiles now show one compact, color-coded leaderboard row for every stat ranked in the top 10.",
  ],
  "0.342": [
    "Death now immediately stops screen shake.",
    "Developer inventory now includes the no-stat Superior Golden Helmet cosmetic.",
  ],
  "0.341": [
    "Player health, damage, and regeneration can now progress to 1 trillion instead of stopping at the former lower caps.",
  ],
  "0.340": [
    "Desert dunes have been removed, and enemy name, health, and reward labels now only draw nearby.",
    "Large damage numbers use compact three-digit formatting, and world text rendering is lighter near enemies.",
  ],
  "0.339": [
    "Equipped items now leave bag slots, and Basic Paper Hat appears on the HEAD equipment slot.",
  ],
  "0.338": [
    "Basic Paper Hat is now a real no-stat head item with its own bag art and equip state.",
    "Equipment slots now stay text-only and no inventory or equipment controls shift when pressed.",
    "Minimized chat now uses a half-transparent background.",
  ],
  "0.337": [
    "Ten new alien skin colors are available, including green, blue, red, violet, and gold options.",
    "Profile DUEL is centered and profile stat descriptions are clearer.",
    "World text now respects tree depth, so players, enemies, chat, and damage hide behind trees.",
  ],
  "0.336": [
    "Player projectiles now use the held Stone art while keeping their launch, trail, and impact effects.",
    "Profile preview and portrait frames now use clean black outlines, with skin-tone color squares rendered correctly.",
    "Tree shadows now follow each tree trunk, and floating damage stays behind trees.",
    "Profile stats now use colored labels and aligned white terminal-style values.",
  ],
  "0.335": [
    "Your profile preview now stays centered, crisp, and styled like Tutorial Forest.",
    "Skin tones now open from a pencil as a compact color-square picker.",
    "The held stone now winds up, launches, and bounces back to the hand.",
    "Player shadows are now smaller and tighter.",
  ],
  "0.334": [
    "Starter head and Basic Paper Hat now use the shared center anchor.",
  ],
  "0.333": [
    "Starter-character idle now keeps both legs still while the head gently bobs.",
  ],
  "0.332": [
    "Player appearance now uses modular dynamic skin, a held stone, Basic Paper Hat, and starter legs.",
    "Trailblazer Boots now switch the player appearance to the boot-leg set.",
    "Your player profile now includes a persistent skin-tone selector.",
    "The offline layer aligner now compares modular body parts plus expansion helmets and chests.",
  ],
  "0.331": [
    "Player character sheets now have crisp black silhouette outlines.",
    "Sprite Aligner can move a full four-frame direction, nudge with arrow keys, and copy its complete character offset table.",
  ],
  "0.330": [
    "Sprite Aligner now previews the same frame anchors used in the game and tunes each frame separately.",
  ],
  "0.329": [
    "Aligned every alternate character animation frame to the original sprite centers and ground baseline.",
  ],
  "0.328": [
    "Game updates now show a clear handoff screen before the latest version loads",
    "Account sign-in keeps its loading state while your character opens",
    "Minimized World Chat reliably keeps the newest messages visible",
    "Dragon and Spider defeat notices wait until you enter the game",
    "HUD and player-profile portraits now repaint reliably",
    "Update notes now show their release date in a shorter sign-in panel",
    "Duel chat now tells you when you won or lost",
    "Dragon portal reveal stays centered and holds one second longer",
    "Duel replay chat opens player profiles from the name and portrait",
    "Activated portal swirl now eases smoothly through its animation",
    "Portal destination text now fades in after activation completes",
    "Minimized chat now pins the newest message visibly at the top",
    "Lost duels now read as a normal message from your player name",
    "Minimized chat now keeps the same bottom-up message order as expanded chat",
    "Minimized chat now uses compact one-line text messages",
    "Minimized chat keeps full usernames and adds a clear name separator",
    "Minimized chat header now stays focused on messages",
    "Toolbar buttons now use solid black outlines",
    "Minimized chat expand control now stays right-aligned",
    "Player HUD now uses the darker frame treatment and compact chat shows player count",
    "Profile name editing now lives in your profile with duplicate-name checks",
    "Portrait anti-aliasing can now be toggled in Settings",
    "Power labels now keep their values bright white",
    "Anti-aliasing now smooths floating world text while sprites stay crisp",
    "Sign-in now waits for page and game art before showing account choices",
    "Sign-in now keeps one clear loading state through account hydration",
    "Floating text now stays smooth and always sits beneath the minimap",
    "Toolbar buttons now use a stationary eased highlight when pressed",
    "Player profiles now preview and switch between four aligned species sprites",
    "Sprite alignment tool is available outside the game",
    "Sprite alignment tool now loads every built-in species sheet",
    "Sprite alignment tool can now pause on any individual frame",
  ],
  "0.302": [
    "Dragon portal cutscene now fades back to the player after the portal lights",
    "Developer panel now includes a local Dragon cutscene preview",
  ],
  "0.301": [
    "Dragon portal cutscene camera pan now moves at half speed",
    "Cutscene blackout now fades to full black while the portal and arch remain visible above it",
  ],
  "0.300": [
    "Dragon portal cutscene now triggers correctly after your first Dragon defeat",
    "Profile portraits now center their crop correctly in every UI frame",
    "Portal energy now fills the arch five percent wider",
  ],
  "0.299": [
    "Profile portraits now use a precise 3% center crop, removing the inset-frame look",
  ],
  "0.298": [
    "Profile portrait grid seams were removed; UI frames now provide the clean black outline",
    "Player and enemy overhead labels are now fully opaque with thicker black outlines",
    "Large-enemy label spacing was restored to its original compact layout",
  ],
  "0.297": [
    "Profile portraits now use white backgrounds and black outlines",
    "Profile, chat, and overhead player/enemy names now share the same rounded name font",
  ],
  "0.296": [
    "Dragon cone now gives an additional 0.4 seconds of warning before fireballs fire",
  ],
  "0.295": [
    "iOS chat return key now sends messages",
    "World Chat now shows its three-second send cooldown",
  ],
  "0.294": [
    "Dragon cone now warns for an extra moment before firing; fireball speed is unchanged",
  ],
  "0.293": [
    "Dragon fire cone now travels slower, giving more time to react",
  ],
  "0.292": [
    "Tutorial Forest Mossbacks now reward +5 armor",
    "Tutorial Forest health-reward enemies now grant double health",
  ],
  "0.291": [
    "Player HUD and toolbar now share one clean border treatment without a shadow seam",
  ],
  "0.290": [
    "Player name and health display now sit vertically centered in the HUD frame",
  ],
  "0.289": [
    "Large regular enemies now have more space between their sprites, health bars, and reward labels",
  ],
  "0.288": [
    "Player HUD and toolbar now use equal-height rows while still matching the minimap",
  ],
  "0.287": [
    "Player HUD now visibly overlaps the toolbar frame and fully clips its contents",
  ],
  "0.286": [
    "Player toolbar buttons now have lighter transparent backgrounds and white labels",
  ],
  "0.285": [
    "Duel result chat now names the winning player instead of DUEL",
    "Click anywhere on a duel result chat message to watch its replay",
    "Click either fighter during a live duel or new duel replay to open their profile",
    "Player HUD now stays above its connected toolbar and clips its health display inside the frame",
  ],
  "0.284": [
    "Player action icons now form one connected toolbar beneath the player panel",
    "The player panel and action toolbar now match the minimap height",
    "Minimized World Chat now shows its newest message first",
    "Minimized World Chat status and version text now stay white",
  ],
  "0.283": [
    "World Chat expand and minimize arrows now point diagonally",
    "Replay medallions now sit at the end of their chat messages",
    "Chat message text, portraits, and message bubbles are 25% larger",
    "Minimized World Chat now has a transparent panel background",
  ],
  "0.282": [
    "World Chat now uses one clear custom expand/minimize arrow",
    "Replay play controls now sit directly on the game without button backgrounds",
  ],
  "0.281": [
    "World Chat replay buttons now use the custom Wildwood play medallion",
    "World Chat expand and minimize control now uses custom pixel corner marks",
  ],
  "0.280": [
    "Player projectiles now always travel at 1,000 speed",
    "Projectile speed and projectile count are hidden from player profile stats",
  ],
  "0.279": [
    "First Dragon victory now unlocks Beginner Desert through a cinematic portal reveal",
    "The camera pans to the Forest portal while player input pauses, then play resumes",
  ],
  "0.278": [
    "Replay results now use a compact custom play button",
    "Minimized World Chat stays left-anchored and never exceeds half the screen width",
    "Player and enemy overhead labels are larger, sharper, and centered",
    "Multiplayer runtime upgraded to SpacetimeDB 2.8.1",
  ],
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

const RELEASE_DATES: Record<string, string> = {
  "0.364": "AUG 13, 2026",
  "0.331": "AUG 13, 2026",
  "0.330": "AUG 13, 2026",
  "0.329": "AUG 13, 2026",
  "0.328": "AUG 13, 2026",
};

function releaseDay(version: string) {
  const numericVersion = Number(version);
  if (numericVersion >= .376) return "2026-08-14";
  if (numericVersion >= .278) return "2026-08-13";
  if (numericVersion >= .261) return "2026-08-12";
  return null;
}

export function releaseDate(version: string) {
  if (RELEASE_DATES[version]) return RELEASE_DATES[version];
  const day = releaseDay(version);
  if (day === "2026-08-14") return "AUG 14, 2026";
  if (day === "2026-08-13") return "AUG 13, 2026";
  if (day === "2026-08-12") return "AUG 12, 2026";
  return "";
}

export function releaseNotes(version: string) {
  return RELEASE_NOTES[version] ?? [];
}

export function recentReleaseNotes(days = 2) {
  const cutoff = new Date();
  cutoff.setHours(0, 0, 0, 0);
  cutoff.setDate(cutoff.getDate() - Math.max(0, days - 1));
  return Object.entries(RELEASE_NOTES)
    .sort(([a], [b]) => b.localeCompare(a, undefined, { numeric: true }))
    .filter(([version]) => {
      const day = releaseDay(version);
      return day !== null && new Date(`${day}T00:00:00`).getTime() >= cutoff.getTime();
    })
    .map(([version, notes]) => ({ version, notes, date: releaseDate(version) }));
}
