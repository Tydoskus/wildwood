import { createHash } from "node:crypto";
import { describe, expect, it } from "vitest";
import { STARTER_BOW_ASSET_SOURCE } from "./starter-bow-asset";

describe("starter bow asset", () => {
  it("keeps the exact FA_WP_Main_Bow_011_Brown PNG bytes", () => {
    const encoded = STARTER_BOW_ASSET_SOURCE.replace("data:image/png;base64,", "");
    const digest = createHash("sha256").update(Buffer.from(encoded, "base64")).digest("hex");
    expect(digest).toBe("381750f017e841feff183b0591e0e0f33f000721fb8a47f31dd71e0584dfaedf");
  });
});
