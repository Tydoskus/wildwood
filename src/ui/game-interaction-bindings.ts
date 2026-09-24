/** Binds small HUD, replay, and profile interactions. */
export function bindGameInteractionListeners(options: {
  hpText: HTMLElement;
  watchDuelReplay: HTMLElement;
  playerHudProfile: HTMLElement;
  playerHudProfileGear: HTMLElement;
  playerProfileIcon: HTMLElement;
  closeProfileIconPicker: HTMLElement;
  onOpenOwnProfile: () => void;
  replayId: () => bigint;
  onWatchReplay: (replayId: bigint) => void;
  canOpenProfileIconPicker: () => boolean;
  openProfileIconPicker: () => void;
  closeIconPicker: () => void;
}) {
  // The whole HUD card opens your profile, which is what the gear beside your
  // power is there to advertise. Buttons inside it act on their own.
  options.hpText.closest(".card")?.addEventListener("click", (event) => {
    if ((event.target as Element | null)?.closest?.("button")) return;
    options.onOpenOwnProfile();
  });
  options.watchDuelReplay.addEventListener("click", () => {
    const replayId = options.replayId();
    if (replayId > 0n) options.onWatchReplay(replayId);
  });
  for (const button of [options.playerHudProfile, options.playerHudProfileGear]) {
    button.addEventListener("click", (event) => {
      event.stopPropagation();
      options.onOpenOwnProfile();
    });
  }
  options.playerProfileIcon.addEventListener("click", () => {
    if (options.canOpenProfileIconPicker()) options.openProfileIconPicker();
  });
  options.closeProfileIconPicker.addEventListener("click", options.closeIconPicker);
}
