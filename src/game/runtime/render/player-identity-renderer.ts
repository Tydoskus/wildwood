import { replaceChildrenIfChanged } from "../../../ui/replace-children-if-changed";
import { drawPlayerPowerLabel } from "../player-power-label";
import { residentImage } from "./resident-image";
import { applyProfileIcon, createProfileIconCanvasPainter } from "../../../app/profile-icons";
import { setProfileSnapshotSource } from "../../../app/profile-snapshot-portraits";
import type { ProfileSnapshotLook } from "../../../../shared/profile-snapshot";
import { playerNamePrefix, appendPlayerNameTags, appendPrestigeBadge, playerPrestigeLevel } from "../../../app/player-name-tags";
import { PRESTIGE_BADGE_ASSET, PRESTIGE_BADGE_PX } from "../../../../shared/prestige";
import {
  playerPowerForStats,
  type PlayerPowerProgress,
  type PlayerPowerStats,
} from "../../../../shared/player-power";
import { isPresenceChatMessage } from "../../../../shared/presence-chat";
import {
  PLAYER_GENDER_FEMALE,
  PLAYER_GENDER_MALE,
  type PlayerGender,
} from "../../../../shared/player-gender";
import { formatCompactNumber } from "../../../../shared/compact-number";
import { appendPlayerGenderIcon } from "../../../ui/player-gender";
import type { ChatMessage } from "../../../wildstat-coop";
import { clamp } from "../../math";
import type { Camera } from "./camera";
import type { ActorStatus } from "./actor-renderer";
import { healthBarTextY } from "./health-bar-layout";
import { drawScreenSpaceAt } from "./render-space";
import { createPlayerStatusBars, paintPlayerStatusBar } from "./player-status-bar";
import { OVERHEAD_IDENTITY_LIFT, OVERHEAD_PLATE_GAP, headArtTopOffsetY } from "./overhead-plate";
import { NAMEPLATE_SCALE, plateFont, platePixels, plateSize, plateStroke } from "./nameplate-scale";
import { plateIconBox, stackPlateLines, textInk, type LineInk } from "./plate-stack";
import type { PlayerState } from "../types";

type OutlinedText = (text: string, x: number, y: number, color: string, strokeWidth?: number) => void;
type FillText = (text: string, x: number, y: number) => void;
type RoundRect = (x: number, y: number, width: number, height: number, radius: number) => void;
type SpeechBubbleMessage = Pick<ChatMessage, "id" | "sender" | "senderName" | "message" | "replayId" | "sentAtMs">;
type SpeechBubble = { sentAtMs: number; lines: string[]; width: number; height: number };

const DEVELOPER_BADGE = "[dev]";
const SPEECH_BUBBLE_DURATION_MS = 8_000;
const SPEECH_BUBBLE_FADE_MS = 1_250;
const SPEECH_BUBBLE_STACK_GAP = 5;
/** Label pixels between the top of a player's plate and the lowest bubble. */
const SPEECH_BUBBLE_GAP = plateSize(22);
/** From the top of the head or helmet to the lowest bubble, for a player whose plate is hidden. */
const SPEECH_BUBBLE_LIFT = plateSize(76);
/** A bareheaded player's head top, for callers that do not give one. */
const BARE_HEAD_TOP = headArtTopOffsetY(undefined, undefined);
/** The size chat, the HUD and the profile give it, at plate scale. */
const OVERHEAD_PRESTIGE_BADGE_SIZE = plateSize(PRESTIGE_BADGE_PX);
/** The badge digit's size against the badge. */
const PRESTIGE_DIGIT_SHARE = .7;
/** Tucked back towards the name, which reads tighter than a full gap. */
const OVERHEAD_GENDER_ICON_OFFSET_X = plateSize(-1);
const OVERHEAD_GENDER_ICON_GAP = plateSize(3);
const OVERHEAD_BADGE_GAP = plateSize(1);
/** Where each icon's artwork sits down its box, so the ink rather than the box is centred. */
const GENDER_ART = { inkTop: .016, inkBottom: .979 };
const PRESTIGE_BADGE_ART = { inkTop: .028, inkBottom: .904 };
const POWER_ART = { inkTop: .027, inkBottom: .953 };
/** Names, power and the health bar's numbers share one size (10px before plate scale). */
const PLATE_TEXT_PX = plateSize(10);
const PLATE_TEXT_FONT = plateFont(10);
const INVISIBLE_PX = plateSize(11);
const INVISIBLE_FONT = plateFont(11);
const GUEST_LABEL = "(guest)";
const INVISIBLE_LABEL = "Invisible";
/** The even space between the ink of one plate line and the next, and above the bar's frame. */
export const PLATE_LINE_GAP = 1;
const PLATE_TEXT_METRICS_LIMIT = 512;
const PLATE_BAR_WIDTH = platePixels(80);
/** A slim frame round the bar; a hairline does not shrink further. */
const PLATE_FRAME_PAD = Math.max(1, platePixels(1.5));
const HEALTH_TEXT_STROKE = plateStroke(2);
const NAME_STROKE = plateStroke(4);
const SUBLINE_STROKE = plateStroke(3);
export const MAX_ACTIVE_SPEECH_BUBBLES_PER_PLAYER = 3;

