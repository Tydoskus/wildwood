export const RELEASE_NOTES: Record<string, string[]> = {
  "0.629": [
    "Each sign-in loading stage now stays visible for at least 0.2 seconds, with the loading bar smoothly easing between progress steps.",
    "Loading presentation pauses on account-choice and error screens, and restarts cleanly when retrying.",
  ],
  "0.628": [
    "Upgraded Prismshell, Ironhorn, and Dreadreaper to 512px Unity sprite exports with boss-only smoothing for cleaner edges.",
    "Preserved boss size, animation timing, and combat behavior; higher-resolution art loads only for the relevant boss.",
  ],
  "0.627": [
    "Smoothed multiplayer movement by following server sample timing and blending delayed updates more consistently through turns and stops.",
    "Added Clockwork Ruins and Duskfall Orchard after Crystal Hollows, with mechanical raptor and pumpkin enemy families captured through the Unity sprite exporter.",
    "Added Ironhorn and Dreadreaper bosses with distinct shockwaves, scrap rows, and harvest-ring attacks, plus multiplayer rewards and portal unlocks.",
    "Existing Prismshell victories unlock Clockwork Ruins automatically.",
  ],
  "0.626": [
    "Portals now wait for the destination connection before revealing the new map, preventing flashes back to the old map.",
    "Fixed map reconnects getting stuck offline, restored immediate movement after reconnecting, and kept the global online count visible during travel.",
  ],
  "0.625": [
    "Online players now shows one global total across all maps and stays correct when connecting or switching map instances.",
    "Virtual-player cleanup now frees its map slots instead of leaving instances marked full.",
  ],
  "0.624": [
    "Maps now fill to 10 players, with another instance prepared as a map reaches 9.",
    "Characters, gear, research, and duels stay shared across map instances, while each instance has its own boss fight.",
    "Reduced repeated rendering work in world drawing and the research tree.",
  ],
  "0.623": [
    "Brought inflated legacy player stats closer to map progression while preserving the exact overall power ranking and ties.",
    "Kept each build’s damage, health, armor, and regeneration proportions, along with earned gear, research, and map unlocks.",
    "Updated older queued saves to the same balance so reconnecting cannot restore inflated stats.",
  ],
  "0.622": [
    "Rebuilt map progression around shared enemy, boss, and reward curves, with clearer Balance Lab pacing and duel diagnostics.",
    "Duels preserve earned stat advantages and escalate damage after ten seconds, using the same combat timeline for live battles and replays.",
    "Enemies keep slightly more space in crowds; movement broadcasts reuse calculations to reduce server work.",
    "Sign-in loads fewer subscriptions, boss health updates follow the active map, and heavy server cleanup runs less frequently while offline completion timers remain intact.",
    "Smoothed installed iPhone sign-in transitions by preserving artwork and logo placement around the brief authentication sheet.",
  ],
  "0.621": [
    "Reduced regular-enemy health by 50% and doubled boss health from Beginner Desert onward; Tutorial Forest remains unchanged while later derived maps inherit the post-Forest tuning.",
  ],
  "0.620": [
    "Boss combat rewards now pay their full authored amount on every clear, including repeat bosses; Balance Lab and repeat-loop reporting keep repeat power and repeat time separate.",
  ],
  "0.619": [
    "Restored repeatable boss combat rewards at a calibrated lower rate instead of suppressing rewards after the first clear; Balance Lab now reports repeat power and repeat time separately.",
    "Rebalanced regular reward power by encounter time so damage, health, armor, and regeneration camps are comparable to farm, while the mixed baseline keeps damage below a dominant share of pursuit time.",
    "Calibrated Crystal Hollows' Prismshell health to the equal-time route so the capstone remains reachable without forcing a damage-only farm.",
  ],
  "0.618": [
    "Boss permanent combat rewards are now first-clear-only, so repeat bosses cannot compound a player's power; authored repeat item outcomes remain available.",
    "Rebalanced late-boss armor and regeneration from each boss's HP envelope, and made Balance Lab repeat time, first-clear power, and repeat power report separately on the tech-tree-on curve.",
  ],
  "0.617": [
    "Recalibrated post-onboarding pacing, enemy health, incoming damage, rewards, and boss gates against the balanced tech-tree curve.",
    "Balance Lab now fills the power graph as campaigns complete, with light mode and separate Natural, Efficient, DPS-first, and Boss-rush strategy traces.",
  ],
  "0.616": [
    "Moved the mobile gameplay camera focus 10% lower for clearer play space above the player.",
    "Added the pathless Cloudspire map design and updated Balance Lab strategy and combat reporting.",
  ],
  "0.615": [
    "Calibrated Samurai Garden through Crystal Hollows incoming damage to a health-and-armor progression curve, bringing Crystal Hollows regular hits to about 80b–128b at the reference build.",
    "Kept boss health, rewards, armor, and saved player stats separate from incoming-hit scaling, with stronger late-map telegraphed attacks.",
    "Replaced brittle source-fragment checks with executable UI and isolated SpacetimeDB reducer tests while keeping balance simulations opt-in.",
  ],
  "0.614": [
    "Added Crystal Hollows beyond Moonfen with five crystal-rabbit camps, editable cavern routes, and the new Prismshell boss.",
    "Defeating Miremaw unlocks Crystal Hollows, with map access and saved location synced across devices.",
    "Made player profiles more compact, removed the duplicate Weapon slot, and arranged equipment evenly with two slots on each side.",
  ],
  "0.613": [
    "Removed duplicate ground shadows from the new enemies in Samurai Garden, Cloudspire, and Moonfen. They keep the shadows included in their artwork.",
  ],
  "0.612": [
    "Corrected idle, movement, and attack facing for the new enemies in Samurai Garden, Cloudspire, and Moonfen.",
    "Removed bow overlays from the new enemy families while keeping their combat behavior unchanged.",
  ],
  "0.611": [
    "Restored original slime, goblin, and skeleton families across the first six maps, keeping one family per map.",
    "Added animated tulip monsters, winged bee monsters, and rock fungi to Samurai Garden, Cloudspire, and Moonfen using map-loaded WebP artwork.",
    "Organized Settings into Game, Audio, and Account tabs, and made the Tech Tree open at active research or the next available technology.",
    "Made profile stat rows more compact and independently expandable, and separated red Report/Block controls from Back.",
    "Added a return button to the in-game Terms, slightly increased bow/rock release volume, and kept the normal frame rate during stationary combat.",
    "Added a local Unity sprite-export tool and an isolated developer-only forest reward validation prototype without changing real player rewards or saves.",
  ],
  "0.610": [
    "Added support contact details, private player reports, and synced Block/Unblock controls on player profiles and in Settings.",
    "Profile stats now use two columns with aligned labels and totals, with detailed breakdowns available by selecting a stat.",
    "Rock throws and bows now use the trimmed release sound at launch, and flying rocks match the held rock's size.",
  ],
  "0.609": [
    "Portal cutscene history now follows your character across devices, with existing unlocked scenes remembered automatically.",
    "Unchanged startup artwork and assets stay cached across releases using content-based filenames.",
    "Update links clean themselves after loading, with recovery for sign-in tabs left open during releases.",
  ],
  "0.608": [
    "Removed black toolbar borders for a cleaner look.",
    "Repeated stat rewards now update their existing total without replaying the entrance animation.",
    "Organized project files into config, docs, launchers, and tools folders while preserving one-click workflows.",
  ],
  "0.607": [
    "Preloaded directly connected maps during idle high-performance moments to reduce portal transition waits.",
    "Combined repeated enemy stat rewards into one updating notification and hid item reveals for already-owned drops.",
    "Kept camera map coverage stable across wide screens, with the square view as the maximum zoom-in.",
    "Refined floating player and regular-enemy health bars, labels, power text, and player spacing for cleaner readability.",
    "Reworked the 2x respawn reward into a compact gold video control with a confirmation prompt.",
  ],
  "0.606": [
    "Made portals activate immediately after map arrival while preserving safe re-entry when a spawn overlaps a portal.",
    "Reduced the top-left player HUD by 20% and thickened the minimap frame.",
    "Added a legacy-site sign-in notice pointing players to wildstatmmo.com.",
  ],
  "0.605": [
    "Applied the latest authored Tutorial Forest and Beginner Desert layouts, decorations, colors, paths, camps, and gameplay markers.",
  ],
  "0.604": [
    "Added a one-click map editor for creating maps and editing layouts, decorations, colors, enemy camps, and gameplay markers.",
    "Applied the newly authored Tutorial Forest layout, palette, paths, decorations, and pickup positions.",
  ],
  "0.603": [
    "Added balanced area knockback to one attack for every boss.",
    "Simplified boss defeat rewards to one compact shared notice without duplicate reward messages.",
    "Refined inventory, equipment layering, minimap framing, and switched the wordmark to WebP.",
  ],
  "0.602": [
    "Item details now open above player profiles with larger, borderless item artwork.",
    "Removed developer save editing controls from player profiles.",
    "Kept the minimap texture inside its frame on fractional mobile layouts.",
  ],
  "0.601": [
    "Moved stat reward cards to the upper center of the screen for clearer visibility.",
  ],
  "0.600": [
    "Restored the optional latency readout beside the FPS display.",
    "Reduced stat reward cards by thirty percent and matched their transparency to the player HUD.",
  ],
  "0.599": [
    "Centered and refreshed stat reward notifications as compact upgrade cards.",
    "Moved Developer Tools into Settings and added a Shop shortcut to the toolbar.",
    "Extended the animated grass backdrop behind the full player equipment preview.",
  ],
  "0.598": [
    "Refined sign-in button labels with larger, cleaner type and a softer shadow.",
    "Corrected Add to Home Screen guidance for Chrome and other browsers on iPhone and iPad.",
  ],
  "0.597": [
    "Kept the animated sign-in logo fully visible and restored bright white beta and character labels.",
  ],
  "0.596": [
    "Refined the sign-in screen with a better-balanced logo position and pill-shaped authentication buttons.",
  ],
  "0.595": [
    "Added an Add to Home Screen button with native browser installation and iPhone/iPad guidance.",
    "Refined the sign-in layout with a raised logo, clearer white labels, and slimmer square authentication buttons.",
  ],
  "0.594": [
    "Upgraded the sign-in screen with a sharper 4K WebP forest backdrop and refined login controls.",
    "Added equipment slots to player profiles so worn gear and cosmetics can be viewed and inspected.",
  ],
  "0.593": [
    "Fixed Connection Setup Failed after the security update by allowing the runtime schema compiler required by SpacetimeDB while continuing to block inline and third-party scripts.",
  ],
  "0.592": [
    "Startup now follows one consistent state flow through sign-in, account recovery, connection retries, and game entry.",
    "Added privacy-safe timing and fixed-category diagnostics for authentication, connection, world sync, and asset failures.",
    "Hardened account sign-in with nonce and signed ID-token validation plus a restrictive browser security policy.",
    "Reduced startup downloads by loading only the active map's enemy, boss, and scenery art; later maps and duel art load when needed.",
  ],
  "0.591": [
    "Corrected the game name capitalization to WildStat across installed-app metadata and player-facing text.",
  ],
  "0.590": [
    "Added WildStat web-app metadata and dedicated Home Screen icons for standalone launches.",
    "Going Back from Spacetime sign-in now immediately restores Sign In and Guest Login instead of remaining on verification.",
  ],
  "0.589": [
    "Made startup and sign-in recovery faster and more reliable, with clearer connection errors and a Retry Now option.",
    "Improved reconnection with bounded timeouts, gradual retry backoff, and better diagnostics.",
    "Loads only the current map's artwork during startup and refreshes the Desert Scorpion and Koi Shogun boss sprites.",
  ],
  "0.588": [
    "Updated WildStat to SpacetimeDB 2.9.0 for more reliable identity-preserving reconnects.",
    "The sign-in logo and buttons now stay fixed in place, and the logo appears immediately without fading in.",
  ],
  "0.587": [
    "Moonfen is now open beyond Cloudspire, with five new enemies and five marsh camps.",
    "Defeat Tempest Kirin to enter Moonfen and face Miremaw's tongue lash and bog burst attacks.",
  ],
  "0.586": [
    "Sign-in verification now finishes before the large background artwork loads, preventing browser tabs from stalling during account return.",
  ],
  "0.585": [
    "Sign-in now recovers from rejected or stalled authentication instead of remaining on Verifying Sign-In.",
  ],
  "0.584": [
    "Added Cloudspire with five storm enemies and the Tempest Kirin world boss.",
    "The sign-in background now fades in over two seconds before revealing the logo.",
    "Aligned the floating Gender and Power icons above player health bars.",
    "Map music now finishes loading silently and loops from memory without requesting the soundtrack again.",
  ],
  "0.583": [
    "The sign-in screen now stays black until the full background is ready, then fades it in without the blurry embedded preview.",
    "Corrected the Koi Shogun's proportions and reduced its in-game size.",
  ],
  "0.582": [
    "Updated the Player Power icon across the HUD, player labels, and chat.",
  ],
  "0.581": [
    "Refreshed the male and female profile icons and Gem artwork.",
    "Adjusted the Koi Shogun artwork so it keeps its intended proportions and faces left consistently.",
  ],
  "0.580": [
    "The sign-in version tab now sits flush with the bottom edge on every screen.",
  ],
  "0.579": [
    "Added the Koi Shogun to Samurai Garden, with water-sword attacks, shared health, contribution rewards, and repeatable respawns.",
    "Polished the sign-in screen with roomier buttons, a cleaner version-notes panel, and updated sound controls.",
    "Duel requests now minimize full-screen chat before opening.",
  ],
  "0.578": [
    "Map music now loads on demand so startup and portal transitions continue without waiting on soundtrack downloads.",
  ],
  "0.577": [
    "Updated remaining game text, item descriptions, and Terms to use the WildStat name.",
    "Updated the desert boss with an animated Desert Scorpion sprite and matching labels.",
  ],
  "0.576": [
    "Updated the sign-in background and its instant loading preview, with release-based artwork cache refreshes.",
    "Added matching WildStat Home Screen and browser icons using the new green-and-blue WS leaf mark.",
  ],
  "0.575": [
    "Updated the WildStat logo and refreshed its cache with each release so returning players receive the latest artwork.",
  ],
  "0.574": [
    "Introduced the WildStat wordmark across sign-in, loading, onboarding, and update screens, with uncropped framing and matching startup labels.",
  ],
  "0.573": [
    "Refined the player HUD with a portrait sized to half the minimap, equal text and health rows, and Gems restored beneath the left edge.",
    "Simplified the optional performance readout to a single FPS value.",
    "Replaced generic window titles and close icons with consistent bottom Back controls across game windows.",
    "Removed the anti-aliasing setting while retaining the existing default portrait smoothing.",
  ],
  "0.572": [
    "Refined the player HUD with aligned portrait and health bar geometry, a two-tone health fill, and the retained Power readout.",
    "Matched the minimap edge padding, border, radius, and duel visibility behavior to the player HUD.",
    "Updated the Power icon and removed audited legacy client code and retired runtime assets.",
  ],
  "0.571": [
    "Guest attack-speed and regeneration rewards now update immediately in gameplay and profiles without requiring a restart.",
    "The player HUD and Gem counter now share a polished framed style with improved spacing and a two-tone health bar while retaining Power.",
  ],
  "0.570": [
    "Snowlands and Night Forest enemies now drop new map-balanced bows at 1/50 and 1/100 odds.",
  ],
  "0.569": [
    "Game artwork and music now prepare on a clearer loading screen before play.",
    "Fixed solo Tidewyrm attacks and portal collision immediately after spawning.",
  ],
  "0.568": [
    "Portal transitions now close edge-to-edge with soft, staggered clouds.",
  ],
  "0.567": [
    "Portal clouds now arrive in a fuller diagonal stagger, sealing the center last with smoother easing.",
  ],
  "0.566": [
    "Portal travel now uses mobile-first clouds to cover destination loading and reveal the new map only when ready.",
    "Normal launches open directly on sign-in, while profile portraits and gender art wait for the game loading screen.",
  ],
  "0.565": [
    "Sign-in now switches directly to loading and returns to account choice only if authentication fails.",
  ],
  "0.564": [
    "Portals now use one shared runtime-tinted swirl sheet instead of separate color files.",
    "Bosses and map scenery now load only for the current or destination map, with travel waiting until destination art is ready.",
  ],
  "0.563": [
    "Screen shake now remembers your preference, and toolbar colors are slightly richer.",
    "Long mobile resumes now escape stuck reconnects through a clean startup reload after four seconds.",
  ],
  "0.562": [
    "Boss names are 50% larger, with boss stat rewards 25% larger.",
    "Desktop sight distance now matches mobile.",
  ],
  "0.561": [
    "The age-gate agreement now keeps its wording concise.",
  ],
  "0.560": [
    "A clean 13+ age and Terms step now appears immediately after sign-in or Guest Login, with private versioned acceptance required before entering the world.",
    "The sign-in panel keeps short-screen scrolling without showing its large outer scrollbar.",
  ],
  "0.559": [
    "Reduced the initial game page to under 24 KB and moved hidden windows into the cached client bundle.",
  ],
  "0.558": [
    "Ranged enemies now fire and hold position just inside each target player's attack range, including remote combat ghosts.",
  ],
  "0.557": [
    "Boss damage now scales with each map's regular enemies, preventing obsolete one-shot attacks while keeping telegraphed hits threatening.",
  ],
  "0.556": [
    "Regular enemies now use one color-coded slime family per map, with bows for ranged variants and larger silhouettes for elites.",
    "Enemy camps are more spacious and stay on a single reward track while preserving each map's enemy and progression budgets.",
  ],
  "0.555": [
    "Mobile now sees 7% more world, while desktop matches the same visible area without shrinking combat labels or health bars.",
    "Late-map elites now grant more Damage than regular enemies, with Night Forest damage kept inside its intended survivability curve.",
  ],
  "0.554": [
    "Legacy leaderboard compression now lands on the intended current-equipment map-entry targets.",
  ],
  "0.553": [
    "Five legacy leaderboard outliers were proportionally compressed onto the current progression curve while preserving rank and build ratios.",
  ],
  "0.552": [
    "Late-map progression now follows a smoother logarithmic rhythm, with meaningful travel, shorter regular fights, and bosses that remain real capstones.",
    "Equipment power has been scaled down, while the Balance Lab now exposes time spent on each stat, travel, bosses, and progression bottlenecks.",
  ],
  "0.551": [
    "Ranged enemies no longer flicker at aggro edges, and movement speed and aggro reach stop increasing after Snowlands.",
    "Sign-in notes and OAuth loading are stable again, while resumed iOS web apps recover from stale reconnects.",
  ],
  "0.550": [
    "Sign-in now happens before the game loads, with a stable loading screen and clean guest login.",
    "Reduced idle rendering and removed Night Forest character and world shadows.",
  ],
  "0.549": [
    "Boss attack patterns and player projectiles now stay synchronized across nearby screens without extra server traffic.",
  ],

  "0.548": [
    "Enemies now separate cleanly after aggro while keeping responsive local movement.",
    "Boss hazards and nearby player attacks now use deterministic client simulation, reducing server traffic.",
  ],
  "0.547": [
    "Replying to chat messages now keeps the composer visible above the mobile keyboard.",
    "Local overhead and HUD power now include equipped-head stats, matching profiles and leaderboards.",
  ],
  "0.546": [
    "Remote combat ghosts are more transparent, survive brief player-detail gaps, and die independently as remote attacks focus one enemy at a time.",
  ],
  "0.545": [
    "Nearby players now appear reliably on join and start and stop smoothly through a buffered 3 Hz detail stream.",
    "Remote regular-enemy fights now use translucent independent enemies with accurate stats, attack range, full starting health, damage, and deaths.",
  ],
  "0.544": [
    "Night Forest, Water Reach, and Samurai Garden now use distinct camp layouts and mixed formations, with less formulaic enemy scaling that preserves the full progression budget.",
  ],
  "0.543": [
    "Tidewyrm now guards Water Reach, and defeating it unlocks Samurai Garden with pink sakura groves and five scaled enemy camps.",
    "Tidewyrm uses the established chunky boss-art style, while boss minimap markers stay clean and aura-free.",
  ],
  "0.542": [
    "Gloomroot now guards Night Forest, and defeating it unlocks Water Reach with five new enemy camps on the extended progression curve.",
    "Night Forest enemies now remain visible through the vignette, while Gloomroot has reliable artwork and clearer minimap markers.",
  ],
  "0.541": [
    "Duel finishes and replays now play death animations and clear remaining projectiles instead of freezing them midair.",
  ],
  "0.538": [
    "Beginner Desert now targets about two hours, each later map about 1.35× longer, and post-Forest power follows a smooth roughly 200×-per-map growth curve.",
    "Wastes Reaper now pays smaller, faster rewards so power starts climbing near the beginning of Desert instead of sitting flat for half an hour.",
    "Only legacy accounts beyond the measured endgame curve receive a one-time rank-preserving soft compression; ordinary accounts remain unchanged and veteran advantage is preserved.",
  ],
  "0.537": [
    "Depth Raider now has 10qd less health and deals half damage.",
  ],
  "0.536": [
    "Depth Raider now grants three times as much permanent Damage, increasing its reward from 19.2 billion to 57.6 billion.",
    "Damage popups no longer jump from stale pooled positions on their first rendered frame.",
  ],
  "0.535": [
    "Equipment bonuses now stack additively, item upgrades grow by 8% of each item's base bonus per level, and equipment no longer increases attack speed.",
    "Maximum base attack speed is now 2.625 attacks per second, with existing saves migrated safely to the new cap.",
    "Night Forest enemy damage now stays in a tight range that lands near 90–100 trillion per hit at 91% block instead of producing multi-quadrillion spikes.",
  ],

  "0.534": [
    "Multiplayer now caches each map's player names, appearances, equipment, speed, and power once instead of moving broad player subscriptions with the camera.",
    "Remote positions are sampled analytically at publication time, eliminating heartbeat-age catch-up jumps without adding server simulation ticks.",
    "Steady movement fanout is bounded to the 2 Hz nearest-five detail frame and the 1 Hz compact map snapshot, and virtual players now test that same production path.",
  ],

  "0.533": [
    "Nearby multiplayer now selects up to five relevant moving players before server fanout, while every other player remains visible through the all-map minimap dots.",
    "Progress saves no longer rewrite an unchanged full progress row, reducing persistence compute and self-subscription traffic.",
    "Virtual-player tests now isolate core, minimap, capped motion, persistence, realistic, and dense-crowd bandwidth costs.",
  ],

  "0.532": [
    "Remote players now extrapolate from transmitted world velocity and use simulation ticks plus motion epochs to prevent speed drift and discontinuity snaps.",
    "Mobile steering keeps fully analog local control while a lightweight 24-direction network gate and 2 Hz heartbeat reduce noisy updates without a high-rate timer pump.",
    "Regular enemies move 50% slower in Tutorial Forest and 25% slower in Beginner Desert; bosses and later regions are unchanged.",
  ],

  "0.531": [
    "Fixed upgraded players jumping on each movement heartbeat by making remote teleport detection account for elapsed time, input magnitude, and effective movement speed.",
  ],

  "0.530": [
    "Updated WildStat's browser favicon and added versioned favicon loading so the new icon replaces cached copies promptly.",
  ],

  "0.529": [
    "Remote players now hold a short true-jitter buffer, preserve visual continuity through position corrections, and learn realized running speed to eliminate repeating side-by-side drift and snap-back.",
    "Updated the Gem artwork and added the new compact Chat icon.",
  ],

  "0.528": [
    "Smoothed mobile movement with native-refresh rendering, fixed-step interpolation, consistent pixel alignment, and a steadier analog joystick.",
    "Prevented duplicate mobile viewport events from repeatedly rebuilding the game canvas.",
  ],
  "0.527": [
    "Eliminated a background timer loop and reduced world-tile graphics memory.",
  ],
  "0.526": [
    "Reworked multiplayer internals for safer, more reliable future updates.",
  ],
  "0.525": [
    "Duel replay chat rows now open the message drawer with Watch Replay, Reply, and eligible Report actions, while portraits continue to open player profiles directly.",
  ],
  "0.524": [
    "Fullscreen chat messages now open a smooth swipe-down action drawer for Copy, Reply, and private Report controls, while only portraits open player profiles.",
    "Replies now preserve a dimmed message reference above the response, and message bubbles fit their content while retaining a comfortable right-side scroll gutter.",
    "Chat moderation now catches more high-confidence evasions, protects display names, and stores private server-verified reports without retaining moderated originals.",
    "WebGL now batches projectiles and particles with safe Canvas fallback, and the respawn countdown remains clearly white over the game world.",
  ],
  "0.523": [
    "WebGL now prewarms the spawn-area world tiles before gameplay and batches crisp Lava Lake rocks into a few GPU draws, with automatic Canvas fallback.",
  ],
  "0.522": [
    "Fire Metal Bow now deals 6× damage—exactly 1× more than Lava Bow—while retaining its 1.3× attack speed.",
    "Night Forest Abyss Archers now grant twice as much permanent Max Health.",
  ],
  "0.521": [
    "Night Forest now uses moonlit tree variants with all charred lava trees removed, looping Night Ambient 3 music, and a readable white portal label.",
  ],
  "0.520": [
    "Night Forest minimaps now retain every enemy marker while dimming the red dots to 50% opacity.",
  ],
  "0.519": [
    "Night Forest darkness now fades across a wider area and leaves distant terrain faintly visible instead of becoming fully black.",
  ],
  "0.518": [
    "Completed research nodes now show clean green Max text with only a subtle shadow.",
    "Toolbar labels now use compact Camel Case text, while minimap player and version labels are easier to read.",
  ],
  "0.517": [
    "Night Forest now has its own moonless woodland layout, black portal swirl, near-black terrain, and enemies that emerge only as they approach attack range.",
    "Dark Metal Helmet now drops independently from regular Night Forest enemies at 1/65, with 2.5× Damage, 2.5× Max Health, and 3× Regen.",
    "Cosmetic equipment no longer consumes bag items, inventory expansion rows stay aligned, completed research turns gold with Max badges, and Upgrade Bench selection reliably restores its Upgrade action.",
  ],

  "0.516": [
    "Fire Metal Helmet now drops from regular Advanced Lava Lake enemies, while Fire Metal Bow drops in Night Forest with its new high-damage equipment bonuses.",
    "Bag capacity can now expand through progressively priced Gem slot unlocks, and the Upgrade Bench item picker shows five choices before scrolling.",
    "Item inspection gains centered Camel Case actions and a bottom Back button, Infernal damage rewards are doubled, and equipped bows sit four pixels lower.",
  ],
  "0.515": [
    "Night Forest now opens beyond Lava Lake after defeating Magmalisk, with a one-time portal reveal and five enemy camps that continue each archetype's established scaling curve.",
    "Mini chat now uses a translucent charcoal gradient over full-height gameplay, while the default page background is black and the toolbar's outside corners are square.",
    "Static world tiles can now render through a lightweight native WebGL layer with automatic Canvas fallback, while permanent joystick compositing reduces first-movement frame hitches.",
  ],
  "0.514": [
    "The minimap now shows the live player count above the version, while the World Map preview is 25% smaller and the Daily Gem Bonus uses a subtler gradient.",
    "Equipped bows regain subtle running sway, and current player appearance frames are prewarmed so first movement avoids cache hitches and begins with a clean FPS sample.",
    "The connection loading panel is centered independently of Safari background overscan, and overhead chat bubbles return to a light theme with an eight-second lifetime.",
  ],
  "0.513": [
    "World Chat now replaces high-confidence abusive, explicit, threatening, scam, and invite content with an italic moderated notice.",
    "Closing fullscreen chat after using the mobile keyboard now restores the gameplay canvas correctly.",
  ],
  "0.512": [
    "Fullscreen chat now uses non-overlapping portrait-led messages, centered compact timestamps, and a safely clipped scroll area.",
    "Fullscreen chat covers the toolbar with compact bottom controls, a centered Back button, and a warmer charcoal background.",
    "Mini chat is shorter and removes its header bar, returning more room to the game canvas.",
    "Global login and leave announcements are hidden until a future friends-only implementation.",
  ],
  "0.511": [
    "Fullscreen chat now uses larger portraits, rows, and message text.",
    "Recovered missing world presence automatically and retried interrupted actions once.",
    "Fixed mobile toolbar safe-area sizing and kept notifications visible above fullscreen windows.",
    "Polished Upgrade Bench item placement, shadow, and the transparent death message layout.",
  ],
  "0.510": [
    "Player deaths now animate before a faster 3-second respawn, and nearby players see the fall too.",
    "Profile stat equations align cleanly, with Block details shown only when Armor is expanded.",
    "Sign-in loading now keeps stable preloaded artwork and avoids Safari viewport flashes and layout shifts.",
    "Chat bubbles, damage popups, and fullscreen chat spacing are more readable and polished.",
  ],
  "0.509": [
    "World Chat now shows plain purple login and leave notices without player profile details, with separate server-side 15-minute cooldowns to prevent reconnect spam.",
  ],
  "0.508": [
    "The FPS display now sits beneath the player HUD and adds a rolling 1% Low metric so brief frame hitches are visible beside average and Work FPS.",
    "Profile stat equations now center multiplication and equals signs between their values, with Armor keeping Block directly beside the final armor total.",
    "Regular bow enemies no longer render separate hand or arm layers.",
  ],
  "0.507": [
    "The World Map now opens into a clean full-window guide with destination-colored portals, simplified reward zones and boss markers, plus concise item drop chances and sources.",
    "Lava Lake scenery now stays crisp and stable while moving, removes stray terrain dots, and keeps decorative rocks walkable; equipped bows rest centered and aim naturally.",
    "Profile Armor now places Block before the final value, the app icon is refreshed, and production browser bundles are minified with source maps for substantially smaller downloads.",
  ],
  "0.506": [
    "Profile Stats now show one combined multiplier per row; tap any 44px row to expand an 88px Tech and Equipment breakdown, with every profile opening collapsed.",
    "Regular desert enemies can now independently drop the 1-in-50 Wood Full Helm and Iron Bow, adding new health, damage, and attack-speed equipment choices.",
    "Research is reorganized into clear five-level bands with aligned one-to-two paths while preserving every completed and active rank.",
    "The Dragon now has 300,000 health and deals twice as much damage, while the tutorial forest Attack Speed reward is increased to 0.02.",
    "Layered player and enemy appearances are cached, lava scenery uses static baked rendering, and cutscenes now cover chat and the toolbar.",
    "Gem spending now requires confirmation, compact chat opens from any click without triggering content beneath it, and guest login immediately shows loading feedback.",
  ],
  "0.505": [
    "The Upgrade Bench now opens on two item slots, with a permanent second slot unlock for 150 Gems and support for two simultaneous upgrades.",
    "Active item upgrades now offer a Gem-priced Finish Now action at one Gem per started ten minutes, followed by a clear Back button to close the bench.",
  ],
  "0.504": [
    "Magmalisk poses are now isolated and repacked without intermittent left-edge cropping, with the shadow raised closer to his feet.",
    "Starter, Frost, and Lava Bows now use the updated transparent sprite artwork.",
  ],
  "0.503": [
    "Arrows now collide with the Magmalisk, show damage numbers, and submit their boss damage correctly.",
    "Magmalisk animation frames now use their true artwork bounds so the left side is no longer cropped.",
  ],
  "0.502": [
    "The Magmalisk now guards Lava Lake with bite and eruption attacks, permanent Damage, Health, Armor, and Regeneration rewards, plus a 1-in-25 Lava Bow drop.",
    "Regular lava monsters now have a 1-in-30 chance to drop Magma Armor, while equipment multipliers now multiply technology percentage bonuses.",
    "Lava Lake now has seven times as many non-overlapping ground-layer rocks that players can walk over without visual layering.",
    "Bag slots now use cleaner icon-only presentation while preserving upgrade badges, with adjusted item sizing, angled bow icons, and 25% larger bows on characters.",
    "Daily Gems now arrive through a registered-account Claim popup, and active research offers centered Gem-priced Finish Now controls.",
  ],
  "0.501": [
    "Registered accounts now receive 7 free Gems once per UTC day, and active research can be finished for one Gem per started ten minutes.",
    "Cosmetics slots can now hide equipped gear visually without changing its stats.",
    "World Chat now uses a seamless dark-gray compact bar, stays at the correct height after fullscreen windows, and the Gem counter has a subtle borderless background.",
  ],
  "0.500": [
    "Moved the private Gems balance out of the profile into a borderless HUD counter beneath the player summary, showing only the pink Gem symbol and amount.",
    "Returned minimized World Chat to a full-width strip between the gameplay canvas and toolbar; gameplay now ends above it while fullscreen windows continue to cover it normally.",
    "Simplified the Upgrade Bench item list by removing the NEXT +level labels.",
  ],
  "0.499": [
    "Added a private, server-backed Gems balance to your profile with a new pink Gem icon; purchases and spending are not enabled yet.",
    "Settings volume controls now use much wider responsive tracks with exact 44-by-44-pixel slider thumbs and visible filled progress for easier touch adjustment.",
    "Minimized World Chat now sits at the top of gameplay directly beneath the player HUD, while expanded chat remains fullscreen above the toolbar.",
  ],
  "0.498": [
    "Dune Archers now use the approved horizontal bow placement and hand pivot from the alignment tool, with the unnecessary separate gripping-hand layer removed.",
  ],
  "0.497": [
    "Added a one-click Enemy Sprite Aligner that reads the game’s exact live layer data, previews facing and target-aware rotation, supports direct dragging and reference images, and saves complete alignment values to a shareable text file.",
  ],
  "0.496": [
    "Enemy artwork now participates in startup loading with bounded retries and partial-layer recovery, preventing delayed mobile assets from turning desert enemies into pixelated fallback blobs.",
    "Dune Archer bows now face their target correctly, enemy shadows sit beneath their feet, and the Upgrade Bench interaction footprint matches its raised artwork.",
    "Bow sound pitch now varies only downward from the original between 0.93x and 1.00x, while dragging over the inventory bag no longer enlarges the panel.",
  ],
  "0.495": [
    "Inventory items can now be dragged between the bag and compatible Equipment or Cosmetics slots with mouse and touch, while preserving tap selection, bag scrolling, and hold-to-inspect.",
    "Left-hand bows now mirror horizontally while preserving their downward aim instead of flipping upward.",
  ],
  "0.494": [
    "Attack cadence now uses one absolute timeline and stays armed while enemies change, preventing random slowdowns between targets.",
    "Bow windup, animation, projectile release, remote boss attacks, and duel animation now share deterministic timestamp rules.",
    "Left-hand bows angle downward correctly, and item inspection now opens after a 0.6-second hold.",
    "A compact automatic version label now appears beneath the minimap above the respawn ad.",
  ],
  "0.493": [
    "Gameplay now advances on a fixed 60 Hz simulation clock, keeping movement, physics, and attack rates consistent through render-frame drops and Low Performance mode.",
    "Brief foreground stalls receive bounded catch-up while pauses and backgrounding reset timing without queued combat bursts.",
  ],
  "0.492": [
    "Item upgrades now scale only each item's additive stat bonuses, keeping the universal 1× baseline unchanged.",
  ],
  "0.491": [
    "Duels now render equipped bows and stones with their real projectile visuals, directions, and attack-speed-scaled weapon animations.",
    "High attack speeds now match the displayed attacks per second instead of silently dropping throws behind a fixed windup.",
  ],
  "0.490": [
    "Profile stat equations now evenly space base values, tech percentages, equipment multipliers, and final totals without covering their labels.",
  ],
  "0.489": [
    "Profile stats now use compact one-line Camel Case equations without Base, Equipment, or Total labels.",
    "Duel results now credit blocked damage to the armored defender, including corrected existing replay totals.",
  ],
  "0.488": [
    "Foraging and Prosperity Stat Gain bonuses now scale every boss stat reward and its displayed value.",
    "Power now uses the same research, equipment, and upgrade calculation across profiles, leaderboards, HUD and overhead labels, remote players, and chat.",
    "Inventory items now select on press so a two-second hold opens details without requiring release first.",
  ],
  "0.487": [
    "Improved leaderboard and chat readability with 44px player rows, roomier message spacing, and larger maximized-chat portraits.",
  ],
  "0.486": [
    "Movement speed now applies Trailblazer Boots, every Move Speed research rank, and durable developer overrides consistently to local movement and remote-player prediction without save resets or correction jumps.",
    "Developer Move Speed overrides can now be cleared by entering 0, returning the player to normal equipment-based speed before research.",
    "Equipping an inventory item now clears its selection, while unequipping no longer highlights every empty bag slot.",
  ],
  "0.485": [
    "Inventory now opens with no selected item, while a reusable standalone item-details window opens only after a continuous two-second hold without interfering with normal tap-to-equip controls.",
    "Active research progress now fills naturally from left to right as elapsed time increases.",
    "Transient mobile disconnects now show Reconnecting instead of a false Game Updating screen, and stale deployed-version responses can no longer trigger update reloads.",
  ],
  "0.484": [
    "The Upgrade Bench now has a distinct Add Item screen whose BACK closes the workbench, while Upgrade appears only after selecting an item.",
  ],
  "0.483": [
    "The Upgrade Bench now forgets prior selections and opens a fresh item list whenever no upgrade is active, including after completion or cancellation.",
  ],
  "0.482": [
    "Upgrade Bench now confirms the exact touch position with the server before starting an upgrade, preventing false Touch the Upgrade Bench first rejections.",
  ],
  "0.481": [
    "Upgrade Bench BACK now returns to item selection whenever no upgrade is active and stays hidden while an upgrade is running.",
  ],
  "0.480": [
    "Upgrade Bench item choices now preview every exact before-and-after stat change before selection.",
    "A 44px BACK button beneath Upgrade or Cancel now closes the Upgrade Bench without interrupting an active upgrade.",
  ],
  "0.479": [
    "Upgrade Bench levels now add twenty percent of each item's original full stat multiplier, keeping previews, inventory, profiles, combat, and server results consistent.",
    "Returning after a suspended tab now recovers stalled connections automatically instead of remaining stuck on Reconnecting.",
    "Leaderboard tabs retain their stat-colored text without button fills or borders, while the full leaderboard window changes tint for the selected stat.",
  ],
  "0.478": [
    "Toolbar icons retain their original artwork while the Leaderboard, Tech Tree, Inventory, and Settings button backgrounds now use distinct gold, blue, brown, and grey tints.",
  ],
  "0.477": [
    "Canceling an Upgrade Bench job now asks for confirmation, forfeits unfinished progress toward the next level, and immediately returns the unchanged item.",
    "Opening any fullscreen game window now minimizes expanded chat, while toolbar icons use distinct gold, blue, brown, and grey tints.",
    "Leaderboard tabs now tint their text and backgrounds by stat, and the Upgrade Bench shadow sits closer beneath the sprite.",
  ],
  "0.476": [
    "The Snowlands Upgrade Bench now opens on contact with a focused fullscreen menu for upgrading stat-bearing weapons and armor from +1 through +10.",
    "Upgrades persist on the server, begin at three minutes, grow forty percent longer per level, add +0.20 to every defined item stat per level, and can be paused to immediately return the item.",
    "Inventory items are now unique instead of stackable; independent loot rolls still occur and clearly report Already Owned when a duplicate succeeds.",
    "Upgrade levels and effective stats now appear throughout inventory, profiles, combat, leaderboards, and the world bench display, with improved bench sprite grounding.",
  ],
  "0.475": [
    "Restored version notes on the sign-in screen with GitHub-verified release dates, and future releases now record their exact date automatically.",
  ],
  "0.474": [
    "Snowlands now has a shadowed, depth-sorted Upgrade Bench beside the portals with a floating label.",
    "Successful item-drop reveals now settle at the upper 30 percent of the game view for better visibility.",
    "Fixed 60 FPS scheduling from accidentally falling to every-other-frame cadence while Low Performance mode remains capped at 30 FPS.",
  ],
  "0.473": [
    "Inventory bags no longer show copies assigned to Equipment or Cosmetics, and using the same item in both loadouts now requires a separate owned copy.",
    "Item inspection now expands into a larger overlay without resizing, shifting, or padding the inventory slot grid.",
  ],
  "0.472": [
    "Inventory now includes a Cosmetics tab where owned items can visually override equipped gear without consuming items or changing stats.",
    "Cosmetic outfits now persist and appear consistently on local and remote players, inventory and profile previews, leaderboard podiums, duels, and replays.",
  ],
  "0.471": [
    "Settings now include a persistent SFX volume slider that controls bow and death sounds independently from music.",
    "Bow attacks now use a wider seven-percent pitch variation for more natural shot-to-shot sound.",
  ],
  "0.470": [
    "Bow and Frost Bow attacks now play the new release sound exactly when arrows launch, with one sound per attack even for multishot.",
    "Bow audio is professionally mixed with a short fade, subtle pitch variation, overlap limits, and the existing volume and mute control.",
  ],
  "0.469": [
    "Successful enemy and boss item drops now appear as queued, glowing item reveals with the item sprite, name, quantity, and stats.",
    "Inventory item details now overlay bag slots without shifting the layout, while only the slot grid scrolls and its scrollbar stays hidden.",
    "Functional UI text now follows an 11px readability floor with scalable type tokens and increased-contrast support, and every tab is 44px tall.",
  ],
  "0.468": [
    "World chat history now remains available for 24 hours, with duel replays retained for matching chat entries.",
    "Toolbar press feedback no longer competes with the green open-window highlight.",
  ],
  "0.467": [
    "Made Chat, Leaderboard, and Settings fullscreen above the toolbar.",
    "Added a red BACK button and touch-friendly 44px chat controls and message rows.",
    "Refined toolbar navigation with persistent active states, swapped Leaderboard and Inventory positions, and cleaner Inventory and Tech Tree labels.",
  ],
  "0.466": [
    "Inventory and equipment slots are 25% smaller exact squares, and the inventory preview no longer shows Power.",
    "Grass now fills the complete loadout behind equipment, with a seamless borderless character preview.",
    "Inventory, Tech Tree, Leaderboard, Settings, and Developer Tools now toggle closed from their toolbar buttons while full windows stay above the dock.",
    "The bottom toolbar now has a 30px lighter-layer cushion with intact dividers, while the player HUD and minimized chat use square upper-right corners.",
  ],
  "0.465": [
    "Toolbar buttons now sit above an additional 10px bottom cushion while chat and gameplay reserve the full dock height.",
    "Equipped-item slots are exact 1:1 squares matching bag slots at every responsive size, with the character preview resized around them.",
    "The leaderboard top-three podium now uses a grass-green backdrop matching the inventory character preview.",
  ],
  "0.464": [
    "Inventory now opens as a fullscreen dark game window with a grass-backed, vertically centered character preview, a hidden scrollbar, and cleaner item guidance.",
    "Inventory, Tech Tree, Leaderboard, and Settings now form a one-handed bottom dock; chat and the playable canvas sit fully above it while the dock owns device safe-area padding.",
  ],
  "0.463": [
    "Inventory now uses an intuitive paper-doll loadout above a four-column bag, with visible item names, fixed-size stack badges, and direct equip, hand-switch, and unequip actions.",
    "An animated equipped-character preview and equipment-aware Power now sit inside a warm off-white mobile layout with compatible-slot highlighting and responsive touch targets.",
  ],
  "0.462": [
    "Leaderboard podiums now use a clean white backdrop, taller character previews seated directly on the steps, usernames only, and no ground shadows.",
    "Left-hand bows now mirror along the correct axis with reversed offsets so they point toward the player's facing and combat target direction.",
  ],
  "0.461": [
    "Every leaderboard tab now shows animated snapshots of its current top three players above the rankings, with first place centered, second on the right, and third on the left.",
    "Frostclaw now independently has a 1-in-5 chance per qualifying player to drop stackable Frost Armor, which doubles max health and regeneration and appears throughout equipment, profiles, and multiplayer.",
    "Bows now use the tuned hand offset and correctly mirrored sprite alignment when equipped in either hand or viewed from either direction.",
  ],
  "0.460": [
    "Frostclaw now has a 1-in-25 chance per qualifying player to drop a stackable Frost Bow using the original transparent blue vendor art.",
    "Frost Bow provides 3× base damage and 1.2× base attack speed, adds its bonuses to tech multipliers, and renders throughout inventory, profiles, duels, and local or nearby combat.",
    "Chat portraits no longer revert to the default image after opening and closing that player's profile.",
  ],
  "0.459": [
    "iOS-safe HP text now stays vertically centered in the HUD and floating health bars.",
    "Updated the duel replay play medallion art.",
  ],
  "0.458": [
    "crop fix 2",
  ],
  "0.457": [
    "Text cropping bug fixes",
  ],
  "0.456": [
    "Skeleton and Dune Archer bows now rotate from the character's grip to aim directly at players in every direction.",
  ],
  "0.455": [
    "Bow now renders only slightly larger than its original character size instead of using the oversized full source dimensions.",
    "Profile stats now include equipped Bow damage and attack speed plus Wooden Armor max health for local and inspected players.",
  ],
  "0.454": [
    "Equipped items now stay selected for inspection, equipment sits in a compact row above the bag, and stacked item badges cannot resize inventory slots.",
    "Bow now renders at full source size, while every held weapon gets subtle mirrored running sway for local and nearby players.",
    "Duel announcements now use one universal challenger-first rule, so every viewer sees who challenged, beat, or lost to whom in the same words.",
  ],
  "0.453": [
    "Bow and Wooden Armor now drop independently from Tutorial Forest enemies at a 1-in-25 rate and stack into single inventory slots.",
    "Bow adds 0.05 to damage and attack-speed multipliers, while Wooden Armor adds 0.05 to max-health multiplier across world combat and duels.",
    "Combat locks local and nearby-player facing toward targets, Bow follows the target from either hand, and equipped slots can be selected like bag slots.",
  ],
  "0.452": [
    "Rock remains every player's unchanged starter weapon; Bow is a separate developer-only inventory item with larger mobile-readable art and arrow visuals.",
    "Inventory and inspection sprites render correctly again, selected items toggle off, and tapping free window space clears selection while valid equipment slots still equip.",
    "The Tech Tree is compact again with one node per upgrade, cumulative saved ranks, and the same long research depth.",
  ],
  "0.451": [
    "The full 36-node Tech Tree is restored with cumulative rank bands, mobile-sized spacing on every screen, and no rank-reset presentation.",
    "One rank in each predecessor now permanently unlocks the next technology, so every unlocked upgrade can be researched through its full grind.",
    "The selected FA_WP_Main_Bow_011_Brown art and visible arrow presentation were added through the modular equipment system.",
    "Equipment now uses shared gameplay and client presentation registries, while mobile-first design and testing are explicit project requirements.",
  ],
  "0.450": [
    "The Tech Tree is compact again: one node per upgrade, cumulative rank totals, and the same long research grind without repeated Stage sections.",
    "Players who completed the original tree keep Critical Damage rank 4 and receive the first five Regen ranks, reopening continued research immediately.",
  ],
  "0.449": [
    "The Tech Tree now includes Regen research and four full progression stages, giving every existing technology three additional tiers to pursue.",
    "Nearby players now visibly throw their real server-confirmed attacks at shared bosses without inventing attacks for idle or background players.",
  ],
  "0.448": [
    "Advanced Lava Lake is the new display name, while every map label and window heading now uses consistent Title Case.",
  ],
  "0.447": [
    "Advanced Lava Lake now plays the looping Night Ambient 5 soundtrack.",
    "Player death now plays the dedicated Death sting through the existing music volume and mute control.",
    "Lava Lake enemy damage has been tripled again, reaching thirty times its original launch tuning.",
  ],
  "0.446": [
    "Lava Lake enemies now deal ten times more damage for a sharper advanced-map challenge.",
    "Lava rocks and charred trees no longer cast ground shadows, and the short wide charred stump variant has been removed.",
  ],
  "0.445": [
    "Advanced Lava Lake is now open beyond Snowlands, with molten pools, volcanic rocks, charred trees, and five new enemy tiers using the existing stat-scaling curve.",
    "Defeating Frostclaw now unlocks a server-validated Snowlands portal and reveal cutscene, with bidirectional travel between Snowlands and Lava Lake.",
  ],
  "0.444": [
    "Nearby players now update headwear, armor, boots, and both hands after equipment changes, including bare-head and empty-hand states, without expanding movement frames.",
    "The leaderboard is taller again, landing halfway between its original and compact heights on desktop and mobile.",
  ],
  "0.443": [
    "Floating player, enemy, and boss health numbers now sit optically centered inside their bars on mobile.",
  ],
  "0.442": [
    "Sign-in controls now stay fixed when update notes close, the WildStat logo floats more visibly, the leaderboard is 40% shorter, and the death title is 30% smaller.",
    "Floating health text is visually centered, overhead gender symbols keep their intended proportions, and screen shake no longer exposes cached world-tile seams.",
  ],
  "0.441": [
    "A new candy-style crossed-swords icon now follows Power values, while HUD Power sits directly beside the player name for faster mobile scanning.",
    "Profiles now use a compact gender picker above the player preview, window titles display in lowercase, and leaderboard and sign-in presentation is steadier and cleaner.",
  ],
  "0.440": [
    "Player profiles now include persistent male and female symbol choices, shown beside player names throughout the HUD, world, chat, profiles, rankings, boss results, duels, replays, and sign-in.",
  ],
  "0.439": [
    "The game now uses one lightweight Canvas renderer while keeping worker-built world tiles, reducing the client download substantially.",
    "Floating player and enemy health text is now vertically centered inside HP bars.",
  ],
  "0.438": [
    "The sign-in sound icon is larger and now floats cleanly without a border or background.",
  ],
  "0.437": [
    "Sign-in and loading screens now use an illustrated WildStat battle scene showing the portal, monsters, and stat gains.",
  ],
  "0.436": [
    "The sign-in screen now plays Light Ambient 4 and has a quick mute or unmute button in the top-right corner.",
    "Intermediate Snowlands now plays Ambient 10, and music volume works reliably through the Web Audio path used by iOS.",
    "Static world tiles now use a PixiJS WebGL layer when available, with an automatic Canvas fallback for compatibility.",
    "The death screen now counts down and returns players to spawn automatically after five seconds.",
    "Duel chat announcements show the displayed player's power, and replay rows open only from expanded chat.",
  ],
  "0.435": [
    "Enemy separation, attack targeting, and projectile collision now use spatial grids, while static decor is pre-sorted and offscreen players and cacti are removed before depth sorting.",
    "Static world tiles now paint in a background worker with a safe fallback; the minimap refreshes at 8 Hz and world text reuses cached rasterized labels instead of rebuilding every frame.",
    "Particles, damage numbers, player projectiles, and enemy shots now reuse bounded pools, preventing combat bursts from creating unbounded client work.",
  ],
  "0.434": [
    "Live duels now carry both frozen player names, keeping arena nameplates and the duel HUD correct after nearby profile subscriptions change.",
    "Live and replay duel combatants now render fully opaque instead of using translucent remote-player styling.",
  ],
  "0.433": [
    "Profile stats now scroll inside the existing profile window height with the scrollbar hidden, preventing the Stats tab from stretching the window.",
  ],
  "0.432": [
    "Nearby-player subscriptions now retire each old query before starting its replacement, preventing SpacetimeDB client-cache reference warnings during sustained movement and large realistic load tests.",
    "Virtual-player shutdown now closes each socket directly instead of racing redundant unsubscribe messages against disconnect, keeping intentional test cleanup out of protocol-error telemetry.",
    "Frostclaw rewards now grant +72M damage and +270M max health while retaining the existing +75K armor reward.",
  ],
  "0.431": [
    "Large virtual-player tests now use a sharded Node runner with movement-only, realistic, and dense-zone modes, avoiding Chromium's roughly 255-WebSocket ceiling while the browser smoke test stays safely capped at 200.",
    "Realtime frame publishing now tracks tiny per-map population rows and range-scans only movement changed since the previous tick instead of repeatedly scanning every motion and identity row.",
    "Minimap frames stay exact through 256 visible players, then spatially aggregate into a bounded 16×16 marker grid so map-wide bandwidth no longer grows quadratically with full player count.",
  ],
  "0.430": [
    "Frostclaw animation frames now share a stable ground anchor, eliminating sideways drift while aligning his sprite, shadow, and nameplate with the collision position.",
  ],
  "0.429": [
    "Frostclaw now uses crisp flat-shaded white pixel art, clean animation-frame seams, and a grounded shadow beneath his feet.",
  ],
  "0.428": [
    "Frostclaw now guards the Intermediate Snowlands with Glacial Roar knockback, targeted Icefall, and three-lane Rift Claws attacks; defeating the third boss grants +15M damage, +50M max health, and +75K armor.",
    "Tiny pixel-art boss and portal indicators now mark key locations on every minimap, including locked portals and defeated bosses.",
    "The Tech Tree notification now disappears when every research node is maxed and no research can be started.",
    "Player profiles now keep cross-map online presence separate from nearby rendering and record accurate last-seen time during orphan cleanup.",
  ],
  "0.427": [
    "A transparent crossed-swords battle icon now replaces the Power label above players and in the HUD, while chat shows each sender's power beside their username.",
    "Virtual-player tests now stop the whole client pool on the first server protocol cutover, preventing stale startup retries and misleading disconnect storms during a release.",
  ],
  "0.426": [
    "Portals now submit the exact client-authoritative trigger position with the map change, removing false move-closer errors and delayed transitions caused by sparse movement heartbeats.",
  ],
  "0.425": [
    "Virtual-player load tests now start through a bounded 16-client pool with acknowledgement-aware backoff, making large tests much faster while still exercising burst joins safely.",
    "Virtual players no longer fetch the full on-demand leaderboard during startup, matching normal player joins and removing an obsolete source of server work.",
  ],
  "0.424": [
    "Movement now sends keyboard changes, meaningful touch steering, and one-second corrections instead of continuous position updates; idle players send no movement traffic.",
    "Remote players extrapolate from compact direction vectors and smoothly absorb each client-authoritative position correction.",
    "Power now keeps increasing beyond 4.29 billion, and scalable health, damage, armor, and regeneration stats support values through undecillion while movement and attack speed caps remain unchanged.",
    "Movement-frame subscriptions now use map and zone indexes, and virtual-player tests exercise the same sparse movement path through 3,000 clients.",
  ],
  "0.423": [
    "Multiplayer movement now uses compact shared position frames, sharply reducing repeated server transactions and subscriber fanout as player counts grow.",
    "Two-player sessions keep immediate smooth updates, while larger groups share one 10 Hz zone stream and a lightweight 1 Hz map-wide minimap snapshot.",
    "Player identity and profile data now travel on cold snapshot paths, and virtual-player cleanup removes stale movement, minimap, profile, and ranking state.",
  ],
  "0.422": [
    "Virtual-player startup now uses a private run ticket claimed through each bot's own confirmed connection, removing the cross-connection authorization race.",
    "Bots now wait for reducers and initial subscriptions before launching the next client, retry transient failures three times, and slow the ramp automatically under load.",
    "Active virtual players still send full movement, saves, and subscription traffic, while stop, disconnect, and maintenance cleanup remain automatic.",
  ],
  "0.421": [
    "Remote players now show only name and power; removing live HP bars and HP uploads cuts an unnecessary realtime server lane.",
    "Developer load tests now accept 1–3,000 virtual players and enforce the limit with a constant-time owner counter instead of repeated full-table recounts.",
    "A persistent FPS Display setting shows Game FPS and Work FPS directly beneath the toolbar.",
  ],
  "0.420": [
    "Active account and guest sessions now resume automatically after a forced game update instead of stopping at the sign-in screen.",
    "Developer Tools can launch disposable virtual players that use real connections, movement, subscriptions, and progress saves for server load testing.",
    "Virtual-player data stays out of rankings and is erased when the test stops, its owner disconnects, or server maintenance finds an orphaned test.",
  ],
  "0.419": [
    "A new glowing 2× Respawn button beneath the minimap grants 15-second regular-enemy respawns for 30 minutes after a rewarded ad.",
    "Browsers use a 30-second black ad timer, earned boost time survives refreshes and app backgrounding, and native apps have a typed iOS/Android rewarded-ad bridge.",
    "Duel victory and defeat overviews now compact-format attacks, damage, regeneration, and blocked damage.",
  ],
  "0.418": [
    "Remote movement now uses camera-aware subscriptions, adaptive buffering, and a private observer signal so nearby players stay smooth even while the developer is invisible.",
    "Nearby health stays live without idle HP traffic; enemy reward saves now batch instead of sending a full progress row per kill.",
    "Research completes automatically, repairs missing schedules, shortens legacy overlong timers, and cleanly removes the retired Tier II path.",
    "Reconnects preserve map position, pause behind the correct update screen, and settle profile, ranking, and replay loads safely.",
    "Duels now snapshot equipped items and researched combat bonuses, finish server-side if a browser backgrounds, and keep equipment in replays.",
    "Android chat now uses a bundled rounded font matching the polished iOS look.",
  ],
  "0.417": [
    "Server disconnects now use the normal GAME UPDATING screen; once the server socket returns, it switches to RECONNECTING until player data is ready.",
  ],
  "0.416": [
    "A live server disconnect now freezes the game and shows GAME UPDATING · RECONNECTING until the new session fully hydrates, instead of leaving a playable-looking zero-player world.",
  ],
  "0.415": [
    "Minimap player dots use one lightweight map-wide feed while full health and movement data stays limited to nearby players.",
    "Profiles load one leaderboard snapshot on spawn; reconnecting snapshot/profile requests now settle cleanly, and research timers recover from reset or account-link edge cases.",
    "Duels snapshot both combatants' equipped items. Critical hits are now yellow, 10% larger, start at ×1.05, and unlock a connected four-rank Critical Damage node.",
  ],
  "0.414": [
    "Nearby players now use a 20 Hz confirmed-snapshot buffer with no forward prediction, removing small movement rubberbands.",
    "Health updates now run only near other players and are capped at eight per second; distant players are excluded from map subscriptions.",
    "Reconnect screens pause world simulation, developer visibility persists across sessions, and cancelled profile requests settle cleanly.",
  ],
  "0.413": [
    "Leaderboard now opens at full size with a loading spinner while its one-time server snapshot arrives.",
    "Remote movement ignores health-only player updates, preventing duplicate movement samples and jerky nearby players.",
    "World touch controls work outside open modal windows.",
  ],
  "0.412": [
    "Fixed leaderboard snapshots so reopening always requests a fresh server ranking.",
  ],
  "0.411": [
    "Leaderboards now load one server snapshot when opened, then stay fixed until reopened instead of rebuilding during combat updates.",
  ],
  "0.410": [
    "Nearby players now sync current health to the server, so their overhead health bars reflect damage and regeneration.",
    "Research now finalizes automatically at the server timer; completed legacy Critical Chance research is migrated and completed on reconnect.",
    "Removed the unused LEGS equipment slot.",
  ],
  "0.409": [
    "Snowlands balance updates reduce Frost Raider and Glacier Archer health, increase Rime Guard armor rewards, and raise the Whiteout Reaper damage reward.",
    "Snow pines now cast grounded shadows and depth-sort around players; enemy health bars show numeric values without an HP suffix.",
    "Tech Tree replaces the Tier II gate with a fresh five-rank Prosperity Stat Gain research, and research rank labels are twice as large.",
    "Player deaths now record in the server-backed lifetime stats table for future profile displays.",
  ],
  "0.408": [
    "Spider rewards now update your overhead Max Health and Power labels immediately when the confirmed result arrives.",
    "Remote movement keeps a stable receive-time timeline while using server timestamps to order batched snapshots.",
  ],
  "0.407": [
    "Fixed rapid movement taps causing remote players to predict too far, then snap back.",
  ],
  "0.406": [
    "Remote players now use server-timestamped interpolation, adaptive buffering, and brief capped prediction for smoother movement.",
    "Left-hand stones now correctly render behind the player while facing right.",
  ],
  "0.405": [
    "Nearby player movement now switches to smooth high-rate updates from twice as far away.",
  ],
  "0.404": [
    "Fixed duel-loss chat entries using the losing player's own portrait and profile link.",
    "Move Speed research now validates correctly on the server without unsupported-speed errors.",
  ],
  "0.403": [
    "Equipped weapons now control auto attack, show on duel players, and visibly switch hands.",
    "Profile stats now show final values with every bonus, including neutral +0% and ×1.00 rows.",
  ],
  "0.402": [
    "Every player now starts with a Starter Stone in the right-hand inventory slot, and inventory selections clear from empty bag slots.",
  ],
  "0.401": [
    "Fixed the startup controller order that could leave the game stuck on Connecting.",
  ],
  "0.400": [
    "Added Move Speed research and two inventory hand slots for future left- and right-hand weapons.",
    "Returning after a long background pause now shows a reconnecting overlay while the game restores its session.",
    "Improved account loading flow, profile and inventory interaction, and runtime structure.",
  ],
  "0.399": [
    "Idle offscreen enemies now simulate at 12 Hz while nearby or engaged enemies remain full-rate; offscreen enemies are culled before depth sorting.",
  ],
  "0.398": [
    "Desert Spider rewards now grant +75K Damage and +200K Max Health to every contributor, while Blight Oracle rewards now grant +320 Regen.",
  ],
  "0.397": [
    "Frost Raider damage reduced by 50%, and enemy reward labels now show bonus fractions such as +1.05 damage.",
  ],
  "0.396": [
    "Research timers now grow 40% per rank from each tech’s own starting time; deeper Tech Tree nodes begin with longer server timers.",
  ],
  "0.395": [
    "Tech Tree nodes now keep their mobile-sized width on desktop, with more vertical room between each row.",
  ],
  "0.394": [
    "Screen vignette now begins near your attack range, the developer panel shows Work FPS alongside real FPS, and stat bonuses show their base value and percentage.",
  ],
  "0.393": [
    "Tech Tree now has more future-node space for scrolling, while player stats show active Tech Tree bonuses.",
  ],
  "0.392": [
    "Tech Tree connectors now scroll with their nodes across the full tree.",
  ],
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
    "Intermediate Snowlands is open as WildStat's third map through the second portal in Beginner Desert.",
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
    "World Chat replay buttons now use the custom WildStat play medallion",
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
    "Beginner Desert added as WildStat's second multiplayer map",
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
    "New WildStat app icon and settings icon added",
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

export const RELEASE_DAYS: Record<string, string> = {
  "0.629": "2026-09-04",
  "0.628": "2026-09-04",
  "0.627": "2026-09-04",
  "0.626": "2026-09-04",
  "0.625": "2026-09-04",
  "0.624": "2026-09-04",
  "0.623": "2026-09-04",
  "0.622": "2026-09-04",
  "0.621": "2026-09-04",
  "0.620": "2026-09-04",
  "0.619": "2026-09-04",
  "0.618": "2026-09-03",
  "0.616": "2026-09-03",
  "0.614": "2026-09-03",
  "0.613": "2026-09-03",
  "0.612": "2026-09-03",
  "0.611": "2026-09-03",
  "0.610": "2026-09-03",
  "0.609": "2026-09-03",
  "0.608": "2026-09-03",
  "0.607": "2026-09-03",
  "0.606": "2026-09-03",
  "0.605": "2026-09-03",
  "0.604": "2026-09-03",
  "0.603": "2026-09-02",
  "0.602": "2026-09-02",
  "0.601": "2026-09-02",
  "0.600": "2026-09-02",
  "0.599": "2026-09-02",
  "0.598": "2026-09-02",
  "0.597": "2026-09-02",
  "0.596": "2026-09-02",
  "0.595": "2026-09-02",
  "0.594": "2026-09-02",
  "0.592": "2026-09-02",
  "0.591": "2026-09-02",
  "0.590": "2026-09-02",
  "0.589": "2026-09-02",
  "0.588": "2026-09-02",
  "0.587": "2026-09-02",
  "0.586": "2026-09-02",
  "0.585": "2026-09-02",
  "0.584": "2026-09-01",
  "0.583": "2026-09-01",
  "0.582": "2026-09-01",
  "0.581": "2026-09-01",
  "0.580": "2026-09-01",
  "0.579": "2026-09-01",
  "0.578": "2026-09-01",
  "0.577": "2026-08-30",
  "0.576": "2026-08-30",
  "0.575": "2026-08-30",
  "0.574": "2026-08-30",
  "0.573": "2026-08-30",
  "0.572": "2026-08-30",
  "0.571": "2026-08-30",
  "0.570": "2026-08-29",
  "0.569": "2026-08-29",
  "0.568": "2026-08-29",
  "0.567": "2026-08-29",
  "0.566": "2026-08-29",
  "0.565": "2026-08-29",
  "0.564": "2026-08-29",
  "0.563": "2026-08-29",
  "0.562": "2026-08-29",
  "0.561": "2026-08-29",
  "0.560": "2026-08-29",
  "0.559": "2026-08-29",
  "0.558": "2026-08-29",
  "0.557": "2026-08-29",
  "0.556": "2026-08-28",
  "0.555": "2026-08-28",
  "0.554": "2026-08-28",
  "0.553": "2026-08-28",
  "0.552": "2026-08-28",
  "0.551": "2026-08-28",
  "0.550": "2026-08-27",
  "0.549": "2026-08-27",
  "0.548": "2026-08-27",
  "0.547": "2026-08-27",
  "0.546": "2026-08-27",
  "0.545": "2026-08-27",
  "0.543": "2026-08-27",
  "0.542": "2026-08-27",
  "0.541": "2026-08-27",
  "0.538": "2026-08-27",
  "0.537": "2026-08-27",
  "0.536": "2026-08-27",
  "0.535": "2026-08-27",
  "0.534": "2026-08-26",
  "0.533": "2026-08-26",
  "0.532": "2026-08-26",
  "0.531": "2026-08-26",
  "0.530": "2026-08-26",
  "0.529": "2026-08-26",
  "0.528": "2026-08-26",
  "0.527": "2026-08-26",
  "0.526": "2026-08-26",
  "0.525": "2026-08-26",
  "0.524": "2026-08-26",
  "0.523": "2026-08-26",
  "0.522": "2026-08-26",
  "0.521": "2026-08-25",
  "0.520": "2026-08-25",
  "0.519": "2026-08-25",
  "0.518": "2026-08-25",
  "0.517": "2026-08-25",
  "0.516": "2026-08-25",
  "0.515": "2026-08-25",
  "0.514": "2026-08-25",
  "0.513": "2026-08-25",
  "0.512": "2026-08-25",
  "0.511": "2026-08-25",
  "0.510": "2026-08-25",
  "0.509": "2026-08-25",
  "0.508": "2026-08-25",
  "0.507": "2026-08-25",
  "0.506": "2026-08-25",
  "0.505": "2026-08-25",
  "0.504": "2026-08-25",
  "0.503": "2026-08-24",
  "0.502": "2026-08-24",
  "0.501": "2026-08-24",
  "0.500": "2026-08-24",
  "0.499": "2026-08-24",
  "0.498": "2026-08-24",
  "0.497": "2026-08-24",
  "0.496": "2026-08-24",
  "0.495": "2026-08-24",
  "0.494": "2026-08-24",
  "0.493": "2026-08-24",
  "0.492": "2026-08-24",
  "0.491": "2026-08-24",
  "0.490": "2026-08-24",
  "0.489": "2026-08-24",
  "0.488": "2026-08-24",
  "0.487": "2026-08-22",
  "0.486": "2026-08-22",
  "0.485": "2026-08-22",
  "0.484": "2026-08-22",
  "0.483": "2026-08-22",
  "0.482": "2026-08-22",
  "0.481": "2026-08-22",
  "0.480": "2026-08-22",
  "0.479": "2026-08-22",
  "0.478": "2026-08-22",
  "0.477": "2026-08-22",
  "0.476": "2026-08-22",
  "0.475": "2026-08-22",
  "0.474": "2026-08-22",
};

function releaseDay(version: string) {
  if (RELEASE_DAYS[version]) return RELEASE_DAYS[version];
  const numericVersion = Number(version);
  if (numericVersion >= .472) return "2026-08-22";
  if (numericVersion >= .459) return "2026-08-21";
  if (numericVersion >= .456) return "2026-08-19";
  if (numericVersion >= .444) return "2026-08-18";
  if (numericVersion >= .431) return "2026-08-17";
  if (numericVersion >= .419) return "2026-08-16";
  if (numericVersion >= .409) return "2026-08-15";
  if (numericVersion >= .376) return "2026-08-14";
  if (numericVersion >= .278) return "2026-08-13";
  if (numericVersion >= .261) return "2026-08-12";
  return null;
}

export function releaseDate(version: string) {
  if (RELEASE_DATES[version]) return RELEASE_DATES[version];
  const day = releaseDay(version);
  if (!day) return "";
  const [year, month, date] = day.split("-").map(Number);
  const monthName = ["JAN", "FEB", "MAR", "APR", "MAY", "JUN", "JUL", "AUG", "SEP", "OCT", "NOV", "DEC"][month - 1];
  return monthName && Number.isInteger(date) ? `${monthName} ${date}, ${year}` : "";
}

export function releaseNotes(version: string) {
  return RELEASE_NOTES[version] ?? [];
}

export function recentReleaseNotes(days = 2, today = new Date(), minimumReleases = 10) {
  const cutoff = new Date(today);
  cutoff.setHours(0, 0, 0, 0);
  cutoff.setDate(cutoff.getDate() - Math.max(0, days - 1));
  const minimum = Math.max(0, Math.floor(minimumReleases));
  return Object.entries(RELEASE_NOTES)
    .sort(([a], [b]) => b.localeCompare(a, undefined, { numeric: true }))
    .filter(([version], index) => {
      if (index < minimum) return true;
      const day = releaseDay(version);
      return day !== null && new Date(`${day}T00:00:00`).getTime() >= cutoff.getTime();
    })
    .map(([version, notes]) => ({ version, notes, date: releaseDate(version) }));
}
