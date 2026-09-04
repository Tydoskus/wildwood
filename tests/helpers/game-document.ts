import { readFileSync } from "node:fs";
import { parseHTML } from "linkedom";
import { installGameShell } from "../../src/ui/game-shell";

export const entryHtml = readFileSync(new URL("../../public/index.html", import.meta.url), "utf8");

export function createGameDocument() {
  const { document } = parseHTML(entryHtml);
  installGameShell(document);
  return document;
}
