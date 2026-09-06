# Mobile-First Product Contract

WildStat targets mobile browsers first. Desktop support is useful compatibility work, not primary product direction.

## Release gates

- Design and verify narrow portrait layouts before desktop layouts.
- Keep interactive targets touch-sized, safe-area aware, and usable without hover.
- Keep primary combat, inventory, settings, profile, leaderboard, and research flows reachable one-handed where practical.
- Preserve readable silhouettes, labels, health bars, stat gains, and equipment at actual phone size.
- Avoid desktop-only spacing expansion. Wider screens may add breathing room around a mobile-sized content column, but must not spread related controls or Tech Tree nodes apart.
- Treat low-end-phone frame time, memory, network usage, asset decode cost, and battery impact as performance constraints.
- Keep worker-built tile caching and the shared WebGL/Canvas2D rendering pipeline described in `mobile-performance.md`; justify rendering changes with measured low-end-device results.
- Test touch scrolling, touch steering, safe-area insets, orientation changes, background/resume behavior, mute behavior, and browser lifecycle saves.

## Desktop scope

Desktop should remain functional with keyboard, mouse, common viewport sizes, and accessible focus behavior. Desktop-specific changes must not alter mobile gameplay balance, mobile geometry, touch targets, asset weight, or renderer complexity without a measured mobile benefit.

## QA order

1. Narrow portrait phone viewport.
2. Representative low-end physical phone.
3. Larger phone and tablet.
4. Desktop compatibility viewports.

## QA ownership

- Project owner performs all visual appearance and play-feel acceptance testing, including final checks on physical mobile devices.
- Coding agents run automated logic, type, build, migration, protocol, and asset-path checks by default. Do not spend release time on extended visual testing unless project owner explicitly requests it.
- Handoffs must call out visual or play-feel changes that still need project-owner review; automated checks never claim visual approval.

Document exceptions beside the feature. Include reason, mobile impact, and removal condition.
