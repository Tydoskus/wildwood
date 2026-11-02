import { PLAYER_GENDER_FEMALE, PLAYER_GENDER_MALE } from "../../../shared/player-gender";
import { isDeveloperIdentity } from "../developer";
import { playerGenderIconPath } from "../../game/player-gender-icon";
import type { CoopAccess } from "../../game/runtime/coop-access";
import { WORLD_HEALTH_BAR_HEIGHT, WORLD_HEALTH_BAR_RADIUS } from "../../game/runtime/game-settings";
import { platePixels, plateSize } from "../../game/runtime/render/nameplate-scale";
import type { createCamera } from "../../game/runtime/render/camera";
import type { createCanvasRuntime } from "../../game/runtime/render/canvas-runtime";
import { createPlayerIdentityRenderer } from "../../game/runtime/render/player-identity-renderer";

function loadedImage(src: string) {
  const image = new Image();
  image.src = src;
  return image;
}

/**
 * Players' names, power, profile pictures and chat bubbles over their heads,
 * read from the coop client's profile and chat rows.
 */
export function createPlayerIdentityRendering(deps: {
  coop: CoopAccess;
  canvasRuntime: ReturnType<typeof createCanvasRuntime>;
  camera: ReturnType<typeof createCamera>;
  /** Redraws the leaderboard once the profile pictures it shows have loaded. */
  onProfileIconsLoaded: () => void;
}) {
  const { coop, canvasRuntime } = deps;
  const client = coop.client;
  return createPlayerIdentityRenderer({
    ctx: canvasRuntime.ctx,
    camera: deps.camera,
    viewport: canvasRuntime.viewport,
    onProfileIconsLoaded: deps.onProfileIconsLoaded,
    powerIcon: loadedImage("assets/wildstat/icons/Icon_Battle_Candy_v2.webp"),
    genderIcons: {
      [PLAYER_GENDER_MALE]: loadedImage(playerGenderIconPath(PLAYER_GENDER_MALE)),
      [PLAYER_GENDER_FEMALE]: loadedImage(playerGenderIconPath(PLAYER_GENDER_FEMALE)),
    },
    // Clients subscribe only to their own prestige row, so a remote player's
    // level is not on the wire yet and reads as zero.
    isDeveloper: isDeveloperIdentity,
    isLocallyInvisible: identity => coop.isLocal(identity) && isDeveloperIdentity(identity) && client?.developerPresenceVisible?.() === false,
    isGuest: coop.isGuest,
    profileIcon: coop.profileIcon,
    profileSnapshots: { look: identity => client?.profileSnapshot?.(identity), revision: () => client?.profileSnapshotsRevision?.() ?? 0 },
    playerGender: coop.playerGender,
    chatRevision: () => client?.chatRevision?.() ?? -1,
    chatMessages: () => (client?.chatMessages?.() ?? []).filter(message => !message.guildReplayKey),
    outlinedText: canvasRuntime.outlinedWorldText,
    fillText: canvasRuntime.fillWorldText,
    roundRect: canvasRuntime.roundRect,
    // Overhead bars are drawn at plate scale (nameplate-scale.ts).
    healthBarHeight: platePixels(WORLD_HEALTH_BAR_HEIGHT),
    healthBarRadius: plateSize(WORLD_HEALTH_BAR_RADIUS),
  });
}
