import {
  playerPowerForStats,
  type PlayerPowerProgress,
  type PlayerPowerStats,
} from "../../../shared/player-power";
import { isPresenceChatMessage } from "../../../shared/presence-chat";
import {
  PLAYER_GENDER_FEMALE,
  PLAYER_GENDER_MALE,
  type PlayerGender,
} from "../../../shared/player-gender";
import { formatCompactNumber } from "../../ui/number-format";
import { appendPlayerGenderIcon } from "../../ui/player-gender";
import type { ChatMessage } from "../../wildstat-coop";
import { clamp } from "../math";
import type { Camera } from "./camera";
import type { ActorStatus } from "./actor-renderer";
import { healthBarTextY } from "./health-bar-layout";
import { drawScreenSpaceAt } from "./render-space";
import type { PlayerState } from "./types";

type OutlinedText = (text: string, x: number, y: number, color: string, strokeWidth?: number) => void;
type FillText = (text: string, x: number, y: number) => void;
type RoundRect = (x: number, y: number, width: number, height: number, radius: number) => void;
type SpeechBubbleMessage = Pick<ChatMessage, "id" | "sender" | "senderName" | "message" | "replayId" | "sentAtMs">;
type SpeechBubble = { sentAtMs: number; lines: string[]; width: number; height: number };

const DEVELOPER_BADGE = "[dev]";
const PROFILE_PORTRAIT_ZOOM = 1.03;
const PROFILE_PORTRAIT_GRID = 8;
const PROFILE_PORTRAIT_POSITION_START = (PROFILE_PORTRAIT_ZOOM - 1) / 2 / (PROFILE_PORTRAIT_GRID * PROFILE_PORTRAIT_ZOOM - 1) * 100;
const SPEECH_BUBBLE_DURATION_MS = 8_000;
const SPEECH_BUBBLE_FADE_MS = 1_250;
const SPEECH_BUBBLE_STACK_GAP = 5;
const OVERHEAD_GENDER_ICON_OFFSET_Y = -1;
const OVERHEAD_POWER_ICON_OFFSET_Y = 1;
export const MAX_ACTIVE_SPEECH_BUBBLES_PER_PLAYER = 3;

