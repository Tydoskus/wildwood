import type { DbConnection } from "../../module_bindings";
import type { ConnectionDiagnostic, ConnectionEventKind } from "../../../shared/connection-diagnostics";

type Factory = Parameters<ReturnType<typeof DbConnection.builder>["withWSFn"]>[0];
/** Mirrors the SDK's browser transport framing while preserving CloseEvent data.
 * No URL, token, payload, or full browser fingerprint is recorded. */
export function diagnosticWebSocket(
  record: (kind: ConnectionEventKind, data: Partial<ConnectionDiagnostic>) => void,
  context: { transport: string; database: string; mapId?: string; isCurrent?: () => boolean; onFrameHandlerFailed?: () => void },
  resolveToken?: (token: string, force: boolean) => Promise<string>,
): Factory {
  return async args => {
    const started = performance.now();
    let intentional = false;
    const report = (kind: ConnectionEventKind, data: Partial<ConnectionDiagnostic> = {}) => {
      try {
        if (context.isCurrent?.() === false) return;
        const { onFrameHandlerFailed: _hook, ...fields } = context;
        record(kind, { ...fields, connectionAgeMs: performance.now() - started, intentional, ...data });
      } catch {}
    };
    let temporaryToken: string | undefined;
    if (args.authToken) {
      if (context.isCurrent?.() === false) throw new Error("Connection superseded");
      const tokenUrl = new URL("v1/identity/websocket-token", args.url);
      tokenUrl.protocol = args.url.protocol === "wss:" ? "https:" : "http:";
      let credential = resolveToken ? await resolveToken(args.authToken, false) : args.authToken;
      const exchange = async () => {
        if (context.isCurrent?.() === false) throw new Error("Connection superseded");
        const controller = new AbortController();
        const timeout = setTimeout(() => controller.abort(), 15_000);
        try { return await fetch(tokenUrl, { method: "POST", signal: controller.signal, headers: { Authorization: `Bearer ${credential}` } }); }
        finally { clearTimeout(timeout); }
      };
      let response = await exchange();
      if (response.status === 401 && resolveToken) {
        if (context.isCurrent?.() === false) throw new Error("Connection superseded");
        report("connect-error", { detail: "token-exchange-http-401; renewing" });
        credential = await resolveToken(credential, true);
        response = await exchange();
      }
      if (!response.ok) { report("connect-error", { detail: `token-exchange-http-${response.status}` }); throw new Error(`Failed to verify token: HTTP ${response.status} ${response.statusText}`); }
      temporaryToken = (await response.json()).token;
    }
    const url = new URL(`v1/database/${args.nameOrAddress}/subscribe`, args.url);
    if (temporaryToken) url.searchParams.set("token", temporaryToken);
    url.searchParams.set("compression", { gzip: "Gzip", brotli: "Brotli", none: "None" }[args.compression]);
    if (args.lightMode) url.searchParams.set("light", "true");
    if (args.confirmedReads !== undefined) url.searchParams.set("confirmed", String(args.confirmedReads));
    if (context.isCurrent?.() === false) throw new Error("Connection superseded");
    const socket = new WebSocket(url.toString(), args.wsProtocol);
    socket.binaryType = "arraybuffer";
    let closed = false;
    socket.addEventListener("close", event => {
      closed = true;
      report("socket-close", { code: event.code, clean: event.wasClean, detail: event.reason });
    });
    socket.addEventListener("error", () => report("socket-error", { detail: "browser-websocket-error" }));
    return {
      get protocol() { return socket.protocol; },
      get readyState() { return socket.readyState; },
      send: data => socket.send(data),
      close: () => { intentional = true; socket.close(); },
      set onclose(handler: (event: CloseEvent) => void) { socket.onclose = handler; },
      set onopen(handler: () => void) { socket.onopen = handler; },
      set onerror(handler: (event: ErrorEvent) => void) { socket.onerror = handler as (event: Event) => void; },
      set onmessage(handler: (message: { data: Uint8Array }) => void) {
        // WebSocket arrival order is guaranteed; asynchronous decompression is
        // not. Serialize decoding AND delivery so a small update cannot overtake
        // its initial snapshot (or an unsubscribe acknowledgement).
        let incoming = Promise.resolve();
        const obsolete = () => closed || intentional || context.isCurrent?.() === false;
        socket.onmessage = (event: MessageEvent<ArrayBuffer>) => incoming = incoming.then(async () => {
          if (obsolete()) return;
          let data: Uint8Array;
          try {
            const bytes = new Uint8Array(event.data); const tag = bytes[0]; const body = bytes.subarray(1);
            if (tag === 0) data = body;
            else {
              if (tag !== 1 && tag !== 2) throw new Error("unknown-compression-tag");
              const stream = new Blob([body]).stream().pipeThrough(new DecompressionStream((tag === 1 ? "brotli" : "gzip") as CompressionFormat));
              data = new Uint8Array(await new Response(stream).arrayBuffer());
            }
          } catch (error) {
            closed = true;
            report("decompression-error", { detail: error instanceof Error ? error.message : "frame-decode-failed" });
            socket.close();
            return;
          }
          if (!obsolete()) handler({ data });
        }).catch((error: unknown) => {
          // A decoder/SDK exception must not leave an apparently live socket
          // silently discarding all future frames. Reuse ordinary recovery.
          closed = true;
          report('lifecycle-failure', { detail: `frame-handler-failed: ${error instanceof Error ? error.message : String(error)}` });
          socket.close();
          if (context.isCurrent?.() !== false) context.onFrameHandlerFailed?.();
        });
      },
    };
  };
}
