// Runs the API against a real Redis: REDIS_URL=redis://localhost:6379 npm test
import assert from 'node:assert/strict';
import { after, before, test } from 'node:test';
import type { AddressInfo } from 'node:net';
import type { Server } from 'node:http';
import { Redis } from 'ioredis';
import { createApp } from '../server/app.ts';

const redis = new Redis(process.env.REDIS_URL ?? 'redis://localhost:6379');
let server: Server;
let base = '';

before(async () => {
  server = createApp({ redis, masterKey: Buffer.from('test-master-key-test-master-key-123') }).listen(0);
  await new Promise((r) => server.once('listening', r));
  base = `http://127.0.0.1:${(server.address() as AddressInfo).port}/api`;
});
after(async () => {
  server.close();
  await redis.quit();
});

async function call(path: string, body?: object) {
  const res = await fetch(base + path, body ? { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body) } : {});
  return { status: res.status, json: (await res.json()) as any };
}
const create = async (body: object) => (await call('/secrets', body)).json.token as string;
const reveal = (token: string, passphrase?: string) => call(`/secrets/${token}/reveal`, passphrase ? { passphrase } : {});

test('health', async () => {
  assert.deepEqual((await call('/health')).json, { status: 'ok', db: 'up' });
});

test('text secret: meta does not consume, reveal works exactly once', async () => {
  const token = await create({ content: 'hunter2', ttl: '1h' });
  assert.match(token, /^[A-Za-z0-9_-]{43}$/);
  assert.equal((await redis.keys('*' + token + '*')).length, 0, 'raw token must not be stored');

  const meta = await call(`/secrets/${token}/meta`);
  assert.equal(meta.json.hasPassphrase, false);
  assert.equal(meta.json.isFile, false);
  assert.ok(Math.abs(Date.parse(meta.json.expiresAt) - Date.now() - 3600_000) < 5000);

  assert.deepEqual((await reveal(token)).json, { isFile: false, data: 'hunter2' });
  const again = await reveal(token);
  assert.equal(again.status, 404);
  assert.equal(again.json.error.code, 'NOT_FOUND');
  assert.equal((await call(`/secrets/${token}/meta`)).status, 404);
});

test('file secret round-trips', async () => {
  const data = Buffer.from('file body').toString('base64');
  const token = await create({ file: { data, name: 'a.txt', type: 'text/plain' }, ttl: '1d' });
  assert.equal((await call(`/secrets/${token}/meta`)).json.isFile, true);
  assert.deepEqual((await reveal(token)).json, { isFile: true, filename: 'a.txt', contentType: 'text/plain', data });
});

test('concurrent reveals: exactly one wins', async () => {
  const token = await create({ content: 'race', ttl: '1h' });
  const results = await Promise.all([reveal(token), reveal(token), reveal(token)]);
  assert.deepEqual(results.map((r) => r.status).sort(), [200, 404, 404]);
});

test('passphrase: required, 5 attempts, then destroyed', async () => {
  const token = await create({ content: 'guarded', ttl: '1h', passphrase: 'right' });
  assert.equal((await call(`/secrets/${token}/meta`)).json.hasPassphrase, true);
  assert.equal((await reveal(token)).json.error.code, 'PASSPHRASE_REQUIRED');

  for (const left of [4, 3, 2, 1]) {
    const r = await reveal(token, 'wrong');
    assert.equal(r.json.error.code, 'INVALID_PASSPHRASE');
    assert.match(r.json.error.message, new RegExp(`${left} attempts? left`));
  }
  assert.equal((await reveal(token, 'wrong')).json.error.code, 'SECRET_DESTROYED');
  assert.equal((await reveal(token, 'right')).json.error.code, 'NOT_FOUND');
});

test('passphrase: correct one reveals after wrong tries', async () => {
  const token = await create({ content: 'guarded', ttl: '1h', passphrase: 'right' });
  assert.equal((await reveal(token, 'wrong')).status, 401);
  assert.deepEqual((await reveal(token, 'right')).json, { isFile: false, data: 'guarded' });
});

test('validation and limits', async () => {
  const bad = [
    { content: '', ttl: '1h' },
    { content: 'x', ttl: '2h' },
    { content: 'x', file: { data: 'eA==', name: 'x', type: '' }, ttl: '1h' },
    { content: 'x', ttl: '1h', passphrase: '' },
  ];
  for (const body of bad) assert.equal((await call('/secrets', body)).json.error.code, 'VALIDATION_ERROR');
  const big = Buffer.alloc(1024 * 1024 + 1).toString('base64');
  const r = await call('/secrets', { file: { data: big, name: 'big', type: '' }, ttl: '1h' });
  assert.equal(r.json.error.code, 'PAYLOAD_TOO_LARGE');
  assert.equal((await call('/secrets/not-a-token/meta')).json.error.code, 'NOT_FOUND');
});
