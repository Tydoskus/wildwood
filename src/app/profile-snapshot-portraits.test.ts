import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { parseHTML } from "linkedom";
import {
  PROFILE_ICON_BLACK_BACKGROUND, PROFILE_ICON_COUNT, PROFILE_ICON_SNAPSHOT, encodeProfileIcon, isSnapshotProfileIcon,
  isValidProfileIcon, normalizeProfileIcon, profileIconLocation, withProfileIconBackground,
} from "../../shared/profile-icons";
import { profileSnapshotKey, type ProfileSnapshotLook } from "../../shared/profile-snapshot";
import { applyProfileIcon, createProfileIconCanvasPainter } from "./profile-icons";
import {
  PROFILE_SNAPSHOT_PORTRAIT_LIMIT, checkProfileSnapshots, profileSnapshotPortrait, resetProfileSnapshotPortraits,
  setProfileSnapshotRenderer, setProfileSnapshotSource,
} from "./profile-snapshot-portraits";
import { keepCanvasMoving, movingCanvasCount } from "./moving-canvases";

const look = (headItem = "basic_paper_hat", skinTone = 3): ProfileSnapshotLook =>
  ({ skinTone, headItem, chestItem: "", feetItem: "", rightHandItem: "starter_bow", leftHandItem: "" });

function setup() {
  const looks = new Map<string, ProfileSnapshotLook>();
  let revision = 0;
  const asked: string[] = [];
  setProfileSnapshotSource({ look: identity => { asked.push(identity); return looks.get(identity); }, revision: () => revision });
  const render = vi.fn((value: ProfileSnapshotLook) => ({ key: profileSnapshotKey(value), canvas: { drawn: profileSnapshotKey(value) } as never, url: `data:image/png;base64,${btoa(profileSnapshotKey(value))}` }));
  setProfileSnapshotRenderer(render);
  return {
    looks, asked, render,
    arrive(identity: string, value: ProfileSnapshotLook) { looks.set(identity, value); revision++; checkProfileSnapshots(); },
  };
}

beforeEach(() => {
  const { document, window } = parseHTML("<html><body></body></html>");
  vi.stubGlobal("document", document); vi.stubGlobal("window", window);
});
afterEach(() => { resetProfileSnapshotPortraits(); vi.unstubAllGlobals(); });

it("reserves the top index for the snapshot, with either backdrop, and nothing else past the sheets", () => {
  expect(PROFILE_ICON_SNAPSHOT).toBe(0xffff);
  for (const icon of [PROFILE_ICON_SNAPSHOT, PROFILE_ICON_SNAPSHOT | PROFILE_ICON_BLACK_BACKGROUND]) {
    expect(isValidProfileIcon(icon)).toBe(true);
    expect(isSnapshotProfileIcon(icon)).toBe(true);
    expect(normalizeProfileIcon(icon)).toBe(icon);
  }
  for (const icon of [PROFILE_ICON_COUNT, PROFILE_ICON_SNAPSHOT - 1, PROFILE_ICON_SNAPSHOT | 0x20000, 0x1ffff + 1, -1]) {
    expect(isValidProfileIcon(icon), String(icon)).toBe(false);
  }
  expect(isSnapshotProfileIcon(5)).toBe(false);
  expect(encodeProfileIcon(PROFILE_ICON_SNAPSHOT, "black")).toBe(PROFILE_ICON_SNAPSHOT | PROFILE_ICON_BLACK_BACKGROUND);
  expect(withProfileIconBackground(PROFILE_ICON_SNAPSHOT | PROFILE_ICON_BLACK_BACKGROUND, "white")).toBe(PROFILE_ICON_SNAPSHOT);
  // Its sheet location is the default silhouette's, which is what shows until the character is drawn.
  const location = profileIconLocation(PROFILE_ICON_SNAPSHOT | PROFILE_ICON_BLACK_BACKGROUND);
  expect(location).toMatchObject({ index: PROFILE_ICON_SNAPSHOT, snapshot: true, sheetIndex: 0, cell: 0, background: "black", category: "people" });
  expect(location.path).toBe(profileIconLocation(0).path);
});

