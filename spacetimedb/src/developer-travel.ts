import { Identity } from "spacetimedb";
import { SenderError } from "spacetimedb/server";
import { HOME_EXTERIOR_MAP_ID } from "../../shared/home";
import { combatMap } from "../../shared/enemy-defeats";

// Called only after the authenticated developer check; never exposed as a public location directory.
export function findDeveloperTravelTarget(ctx: any, query: string) {
  const name = query.trim().toLowerCase();
  if (!name || name.length > 80) throw new SenderError("Enter a player username.");
  if (/^(?:0x)?[a-f0-9]{64}$/.test(name)) return readDeveloperTravelTarget(ctx, Identity.fromString(name));
  const matches = [...ctx.db.playerProfile.iter()].filter((row: any) => row.displayName.toLowerCase() === name);
  if (matches.length !== 1) throw new SenderError(matches.length ? "Multiple players have that name. Use their account ID." : "Player not found.");
  return readDeveloperTravelTarget(ctx, matches[0].identity);
}

export function readDeveloperTravelTarget(ctx: any, identity: Identity, expectedMap?: string) {
  if (identity.equals(ctx.sender)) throw new SenderError("You are already at your own player.");
  const player = ctx.db.player.identity.find(identity);
  const controller = ctx.db.playerController.identity.find(identity);
  const session = controller && ctx.db.playerSession.connectionId.find(controller.connectionId);
  if (!player || !session?.enteredWorld || !session.identity.equals(identity)) throw new SenderError("Player is offline.");
  if (player.mapId === HOME_EXTERIOR_MAP_ID || !combatMap(player.mapId)) throw new SenderError("Player is in a private map.");
  if (expectedMap && expectedMap !== player.mapId) throw new SenderError("Player changed maps. Try again.");
  const motion = ctx.db.playerMotion.identity.find(identity);
  const position = motion?.mapId === player.mapId ? motion : player;
  return { identity, displayName: ctx.db.playerProfile.identity.find(identity)?.displayName ?? "Player", mapId: player.mapId,
    x: position.x, y: position.y, facing: position.facing };
}
