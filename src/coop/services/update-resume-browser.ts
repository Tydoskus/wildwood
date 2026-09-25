import { isNewerGameVersion } from "../../app/version";
import { createUpdateResumeStore, inferLegacyUpdateResumeMode, type UpdateResumeMode } from "./update-resume-store";

export function consumeUpdateResumeMode(options: { version: string; store: ReturnType<typeof createUpdateResumeStore>; consumedKey: string; tabKey: string; tokenKey: string }): UpdateResumeMode | null {
  const { version: GAME_VERSION, store: updateResumeStore, consumedKey: updateResumeConsumedKey, tabKey: authTabKey, tokenKey: accountTokenKey } = options;
  const requestedVersion = new URL(window.location.href).searchParams.get("v") ?? "";
  if (requestedVersion !== GAME_VERSION && !isNewerGameVersion(GAME_VERSION, requestedVersion)) return null;
  const explicitMode = updateResumeStore.consume(requestedVersion);

  try {
    const consumedVersion = sessionStorage.getItem(updateResumeConsumedKey) ?? "";
    if (explicitMode) {
      sessionStorage.setItem(updateResumeConsumedKey, requestedVersion);
      return explicitMode;
    }

    // Clients predating the explicit handoff still leave a per-tab world ID.
    // Consume it once so the first deployment of this feature also resumes.
    const legacyMode = inferLegacyUpdateResumeMode({
      requestedVersion,
      currentVersion: GAME_VERSION,
      hadPlayableTab: Boolean(sessionStorage.getItem(authTabKey)),
      hasAccountToken: Boolean(localStorage.getItem(accountTokenKey)),
      consumedVersion,
    });
    if (legacyMode) sessionStorage.setItem(updateResumeConsumedKey, requestedVersion);
    return legacyMode;
  } catch {
    return explicitMode;
  }
}


/** Every automatic recovery reload must carry the active session to the next page. */
export function reloadWithUpdateResume(version: string, prepare: (version: string) => boolean | void) {
  if (prepare(version) === false) return false;
  const url = new URL(window.location.href);
  url.searchParams.set("v", version);
  window.location.replace(url.href);
  return true;
}
