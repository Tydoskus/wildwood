import { GUILD_HALL_FEET_OFFSET, GUILD_HALL_WORLD } from "../../../shared/guild-hall";
import { guildEmblemCell } from "../../ui/guild-emblems";
import { GUILD_HALL_INTERIOR_LEFT, guildHallRoomPicture, guildHallSeatAt, guildHallShown, type GuildHallSeat } from "../guild-hall";
import type { Camera } from "./camera";
import { snapWorldRenderCoordinate } from "./render-space";

/** Sitting: the body drops this far onto the stool, and nothing of it below this far under its position is drawn. */
const SIT_DROP = 6, SIT_CLIP = 16;
/** Sitting faces the table: north seats look down at it, south seats up (an angle, y down). */
export const GUILD_HALL_SEAT_FACING: Readonly<Record<GuildHallSeat["side"], number>> = { north: Math.PI / 2, south: -Math.PI / 2 };

/** The seat someone standing still at this position is in, on a guild hall map. */
export const seatedAt = (x: number, y: number) => guildHallShown.seats.length ? guildHallSeatAt(x, y + GUILD_HALL_FEET_OFFSET) : null;

/**
 * Draws someone sitting at the great table: their legs (under the table top or
 * on the stool) cut away and the body lowered onto the seat. `screenY` is
 * their position on screen; anyone not seated is drawn as they are.
 */
export function drawSeated(ctx: CanvasRenderingContext2D, screenY: number, seated: boolean, draw: () => void) {
  if (!seated) { draw(); return; }
  ctx.save();
  ctx.beginPath();
  ctx.rect(-1e5, -1e5, 2e5, 1e5 + screenY + SIT_CLIP);
  ctx.clip();
  ctx.translate(0, SIT_DROP);
  draw();
  ctx.restore();
}

/** The dark around the great hall and the room for the hall's size, under its furniture. */
export function createGuildHallRoomsDrawer(options: {
  ctx: CanvasRenderingContext2D;
  camera: Camera;
  rooms: () => HTMLImageElement | undefined;
  devicePixelRatio: () => number;
}) {
  return (viewRight: number, viewBottom: number) => {
    const { ctx, camera } = options;
    const left = Math.max(GUILD_HALL_INTERIOR_LEFT, camera.x), top = Math.max(0, camera.y);
    const right = Math.min(GUILD_HALL_WORLD.width, viewRight), bottom = Math.min(GUILD_HALL_WORLD.height, viewBottom);
    if (left >= right || top >= bottom) return;
    ctx.fillStyle = "#000";
    ctx.fillRect(left - camera.x, top - camera.y, right - left, bottom - top);
    const image = options.rooms();
    if (!image?.complete || image.naturalWidth <= 0) return;
    const room = guildHallRoomPicture(guildHallShown.size);
    const snap = (value: number) => snapWorldRenderCoordinate(value, camera.zoom, options.devicePixelRatio());
    ctx.drawImage(image, room.sx, room.sy, room.w, room.h, snap(room.x - camera.x), snap(room.y - camera.y), room.w, room.h);
  };
}

/** Draws the hall's guild badge, `size` square, centred at a point on screen; nothing until the guild is known. */
export function createGuildCrestDrawer(sheets: () => readonly (HTMLImageElement | undefined)[] | undefined) {
  return (ctx: CanvasRenderingContext2D, x: number, y: number, size: number) => {
    if (guildHallShown.emblem < 0) return;
    const cell = guildEmblemCell(guildHallShown.emblem);
    const image = sheets()?.[cell.sheet];
    if (!image?.complete || image.naturalWidth <= 0) return;
    // The sheets are fitted at 1254px; a smaller export scales the frame with it.
    const scale = image.naturalWidth / 1254;
    ctx.drawImage(image, cell.x * scale, cell.y * scale, cell.size * scale, cell.size * scale, x - size / 2, y - size / 2, size, size);
  };
}
