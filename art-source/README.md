# Art source files

Non-runtime vendor art lives here. This directory is deliberately outside `public/`, so Vite does not copy it into `dist/` or the GitHub Pages artifact.

Use these folders as a one-way promotion pipeline:

- `inbox/` for old sprites and art that has not been reviewed yet.
- `vendor/` for original asset packs, preserving their relative paths.
- `generated/` for generated candidates and working source images.
- `unity-workspace/` for the local Unity sprite-export project (all imported art, caches, and settings stay ignored).
- `alignments/` for small, human-authored sprite assembly recipes that should be reviewed and committed like code.
- `retired/` for optional local copies of superseded artwork; this folder is ignored. Previously committed versions remain recoverable from Git history.
- `public/assets/wildstat/` only for runtime art that is referenced by shipped code.

New files under `inbox/`, `vendor/`, and `generated/` are ignored by Git. Existing files that were already committed remain tracked. When source art is worth preserving in the repository, add that specific file explicitly with `git add -f`; when art is ready for the game, copy the selected optimized runtime asset into `public/assets/wildstat/` and stage it normally.

Unity packages (`*.unitypackage`) and everything in `unity-workspace/` are also ignored. Do not force-add purchased packages or promote licensed artwork into a public repository without confirming that its license permits that distribution. The [Unity sprite exporter](../tools/unity-sprite-exporter/README.md) creates candidates, not automatic game changes.

The live release command excludes untracked files unless `--include-untracked` is explicitly supplied, so local art candidates never need to be staged and then removed from a normal release.
