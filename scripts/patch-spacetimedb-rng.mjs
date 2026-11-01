// SpacetimeDB's server RNG (2.10 to 2.12 at least) seeds with a signed shift: `xorshifted >> rot`.
// The sign spills into the seed, and a transaction's first ctx.random() lands under 0.001 about 28% of the
// time (a 1% roll comes up 34%). An unsigned shift makes every draw fair. This rewrites that one line in the
// installed copies, does nothing when already done, and fails when the line moved so a new SDK is looked at.
//
// Its identity and connection hex (u256ToHexString/u128ToHexString) writes the number to bytes and maps each byte
// to a string: about 5 µs a call, and toHexString and isEqual run on every guarded reducer, 14 times a kill report.
// toString(16) of the same low 256/128 bits gives the identical text in a twentieth of the time.
import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const COPIES = ["node_modules/spacetimedb", "spacetimedb/node_modules/spacetimedb"];
const FILES = ["dist/server/index.mjs", "dist/server/test-utils/index.mjs", "src/server/rng.ts"];
/** The hex conversion, as the server bundles and the TS source have it; asUintN keeps the bits the byte writer keeps. */
const HEX_FILES = ["dist/server/index.mjs", "dist/server/test-utils/index.mjs", "src/lib/util.ts"];
const HEX_FIXES = [
  ["function u128ToHexString(data) {\n  return uint8ArrayToHexString(u128ToUint8Array(data));\n}",
    "function u128ToHexString(data) {\n  return BigInt.asUintN(128, data).toString(16).padStart(32, \"0\");\n}"],
  ["function u256ToHexString(data) {\n  return uint8ArrayToHexString(u256ToUint8Array(data));\n}",
    "function u256ToHexString(data) {\n  return BigInt.asUintN(256, data).toString(16).padStart(64, \"0\");\n}"],
  ["function u128ToHexString(data: bigint): string {\n  return uint8ArrayToHexString(u128ToUint8Array(data));\n}",
    "function u128ToHexString(data: bigint): string {\n  return BigInt.asUintN(128, data).toString(16).padStart(32, \"0\");\n}"],
  ["function u256ToHexString(data: bigint): string {\n  return uint8ArrayToHexString(u256ToUint8Array(data));\n}",
    "function u256ToHexString(data: bigint): string {\n  return BigInt.asUintN(256, data).toString(16).padStart(64, \"0\");\n}"],
];
const FIXES = [
  ["return xorshifted >> rot | xorshifted << 32 - rot;", "return (xorshifted >>> rot | xorshifted << 32 - rot) >>> 0;"],
  ["return (xorshifted >> rot) | (xorshifted << (32 - rot));", "return ((xorshifted >>> rot) | (xorshifted << (32 - rot))) >>> 0;"],
];

/** Returns the files it changed; throws when an installed server copy has neither the broken nor the fixed line. */
export function patchSpacetimeRng(base = root) {
  const changed = [];
  for (const copy of COPIES) {
    for (const file of FILES) {
      const path = resolve(base, copy, file);
      if (!existsSync(path)) continue;
      const source = readFileSync(path, "utf8");
      const broken = FIXES.find(([before]) => source.includes(before));
      if (broken) {
        writeFileSync(path, source.replace(broken[0], broken[1]));
        changed.push(`${copy}/${file}`);
      } else if (file === "dist/server/index.mjs" && !FIXES.some(([, after]) => source.includes(after))) {
        throw new Error(`${copy}/${file}: the SpacetimeDB RNG line changed. Check whether the signed-shift bias is fixed upstream, then update scripts/patch-spacetimedb-rng.mjs.`);
      }
    }
  }
  for (const copy of COPIES) {
    for (const file of HEX_FILES) {
      const path = resolve(base, copy, file);
      if (!existsSync(path)) continue;
      let source = readFileSync(path, "utf8");
      const before = source;
      for (const [slow, fast] of HEX_FIXES) source = source.replace(slow, fast);
      if (source !== before) { writeFileSync(path, source); changed.push(`${copy}/${file} (hex)`); }
      else if (file === "dist/server/index.mjs" && !source.includes("BigInt.asUintN(256, data).toString(16)")) {
        throw new Error(`${copy}/${file}: the SpacetimeDB identity hex code changed. Check it, then update scripts/patch-spacetimedb-rng.mjs.`);
      }
    }
  }
  return changed;
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const changed = patchSpacetimeRng();
  if (changed.length) console.log(`SpacetimeDB patched in: ${changed.join(", ")}`);
}
