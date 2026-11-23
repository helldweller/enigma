import { createCipheriv, createDecipheriv, createHash, hkdfSync, randomBytes, scrypt } from 'node:crypto';
import { join } from 'node:path';
import { promisify } from 'node:util';
import express from 'express';
import type { ErrorRequestHandler, Request, RequestHandler } from 'express';
import helmet from 'helmet';
import { ipKeyGenerator, rateLimit } from 'express-rate-limit';
import type { Redis } from 'ioredis';
import { z } from 'zod';

const scryptAsync = promisify(scrypt) as (pw: string, salt: Buffer, len: number, opts: object) => Promise<Buffer>;

const MAX_BYTES = 1024 * 1024; // 1 MiB of text or file content
const MAX_ATTEMPTS = 5;
const TTL_SECONDS = { '1h': 3600, '12h': 43200, '1d': 86400, '3d': 259200, '5d': 432000, '7d': 604800 } as const;

type ErrorCode =
  | 'NOT_FOUND' | 'PASSPHRASE_REQUIRED' | 'INVALID_PASSPHRASE' | 'SECRET_DESTROYED' | 'RATE_LIMITED'
  | 'PAYLOAD_TOO_LARGE' | 'VALIDATION_ERROR' | 'INTERNAL_ERROR';

const STATUS: Record<ErrorCode, number> = {
  NOT_FOUND: 404, PASSPHRASE_REQUIRED: 401, INVALID_PASSPHRASE: 401, SECRET_DESTROYED: 410, RATE_LIMITED: 429,
  PAYLOAD_TOO_LARGE: 413, VALIDATION_ERROR: 400, INTERNAL_ERROR: 500,
};

class ApiError extends Error {
  code: ErrorCode;
  constructor(code: ErrorCode, message: string) {
    super(message);
    this.code = code;
  }
}

const notFound = () => new ApiError('NOT_FOUND', 'Secret not found, already opened, or expired.');

const createSchema = z
  .strictObject({
    content: z.string().min(1).optional(),
    file: z
      .strictObject({ data: z.base64().min(1), name: z.string().max(255), type: z.string().max(255) })
      .optional(),
    ttl: z.enum(Object.keys(TTL_SECONDS) as [keyof typeof TTL_SECONDS]),
    passphrase: z.string().min(1).max(256).optional(),
  })
  .refine((b) => (b.content === undefined) !== (b.file === undefined), 'Provide exactly one of `content` or `file`.');

const revealSchema = z.strictObject({ passphrase: z.string().min(1).max(256).optional() });

// Tokens are 32 random bytes in base64url. Redis only ever sees sha256(token).
const tokenSchema = z.string().regex(/^[A-Za-z0-9_-]{43}$/);
const redisKey = (token: string) => 'secret:' + createHash('sha256').update(token).digest('hex');

// Per-secret key = HKDF(master key || token || scrypt(passphrase, salt)). Without the token
// (never stored) a Redis dump plus the master key decrypts nothing; with a passphrase the
// server cannot decrypt without it either. A GCM auth failure means a wrong passphrase.
async function deriveKey(masterKey: Buffer, token: string, salt: Buffer, passphrase?: string) {
  const pass = passphrase
    ? await scryptAsync(passphrase, salt, 32, { N: 2 ** 15, r: 8, p: 1, maxmem: 64 * 1024 * 1024 })
    : Buffer.alloc(0);
  const ikm = Buffer.concat([masterKey, Buffer.from(token), pass]);
  return Buffer.from(hkdfSync('sha256', ikm, salt, 'enigma-v1', 32));
}

// Reads a secret; when a passphrase is supplied for a protected secret, atomically reserves
// one attempt first, so parallel guesses can never exceed MAX_ATTEMPTS.
const BEGIN_REVEAL = `
if redis.call('EXISTS', KEYS[1]) == 0 then return false end
if ARGV[1] == '1' and redis.call('HGET', KEYS[1], 'pass') == '1' then
  redis.call('HINCRBY', KEYS[1], 'attempts', 1)
end
return redis.call('HGETALL', KEYS[1])`;

function toRecord(flat: string[]) {
  const r: Record<string, string> = {};
  for (let i = 0; i < flat.length; i += 2) r[flat[i]] = flat[i + 1];
  return r;
}

