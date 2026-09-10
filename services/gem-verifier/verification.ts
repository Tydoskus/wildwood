import { createHash, createHmac, timingSafeEqual } from 'node:crypto';
import { GEM_PACKS } from '../../shared/gem-packs';
import type { VerifierConfig } from './config';

export type VerifiedEvent = {
  eventId: string; eventHash: string; kind: 'purchase' | 'refund';
  owner: string; packId: string; reference: string; purchasedAtMs: number;
};
function sameSecret(left: string, right: string) {
  const a = createHash('sha256').update(left).digest();
  const b = createHash('sha256').update(right).digest();
  return timingSafeEqual(a, b);
}
export function authenticate(body: Uint8Array, authorization: string, signature: string, config: VerifierConfig, nowMs: number) {
  if (!sameSecret(authorization, config.authorization)) return false;
  const match = /^t=(\d{1,12}),v1=([a-fA-F0-9]{64})$/.exec(signature);
  if (!match || Math.abs(nowMs / 1000 - Number(match[1])) > 300) return false;
  const calculated = createHmac('sha256', config.signingSecret).update(`${match[1]}.`).update(body).digest();
  return timingSafeEqual(calculated, Buffer.from(match[2], 'hex'));
}
/** Only fields from an authenticated server webhook reach this parser. Client
 * attributes, aliases, reported Gem amounts and SDK transaction results are ignored. */
export function verifyEvent(input: unknown, config: VerifierConfig, nowMs: number): VerifiedEvent | null {
  if (!input || typeof input !== 'object') throw new Error('Invalid envelope');
  const envelope = input as Record<string, unknown>;
  const e = envelope.event as Record<string, unknown> | undefined;
  if (envelope.api_version !== '1.0' || !e || typeof e !== 'object') throw new Error('Invalid envelope');
  if (e.type === 'TEST') return null;
  if (e.environment === 'SANDBOX') return null;
  if (e.environment !== 'PRODUCTION') throw new Error('Invalid payment environment');
  if (typeof e.app_id !== 'string' || !Object.hasOwn(config.apps, e.app_id) || config.apps[e.app_id] !== e.store) throw new Error('Unconfigured store app');
  if (!['NON_RENEWING_PURCHASE', 'CANCELLATION'].includes(String(e.type))) return null;
  if (e.quantity !== undefined && e.quantity !== 1) throw new Error('Only one pack per purchase is supported');
  if (e.is_family_share === true) throw new Error('Shared purchase is not a consumable payment');
  const owner = typeof e.app_user_id === 'string' ? /^wildstat:([a-f0-9]{64})$/.exec(e.app_user_id)?.[1] : undefined;
  if (!owner || e.original_app_user_id !== e.app_user_id) throw new Error('Purchase account is not canonical');
  if (!GEM_PACKS.some(pack => pack.id === e.product_id)) throw new Error('Unknown product');
  if (typeof e.id !== 'string' || !/^[A-Za-z0-9_-]{1,100}$/.test(e.id)) throw new Error('Invalid event ID');
  if (typeof e.transaction_id !== 'string' || !/^[A-Za-z0-9._:-]{1,240}$/.test(e.transaction_id)) throw new Error('Invalid transaction');
  if (!Number.isSafeInteger(e.purchased_at_ms) || Number(e.purchased_at_ms) <= 0 || Number(e.purchased_at_ms) > nowMs + 300_000) throw new Error('Invalid purchase timestamp');
  if (e.type === 'CANCELLATION' && e.cancel_reason !== 'CUSTOMER_SUPPORT') throw new Error('Cancellation needs review');
  const fields = {
    eventId: e.id, kind: e.type === 'NON_RENEWING_PURCHASE' ? 'purchase' as const : 'refund' as const,
    owner, packId: String(e.product_id), reference: `${e.store === 'APP_STORE' ? 'apple' : 'google'}:${e.transaction_id}`,
    purchasedAtMs: Number(e.purchased_at_ms),
  };
  return { ...fields, eventHash: createHash('sha256').update(JSON.stringify(fields)).digest('hex') };
}
