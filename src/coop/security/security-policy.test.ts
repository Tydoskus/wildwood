import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const entryHtml = readFileSync(new URL("../../../public/index.html", import.meta.url), "utf8");

function contentSecurityPolicy() {
  const match = entryHtml.match(/<meta http-equiv="Content-Security-Policy" content="([^"]+)" \/>/);
  expect(match).not.toBeNull();
  return match![1];
}

describe("browser security policy", () => {
  it("loads executable scripts only from same-origin external files", () => {
    const policy = contentSecurityPolicy();
    expect(policy).toContain("default-src 'none'");
    expect(policy).toContain("script-src 'self'");
    expect(policy).toContain("script-src-attr 'none'");
    expect(policy).not.toContain("'unsafe-eval'");

    const scripts = [...entryHtml.matchAll(/<script\b([^>]*)>/g)];
    expect(scripts.length).toBeGreaterThan(0);
    for (const [, attributes] of scripts) expect(attributes).toMatch(/\bsrc="assets\/wildstat\//);
    expect(entryHtml).not.toMatch(/\son[a-z]+\s*=/i);
  });

  it("allows only the connections and resource forms used by WildStat", () => {
    const policy = contentSecurityPolicy();
    expect(policy).toContain("object-src 'none'");
    expect(policy).toContain("frame-src 'none'");
    expect(policy).toContain("base-uri 'self'");
    expect(policy).toContain("form-action 'self'");
    expect(policy).toContain("worker-src 'self' blob:");
    expect(policy).toContain("media-src 'self' data: blob:");
    expect(policy).toContain("https://auth.spacetimedb.com");
    expect(policy).toContain("wss://maincloud.spacetimedb.com");
    expect(policy).not.toContain(" wss: ");
    expect(policy).toContain("ws://*:3000");
  });

  it("never sends the OAuth callback URL as a referrer", () => {
    expect(entryHtml).toContain('<meta name="referrer" content="no-referrer" />');
    expect(entryHtml.indexOf('http-equiv="Content-Security-Policy"')).toBeLessThan(1_024);
  });
});
