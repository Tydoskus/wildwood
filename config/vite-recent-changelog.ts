import type { Plugin } from "vite";

/** Releases the client ships notes for. Players see at most the last eight days (the mailbox); this is about two weeks. */
export const SHIPPED_RELEASE_NOTES = 150;

/**
 * The whole changelog, a thousand releases, was compiled into both client
 * bundles: ~160 KB each, a fifth of the sign-in bundle. Only recent notes are
 * ever shown, so the build keeps the newest entries of RELEASE_NOTES (which
 * the release script always writes at the top) and drops the rest. The source
 * file, and every test and script reading it, keep the full history.
 */
export function trimReleaseNotes(source: string, keep = SHIPPED_RELEASE_NOTES) {
  const start = source.indexOf("export const RELEASE_NOTES");
  const end = source.indexOf("\n};\n", start);
  if (start < 0 || end < 0) throw new Error("changelog.ts: RELEASE_NOTES block not found");
  const body = source.slice(source.indexOf("{\n", start) + 2, end);
  const entries = body.split(/\n(?=  "\d+(?:\.\d+)+": \[)/);
  if (entries.length <= keep) return source;
  return `${source.slice(0, source.indexOf("{\n", start) + 2)}${entries.slice(0, keep).join("\n")}${source.slice(end)}`;
}

export function recentChangelog(): Plugin {
  return {
    name: "wildstat-recent-changelog",
    transform(code, id) {
      if (!id.replace(/\\/g, "/").endsWith("/src/app/changelog.ts")) return null;
      return { code: trimReleaseNotes(code), map: null };
    },
  };
}
