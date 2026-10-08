/**
 * A snapshotted character, as player_profile_snapshot stores it: the look, not
 * a picture. Clients draw it with the game's own character renderer.
 */
export type ProfileSnapshotLook = {
  skinTone: number;
  headItem: string;
  chestItem: string;
  feetItem: string;
  rightHandItem: string;
  leftHandItem: string;
};

/** Two players who look the same share one drawn portrait; a new snapshot is a new key. */
export const profileSnapshotKey = (look: ProfileSnapshotLook) =>
  [look.skinTone, look.headItem, look.chestItem, look.feetItem, look.rightHandItem, look.leftHandItem].join("|");
