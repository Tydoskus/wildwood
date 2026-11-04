# One-click tools

On Windows, double-click **Run Wildstat Local.bat**: it does what the macOS **Run Wildstat Local.command** below does. Only Node.js (LTS, from nodejs.org) has to be installed first; the SpacetimeDB CLI is installed if missing and switched to the version WildStat builds with.

On macOS, double-click the tool you need:

- **Open WildStat Map Editor.command** — edit existing maps or create new ones; Save writes the map changes into the repository.
- **Open Enemy Sprite Aligner.command** — align enemy sprite artwork.
- **Open Unity Sprite Exporter.command** — open a local Unity workspace to turn animated sprite prefabs into PNG sheets, preview them, and make a WebP bundle. [Guide](../tools/unity-sprite-exporter/README.md).
- **Run Wildstat Local.command** — install the SpacetimeDB CLI if it is missing, start the local database and live development server. Leave it open: CSS updates in place, code edits rebuild and refresh the tab, and server edits republish locally.
- **Release Wildstat.command** — run the guided production release workflow, including checks, commit, and push.
- **Publish Server.command** — build and publish the server module after a compatibility preflight; data is never cleared.

Keep these files inside this folder so they can find the project one level up. You can make a Finder alias for a tool you use often. The map editor has its own [guide](../tools/map-editor/README.md).
