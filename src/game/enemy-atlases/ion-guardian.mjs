import { neonSentryAtlas } from './neon-sentry.mjs';

/** The original reserved shield sentry, promoted without changing its artwork. */
export function ionGuardianAtlas() {
  return { ...neonSentryAtlas('guardian'),
    pages: [{ src: 'assets/wildstat/enemies/ion-guardian/guardian.svg', width: 1024, height: 384 }] };
}
