/**
 * The Android version code for a game version, as mobile/android/app/build.gradle works it out:
 * 0.901.45 -> 9010450, with a fourth part (0.901.45.1) in the last digit. Run directly, it prints the
 * code for public/version.json.
 */
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { resolve } from 'node:path';

export function androidVersionCode(version) {
  const parts = String(version).split('.').map(Number);
  if (!parts.length || parts.length > 4 || parts.some(part => !Number.isInteger(part) || part < 0 || part > 999)) throw new Error(`Not a game version: ${version}`);
  const [major = 0, minor = 0, patch = 0, hotfix = 0] = parts;
  if (hotfix > 9) throw new Error(`A fourth version part must be 0-9: ${version}`);
  return ((major * 1000 + minor) * 1000 + patch) * 10 + hotfix;
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const root = resolve(fileURLToPath(new URL('../..', import.meta.url)));
  console.log(androidVersionCode(JSON.parse(readFileSync(resolve(root, 'public/version.json'), 'utf8')).version));
}
