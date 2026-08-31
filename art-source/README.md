# Art source files

Non-runtime vendor art lives here. This directory is deliberately outside `public/`, so Vite does not copy it into `dist/` or the GitHub Pages artifact.

Use these folders as a one-way promotion pipeline:

- `inbox/` for old sprites and art that has not been reviewed yet.
- `vendor/` for original asset packs, preserving their relative paths.
- `generated/` for generated candidates and working source images.
- `alignments/` for small, human-authored sprite assembly recipes that should be reviewed and committed like code.
- `public/assets/wildstat/` only for runtime art that is referenced by shipped code.

New files under `inbox/`, `vendor/`, and `generated/` are ignored by Git. Existing files that were already committed remain tracked. When source art is worth preserving in the repository, add that specific file explicitly with `git add -f`; when art is ready for the game, copy the selected optimized runtime asset into `public/assets/wildstat/` and stage it normally.

The live release command excludes untracked files unless `--include-untracked` is explicitly supplied, so local art candidates never need to be staged and then removed from a normal release.
