import { describe, expect, it } from "vitest";
import { defaultRealtimeHost, isLocalNetworkHostname } from "./realtime-host";

describe("realtime host selection", () => {
  it("points LAN clients back to the machine serving the page", () => {
    expect(defaultRealtimeHost("localhost")).toBe("ws://localhost:3000");
    expect(defaultRealtimeHost("192.168.1.24")).toBe("ws://192.168.1.24:3000");
    expect(defaultRealtimeHost("10.0.0.8")).toBe("ws://10.0.0.8:3000");
    expect(defaultRealtimeHost("wildstat-mac")).toBe("ws://wildstat-mac:3000");
    expect(defaultRealtimeHost("[::1]")).toBe("ws://[::1]:3000");
  });

  it("keeps public deployments on maincloud", () => {
    expect(isLocalNetworkHostname("tydoskus.github.io")).toBe(false);
    expect(defaultRealtimeHost("tydoskus.github.io")).toBe("wss://maincloud.spacetimedb.com");
  });
});
