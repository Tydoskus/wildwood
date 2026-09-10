import { createServer } from 'node:http';
import { Readable } from 'node:stream';
import { readConfig } from './config';
import { createWebhookHandler, databaseCommit } from './handler';

const config = readConfig(process.env);
const handler = createWebhookHandler(config, { commit: databaseCommit(config) });
const port = Number(process.env.PORT || 8787);
if (!Number.isInteger(port) || port < 1 || port > 65535) throw new Error('Invalid PORT');
const server = createServer(async (incoming, outgoing) => {
  try {
    const headers = new Headers();
    for (const [key, value] of Object.entries(incoming.headers)) if (value) headers.set(key, Array.isArray(value) ? value.join(',') : value);
    const request = new Request(`http://localhost:${port}${incoming.url || '/'}`, {
      method: incoming.method, headers,
      ...(incoming.method !== 'GET' && incoming.method !== 'HEAD' ? { body: Readable.toWeb(incoming) as ReadableStream, duplex: 'half' } : {}),
    });
    const response = await handler(request);
    outgoing.writeHead(response.status, Object.fromEntries(response.headers));
    outgoing.end(Buffer.from(await response.arrayBuffer()));
  } catch { outgoing.writeHead(500); outgoing.end(); }
});
server.requestTimeout = 15_000;
server.headersTimeout = 10_000;
server.listen(port, process.env.HOST || '127.0.0.1', () => console.log(`Gem verifier listening on port ${port}`));
