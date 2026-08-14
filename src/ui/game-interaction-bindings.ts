/** Binds small HUD, replay, profile, and developer world interactions. */
export function bindGameInteractionListeners(options: {
  triggerDragonCutscene: HTMLElement;
  triggerSnowlandsCutscene: HTMLElement;
  hpText: HTMLElement;
  watchDuelReplay: HTMLElement;
  playerHudProfile: HTMLElement;
  playerProfileIcon: HTMLElement;
  closeProfileIconPicker: HTMLElement;
  onDragonCutscene: () => void;
  onSnowlandsCutscene: () => void;
  onOpenOwnProfile: () => void;
  replayId: () => bigint;
  onWatchReplay: (replayId: bigint) => void;
  canOpenProfileIconPicker: () => boolean;
  openProfileIconPicker: () => void;
  closeIconPicker: () => void;
}) {
  options.triggerDragonCutscene.addEventListener("click", options.onDragonCutscene);
  options.triggerSnowlandsCutscene.addEventListener("click", options.onSnowlandsCutscene);
  options.hpText.closest(".card")?.addEventListener("click", options.onOpenOwnProfile);
  options.watchDuelReplay.addEventListener("click", () => {
    const replayId = options.replayId();
    if (replayId > 0n) options.onWatchReplay(replayId);
  });
  options.playerHudProfile.addEventListener("click", (event) => {
    event.stopPropagation();
    options.onOpenOwnProfile();
  });
  options.playerProfileIcon.addEventListener("click", () => {
    if (options.canOpenProfileIconPicker()) options.openProfileIconPicker();
  });
  options.closeProfileIconPicker.addEventListener("click", options.closeIconPicker);
}
