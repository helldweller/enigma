import { Redis } from 'ioredis';
import { createApp } from './app.ts';

const masterKey = process.env.MASTER_KEY ?? '';
if (masterKey.length < 32) {
  console.error('MASTER_KEY must be set to at least 32 random characters (e.g. `openssl rand -base64 32`).');
  process.exit(1);
}

const redis = new Redis(process.env.REDIS_URL ?? 'redis://localhost:6379', {
  password: process.env.REDIS_PASSWORD || undefined,
  maxRetriesPerRequest: 2,
});
redis.on('error', (err) => console.error('redis:', err.message));

const app = createApp({
  redis,
  masterKey: Buffer.from(masterKey),
  clientIpHeader: process.env.CLIENT_IP_HEADER || undefined,
});

const port = Number(process.env.PORT ?? 3000);
const server = app.listen(port, () => console.log(`enigma listening on :${port}`));

for (const sig of ['SIGTERM', 'SIGINT']) {
  process.on(sig, () => server.close(() => redis.quit().finally(() => process.exit(0))));
}