export function createApp({ redis, masterKey, clientIpHeader }: {
  redis: Redis;
  masterKey: Buffer;
  clientIpHeader?: string; // e.g. cf-connecting-ip; only set it when the origin is reachable solely through that proxy
}) {
  const app = express();
  app.disable('x-powered-by');
  app.use(
    helmet({
      contentSecurityPolicy: {
        directives: { 'style-src': ["'self'"], 'connect-src': ["'self'"], 'frame-ancestors': ["'none'"] },
      },
      referrerPolicy: { policy: 'no-referrer' },
    }),
  );

  const clientIp = (req: Request) => (clientIpHeader && req.get(clientIpHeader)) || req.socket.remoteAddress || '';
  const limiter = (limit: number) =>
    rateLimit({
      windowMs: 60_000,
      limit,
      standardHeaders: 'draft-7',
      legacyHeaders: false,
      keyGenerator: (req) => ipKeyGenerator(clientIp(req)),
      validate: { xForwardedForHeader: false },
      handler: (_req, _res, next) => next(new ApiError('RATE_LIMITED', 'Too many requests. Please slow down and try again later.')),
    });

  const api = express.Router();
  api.use(express.json({ limit: '2mb' }));

  api.get('/health', async (_req, res) => {
    try {
      await redis.ping();
      res.json({ status: 'ok', db: 'up' });
    } catch {
      res.status(503).json({ status: 'error', db: 'down' });
    }
  });

  api.post('/secrets', limiter(20), async (req, res) => {
    const body = createSchema.parse(req.body);
    const payload = body.file
      ? { name: body.file.name, type: body.file.type, data: body.file.data }
      : { content: body.content };
    const size = body.file ? Buffer.from(body.file.data, 'base64').length : Buffer.byteLength(body.content!);
    if (size > MAX_BYTES) throw new ApiError('PAYLOAD_TOO_LARGE', 'Secret payload exceeds the size limit.');

    const token = randomBytes(32).toString('base64url');
    const salt = randomBytes(16);
    const iv = randomBytes(12);
    const key = await deriveKey(masterKey, token, salt, body.passphrase);
    const cipher = createCipheriv('aes-256-gcm', key, iv);
    const ct = Buffer.concat([cipher.update(JSON.stringify(payload)), cipher.final(), cipher.getAuthTag()]);
    const ttl = TTL_SECONDS[body.ttl];
    const k = redisKey(token);
    await redis
      .multi()
      .hset(k, {
        ct: ct.toString('base64'),
        iv: iv.toString('base64'),
        salt: salt.toString('base64'),
        pass: body.passphrase ? '1' : '0',
        file: body.file ? '1' : '0',
        exp: String(Date.now() + ttl * 1000),
        attempts: '0',
      })
      .expire(k, ttl)
      .exec();
    res.status(201).json({ token });
  });

  const withToken: RequestHandler = (req, _res, next) => {
    if (!tokenSchema.safeParse(req.params.token).success) throw notFound();
    next();
  };

  api.get('/secrets/:token/meta', limiter(100), withToken, async (req, res) => {
    const [pass, file, exp] = await redis.hmget(redisKey(req.params.token as string), 'pass', 'file', 'exp');
    if (exp === null) throw notFound();
    res.json({ hasPassphrase: pass === '1', isFile: file === '1', expiresAt: new Date(Number(exp)).toISOString() });
  });

  api.post('/secrets/:token/reveal', limiter(100), withToken, async (req, res) => {
    const { passphrase } = revealSchema.parse(req.body ?? {});
    const token = req.params.token as string;
    const k = redisKey(token);
    const flat = (await redis.eval(BEGIN_REVEAL, 1, k, passphrase ? '1' : '0')) as string[] | null;
    if (!flat) throw notFound();
    const s = toRecord(flat);
    const hasPass = s.pass === '1';
    if (hasPass && !passphrase) throw new ApiError('PASSPHRASE_REQUIRED', 'A passphrase is required to open this secret.');
    const attempts = Number(s.attempts);
    const destroyed = () =>
      new ApiError('SECRET_DESTROYED', 'Too many incorrect passphrase attempts. This secret has been destroyed.');
    if (hasPass && attempts > MAX_ATTEMPTS) throw destroyed(); // a parallel request already used the last attempt

    let plain: string;
    try {
      const salt = Buffer.from(s.salt, 'base64');
      const ct = Buffer.from(s.ct, 'base64');
      const key = await deriveKey(masterKey, token, salt, hasPass ? passphrase : undefined);
      const decipher = createDecipheriv('aes-256-gcm', key, Buffer.from(s.iv, 'base64'));
      decipher.setAuthTag(ct.subarray(-16));
      plain = Buffer.concat([decipher.update(ct.subarray(0, -16)), decipher.final()]).toString();
    } catch (err) {
      if (!hasPass) throw err; // without a passphrase this means a changed master key: 500
      if (attempts >= MAX_ATTEMPTS) {
        await redis.del(k);
        throw destroyed();
      }
      const left = MAX_ATTEMPTS - attempts;
      throw new ApiError('INVALID_PASSPHRASE', `Incorrect passphrase. ${left} attempt${left === 1 ? '' : 's'} left.`);
    }

    // DEL is atomic: of two concurrent reveals only the one that actually deleted the key wins.
    if ((await redis.del(k)) !== 1) throw notFound();
    const p = JSON.parse(plain);
    res.json(s.file === '1' ? { isFile: true, filename: p.name, contentType: p.type, data: p.data } : { isFile: false, data: p.content });
  });

  api.use(() => {
    throw new ApiError('NOT_FOUND', 'Not found.');
  });

  const onError: ErrorRequestHandler = (err, _req, res, _next) => {
    let e: ApiError;
    if (err instanceof ApiError) e = err;
    else if (err instanceof z.ZodError) e = new ApiError('VALIDATION_ERROR', err.issues[0]?.message ?? 'Invalid request.');
    else if (err?.type === 'entity.too.large') e = new ApiError('PAYLOAD_TOO_LARGE', 'Secret payload exceeds the size limit.');
    else if (err?.type === 'entity.parse.failed') e = new ApiError('VALIDATION_ERROR', 'Malformed JSON body.');
    else {
      console.error(err);
      e = new ApiError('INTERNAL_ERROR', 'An unexpected error occurred.');
    }
    res.status(STATUS[e.code]).json({ error: { code: e.code, message: e.message } });
  };
  api.use(onError);
  app.use('/api', api);

  // The built SPA: hashed assets are immutable, every other path gets index.html.
  const web = join(import.meta.dirname, '../dist/web');
  app.use('/assets', express.static(join(web, 'assets'), { immutable: true, maxAge: '1y', fallthrough: false }));
  app.use(express.static(web, { index: false, maxAge: '1h' }));
  app.get('/{*path}', (_req, res) => {
    res.set('Cache-Control', 'no-cache').sendFile(join(web, 'index.html'));
  });

  return app;
}
