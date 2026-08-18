import { BASIC_PAPER_HAT } from "../../../shared/rules";

export type RemoteEquipment = {
  feetItem: string;
  headItem: string;
  chestItem: string;
  rightHandItem: string;
  leftHandItem: string;
};

/** Preserves explicit empty slots while safely hydrating older row shapes. */
export function remoteEquipmentFromRow(row: Partial<RemoteEquipment>): RemoteEquipment {
  return {
    feetItem: typeof row.feetItem === "string" ? row.feetItem : "",
    headItem: typeof row.headItem === "string" ? row.headItem : BASIC_PAPER_HAT,
    chestItem: typeof row.chestItem === "string" ? row.chestItem : "",
    rightHandItem: typeof row.rightHandItem === "string" ? row.rightHandItem : "",
    leftHandItem: typeof row.leftHandItem === "string" ? row.leftHandItem : "",
  };
}
