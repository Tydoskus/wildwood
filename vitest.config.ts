import { configDefaults, defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    // Native build checkouts contain third-party test suites, not game tests.
    exclude: [...configDefaults.exclude, 'mobile/.build/**', 'mobile/www/**'],
  },
});