/** A line of plate text: its width and how far its glyphs reach above and below the baseline. */
export type PlateTextMetrics = { width: number; ascent: number; descent: number };

/** The glyphs' own ink from measureText, or an estimate from the font size where a browser gives none. */
export function plateTextInk(metrics: TextMetrics | { width: number; actualBoundingBoxAscent?: number; actualBoundingBoxDescent?: number }, fontPx: number): PlateTextMetrics {
  const ascent = metrics.actualBoundingBoxAscent;
  const descent = metrics.actualBoundingBoxDescent;
  return {
    width: metrics.width,
    ascent: Number.isFinite(ascent) && ascent! > 0 ? ascent! : fontPx * .8,
    descent: Number.isFinite(descent) && descent! >= 0 ? descent! : fontPx * .2,
  };
}

/**
 * Where each line of a player's plate goes: bar, power, name, "(guest)", then
 * "Invisible", stacked from `floor` (the bar's frame top) with the same space
 * between each line's outlined text. Icons do not count, so every plate is spaced alike.
 */
export function layoutPlayerPlate(plate: {
  floor: number;
  power: PlateTextMetrics | null;
  name: PlateTextMetrics | null;
  guest: PlateTextMetrics | null;
  invisible: PlateTextMetrics | null;
}) {
  const lines: LineInk[] = [];
  const slots: Array<"power" | "name" | "guest" | "invisible"> = [];
  if (plate.power) { lines.push(textInk(plate.power, NAME_STROKE)); slots.push("power"); }
  if (plate.name) { lines.push(textInk(plate.name, NAME_STROKE)); slots.push("name"); }
  if (plate.guest) { lines.push(textInk(plate.guest, SUBLINE_STROKE)); slots.push("guest"); }
  if (plate.invisible) { lines.push(textInk(plate.invisible, NAME_STROKE)); slots.push("invisible"); }
  const stack = stackPlateLines(lines, plate.floor, PLATE_LINE_GAP);
  const placed = { power: null as number | null, name: null as number | null, guest: null as number | null, invisible: null as number | null };
  slots.forEach((slot, index) => { placed[slot] = stack.baselines[index]; });
  return {
    ...placed,
    top: stack.top,
    /** Each line's ink from top to bottom, bottom line first. */
    boxes: lines.map((line, index) => ({ top: stack.baselines[index] - line.above, bottom: stack.baselines[index] + line.below })),
  };
}

/** Icons are drawn as tall as their line's outlined capitals, so they read as part of it. */
const PLATE_ICON_INK = (capHeight: number) => capHeight + NAME_STROKE;
/** The badge a pixel over that, room for its digit; still inside the gaps. */
const PLATE_BADGE_EXTRA = 1;

/** The power, badge and gender icons' boxes, relative to their line's baseline, for the plate font's cap height. */
export function plateIcons(capHeight: number) {
  const badge = plateIconBox(capHeight, PLATE_ICON_INK(capHeight) + PLATE_BADGE_EXTRA, PRESTIGE_BADGE_ART);
  return {
    power: plateIconBox(capHeight, PLATE_ICON_INK(capHeight), POWER_ART),
    gender: plateIconBox(capHeight, PLATE_ICON_INK(capHeight), GENDER_ART),
    badge,
    // The digit fills more of a badge this small, its outline shrunk with it, so it stays readable.
    badgeDigitFont: plateFont(badge.size * PRESTIGE_DIGIT_SHARE / NAMEPLATE_SCALE),
    badgeDigitStroke: SUBLINE_STROKE * badge.size / OVERHEAD_PRESTIGE_BADGE_SIZE,
  };
}

