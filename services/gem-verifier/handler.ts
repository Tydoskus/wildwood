import { authenticate, verifyEvent, type VerifiedEvent } from './verification';
import type { VerifierConfig } from './config';

const MAX_BODY = 64 * 1024;
export function createWebhookHandler(config: VerifierConfig, dependencies: {
  commit: (event: VerifiedEvent) => Promise<void>;
  now?: () => number;
}) {
  return async (request: Request): Promise<Response> => {
    const reply = (status: number, state: string) => Response.json({ state }, { status, headers: { 'cache-control': 'no-store' } });
    const url = new URL(request.url);
    if (url.pathname === '/health' && request.method === 'GET') return reply(200, 'ready');
    if (url.pathname !== '/webhooks/revenuecat') return reply(404, 'not_found');
    if (request.method !== 'POST') return reply(405, 'method_not_allowed');
    if (!request.headers.get('content-type')?.toLowerCase().startsWith('application/json')) return reply(415, 'json_required');
    if (Number(request.headers.get('content-length') || 0) > MAX_BODY) return reply(413, 'too_large');
    const reader = request.body?.getReader();
    if (!reader) return reply(400, 'empty_body');
    const chunks: Uint8Array[] = [];
    let size = 0;
    try {
      while (true) {
        const chunk = await reader.read();
        if (chunk.done) break;
        size += chunk.value.byteLength;
        if (size > MAX_BODY) { await reader.cancel(); return reply(413, 'too_large'); }
        chunks.push(chunk.value);
      }
    } catch { return reply(400, 'invalid_body'); }
    const body = Buffer.concat(chunks);
    const now = dependencies.now?.() ?? Date.now();
    if (!authenticate(body, request.headers.get('authorization') || '', request.headers.get('x-revenuecat-webhook-signature') || '', config, now)) return reply(401, 'unauthorized');
    let event: VerifiedEvent | null;
    try { event = verifyEvent(JSON.parse(body.toString('utf8')), config, now); }
    catch { return reply(422, 'event_needs_review'); }
    if (!event) return reply(200, 'ignored');
    try {
      // Never acknowledge before durable database commit. Failed responses may
      // be retried: the reducer deduplicates both event ID and store receipt.
      await dependencies.commit(event);
      return reply(200, 'accepted');
    } catch { return reply(503, 'retry'); }
  };
}

export function databaseCommit(config: VerifierConfig, fetcher: typeof fetch = fetch) {
  return async (event: VerifiedEvent) => {
    const response = await fetcher(`${config.databaseUrl}/call/ingest_gem_store_event`, {
      method: 'POST', headers: { authorization: `Bearer ${config.databaseToken}`, 'content-type': 'application/json' },
      body: JSON.stringify([event.eventId, event.eventHash, event.kind, event.owner, event.packId, event.reference, event.purchasedAtMs]),
      redirect: 'error', signal: AbortSignal.timeout(10_000),
    });
    if (!response.ok) throw new Error('Database commit failed');
  };
}