it("an older client's check turns the snapshot into the default silhouette on White", () => {
  // The validation every client before this one shipped (0.901.17's shared/profile-icons.ts).
  const oldValid = (value: number) => Number.isInteger(value) && value >= 0 && value <= (0x10000 | 0xffff) && (value & 0xffff) < PROFILE_ICON_COUNT;
  const oldNormalize = (value: number) => Number.isFinite(value) && oldValid(Math.floor(value)) ? Math.floor(value) : 0;
  expect(oldNormalize(PROFILE_ICON_SNAPSHOT)).toBe(0);
  expect(oldNormalize(PROFILE_ICON_SNAPSHOT | PROFILE_ICON_BLACK_BACKGROUND)).toBe(0);
});

it("draws the silhouette until the look arrives, then repaints the same element with the character", () => {
  const f = setup();
  const element = document.createElement("span"); document.body.append(element);
  applyProfileIcon(element, PROFILE_ICON_SNAPSHOT | PROFILE_ICON_BLACK_BACKGROUND, "aa");
  expect(element.style.backgroundImage).toContain(profileIconLocation(0).path);
  expect(element.dataset.profileBackground).toBe("black");
  expect(element.style.backgroundColor).toBe("#000000");
  f.arrive("aa", look());
  expect(element.style.backgroundImage).toContain("data:image/png;base64,");
  expect(element.classList.contains("profile-icon-is-snapshot")).toBe(true);
  expect(element.style.backgroundColor).toBe("#000000");
  // Switching back to a normal picture stops watching: a later look does not overwrite it.
  applyProfileIcon(element, 12, "aa");
  expect(element.style.backgroundImage).toContain("profile-portraits-grid-v2-alpha.webp");
  f.arrive("aa", look("samurai_hat"));
  expect(element.style.backgroundImage).toContain("profile-portraits-grid-v2-alpha.webp");
});

it("without an identity a snapshot icon is only the silhouette", () => {
  const f = setup();
  f.looks.set("aa", look());
  const element = document.createElement("span");
  applyProfileIcon(element, PROFILE_ICON_SNAPSHOT);
  expect(element.style.backgroundImage).toContain(profileIconLocation(0).path);
  expect(f.render).not.toHaveBeenCalled();
});

it("draws each look once, shares it between players who look alike, and redraws a retaken one", () => {
  const f = setup();
  f.looks.set("aa", look()); f.looks.set("bb", look());
  const elements = Array.from({ length: 30 }, () => document.createElement("span"));
  for (const [index, element] of elements.entries()) applyProfileIcon(element, PROFILE_ICON_SNAPSHOT, index % 2 ? "aa" : "bb");
  for (const element of elements) applyProfileIcon(element, PROFILE_ICON_SNAPSHOT, "aa");
  expect(f.render).toHaveBeenCalledOnce();
  f.looks.set("aa", look("samurai_hat"));
  expect(profileSnapshotPortrait("aa")?.key).toBe(profileSnapshotKey(look("samurai_hat")));
  expect(f.render).toHaveBeenCalledTimes(2);
  expect(profileSnapshotPortrait("bb")?.key).toBe(profileSnapshotKey(look()));
  expect(f.render).toHaveBeenCalledTimes(2);
});

it("keeps a bounded number of drawn looks, dropping the least recently shown", () => {
  const f = setup();
  for (let index = 0; index <= PROFILE_SNAPSHOT_PORTRAIT_LIMIT; index++) {
    f.looks.set(`p${index}`, look("", index)); profileSnapshotPortrait(`p${index}`);
  }
  expect(f.render).toHaveBeenCalledTimes(PROFILE_SNAPSHOT_PORTRAIT_LIMIT + 1);
  profileSnapshotPortrait(`p${PROFILE_SNAPSHOT_PORTRAIT_LIMIT}`);
  expect(f.render).toHaveBeenCalledTimes(PROFILE_SNAPSHOT_PORTRAIT_LIMIT + 1);
  profileSnapshotPortrait("p0");
  expect(f.render).toHaveBeenCalledTimes(PROFILE_SNAPSHOT_PORTRAIT_LIMIT + 2);
});