type DisplayedPlayerPowerEquipment = {
  equippedHead: string;
  equippedChest: string;
  /** Warrior Boots raise armor, so boots count toward power. */
  equippedFeet?: string;
  equippedRightHand: string;
  equippedLeftHand: string;
  /** The active cards in play; equip comparisons leave them out. */
  activeCards?: readonly string[];
};

/** Requires every power-bearing equipment slot for the local world and HUD labels. */
export function displayedPlayerPowerProgress(
  stats: PlayerPowerStats,
  equipment: DisplayedPlayerPowerEquipment,
): PlayerPowerProgress {
  return { ...stats, ...equipment };
}

export function activeSpeechBubbleMessages(messages: readonly SpeechBubbleMessage[], now: number) {
  const active = new Map<string, SpeechBubbleMessage[]>();
  for (let index = messages.length - 1; index >= 0; index -= 1) {
    const message = messages[index];
    const age = now - message.sentAtMs;
    if (age < 0 || age >= SPEECH_BUBBLE_DURATION_MS) continue;
    if (isPresenceChatMessage(message.senderName) || message.senderName === "DUEL" || message.replayId > 0n) continue;
    const stack = active.get(message.sender) ?? [];
    if (stack.length >= MAX_ACTIVE_SPEECH_BUBBLES_PER_PLAYER) continue;
    stack.push(message);
    active.set(message.sender, stack);
  }
  return active;
}

