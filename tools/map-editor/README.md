# WildStat Map Editor

Double-click `Open WildStat Map Editor.command` at the repository root. The
launcher starts the local editor in the background and opens it in the default
browser. Its Terminal window can be closed after the browser opens.

- Select and drag paths, decorations, enemy camps, portals, the arrival point,
  boss marker, or Tutorial Forest's Trailblazer Boots pickup.
- Add items from the left panel. Use the inspector for exact coordinates,
  scale, variants, enemy formation, and colors.
- Use the mouse wheel to zoom and Space-drag to pan. Common undo, redo, copy,
  paste, duplicate, delete, and save keyboard shortcuts work.
- Saving an existing map writes its layout to `src/game/map-designs.json` and
  its shared gameplay coordinates to `shared/map-editor-overrides.ts`. The
  saved source takes effect in the next game build or release.
- New maps can start from a blank canvas or a copy of any game map and are
  saved as drafts. Drafts deliberately do not enter the live
  campaign until their enemies, boss, rewards, progression, and database rules
  are explicitly connected.
- Every save/revert writes a local recovery copy under
  `art-source/map-editor-backups/`; that folder is ignored by Git.

The editor only accepts local requests on `127.0.0.1`, validates all saved
coordinates and map objects, preserves the campaign portal route, and writes
source files atomically.
