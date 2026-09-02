export type StartupRoute =
  | "running"
  | "session-conflict"
  | "verifying-sign-in"
  | "account-choice"
  | "legal"
  | "load-game"
  | "loading"
  | "new-player"
  | "enter-game";

export type StartupRouteAccount = {
  signedIn?: boolean;
  guestSessionApproved?: boolean;
  gameSessionApproved?: boolean;
  authInProgress?: boolean;
  returningFromSignIn?: boolean;
  sessionConflict?: boolean;
};

type StartupRouteInput = {
  mode: "auth-shell" | "game-runtime";
  account?: StartupRouteAccount;
  guestContinuationChosen?: boolean;
  legalAccepted: boolean;
  shellReady: boolean;
  runtimeReady?: boolean;
  started?: boolean;
  startupKind?: "new" | "returning" | null;
};

export function hasApprovedGameSession(
  account: StartupRouteAccount | undefined,
  guestContinuationChosen = false,
) {
  return Boolean(account?.signedIn || account?.guestSessionApproved || account?.gameSessionApproved
    || guestContinuationChosen);
}

/** Single precedence model for both the lightweight auth shell and full game. */
export function resolveStartupRoute(input: StartupRouteInput): StartupRoute {
  if (input.account?.sessionConflict) return "session-conflict";
  if (!hasApprovedGameSession(input.account, input.guestContinuationChosen)) {
    if (input.account?.authInProgress || input.account?.returningFromSignIn) return "verifying-sign-in";
    return input.shellReady ? "account-choice" : "loading";
  }
  if (input.started) return "running";
  if (!input.legalAccepted) return input.shellReady ? "legal" : "loading";
  if (input.mode === "auth-shell") return "load-game";
  if (!input.runtimeReady) return "loading";
  if (input.startupKind === "new") return "new-player";
  if (input.startupKind === "returning") return "enter-game";
  return "loading";
}