type DisplayedPlayerPowerEquipment = {
  equippedHead: string;
  equippedChest: string;
  equippedRightHand: string;
  equippedLeftHand: string;
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
  profileIconSheet: HTMLImageElement;
  powerIcon: HTMLImageElement;
  genderIcons: Record<typeof PLAYER_GENDER_MALE | typeof PLAYER_GENDER_FEMALE, HTMLImageElement>;
  isDeveloper: (identity: string | undefined) => boolean;
  isLocallyInvisible: (identity: string | undefined) => boolean;
  isGuest: (identity: string | undefined) => boolean;
  profileIcon: (identity: string | undefined) => number;
  playerGender: (identity: string | undefined) => PlayerGender;
  chatRevision: () => number;
  chatMessages: () => ChatMessage[];
  outlinedText: OutlinedText;
  fillText: FillText;
  roundRect: RoundRect;
  healthBarHeight: number;
}) {
  const bubbles = new Map<string, SpeechBubble[]>();
  const speechBubbleLayoutCache = new Map<bigint, SpeechBubble>();
  let renderedSpeechBubbleRevision = -1;
  let nextSpeechBubbleExpiryAt = 0;
  let speechBubbleNow = 0;

  function publicPlayerName(identity: string | undefined, name: string | undefined) {
    const baseName = name || "PLAYER";
    const guestName = options.isGuest(identity) ? `${baseName} (guest)` : baseName;
    return options.isDeveloper(identity) ? `${DEVELOPER_BADGE} ${guestName}` : guestName;
  }

  function renderDomPlayerName(element: HTMLElement, identity: string | undefined, name: string | undefined, gender = options.playerGender(identity)) {
    const baseName = name || "PLAYER";
    element.replaceChildren();
    if (options.isDeveloper(identity)) {
      const badge = document.createElement("span");
      badge.className = "dev-badge";
      badge.textContent = `${DEVELOPER_BADGE} `;
      element.appendChild(badge);
    }
    element.append(document.createTextNode(baseName));
    appendPlayerGenderIcon(element, gender);
    if (options.isGuest(identity)) {
      const guest = document.createElement("span");
      guest.className = "player-name-guest";
      guest.textContent = " (guest)";
      element.append(guest);
    }
  }

  function applyProfileIcon(element: HTMLElement, iconIndex: number) {
    const index = Math.max(0, Math.min(63, Math.floor(Number(iconIndex) || 0)));
    const column = index % PROFILE_PORTRAIT_GRID;
    const row = Math.floor(index / PROFILE_PORTRAIT_GRID);
    const positionStep = PROFILE_PORTRAIT_ZOOM / (PROFILE_PORTRAIT_GRID * PROFILE_PORTRAIT_ZOOM - 1) * 100;
    element.style.backgroundImage = 'url("assets/wildstat/profile-portraits-grid-v2.png")';
    element.style.backgroundRepeat = "no-repeat";
    element.style.backgroundSize = "824% 824%";
    element.style.backgroundPosition = `${PROFILE_PORTRAIT_POSITION_START + column * positionStep}% ${PROFILE_PORTRAIT_POSITION_START + row * positionStep}%`;
    element.dataset.profileIcon = String(index);
  }

  function paintProfileIconCanvas(canvas: HTMLCanvasElement, iconIndex: number) {
    const iconContext = canvas.getContext("2d");
    if (!iconContext) return;
    iconContext.clearRect(0, 0, canvas.width, canvas.height);
    const sheet = options.profileIconSheet;
    if (!sheet.complete || sheet.naturalWidth <= 0) return;
    const index = Math.max(0, Math.min(63, Math.floor(Number(iconIndex) || 0)));
    const cellWidth = sheet.naturalWidth / PROFILE_PORTRAIT_GRID;
    const cellHeight = sheet.naturalHeight / PROFILE_PORTRAIT_GRID;
    const insetX = cellWidth * (1 - 1 / PROFILE_PORTRAIT_ZOOM) / 2;
    const insetY = cellHeight * (1 - 1 / PROFILE_PORTRAIT_ZOOM) / 2;
    iconContext.imageSmoothingEnabled = true;
    iconContext.drawImage(sheet, (index % PROFILE_PORTRAIT_GRID) * cellWidth + insetX, Math.floor(index / PROFILE_PORTRAIT_GRID) * cellHeight + insetY, cellWidth / PROFILE_PORTRAIT_ZOOM, cellHeight / PROFILE_PORTRAIT_ZOOM, 0, 0, canvas.width, canvas.height);
  }

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

  function drawSpeechBubble(identity: string | undefined, x: number, y: number) {
    if (!identity) return;
    const stack = bubbles.get(identity);
    if (!stack?.length) return;
    const fadeStart = SPEECH_BUBBLE_DURATION_MS - SPEECH_BUBBLE_FADE_MS;
    const paddingY = 7;
    const lineHeight = 15;
    const ctx = options.ctx;
    const visibleWidth = options.viewport().width;
    const anchorScreenX = x * options.camera.zoom;
    const anchorScreenY = y * options.camera.zoom;
    const totalHeight = stack.reduce((height, bubble) => height + bubble.height, 0)
      + SPEECH_BUBBLE_STACK_GAP * (stack.length - 1);
    drawScreenSpaceAt(ctx, options.camera.zoom, x, y, () => {
      ctx.font = '900 12px "Arial Rounded MT Bold", "Arial Rounded MT", Arial, sans-serif';
      ctx.textAlign = "center";
      ctx.textBaseline = "middle";
      let bottom = Math.max(totalHeight + 4, anchorScreenY - (options.isGuest(identity) ? 124 : 108)) - anchorScreenY;
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

  function drawActorStatus({ x, y, identity, name, gender, nameColor, hp, maxHp, power, fillColor }: ActorStatus) {
    const ctx = options.ctx;
    drawScreenSpaceAt(ctx, options.camera.zoom, x, y, () => {
      const centerX = 0;
      const barW = 94 * 1.05;
      const barH = options.healthBarHeight;
      const barX = centerX - Math.floor(barW / 2);
      const barY = -62;
      const fillWidth = Math.round(barW * clamp(hp / maxHp, 0, 1));
      ctx.fillStyle = "rgba(0,0,0,.88)";
      ctx.fillRect(barX - 2, barY - 2, barW + 4, barH + 4);
      ctx.fillStyle = "#402326";
      ctx.fillRect(barX, barY, barW, barH);
      ctx.fillStyle = fillColor;
      ctx.fillRect(barX, barY, fillWidth, barH);
      if (fillWidth > 0) {
        ctx.fillStyle = "rgba(255,255,255,.25)";
        ctx.fillRect(barX, barY, fillWidth, 1);
      }
      ctx.save();
      ctx.font = '900 11px "Arial Rounded MT Bold", "Arial Rounded MT", Arial, sans-serif';
      ctx.textAlign = "center";
      ctx.textBaseline = "middle";
      options.outlinedText(`${formatCompactNumber(Math.max(0, Math.ceil(hp)))} / ${formatCompactNumber(Math.ceil(maxHp))}`, centerX, healthBarTextY(barY, barH), "#ffffff", 2);
      ctx.restore();
      if (options.isLocallyInvisible(identity)) {
        ctx.save();
        ctx.font = '900 11px "Arial Rounded MT Bold", "Arial Rounded MT", Arial, sans-serif';
        ctx.textAlign = "center";
        ctx.textBaseline = "bottom";
        options.outlinedText("Invisible", centerX, barY - (options.isGuest(identity) ? 55 : 39), "#c9a6ff", 4);
        ctx.restore();
      }
      paintPlayerIdentity(identity, name, power, centerX, barY - 7, nameColor, gender);
    });
  }

  function paintPlayerIdentity(identity: string | undefined, name: string, power: number | null, centerX: number, bottom: number, color: string, explicitGender?: PlayerGender) {
    if (!name) return;
    const ctx = options.ctx;
    const guest = options.isGuest(identity);
    const displayName = guest ? name.replace(/\s*\(guest\)$/i, "") : name;
    const powerValue = power === null ? "" : formatCompactNumber(power);
    ctx.save();
    ctx.font = '900 14px "Arial Rounded MT Bold", "Arial Rounded MT", Arial, sans-serif';
    ctx.textBaseline = "bottom";
    const nameWidth = ctx.measureText(displayName).width;
    const gender = explicitGender ?? options.playerGender(identity);
    const genderIcon = gender === PLAYER_GENDER_MALE || gender === PLAYER_GENDER_FEMALE
      ? options.genderIcons[gender]
      : null;
    const hasGenderIcon = Boolean(genderIcon?.complete && genderIcon.naturalWidth > 0 && genderIcon.naturalHeight > 0);
    const genderIconHeight = hasGenderIcon ? 15 : 0;
    const genderIconWidth = hasGenderIcon && genderIcon
      ? genderIconHeight * genderIcon.naturalWidth / genderIcon.naturalHeight
      : 0;
    const genderIconGap = hasGenderIcon ? 3 : 0;
    const labelWidth = nameWidth + genderIconGap + genderIconWidth;
    const textLeft = centerX - labelWidth / 2;
    const nameBottom = powerValue ? bottom - 18 : bottom;
    const developerPrefix = `${DEVELOPER_BADGE} `;
    if (displayName.startsWith(developerPrefix)) {
      const playerName = displayName.slice(developerPrefix.length);
      const prefixWidth = ctx.measureText(developerPrefix).width;
      ctx.textAlign = "left";
      options.outlinedText(developerPrefix, textLeft, nameBottom, "#ffd85b", 4);
      options.outlinedText(playerName, textLeft + prefixWidth, nameBottom, color, 4);
    } else {
      ctx.textAlign = "left";
      options.outlinedText(displayName, textLeft, nameBottom, color, 4);
    }
    if (hasGenderIcon && genderIcon) {
      ctx.imageSmoothingEnabled = true;
      ctx.drawImage(
        genderIcon,
        textLeft + nameWidth + genderIconGap,
        nameBottom - genderIconHeight + OVERHEAD_GENDER_ICON_OFFSET_Y,
        Math.round(genderIconWidth),
        genderIconHeight,
      );
    }
    if (guest) {
      ctx.font = '900 10px "Arial Rounded MT Bold", "Arial Rounded MT", Arial, sans-serif';
      ctx.textAlign = "center";
      options.outlinedText("(guest)", centerX, nameBottom - 16, "#a9b1ad", 3);
    }
    if (powerValue) {
      const hasPowerIcon = options.powerIcon.complete && options.powerIcon.naturalWidth > 0;
      const iconSize = hasPowerIcon ? 16 : 0;
      const iconGap = hasPowerIcon ? 3 : 0;
      const powerValueWidth = ctx.measureText(powerValue).width;
      const left = centerX - (iconSize + iconGap + powerValueWidth) / 2;
      ctx.textAlign = "left";
      options.outlinedText(powerValue, left, bottom, "#ffffff", 4);
      if (hasPowerIcon) {
        ctx.imageSmoothingEnabled = true;
        ctx.drawImage(
          options.powerIcon,
          left + powerValueWidth + iconGap,
          bottom - iconSize + OVERHEAD_POWER_ICON_OFFSET_Y,
          iconSize,
          iconSize,
        );
      }
    }
    ctx.restore();
  }

  function drawPlayerIdentity(identity: string | undefined, name: string, power: number | null, centerX: number, bottom: number, color: string, explicitGender?: PlayerGender) {
    if (!name) return;
    drawScreenSpaceAt(options.ctx, options.camera.zoom, centerX, bottom, () => {
      paintPlayerIdentity(identity, name, power, 0, 0, color, explicitGender);
    });
  }

  function playerPower(stats: Pick<PlayerState, "attackRate" | "damage" | "maxHp" | "armor" | "regen">) {
    return playerPowerForStats(stats);
  }

  return { publicPlayerName, renderDomPlayerName, applyProfileIcon, paintProfileIconCanvas, updateSpeechBubbles, drawSpeechBubble, drawActorStatus, drawPlayerIdentity, playerPower };
}
