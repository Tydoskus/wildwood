import { DEFAULT_ATTACK_INTERVAL, MIN_ATTACK_INTERVAL } from "../../../shared/rules";
import { formatCompactNumber } from "../../ui/number-format";
import type { ChatMessage } from "../../wildwood-coop";
import { clamp } from "../math";
import type { Camera } from "./camera";
import type { ActorStatus } from "./actor-renderer";
import type { PlayerState } from "./types";

type OutlinedText = (text: string, x: number, y: number, color: string, strokeWidth?: number) => void;
type FillText = (text: string, x: number, y: number) => void;
type RoundRect = (x: number, y: number, width: number, height: number, radius: number) => void;
type SpeechBubble = { text: string; sentAtMs: number; lines: string[]; textWidth: number };

const DEVELOPER_BADGE = "[dev]";
const PROFILE_PORTRAIT_ZOOM = 1.03;
const PROFILE_PORTRAIT_GRID = 8;
const PROFILE_PORTRAIT_POSITION_START = (PROFILE_PORTRAIT_ZOOM - 1) / 2 / (PROFILE_PORTRAIT_GRID * PROFILE_PORTRAIT_ZOOM - 1) * 100;
const SPEECH_BUBBLE_DURATION_MS = 6_000;
const SPEECH_BUBBLE_FADE_MS = 1_250;

