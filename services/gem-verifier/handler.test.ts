import { createHmac } from 'node:crypto';
import { describe, expect, it, vi } from 'vitest';
import { createWebhookHandler, databaseCommit } from './handler';
import type { VerifiedEvent } from './verification';
import { readConfig, type VerifierConfig } from './config';
const now = 1_800_000_000_000;
const owner = 'a'.repeat(64);
const config: VerifierConfig = { authorization: 'Bearer ' + 'a'.repeat(40), signingSecret: 's'.repeat(40), databaseUrl: 'https://maincloud.spacetimedb.com/v1/database/test', databaseToken: 'server-only-token', apps: { appApple: 'APP_STORE', appGoogle: 'PLAY_STORE' } };
function payload(overrides: Record<string, unknown> = {}) {
  return JSON.stringify({ api_version: '1.0', event: { id: 'event-one', type: 'NON_RENEWING_PURCHASE', environment: 'PRODUCTION', store: 'APP_STORE', app_id: 'appApple', app_user_id: `wildstat:${owner}`, original_app_user_id: `wildstat:${owner}`, product_id: 'gems_60', transaction_id: 'store-1', purchased_at_ms: now - 1000, ...overrides } });
}
function request(body = payload(), timestamp = Math.floor(now / 1000)) {
  const signature = createHmac('sha256', config.signingSecret).update(`${timestamp}.${body}`).digest('hex');
  return new Request('https://example.com/webhooks/revenuecat', { method: 'POST', headers: { 'content-type': 'application/json', authorization: config.authorization, 'x-revenuecat-webhook-signature': `t=${timestamp},v1=${signature}` }, body });
}
function setup() {
  const commit = vi.fn(async (_event: VerifiedEvent) => {});
  return { commit, handle: createWebhookHandler(config, { commit, now: () => now }) };
}
describe('RevenueCat verifier HTTP boundary', () => {
  it('commits only a verified canonical purchase and never forwards secrets or client attributes', async () => {
    const { commit, handle } = setup();
    expect((await handle(request(payload({ subscriber_attributes: { gems: 999999 }, price: 1.99 })))).status).toBe(200);
    expect(commit).toHaveBeenCalledWith(expect.objectContaining({ owner, packId: 'gems_60', reference: 'apple:store-1', kind: 'purchase' }));
    expect(Object.keys(commit.mock.calls[0][0] as object)).not.toContain('subscriber_attributes');
  });
  it('rejects forged, altered, stale, missing or malformed authentication', async () => {
    const { handle, commit } = setup();
    const missing = request(); missing.headers.delete('authorization');
    const unsigned = request(); unsigned.headers.delete('x-revenuecat-webhook-signature');
    const forged = request(); forged.headers.set('x-revenuecat-webhook-signature', `t=${now / 1000},v1=${'0'.repeat(64)}`);
    const original = request();
    const altered = new Request(original.url, { method: 'POST', headers: original.headers, body: payload({ product_id: 'gems_3300' }) });
    for (const input of [missing, unsigned, forged, altered, request(payload(), now / 1000 - 301)]) expect((await handle(input)).status).toBe(401);
    expect(commit).not.toHaveBeenCalled();
  });
  it('rejects the wrong app, store, product, account mapping, timestamps and quantity', async () => {
    const { handle, commit } = setup();
    for (const overrides of [ { app_id: 'appWrong' }, { store: 'TEST_STORE' }, { store: 'PLAY_STORE' }, { product_id: 'gems_free' }, { app_user_id: 'anonymous' }, { original_app_user_id: 'someone-else' }, { purchased_at_ms: now + 300_001 }, { purchased_at_ms: 1.5 }, { quantity: 2 }, { is_family_share: true }, { environment: undefined } ]) {
      expect((await handle(request(payload(overrides)))).status).toBe(422);
    }
    expect(commit).not.toHaveBeenCalled();
  });
  it('acknowledges test, sandbox and unrelated events without crediting', async () => {
    const { handle, commit } = setup();
    for (const overrides of [{ environment: 'SANDBOX' }, { type: 'TEST' }, { type: 'RENEWAL' }, { type: 'TEMPORARY_ENTITLEMENT_GRANT' }]) expect((await handle(request(payload(overrides)))).status).toBe(200);
    expect(commit).not.toHaveBeenCalled();
  });
  it('waits for durable commit and returns retry on database failure', async () => {
    const { handle, commit } = setup();
    let finish!: () => void;
    commit.mockImplementationOnce(() => new Promise<void>(resolve => { finish = resolve; }));
    let replied = false;
    const response = handle(request()).then(value => { replied = true; return value; });
    await vi.waitFor(() => expect(finish).toBeTypeOf('function'));
    expect(replied).toBe(false);
    finish(); expect((await response).status).toBe(200);
    commit.mockRejectedValueOnce(new Error('offline'));
    expect((await handle(request())).status).toBe(503);
  });
  it('accepts production refund notifications but not ordinary subscription cancellations', async () => {
    const { handle, commit } = setup();
    expect((await handle(request(payload({ type: 'CANCELLATION', cancel_reason: 'CUSTOMER_SUPPORT' })))).status).toBe(200);
    expect(commit).toHaveBeenCalledWith(expect.objectContaining({ kind: 'refund' }));
    expect((await handle(request(payload({ type: 'CANCELLATION', cancel_reason: 'UNSUBSCRIBE' })))).status).toBe(422);
  });
  it('bounds bodies even without a content-length header', async () => {
    const { handle } = setup();
    expect((await handle(request('x'.repeat(65537)))).status).toBe(413);
    expect((await handle(request('{'))).status).toBe(422);
  });
  it('uses the dedicated database token and reports unsuccessful commits', async () => {
    const fetcher = vi.fn(async () => new Response('', { status: 200 }));
    const event = { eventId: 'one', eventHash: 'hash', owner, kind: 'purchase' as const, packId: 'gems_60', reference: 'apple:one', purchasedAtMs: now };
    await databaseCommit(config, fetcher)(event);
    expect(fetcher).toHaveBeenCalledWith(config.databaseUrl + '/call/ingest_gem_store_event', expect.objectContaining({ redirect: 'error', headers: expect.objectContaining({ authorization: 'Bearer server-only-token' }), body: JSON.stringify(['one', 'hash', 'purchase', owner, 'gems_60', 'apple:one', now]) }));
    fetcher.mockResolvedValueOnce(new Response('', { status: 500 }));
    await expect(databaseCommit(config, fetcher)(event)).rejects.toThrow();
  });
  it('fails closed without secrets, HTTPS or known production app mappings', () => {
    expect(() => readConfig({})).toThrow();
    const env = { REVENUECAT_WEBHOOK_AUTHORIZATION: config.authorization, REVENUECAT_WEBHOOK_SIGNING_SECRET: config.signingSecret, SPACETIME_DATABASE_URL: config.databaseUrl, SPACETIME_VERIFIER_TOKEN: config.databaseToken, REVENUECAT_STORE_APPS: JSON.stringify(config.apps) };
    expect(readConfig(env)).toEqual(config);
    expect(() => readConfig({ ...env, REVENUECAT_STORE_APPS: '{}' })).toThrow();
    expect(() => readConfig({ ...env, SPACETIME_DATABASE_URL: 'http://example.com/v1/database/test' })).toThrow();
  });
});
