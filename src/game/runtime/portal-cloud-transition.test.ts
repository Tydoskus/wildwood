import { existsSync } from "node:fs";
import { describe, expect, it, vi } from "vitest";
import { createPortalCloudTransition, PORTAL_CLOUD_SOURCE } from "./portal-cloud-transition";

class FakeClassList {
  values = new Set<string>();
  add(...names: string[]) { names.forEach((name) => this.values.add(name)); }
  remove(...names: string[]) { names.forEach((name) => this.values.delete(name)); }
  contains(name: string) { return this.values.has(name); }
}

class FakeStyle {
  values = new Map<string, string>();
  setProperty(name: string, value: string) { this.values.set(name, value); }
}

class FakeFragment { children: FakeImage[] = []; append(child: FakeImage) { this.children.push(child); } }
class FakeImage {
  className = "";
  src = "";
  alt = "";
  draggable = true;
  decoding = "auto";
  style = new FakeStyle();
}

class FakeRoot {
  hidden = true;
  offsetWidth = 0;
  childElementCount = 0;
  children: FakeImage[] = [];
  classList = new FakeClassList();
  append(fragment: FakeFragment) {
    this.children.push(...fragment.children);
    this.childElementCount = this.children.length;
  }
}

describe("portal cloud transition", () => {
  it("repeats one cached sprite from both sides and hides again after reveal", async () => {
    const root = new FakeRoot();
    const wait = vi.fn(async () => {});
    const transition = createPortalCloudTransition(root as unknown as HTMLElement, {
      document: {
        createDocumentFragment: () => new FakeFragment(),
        createElement: () => new FakeImage(),
      } as unknown as Document,
      wait,
      nextFrame: async () => {},
      reduceMotion: true,
    });

    await transition.cover();
    expect(root.childElementCount).toBe(22);
    expect(root.children[0].style.values.get("--cloud-cover-delay")).toBe("0ms");
    expect(root.children[1].style.values.get("--cloud-cover-delay")).toBe("63ms");
    expect(root.children[5].style.values.get("--cloud-cover-delay")).toBe("258ms");
    expect(root.children[11].style.values.get("--cloud-cover-delay")).toBe("38ms");
    expect(root.children[12].style.values.get("--cloud-cover-delay")).toBe("25ms");
    expect(root.children[5].style.values.get("--cloud-reveal-delay")).toBe("0ms");
    expect(root.children[0].style.values.get("--cloud-entry-y")).toBe("-22vh");
    expect(root.children[11].style.values.get("--cloud-entry-y")).toBe("22vh");
    expect(root.hidden).toBe(false);
    expect(root.classList.contains("is-covered")).toBe(true);

    await transition.reveal();
    expect(root.hidden).toBe(true);
    expect(root.classList.contains("is-covered")).toBe(false);
    expect(wait).toHaveBeenCalledTimes(2);
  });

  it("keeps the generated single-cloud asset in the deployed tree", () => {
    expect(PORTAL_CLOUD_SOURCE).toBe("assets/wildwood/portal-cloud-v2.png");
    expect(existsSync(new URL("../../../public/assets/wildwood/portal-cloud-v2.png", import.meta.url))).toBe(true);
  });
});
