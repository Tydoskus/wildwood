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
}) {
  function hasSeen(key: string) {
    try { return localStorage.getItem(key) === "true"; } catch { return false; }
  }

  function updateBootPickup() {
    const { bootsPickup, player } = hooks;
    if (bootsPickup.collected) return;
    const dx = player.x - bootsPickup.x;
    const dy = player.y - bootsPickup.y;
    const reach = player.r + bootsPickup.r;
    if (dx * dx + dy * dy > reach * reach) return;
    bootsPickup.collected = true;
    hooks.collectBoots();
    player.speed = hooks.movementSpeedForBoots(true);
    hooks.saveProgress();
    hooks.renderInventory();
    hooks.pause();
    hooks.bootUpgrade.hidden = false;
    hooks.bootUpgradeClose.focus();
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
    updateBootPickup,
    closeBootUpgrade,
    hideBootUpgrade: () => { hooks.bootUpgrade.hidden = true; },
  };
}
