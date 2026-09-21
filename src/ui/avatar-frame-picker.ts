import { avatarFrameAsset, allowedAvatarFrame, AVATAR_FRAME_OFFERED, type AvatarFrame, type PatreonStatus } from "../../shared/avatar-frames";
import { createAvatarFrameGlow } from "../app/avatar-frame-glow";
import { createPatreonSupportForm } from "./patreon-support-form";

export type SupporterActions = {
  patreonStatus: () => Promise<PatreonStatus>;
  refreshPatreon: () => Promise<PatreonStatus>;
  beginPatreonLink: () => Promise<string>;
  setAvatarFrame: (frame: AvatarFrame) => Promise<PatreonStatus>;
  disconnectPatreon: () => Promise<PatreonStatus>;
  localDisplayName?: () => string;
  requestPatreonHelp: (email: string) => Promise<unknown>;
};

export function createAvatarFramePicker(actions: SupporterActions, showMessage: (message: string, color: string) => void) {
  const root = document.createElement("section"); root.className = "avatar-frame-picker";
  const heading = document.createElement("h3"); heading.textContent = "Frame";
  const selection = document.createElement("span"); selection.className = "avatar-frame-summary";
  const selectedArt = document.createElement("img"); selectedArt.alt = ""; selectedArt.hidden = true;
  const selectedName = document.createElement("span"); selectedName.textContent = "…";
  selection.append(selectedArt, selectedName);
  const choices = document.createElement("div"); choices.className = "avatar-frame-choices";
  const status = document.createElement("p"); status.setAttribute("role", "status");
  const controls = document.createElement("div"); controls.className = "avatar-frame-controls";
  const connect = document.createElement("button"); connect.type = "button"; connect.textContent = "Connect Patreon";
  const refresh = document.createElement("button"); refresh.type = "button"; refresh.textContent = "Refresh";
  const unlink = document.createElement("button"); unlink.type = "button"; unlink.textContent = "Disconnect";
  const continueLink = document.createElement("a"); continueLink.textContent = "Continue to Patreon"; continueLink.target = "_blank"; continueLink.rel = "noopener noreferrer"; continueLink.hidden = true;
  controls.append(connect, refresh, unlink, continueLink); root.append(heading, choices, status, controls);
  const help = createPatreonSupportForm(actions); root.append(help.element);
  let revision = 0, poll: ReturnType<typeof setInterval> | undefined, busy = false;
  const buttons = new Map<AvatarFrame, HTMLButtonElement>();
  let current: PatreonStatus | undefined;
  const fail = (error: unknown) => { status.textContent = error instanceof Error ? error.message : "Couldn't check Patreon. Try again."; };
  function render(value: PatreonStatus) {
    current = value;
    selection.dataset.frame = value.frame;
    // Leave the last artwork in place for "none" rather than blanking the src,
    // which would request the page itself and log a broken image.
    if (value.frame !== "none") selectedArt.src = avatarFrameAsset(value.frame);
    selectedArt.hidden = value.frame === "none";
    selectedName.textContent = value.frame[0].toUpperCase() + value.frame.slice(1);
    status.textContent = value.preview ? "Developer frame preview" : !value.configured ? "Supporter frames are coming soon." : !value.linked ? "Connect once. Your supporter frame applies automatically." : value.tier === "none" ? "Connected · no active paid membership" : `${value.tier[0].toUpperCase()}${value.tier.slice(1)} supporter · thank you!`;
    connect.hidden = value.linked; connect.disabled = !value.configured || busy;
    refresh.hidden = !value.linked; unlink.hidden = !value.linked;
    refresh.disabled = busy; unlink.disabled = busy;
    for (const [frame, button] of buttons) {
      button.disabled = busy || !allowedAvatarFrame(value.tier, frame);
      button.setAttribute("aria-pressed", String(value.frame === frame));
      button.title = allowedAvatarFrame(value.tier, frame) ? "" : `Requires ${frame} membership`;
    }
  }
  async function run(action: () => Promise<PatreonStatus>) {
    if (busy) return;
    const version = revision; busy = true;
    if (current) render(current);
    try { const value = await action(); if (version === revision) { busy = false; render(value); } }
    catch (error) { if (version === revision) { busy = false; if (current) render(current); fail(error); } }
  }
  for (const frame of AVATAR_FRAME_OFFERED) {
    const button = document.createElement("button"); button.type = "button"; button.dataset.frame = frame;
    const preview = document.createElement("span"); preview.className = "avatar-frame-choice-art";
    if (frame !== "none") {
      const image = document.createElement("img"); image.src = avatarFrameAsset(frame); image.alt = "";
      preview.append(image, createAvatarFrameGlow());
    }
    const name = document.createElement("span"); name.textContent = frame[0].toUpperCase() + frame.slice(1);
    button.append(preview, name); button.setAttribute("aria-label", `Use ${frame} frame`); button.disabled = true;
    button.addEventListener("click", () => void run(async () => { const value = await actions.setAvatarFrame(frame); showMessage("FRAME UPDATED", "#72ef58"); return value; }));
    choices.append(button); buttons.set(frame, button);
  }
  connect.addEventListener("click", async () => {
    if (busy) return;
    const version = revision; busy = true; connect.disabled = true;
    const native = (window as unknown as { wildstatOpenPatreon?: (url: string) => Promise<void> }).wildstatOpenPatreon;
    const popup = native ? null : window.open("about:blank", "_blank");
    if (popup) popup.opener = null;
    try {
      const url = await actions.beginPatreonLink();
      const parsed = new URL(url);
      if (parsed.protocol !== "https:" || parsed.hostname !== "www.patreon.com" || parsed.pathname !== "/oauth2/authorize") throw new Error("Invalid Patreon link.");
      if (version !== revision) { popup?.close(); return; }
      if (native) await native(url); else if (popup) popup.location.replace(url);
      else { continueLink.href = url; continueLink.hidden = false; }
      status.textContent = "Finish connecting on Patreon, then return here.";
      clearInterval(poll);
      const deadline = Date.now() + 10 * 60_000;
      poll = setInterval(() => {
        if (Date.now() > deadline) { clearInterval(poll); return; }
        void actions.patreonStatus().then(value => { if (version === revision && value.linked) { render(value); continueLink.hidden = true; clearInterval(poll); } }).catch(() => {});
      }, 5_000);
    } catch (error) { popup?.close(); if (version === revision) fail(error); }
    finally { if (version === revision) { busy = false; connect.disabled = false; } }
  });
  refresh.addEventListener("click", () => void run(actions.refreshPatreon));
  unlink.addEventListener("click", () => void run(actions.disconnectPatreon));
  return { element: root, selection,
    open() {
      help.reset();
      selectedArt.hidden = true; selectedName.textContent = "…";
      revision++; busy = false; current = undefined; clearInterval(poll); poll = undefined; continueLink.hidden = true;
      connect.disabled = true; refresh.disabled = true; unlink.disabled = true;
      for (const button of buttons.values()) button.disabled = true;
      status.textContent = "Checking frames…"; void run(actions.refreshPatreon);
    },
    close() { help.reset(); revision++; busy = false; clearInterval(poll); poll = undefined; continueLink.hidden = true; },
  };
}
