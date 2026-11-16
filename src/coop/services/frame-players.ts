import type { RemotePlayer } from "../contracts";

/**
 * One build of the other players per frame for every caller: a build sorts and walks every player and
 * Auto Farm puppet, and a slow frame ran up to eight simulation steps, each building again. A frame's steps
 * and its draw are one task, so the list is kept until that task ends, however long the frame takes.
 */
export function createFramePlayers(build: () => RemotePlayer[], afterTask: (done: () => void) => void = done => queueMicrotask(done)) {
  let built = false, players: RemotePlayer[] = [];
  return () => {
    if (!built) {
      players = build();
      built = true;
      afterTask(() => { built = false; });
    }
    return players;
  };
}
