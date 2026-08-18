import { describe, expect, it } from "vitest";
import { BASIC_PAPER_HAT, STARTER_STONE } from "../../../shared/rules";
import { remoteEquipmentFromRow } from "./remote-equipment";

describe("remoteEquipmentFromRow", () => {
  it("preserves empty headwear and left-handed weapons", () => {
    expect(remoteEquipmentFromRow({
      feetItem: "",
      headItem: "",
      chestItem: "",
      rightHandItem: "",
      leftHandItem: STARTER_STONE,
    })).toEqual({
      feetItem: "",
      headItem: "",
      chestItem: "",
      rightHandItem: "",
      leftHandItem: STARTER_STONE,
    });
  });

  it("uses safe presentation defaults for older row shapes", () => {
    expect(remoteEquipmentFromRow({})).toEqual({
      feetItem: "",
      headItem: BASIC_PAPER_HAT,
      chestItem: "",
      rightHandItem: "",
      leftHandItem: "",
    });
  });
});