/** Player names, profile portraits, status bars, and speech bubbles. */
export function createPlayerIdentityRenderer(options: {
  ctx: CanvasRenderingContext2D;
  camera: Camera;
  viewport: () => { width: number; height: number };
  onProfileIconsLoaded: () => void;
  powerIcon: HTMLImageElement;
  genderIcons: Record<typeof PLAYER_GENDER_MALE | typeof PLAYER_GENDER_FEMALE, HTMLImageElement>;
  isDeveloper: (identity: string | undefined) => boolean;
  isLocallyInvisible: (identity: string | undefined) => boolean;
  isGuest: (identity: string | undefined) => boolean;
  profileIcon: (identity: string | undefined) => number;
  /** Players' snapshotted looks, for snapshot profile pictures, and a number that moves when one arrives. */
  profileSnapshots?: { look: (identity: string) => ProfileSnapshotLook | undefined; revision: () => number };
  playerGender: (identity: string | undefined) => PlayerGender;
  chatRevision: () => number;
  chatMessages: () => ChatMessage[];
  outlinedText: OutlinedText;
  fillText: FillText;
  roundRect: RoundRect;
  healthBarHeight: number;
  healthBarRadius: number;
}) {
  const prestigeBadge = new Image();
  prestigeBadge.src = PRESTIGE_BADGE_ASSET;
  const residentBadge = residentImage(prestigeBadge);
  const residentPower = residentImage(options.powerIcon);
  const residentGender = {
    [PLAYER_GENDER_MALE]: residentImage(options.genderIcons[PLAYER_GENDER_MALE]),
    [PLAYER_GENDER_FEMALE]: residentImage(options.genderIcons[PLAYER_GENDER_FEMALE]),
  };
  const bubbles = new Map<string, SpeechBubble[]>();
  const speechBubbleLayoutCache = new Map<bigint, SpeechBubble>();
  let renderedSpeechBubbleRevision = -1;
  let nextSpeechBubbleExpiryAt = 0;
  let speechBubbleNow = 0;

  function publicPlayerName(identity: string | undefined, name: string | undefined) {
    const baseName = name || "PLAYER";
    const guestName = options.isGuest(identity) ? `${baseName} (guest)` : baseName;
    // A space after the tags, so "[dev][TheG]rymel" reads as a name with
    // badges rather than one run-on word.
    const prefix = playerNamePrefix(identity, options.isDeveloper(identity));
    return prefix ? `${prefix} ${guestName}` : guestName;
  }

  function renderDomPlayerName(element: HTMLElement, identity: string | undefined, name: string | undefined, gender = options.playerGender(identity)) {
    const baseName = name || "PLAYER";
    replaceChildrenIfChanged(element, target => {
      appendPlayerNameTags(target, identity, options.isDeveloper(identity));
      target.append(document.createTextNode(baseName));
      appendPrestigeBadge(target, identity);
      appendPlayerGenderIcon(target, gender);
      if (options.isGuest(identity)) {
        const guest = document.createElement("span");
        guest.className = "player-name-guest";
        guest.textContent = " (guest)";
        target.append(guest);
      }
    });
  }

  if (options.profileSnapshots) setProfileSnapshotSource(options.profileSnapshots);
  const paintProfileIconCanvas = createProfileIconCanvasPainter(options.onProfileIconsLoaded);

  function updateSpeechBubbles() {
    const now = Date.now();
    speechBubbleNow = now;
    const revision = options.chatRevision();
    if (revision === renderedSpeechBubbleRevision && now < nextSpeechBubbleExpiryAt) return;
    bubbles.clear();
    nextSpeechBubbleExpiryAt = Number.POSITIVE_INFINITY;
    const ctx = options.ctx;
    ctx.save();
    ctx.font = '900 12px "Arial Rounded MT Bold", "Arial Rounded MT", Arial, sans-serif';
    const activeMessageIds = new Set<bigint>();
    for (const [identity, messages] of activeSpeechBubbleMessages(options.chatMessages(), now)) {
      const stack: SpeechBubble[] = [];
      for (const message of messages) {
        activeMessageIds.add(message.id);
        let bubble = speechBubbleLayoutCache.get(message.id);
        if (!bubble) {
          const lines = wrapSpeechBubbleText(message.message, 190);
          const textWidth = Math.max(28, ...lines.map((line) => ctx.measureText(line).width));
          const paddingX = 11;
          const paddingY = 7;
          const lineHeight = 15;
          bubble = {
            sentAtMs: message.sentAtMs,
            lines,
            width: Math.ceil(textWidth + paddingX * 2),
            height: lines.length * lineHeight + paddingY * 2,
          };
          speechBubbleLayoutCache.set(message.id, bubble);
        }
        stack.push(bubble);
        nextSpeechBubbleExpiryAt = Math.min(nextSpeechBubbleExpiryAt, message.sentAtMs + SPEECH_BUBBLE_DURATION_MS);
      }
      bubbles.set(identity, stack);
    }
    for (const messageId of speechBubbleLayoutCache.keys()) {
      if (!activeMessageIds.has(messageId)) speechBubbleLayoutCache.delete(messageId);
    }
    ctx.restore();
    renderedSpeechBubbleRevision = revision;
  }

  function wrapSpeechBubbleText(text: string, maxWidth: number) {
    const lines: string[] = [];
    let line = "";
    for (const word of text.split(/\s+/)) {
      const candidate = line ? `${line} ${word}` : word;
      if (options.ctx.measureText(candidate).width <= maxWidth) {
        line = candidate;
        continue;
      }
      if (line) lines.push(line);
      line = word;
      while (options.ctx.measureText(line).width > maxWidth) {
        let end = line.length - 1;
        while (end > 1 && options.ctx.measureText(line.slice(0, end)).width > maxWidth) end -= 1;
        lines.push(line.slice(0, end));
        line = line.slice(end);
      }
      if (lines.length >= 3) break;
    }
    if (line && lines.length < 3) lines.push(line);
    if (lines.length === 3 && text.length > lines.join(" ").length) {
      while (lines[2].length > 1 && options.ctx.measureText(`${lines[2]}…`).width > maxWidth) lines[2] = lines[2].slice(0, -1);
      lines[2] += "…";
    }
    return lines;
  }

  /** `headTop` is the top of the head or helmet in world space (overhead-plate.ts). */
  function drawSpeechBubble(identity: string | undefined, x: number, headTop: number) {
    if (!identity) return;
    const stack = bubbles.get(identity);
    if (!stack?.length) return;
    const fadeStart = SPEECH_BUBBLE_DURATION_MS - SPEECH_BUBBLE_FADE_MS;
    const paddingY = 7;
    const lineHeight = 15;
    const ctx = options.ctx;
    const visibleWidth = options.viewport().width;
    const anchorScreenX = x * options.camera.zoom;
    const y = headTop;
    const anchorScreenY = y * options.camera.zoom;
    const totalHeight = stack.reduce((height, bubble) => height + bubble.height, 0)
      + SPEECH_BUBBLE_STACK_GAP * (stack.length - 1);
    drawScreenSpaceAt(ctx, options.camera.zoom, x, y, () => {
      ctx.font = '900 12px "Arial Rounded MT Bold", "Arial Rounded MT", Arial, sans-serif';
      ctx.textAlign = "center";
      ctx.textBaseline = "middle";
      // Just over this frame's plate; taken, so a plate hidden later does not leave its height behind.
      const plateTop = plateTops.get(identity);
      plateTops.delete(identity);
      const lift = plateTop === undefined ? SPEECH_BUBBLE_LIFT : SPEECH_BUBBLE_GAP - plateTop;
      let bottom = Math.max(totalHeight + 4, anchorScreenY - lift) - anchorScreenY;
      for (const bubble of stack) {
        const age = speechBubbleNow - bubble.sentAtMs;
        const opacity = age <= fadeStart ? 1 : clamp(1 - (age - fadeStart) / SPEECH_BUBBLE_FADE_MS, 0, 1);
        const centerX = clamp(anchorScreenX, bubble.width / 2 + 4, visibleWidth - bubble.width / 2 - 4) - anchorScreenX;
        const left = Math.round(centerX - bubble.width / 2);
        const top = Math.round(bottom - bubble.height);

        ctx.globalAlpha = opacity * .28;
        ctx.fillStyle = "#050806";
        options.roundRect(left + 1, top + 3, bubble.width, bubble.height, 9);
        ctx.fill();

        ctx.globalAlpha = opacity;
        ctx.fillStyle = "#f4f0df";
        ctx.strokeStyle = "#171b18";
        ctx.lineWidth = 2;
        options.roundRect(left, top, bubble.width, bubble.height, 9);
        ctx.fill();
        ctx.stroke();
        ctx.strokeStyle = "rgba(255, 255, 255, .58)";
        ctx.lineWidth = 1;
        options.roundRect(left + 1.5, top + 1.5, bubble.width - 3, bubble.height - 3, 7.5);
        ctx.stroke();

        ctx.fillStyle = "#20251f";
        bubble.lines.forEach((line, index) => options.fillText(line, centerX, top + paddingY + lineHeight * (index + .5)));
        bottom = top - SPEECH_BUBBLE_STACK_GAP;
      }
    });
  }

  const drawStatusBar = createPlayerStatusBars();
  function drawActorStatus({ x, y, headTop = y + BARE_HEAD_TOP, identity, name, gender, nameColor, hp, maxHp, power, fillColor }: ActorStatus) {
    const ctx = options.ctx;
    // Anchored on the head or helmet in world space, so it clears tall helmets at every camera framing.
    drawScreenSpaceAt(ctx, options.camera.zoom, x, headTop, () => {
      const centerX = 0;
      const barW = PLATE_BAR_WIDTH;
      const barH = options.healthBarHeight;
      const barX = centerX - Math.floor(barW / 2);
      // A pill: the frame, the empty channel and the fill all share the same
      // corner radius, so the bar reads as one rounded shape rather than a
      // rectangle with a border painted round it.
      // A slimmer frame than the old square one: at two pixels the rounded
      // outline alone made the whole bar look twice the size.
      const framePad = PLATE_FRAME_PAD;
      const barY = -OVERHEAD_PLATE_GAP - framePad - barH;
      const fillWidth = Math.round(barW * clamp(hp / maxHp, 0, 1));
      const bar = { x: barX, y: barY, width: barW, height: barH, pad: framePad, radius: options.healthBarRadius, fillWidth, fillColor };
      // Copied from a bar drawn once per look (player-status-bar.ts), else drawn here.
      if (!drawStatusBar(ctx, bar)) paintPlayerStatusBar(ctx, bar);
      ctx.save();
      ctx.font = PLATE_TEXT_FONT;
      ctx.textAlign = "center";
      ctx.textBaseline = "middle";
      options.outlinedText(`${formatCompactNumber(Math.max(0, Math.ceil(hp)))} / ${formatCompactNumber(Math.ceil(maxHp))}`, centerX, healthBarTextY(barY, barH), "#ffffff", HEALTH_TEXT_STROKE);
      ctx.restore();
      paintPlayerIdentity(identity, name, power, centerX, barY - framePad, nameColor, gender);
    });
  }

  // Ink is measured once per font and text, not every frame.
  const plateTextMetrics = new Map<string, PlateTextMetrics>();
  function measurePlateText(text: string, fontPx: number): PlateTextMetrics {
    const ctx = options.ctx;
    const key = `${ctx.font}\u0000${text}`;
    let metrics = plateTextMetrics.get(key);
    if (metrics) return metrics;
    if (plateTextMetrics.size >= PLATE_TEXT_METRICS_LIMIT) plateTextMetrics.clear();
    metrics = plateTextInk(ctx.measureText(text), fontPx);
    plateTextMetrics.set(key, metrics);
    return metrics;
  }

  let icons: ReturnType<typeof plateIcons> | null = null;
  let iconsCapHeight = 0;
  /** The icons for the current font, sized once (the font's cap height is measured, not guessed). */
  function currentPlateIcons() {
    const capHeight = measurePlateText("H", PLATE_TEXT_PX).ascent;
    if (!icons || capHeight !== iconsCapHeight) { icons = plateIcons(capHeight); iconsCapHeight = capHeight; }
    return icons;
  }

  /** Lift from the anchor to the top of each player's plate this frame, for the speech bubble drawn after it. */
  const plateTops = new Map<string, number>();

  /** The plate's lines stacked up from `floor`, evenly spaced by their ink (layoutPlayerPlate). */
  function paintPlayerIdentity(identity: string | undefined, name: string, power: number | null, centerX: number, floor: number, color: string, explicitGender?: PlayerGender) {
    const ctx = options.ctx;
    const guest = Boolean(name) && options.isGuest(identity);
    const displayName = guest ? name.replace(/\s*\(guest\)$/i, "") : name;
    const powerValue = name && power !== null ? formatCompactNumber(power) : "";
    ctx.save();
    ctx.font = PLATE_TEXT_FONT;
    const nameMetrics = displayName ? measurePlateText(displayName, PLATE_TEXT_PX) : null;
    const powerMetrics = powerValue ? measurePlateText(powerValue, PLATE_TEXT_PX) : null;
    const guestMetrics = guest ? measurePlateText(GUEST_LABEL, PLATE_TEXT_PX) : null;
    const iconBoxes = currentPlateIcons();
    const gender = explicitGender ?? options.playerGender(identity);
    const genderIcon = nameMetrics && (gender === PLAYER_GENDER_MALE || gender === PLAYER_GENDER_FEMALE)
      ? residentGender[gender]()
      : null;
    // After the name, before the gender icon, at the same size as the power
    // sword below it. Its width joins the label so the whole stays centred.
    const prestige = playerPrestigeLevel(identity);
    const badge = nameMetrics && prestige > 0 ? residentBadge() : null;
    const powerIcon = powerMetrics ? residentPower() : null;
    let invisibleMetrics: PlateTextMetrics | null = null;
    if (options.isLocallyInvisible(identity)) {
      ctx.font = INVISIBLE_FONT;
      invisibleMetrics = measurePlateText(INVISIBLE_LABEL, INVISIBLE_PX);
      ctx.font = PLATE_TEXT_FONT;
    }
    const layout = layoutPlayerPlate({
      floor,
      power: powerMetrics,
      name: nameMetrics,
      guest: guestMetrics,
      invisible: invisibleMetrics,
    });
    if (identity) plateTops.set(identity, layout.top);
    ctx.textBaseline = "alphabetic";
    if (nameMetrics && layout.name !== null) {
      const baseline = layout.name;
      const genderIconHeight = iconBoxes.gender.size;
      const genderIconWidth = genderIcon ? genderIconHeight * genderIcon.width / genderIcon.height : 0;
      const genderIconGap = genderIcon ? OVERHEAD_GENDER_ICON_GAP : 0;
      const badgeSize = badge ? iconBoxes.badge.size : 0;
      const badgeGap = badge ? OVERHEAD_BADGE_GAP : 0;
      const nameWidth = nameMetrics.width;
      const labelWidth = nameWidth + badgeGap + badgeSize + genderIconGap + genderIconWidth;
      const textLeft = centerX - labelWidth / 2;
      const badgeLeft = textLeft + nameWidth + badgeGap;
      ctx.textAlign = "left";
      if (displayName.startsWith(DEVELOPER_BADGE)) {
        const prefixWidth = measurePlateText(DEVELOPER_BADGE, PLATE_TEXT_PX).width;
        options.outlinedText(DEVELOPER_BADGE, textLeft, baseline, "#ffd85b", NAME_STROKE);
        options.outlinedText(displayName.slice(DEVELOPER_BADGE.length), textLeft + prefixWidth, baseline, color, NAME_STROKE);
      } else {
        options.outlinedText(displayName, textLeft, baseline, color, NAME_STROKE);
      }
      if (badge) {
        ctx.imageSmoothingEnabled = true;
        const badgeTop = baseline + iconBoxes.badge.top;
        ctx.drawImage(badge, badgeLeft, badgeTop, badgeSize, badgeSize);
        // White with the same outline every other overhead label carries. The
        // digit is drawn at .515 rather than the middle because "middle" centres
        // the font's em box, not the ink, and the shield's own centre is above
        // the middle of its square; measured, the two land together there.
        ctx.font = iconBoxes.badgeDigitFont;
        ctx.textAlign = "center";
        ctx.textBaseline = "middle";
        options.outlinedText(String(prestige), badgeLeft + badgeSize / 2, badgeTop + badgeSize * .515, "#ffffff", iconBoxes.badgeDigitStroke);
        ctx.textBaseline = "alphabetic";
        ctx.font = PLATE_TEXT_FONT;
      }
      if (genderIcon) {
        ctx.imageSmoothingEnabled = true;
        ctx.drawImage(
          genderIcon,
          textLeft + nameWidth + badgeGap + badgeSize + genderIconGap + OVERHEAD_GENDER_ICON_OFFSET_X,
          baseline + iconBoxes.gender.top,
          Math.round(genderIconWidth),
          genderIconHeight,
        );
      }
    }
    if (guestMetrics && layout.guest !== null) {
      ctx.textAlign = "center";
      options.outlinedText(GUEST_LABEL, centerX, layout.guest, "#a9b1ad", SUBLINE_STROKE);
    }
    if (powerValue && layout.power !== null) {
      drawPlayerPowerLabel(ctx, options.outlinedText, powerIcon, powerValue, centerX, layout.power, { scale: NAMEPLATE_SCALE, strokeWidth: NAME_STROKE, baseline: "alphabetic", iconBox: iconBoxes.power });
    }
    if (invisibleMetrics && layout.invisible !== null) {
      ctx.font = INVISIBLE_FONT;
      ctx.textAlign = "center";
      options.outlinedText(INVISIBLE_LABEL, centerX, layout.invisible, "#c9a6ff", NAME_STROKE);
    }
    ctx.restore();
  }

  /** A name and power with no bar, about where they sit over one; `headTop` as drawSpeechBubble's. */
  function drawPlayerIdentity(identity: string | undefined, name: string, power: number | null, centerX: number, headTop: number, color: string, explicitGender?: PlayerGender) {
    if (!name) return;
    drawScreenSpaceAt(options.ctx, options.camera.zoom, centerX, headTop, () => {
      paintPlayerIdentity(identity, name, power, 0, -OVERHEAD_IDENTITY_LIFT + PLATE_LINE_GAP, color, explicitGender);
    });
  }

  function playerPower(stats: Pick<PlayerState, "attackRate" | "damage" | "maxHp" | "armor" | "regen">) {
    return playerPowerForStats(stats);
  }

  return { publicPlayerName, renderDomPlayerName, applyProfileIcon, paintProfileIconCanvas, updateSpeechBubbles, drawSpeechBubble, drawActorStatus, drawPlayerIdentity, playerPower };
}
