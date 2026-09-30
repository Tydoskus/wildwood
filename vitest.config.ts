import { configDefaults, defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    // Native checkouts, local runner workspaces and agent worktrees are copies.
    exclude: [...configDefaults.exclude, 'mobile/.build/**', 'mobile/www/**', 'local-data/**', '.claude/**'],
  },
});
