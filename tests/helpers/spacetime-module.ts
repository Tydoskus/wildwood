import { schema as sdkSchema, table, t } from "spacetimedb";

// Node cannot load the host-only `spacetime:sys` imports. Keep the real SDK
// table/type builders, replacing only export registration, not reducer logic.
// Reducer callbacks are executed by the in-memory transaction harness.
export { table, t };
export class SenderError extends Error {}

export const reducerParameters = new WeakMap<Function, Record<string, unknown>>();

export function schema(tables: Parameters<typeof sdkSchema>[0]) {
  function register(...args: any[]) {
    const callback = args[args.length - 1];
    if (typeof callback !== "function") throw new Error("Expected a reducer/view callback");
    reducerParameters.set(callback, args.length === 2 ? args[0] : {});
    return callback;
  }
  return {
    ...sdkSchema(tables),
    reducer: register,
    procedure: register,
    clientConnected: register,
    clientDisconnected: register,
    view: register,
  };
}

// Host-only server runtime is replaced above. Match the SDK Range public shape
// so real reducer helpers can exercise indexed range reads in Node tests.
export class Range<T> {
  readonly from: { tag: "unbounded" } | { tag: "included" | "excluded"; value: T };
  readonly to: { tag: "unbounded" } | { tag: "included" | "excluded"; value: T };
  constructor(from?: Range<T>["from"], to?: Range<T>["to"]) {
    this.from = from ?? { tag: "unbounded" }; this.to = to ?? { tag: "unbounded" };
  }
}
