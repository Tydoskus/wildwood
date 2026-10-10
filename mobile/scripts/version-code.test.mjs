import { test, expect } from 'vitest';
import { androidVersionCode } from './version-code.mjs';

test('a game version gives its own Play version code, always higher for a later release', () => {
  expect(androidVersionCode('0.901.45')).toBe(9010450);
  expect(androidVersionCode('0.901.45.1')).toBe(9010451);
  expect(androidVersionCode('0.902')).toBeGreaterThan(androidVersionCode('0.901.999'));
  expect(androidVersionCode('0.901.45')).toBeGreaterThan(862);
  expect(() => androidVersionCode('0.901.x')).toThrow();
  expect(() => androidVersionCode('0.901.45.10')).toThrow();
});
