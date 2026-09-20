# WildStat Google Play asset kit

Created September 12, 2026. Prepared files; not uploaded to the store listing.

## Upload files

- `icon-512x512.png`: existing WildStat app icon, 512 × 512 PNG.
- `feature-illustrated-1024x500.png`: primary illustrated feature graphic, 1024 × 500 PNG.
- `feature-gameplay-1024x500.png`: alternate feature graphic using the actual leaderboard podium, 1024 × 500 PNG. Choose one feature graphic.
- `screenshots/01-small-hero-big-numbers.png`: hero equipment and earned stats.
- `screenshots/02-pick-your-next-gain.png`: enemy zones, stat rewards, and item drops.
- `screenshots/03-your-home-more-power.png`: home courtyard with equipment upgrades and tech research.
- `screenshots/04-make-the-climb.png`: live leaderboard and podium.

All four phone screenshots are 1080 × 1920 PNG (9:16). Upload them in filename order. The ZIP contains only the upload assets and these notes. The editable layout is `render.html`; the visual gallery is `index.html`.

In Google Play Console: Grow users → Store presence → Main store listing → Graphics. The feature graphic is separate from phone screenshots. See [Google's preview asset guidance](https://support.google.com/googleplay/android-developer/answer/9866151?hl=en-GB).

## Creative direction

The set uses small-versus-large contrast, aspiration, visible progression, choice of rewards, and a competitive goal. One short headline per screenshot keeps the promise readable at store thumbnail size. Lime, cyan, warm stone, and gold identify each benefit while typography, margins, rounded frames, branding, and footer stay consistent.

The illustrated feature is promotional key art. The four screenshot panels and the alternate podium graphic are real WildStat web-client captures from version 0.657, made at a 480 × 854 mobile viewport and cropped/scaled into the layouts. Their numbers, item names, characters, and interfaces are unchanged. The hero is the publicly viewable rymel profile; leaderboard names and values are the actual captured standings. Captures omit chat. They are not Android device captures. Source PNGs are retained in `source/` for future revisions.

These are creative hypotheses, not claims about measured conversion or Last War's internal marketing strategy. No fabricated reviews, rankings, player counts, bonuses, or unrelated puzzle gameplay were added. The rank numbers in the podium are in-game standings.

## Generation record

Mode: built-in image generation. The illustration used the existing WildStat icon, the user's leaderboard character reference, and the game's red dragon sprite sheet. The generated original is preserved as `source/feature-illustration-original.png`; the final was resized to the Play feature dimensions. Screenshot and alternate-banner layout use deterministic HTML/CSS and the bundled Nunito font.

Prompt:

> Use case: ads-marketing. Create a polished illustrated Google Play feature graphic for the fantasy multiplayer game WildStat. Output a wide 2.048:1 landscape composition intended for 1024x500. Reference 1 supplies WildStat's electric lime and blue brand palette, reference 2 the exact simple chibi archer character design (black thick outlines, round tan face, oversized horned dark helmet, purple bow); reference 3 supplies the red horned dragon boss design; it is a sprite sheet so depict ONE dragon, ignore its green chroma background. Dramatic encounter: large recognizable chibi archer on the left drawing purple bow, towering red dragon on right with readable silhouette and glowing orange chest, rich emerald fantasy forest, golden arrow streak leading across the scene. Clear exciting scale contrast, uncluttered three-part composition, beautifully finished bold 2D mobile-game key art, not realistic. Center upper-middle giant title exactly 'WILDSTAT', chunky rounded cream-white lettering with dark outline, lime-to-cyan accent details tied to reference icon. Under it one compact line exactly 'GROW STRONGER. GO FURTHER.' Place all text in central safe zone, generous 60px edge margin. No fake UI, no review stars, no install buttons, no badges, no other text, no invented game mechanics. Keep major subjects inside center 85% of frame, background may bleed. This is promotional illustration, preserve the game's cute simple character style rather than realistic warriors.

Reference paths:

- `public/assets/wildstat/wildstat-app-icon-512.png`
- `/var/folders/mx/vv_f3zx10mj3ntmvshsq8xbr0000gn/T/codex-clipboard-1075644a-7c2d-4d7c-806f-3a608a4024d3.png`
- `public/assets/wildstat/dragon_boss_spritesheet.png`

To render revisions, serve this directory locally, open `render.html?view=hero`, `map`, `home`, or `leader` at a 1080 × 1920 viewport, and export the viewport PNG. Open `render.html?view=feature` and export the 1024 × 500 rectangle for the alternate feature graphic. The source captures must stay beside the renderer.
