type Player = { x: number; y: number; r: number; speed: number };
type BootsPickup = { x: number; y: number; r: number; collected: boolean };

export function createWorldProgressionController(hooks: {
  player: Player;
  bootsPickup: BootsPickup;
  movementSpeedForBoots: (bootsEquipped: boolean) => number;
  collectBoots: () => void;
  saveProgress: () => void;
  renderInventory: () => void;
  pause: () => void;
  resume: () => void;
  bootUpgrade: HTMLElement;
  bootUpgradeClose: HTMLElement;
  dragonCutsceneSeenKey: string;
  snowlandsCutsceneSeenKey: string;
  lavaCutsceneSeenKey: string;
  infernalCutsceneSeenKey: string;
  waterCutsceneSeenKey: string;
  samuraiCutsceneSeenKey: string;
  hasSeenPortalCutscene: (cutscene: string) => boolean;
}) {
  function hasSeen(key: string) {
    return hooks.hasSeenPortalCutscene(key);
  }

  function closeBootUpgrade() {
    hooks.resume();
    hooks.bootUpgrade.hidden = true;
  }

  return {
    hasSeenDragonPortalCutscene: () => hasSeen(hooks.dragonCutsceneSeenKey),
    hasSeenSnowlandsPortalCutscene: () => hasSeen(hooks.snowlandsCutsceneSeenKey),
    hasSeenLavaPortalCutscene: () => hasSeen(hooks.lavaCutsceneSeenKey),
    hasSeenInfernalPortalCutscene: () => hasSeen(hooks.infernalCutsceneSeenKey),
    hasSeenWaterPortalCutscene: () => hasSeen(hooks.waterCutsceneSeenKey),
    hasSeenSamuraiPortalCutscene: () => hasSeen(hooks.samuraiCutsceneSeenKey),
    closeBootUpgrade,
    hideBootUpgrade: () => { hooks.bootUpgrade.hidden = true; },
  };
}
