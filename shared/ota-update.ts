/**
 * Bump these when an OTA cannot safely share the installed bridge or local saves.
 * With the native fingerprint checked when a bundle is packaged, these are the
 * whole compatibility rule. The protocol version is not part of it: it is the
 * web-to-server contract, and an update carries its own matching game code.
 */
export const OTA_RUNTIME = 'wildstat-capacitor8-1';
export const OTA_SAVE_FORMAT = 1;
export type OtaChannel = 'production' | 'developer';
export type OtaBundle = { id: string; url: string; checksum: string; signature: string };
export type OtaManifest = {
  schema: 1; channel: OtaChannel; platform: 'ios' | 'android'; sequence: number;
  runtime: string; saveFormat: number;
  /** The bundle's own protocol. Informational: apps from before this rule compared it, so it stays in the feed. */
  protocol?: number;
  /** Every installed build in this range shares the native code the bundle was packaged against. */
  minBuild: number; maxBuild: number;
  /** null explicitly schedules the store-bundled version (emergency rollback). */
  bundle: OtaBundle | null;
};
export type SignedOtaManifest = { payload: string; signature: string };
export function validateOtaManifest(value: unknown, expected: {
  channel: OtaChannel; platform: string; build: number; runtime: string; saveFormat: number;
}): OtaManifest {
  const m = value as OtaManifest;
  if (!Number.isSafeInteger(expected.build) || expected.build < 1 || !m || m.schema !== 1 || m.channel !== expected.channel || m.platform !== expected.platform
    || !Number.isSafeInteger(m.sequence) || m.sequence <= 0 || m.runtime !== expected.runtime
    || m.saveFormat !== expected.saveFormat
    || !Number.isSafeInteger(m.minBuild) || !Number.isSafeInteger(m.maxBuild)
    || m.minBuild < 1 || m.maxBuild < m.minBuild || expected.build < m.minBuild || expected.build > m.maxBuild)
    throw new Error('This update requires a different app build.');
  if (m.bundle !== null) {
    const b = m.bundle;
    if (!b || typeof b.id !== 'string' || typeof b.url !== 'string' || typeof b.checksum !== 'string' || typeof b.signature !== 'string'
      || !/^[a-zA-Z0-9][a-zA-Z0-9._-]{0,95}$/.test(b.id) || b.id === 'public'
      || !/^[a-f0-9]{64}$/.test(b.checksum) || !/^[A-Za-z0-9+/]{100,}={0,2}$/.test(b.signature)) throw new Error('Invalid update bundle.');
    const url = new URL(b.url);
    if (url.protocol !== 'https:' || url.username || url.password || url.hash) throw new Error('Invalid update URL.');
  }
  return m;
}
