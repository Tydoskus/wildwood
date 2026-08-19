import { describe, expect, it } from "vitest";
import { WOODEN_ARMOR_ASSET_SOURCE } from "./wooden-armor-asset";

describe("wooden armor asset", () => {
  it("embeds FA_Chest_035_Brown as a PNG data source", () => {
    const encoded = WOODEN_ARMOR_ASSET_SOURCE.replace("data:image/png;base64,", "");
    expect(Buffer.from(encoded, "base64").subarray(0, 8).toString("hex")).toBe("89504e470d0a1a0a");
  });
});
