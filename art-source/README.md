# Art source files

Non-runtime vendor art lives here. This directory is deliberately outside `public/`, so Vite does not copy it into `dist/` or the GitHub Pages artifact.

`vendor/` preserves original relative asset paths for future art editing. Only files referenced by `src/` or `public/index.html` belong under `public/assets/`.