it("waits for the character art before drawing, then redraws what is on screen", () => {
  const looks = new Map([["aa", look()]]);
  setProfileSnapshotSource({ look: identity => looks.get(identity), revision: () => 0 });
  const element = document.createElement("span"); document.body.append(element);
  applyProfileIcon(element, PROFILE_ICON_SNAPSHOT, "aa");
  expect(element.style.backgroundImage).toContain(profileIconLocation(0).path);
  setProfileSnapshotRenderer(value => ({ key: profileSnapshotKey(value), canvas: {} as never, url: "data:image/png;base64,QQ==" }));
  expect(element.style.backgroundImage).toContain("data:image/png;base64,QQ==");
});

it("paints canvas portraits from the drawn look over the backdrop, and asks for a redraw when one arrives", () => {
  const f = setup();
  const redraw = vi.fn();
  vi.stubGlobal("Image", class { complete = false; naturalWidth = 0; src = ""; addEventListener() {} });
  const fills: string[] = [];
  const context = { fillStyle: "", imageSmoothingEnabled: false, drawImage: vi.fn(),
    fillRect: vi.fn(function (this: { fillStyle: string }) { fills.push(this.fillStyle); }) };
  const canvas = { width: 25, height: 25, getContext: () => context } as unknown as HTMLCanvasElement;
  const paint = createProfileIconCanvasPainter(redraw);
  paint(canvas, PROFILE_ICON_SNAPSHOT | PROFILE_ICON_BLACK_BACKGROUND, "aa");
  expect(fills).toEqual(["#000000"]); expect(context.drawImage).not.toHaveBeenCalled();
  f.arrive("aa", look());
  expect(redraw).toHaveBeenCalledOnce();
  paint(canvas, PROFILE_ICON_SNAPSHOT | PROFILE_ICON_BLACK_BACKGROUND, "aa");
  expect(context.drawImage).toHaveBeenCalledWith({ drawn: profileSnapshotKey(look()) }, 0, 0, 25, 25);
});

it("draws a galaxy look live, in DOM and canvas portraits alike, and stops once the look is still", () => {
  const looks = new Map([["aa", look("galaxy_helmet")]]);
  setProfileSnapshotSource({ look: identity => looks.get(identity), revision: () => 0 });
  const painted: Array<[number, number]> = [];
  setProfileSnapshotRenderer(value => ({ key: profileSnapshotKey(value), canvas: {} as never, url: "data:image/png;base64,QQ==",
    paint: value.headItem === "galaxy_helmet" ? (_context: CanvasRenderingContext2D, width: number, height: number) => { painted.push([width, height]); } : undefined }));
  const element = document.createElement("span"); document.body.append(element);
  applyProfileIcon(element, PROFILE_ICON_SNAPSHOT, "aa");
  // A canvas over the backdrop carries the moving portrait; the frozen picture is not set under it.
  expect(element.querySelector("canvas.profile-icon-live")).not.toBeNull();
  expect(element.style.backgroundImage).toBe("none");
  expect(movingCanvasCount()).toBe(1);
  applyProfileIcon(element, PROFILE_ICON_SNAPSHOT, "aa");
  expect(element.querySelectorAll("canvas.profile-icon-live")).toHaveLength(1);
  looks.set("aa", look());
  applyProfileIcon(element, PROFILE_ICON_SNAPSHOT, "aa");
  expect(element.querySelector("canvas.profile-icon-live")).toBeNull();
  expect(element.style.backgroundImage).toContain("data:image/png;base64,QQ==");
  expect(movingCanvasCount()).toBe(0);

  looks.set("aa", look("galaxy_helmet"));
  const context = { fillStyle: "", imageSmoothingEnabled: false, drawImage: vi.fn(), fillRect: vi.fn() };
  const canvas = { width: 25, height: 25, getContext: () => context } as unknown as HTMLCanvasElement;
  createProfileIconCanvasPainter(() => {})(canvas, PROFILE_ICON_SNAPSHOT, "aa");
  expect(painted.at(-1)).toEqual([25, 25]);
  expect(context.drawImage).not.toHaveBeenCalled();
  expect(movingCanvasCount()).toBe(1);
  keepCanvasMoving(canvas, null);
});