/** Player names, profile portraits, status bars, and speech bubbles. */
export function createPlayerIdentityRenderer(options: {
  ctx: CanvasRenderingContext2D;
  camera: Camera;
  viewport: () => { width: number; height: number };
  profileIconSheet: HTMLImageElement;
  antiAliasingEnabled: () => boolean;
  isDeveloper: (identity: string | undefined) => boolean;
  isGuest: (identity: string | undefined) => boolean;
  profileIcon: (identity: string | undefined) => number;
  chatRevision: () => number;
  chatMessages: () => ChatMessage[];
  outlinedText: OutlinedText;
  fillText: FillText;
  roundRect: RoundRect;
  healthBarHeight: number;
}) {
  const bubbles = new Map<string, SpeechBubble>();
  let renderedSpeechBubbleRevision = -1;
  let nextSpeechBubbleExpiryAt = 0;

  function publicPlayerName(identity: string | undefined, name: string | undefined) {
    const baseName = name || "PLAYER";
    const guestName = options.isGuest(identity) ? `${baseName} (guest)` : baseName;
    return options.isDeveloper(identity) ? `${DEVELOPER_BADGE} ${guestName}` : guestName;
  }

  function renderDomPlayerName(element: HTMLElement, identity: string | undefined, name: string | undefined) {
    const baseName = name || "PLAYER";
    element.replaceChildren();
    if (options.isDeveloper(identity)) {
      const badge = document.createElement("span");
      badge.className = "dev-badge";
      badge.textContent = `${DEVELOPER_BADGE} `;
      element.appendChild(badge);
    }
    element.append(document.createTextNode(baseName));
    if (options.isGuest(identity)) element.append(document.createTextNode(" (guest)"));
  }

  function applyProfileIcon(element: HTMLElement, iconIndex: number) {
    const index = Math.max(0, Math.min(63, Math.floor(Number(iconIndex) || 0)));
    const column = index % PROFILE_PORTRAIT_GRID;
    const row = Math.floor(index / PROFILE_PORTRAIT_GRID);
    const positionStep = PROFILE_PORTRAIT_ZOOM / (PROFILE_PORTRAIT_GRID * PROFILE_PORTRAIT_ZOOM - 1) * 100;
    element.style.backgroundImage = 'url("assets/wildwood/profile-portraits-grid-v2.png")';
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
    iconContext.imageSmoothingEnabled = options.antiAliasingEnabled();
    iconContext.drawImage(sheet, (index % PROFILE_PORTRAIT_GRID) * cellWidth + insetX, Math.floor(index / PROFILE_PORTRAIT_GRID) * cellHeight + insetY, cellWidth / PROFILE_PORTRAIT_ZOOM, cellHeight / PROFILE_PORTRAIT_ZOOM, 0, 0, canvas.width, canvas.height);
  }

  function updateSpeechBubbles() {
    const now = Date.now();
    const revision = options.chatRevision();
    if (revision === renderedSpeechBubbleRevision && now < nextSpeechBubbleExpiryAt) return;
    bubbles.clear();
    nextSpeechBubbleExpiryAt = Number.POSITIVE_INFINITY;
    const ctx = options.ctx;
    ctx.save();
    ctx.font = '900 12px "Arial Rounded MT Bold", "Arial Rounded MT", Arial, sans-serif';
    for (let index = options.chatMessages().length - 1; index >= 0; index -= 1) {
      const message = options.chatMessages()[index];
      const age = now - message.sentAtMs;
      if (age < 0 || age >= SPEECH_BUBBLE_DURATION_MS) continue;
      if (message.senderName === "DUEL" || message.replayId > 0n || bubbles.has(message.sender)) continue;
      const lines = wrapSpeechBubbleText(message.message, 190);
      const textWidth = Math.max(28, ...lines.map((line) => ctx.measureText(line).width));
      bubbles.set(message.sender, { text: message.message, sentAtMs: message.sentAtMs, lines, textWidth });
      nextSpeechBubbleExpiryAt = Math.min(nextSpeechBubbleExpiryAt, message.sentAtMs + SPEECH_BUBBLE_DURATION_MS);
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
    const bubble = bubbles.get(identity);
    if (!bubble) return;
    const age = Date.now() - bubble.sentAtMs;
    const fadeStart = SPEECH_BUBBLE_DURATION_MS - SPEECH_BUBBLE_FADE_MS;
    const opacity = age <= fadeStart ? 1 : clamp(1 - (age - fadeStart) / SPEECH_BUBBLE_FADE_MS, 0, 1);
    const paddingX = 10;
    const paddingY = 7;
    const lineHeight = 15;
    const ctx = options.ctx;
    ctx.save();
    ctx.font = '900 12px "Arial Rounded MT Bold", "Arial Rounded MT", Arial, sans-serif';
    const width = Math.ceil(bubble.textWidth + paddingX * 2);
    const height = bubble.lines.length * lineHeight + paddingY * 2;
    const visibleWidth = options.viewport().width / options.camera.zoom;
    const centerX = clamp(x, width / 2 + 4, visibleWidth - width / 2 - 4);
    const bottom = Math.max(height + 8, y - 108);
    const left = Math.round(centerX - width / 2);
    const top = Math.round(bottom - height);
    ctx.globalAlpha = opacity;
    ctx.fillStyle = "#f4f0df";
    ctx.strokeStyle = "#171b18";
    ctx.lineWidth = 2;
    options.roundRect(left, top, width, height, 8);
    ctx.fill();
    ctx.stroke();
    ctx.beginPath();
    ctx.moveTo(centerX - 6, bottom - 1);
    ctx.lineTo(centerX, bottom + 7);
    ctx.lineTo(centerX + 6, bottom - 1);
    ctx.closePath();
    ctx.fill();
    ctx.stroke();
    ctx.fillStyle = "#20251f";
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    bubble.lines.forEach((line, index) => options.fillText(line, centerX, top + paddingY + lineHeight * (index + .5)));
    ctx.restore();
  }

  function drawActorStatus({ x, y, identity, name, nameColor, hp, maxHp, power, fillColor }: ActorStatus) {
    const ctx = options.ctx;
    ctx.save();
    const centerX = Math.round(x);
    const barW = 94 * 1.05;
    const barH = options.healthBarHeight;
    const barX = centerX - Math.floor(barW / 2);
    const barY = Math.round(y - 62);
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
    options.outlinedText(`${formatCompactNumber(Math.max(0, Math.ceil(hp)))} / ${formatCompactNumber(Math.ceil(maxHp))}`, centerX, barY + barH / 2, "#ffffff", 2);
    ctx.restore();
    drawPlayerIdentity(identity, name, power, centerX, barY - 7, nameColor);
    ctx.restore();
  }

  function drawPlayerIdentity(_identity: string | undefined, name: string, power: number | null, centerX: number, bottom: number, color: string) {
    if (!name) return;
    const ctx = options.ctx;
    const powerValue = power === null ? "" : formatCompactNumber(power);
    ctx.save();
    ctx.font = '900 14px "Arial Rounded MT Bold", "Arial Rounded MT", Arial, sans-serif';
    ctx.textBaseline = "bottom";
    const nameWidth = ctx.measureText(name).width;
    const textLeft = Math.round(centerX - nameWidth / 2);
    const nameBottom = powerValue ? bottom - 18 : bottom;
    const developerPrefix = `${DEVELOPER_BADGE} `;
    if (name.startsWith(developerPrefix)) {
      const playerName = name.slice(developerPrefix.length);
      const prefixWidth = ctx.measureText(developerPrefix).width;
      ctx.textAlign = "left";
      options.outlinedText(developerPrefix, textLeft, nameBottom, "#ffd85b", 4);
      options.outlinedText(playerName, textLeft + prefixWidth, nameBottom, color, 4);
    } else {
      ctx.textAlign = "center";
      options.outlinedText(name, centerX, nameBottom, color, 4);
    }
    if (powerValue) {
      const powerName = "Power:";
      const powerNameWidth = ctx.measureText(powerName).width;
      const powerValueWidth = ctx.measureText(` ${powerValue}`).width;
      const left = Math.round(centerX - (powerNameWidth + powerValueWidth) / 2);
      ctx.textAlign = "left";
      options.outlinedText(powerName, left, bottom, "#ffe05d", 4);
      options.outlinedText(` ${powerValue}`, left + powerNameWidth, bottom, "#ffffff", 4);
    }
    ctx.restore();
  }

  function playerPower(stats: Pick<PlayerState, "attackRate" | "damage" | "maxHp" | "armor" | "regen">) {
    const attackSpeedMultiplier = DEFAULT_ATTACK_INTERVAL / Math.max(MIN_ATTACK_INTERVAL, stats.attackRate);
    return Math.min(0xffffffff, Math.round(stats.damage * attackSpeedMultiplier + stats.maxHp + stats.armor * 3 + stats.regen * 10));
  }

  return { publicPlayerName, renderDomPlayerName, applyProfileIcon, paintProfileIconCanvas, updateSpeechBubbles, drawSpeechBubble, drawActorStatus, playerPower };
}
