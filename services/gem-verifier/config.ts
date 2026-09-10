export type VerifierConfig = {
  authorization: string;
  signingSecret: string;
  databaseUrl: string;
  databaseToken: string;
  apps: Record<string, 'APP_STORE' | 'PLAY_STORE'>;
};
export function readConfig(env: NodeJS.ProcessEnv): VerifierConfig {
  function required(key: string) {
    const value = env[key];
    if (!value?.trim()) throw new Error(`Missing ${key}`);
    return value;
  }
  const authorization = required('REVENUECAT_WEBHOOK_AUTHORIZATION');
  const signingSecret = required('REVENUECAT_WEBHOOK_SIGNING_SECRET');
  if (authorization.length < 32 || signingSecret.length < 32) throw new Error('Webhook secrets must have at least 32 characters.');
  const url = new URL(required('SPACETIME_DATABASE_URL'));
  if (url.protocol !== 'https:' || url.username || url.password || url.search || url.hash ||
      !/^\/v1\/database\/[A-Za-z0-9_-]+\/?$/.test(url.pathname)) throw new Error('Set an HTTPS SpacetimeDB database API URL.');
  const apps: unknown = JSON.parse(required('REVENUECAT_STORE_APPS'));
  if (!apps || typeof apps !== 'object' || Array.isArray(apps) || !Object.keys(apps).length ||
      Object.entries(apps).some(([id, store]) => !/^app[a-zA-Z0-9]+$/.test(id) || !['APP_STORE', 'PLAY_STORE'].includes(String(store)))) {
    throw new Error('Configure the RevenueCat Apple/Google app IDs and stores.');
  }
  return { authorization, signingSecret, databaseUrl: url.href.replace(/\/$/, ''), databaseToken: required('SPACETIME_VERIFIER_TOKEN'), apps: apps as VerifierConfig['apps'] };
}
