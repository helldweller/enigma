# Enigma

One-time secret sharing: links that self-destruct after the first view.

Paste a text (or attach a file up to 1 MB), pick an expiry (1 hour to 7 days), optionally add a
passphrase, and get a link. The recipient opens it once; after that the secret is gone.

- React SPA (Vite, react-router), EN/RU, light/dark theme
- Express API (helmet, zod, express-rate-limit), Node 22, TypeScript
- Redis with native key expiry
- One container serves the API and the built SPA; Helm chart for Kubernetes

## Security model

- **Unguessable links.** A token is 32 random bytes (base64url, 43 chars). Share links look like
  `https://host/s/<token>/r`. The `/r` page only shows metadata (type, expiry, whether a
  passphrase is needed) and does not consume the secret, so link-preview bots in chat apps
  cannot burn it. The secret is revealed only after the recipient clicks "Reveal".
- **Redis never sees the token.** Records are stored under `sha256(token)`.
- **Encrypted at rest.** Each secret is encrypted with AES-256-GCM under a key derived with
  HKDF-SHA256 from the server master key, the token and a per-secret random salt. A Redis dump
  plus the master key is not enough to decrypt anything without the links.
- **Passphrases are part of the key.** With a passphrase, `scrypt(passphrase, salt)` is mixed into
  the key, so the server itself cannot decrypt the secret without it. No passphrase hash is
  stored: a failed GCM authentication means a wrong passphrase.
- **Exactly once.** Reveal deletes the record with a single `DEL`; of concurrent reveals only the
  request whose `DEL` removed the key returns the secret.
- **5 passphrase attempts.** Each attempt is reserved atomically (Lua script) before the
  passphrase is checked, so parallel guessing cannot exceed the limit. The 5th wrong attempt
  deletes the secret.
- **Expiry** is Redis key TTL; nothing outlives it.
- **Rate limits** per client IP: 20 creates/min, 100 meta+reveal requests/min.
- **Strict headers.** CSP `default-src 'self'` without inline scripts or styles, HSTS,
  `frame-ancestors 'none'`, `Referrer-Policy: no-referrer`.

The server does see plaintext while encrypting and decrypting (there is no client-side
encryption), so you trust whoever runs the instance. The master key comes from the
environment (a Kubernetes Secret in the chart).

## API

All bodies are JSON. Errors are `{"error": {"code": "...", "message": "..."}}`.

| Method & path | Body | Response |
| --- | --- | --- |
| `POST /api/secrets` | `{content, ttl, passphrase?}` or `{file: {data, name, type}, ttl, passphrase?}` | `201 {"token": "..."}` |
| `GET /api/secrets/:token/meta` | | `{"hasPassphrase", "isFile", "expiresAt"}` (does not consume) |
| `POST /api/secrets/:token/reveal` | `{}` or `{passphrase}` | `{"isFile": false, "data"}` or `{"isFile": true, "filename", "contentType", "data"}`, then the secret is deleted |
| `GET /api/health` | | `{"status": "ok", "db": "up"}` |

`ttl` is one of `1h`, `12h`, `1d`, `3d`, `5d`, `7d`. File `data` is base64; content and files are
limited to 1 MB.

Error codes: `NOT_FOUND` (404), `PASSPHRASE_REQUIRED` (401), `INVALID_PASSPHRASE` (401, message
says how many attempts are left), `SECRET_DESTROYED` (410), `VALIDATION_ERROR` (400),
`PAYLOAD_TOO_LARGE` (413), `RATE_LIMITED` (429), `INTERNAL_ERROR` (500).

## Run locally

```sh
MASTER_KEY=$(openssl rand -base64 32) docker compose up --build
# http://localhost:3000
```

Development (Node 22.18+, which runs the TypeScript server directly):

```sh
docker run -d -p 6379:6379 redis:7-alpine
npm ci
MASTER_KEY=dev-only-key-dev-only-key-dev-only npm run dev:server   # API on :3000
npm run dev                                                        # Vite on :5173, proxies /api
npm test                                                           # API test against Redis (REDIS_URL)
```

Environment variables:

| Variable | Default | |
| --- | --- | --- |
| `MASTER_KEY` | (required) | at least 32 random characters; changing it makes stored secrets unreadable |
| `REDIS_URL` | `redis://localhost:6379` | |
| `REDIS_PASSWORD` | | |
| `PORT` | `3000` | |
| `CLIENT_IP_HEADER` | | header with the real client IP for rate limiting, e.g. `cf-connecting-ip`. Set it only if clients cannot reach the app except through that proxy, or they can spoof it |

## Deploy with Helm

The chart in [`charts/enigma`](charts/enigma) installs the app, a single Redis (StatefulSet with
AOF on a small PVC) and an Ingress. The master key and Redis password are generated on first
install and kept across upgrades (or bring your own Secret with keys `master-key` and
`redis-password` via `existingSecret`).

```sh
helm upgrade --install enigma charts/enigma -n enigma --create-namespace -f my-values.yaml \
  --set image.tag=<git sha>
```

Example `my-values.yaml` behind Cloudflare, with the nginx.org ingress controller and
cert-manager (HTTP-01):

```yaml
clientIpHeader: cf-connecting-ip   # only if the origin accepts 80/443 from Cloudflare alone
ingress:
  className: nginx
  host: enigma.example.com
  annotations:
    cert-manager.io/cluster-issuer: letsencrypt
    acme.cert-manager.io/http01-edit-in-place: "true"   # nginx.org rejects a 2nd Ingress per host
    ingress.kubernetes.io/ssl-redirect: "false"         # Cloudflare "Flexible" talks HTTP to the origin
    nginx.org/client-max-body-size: "4m"                # 1 MB files arrive base64-encoded in JSON
redis:
  storageClassName: ""   # empty = cluster default
```

Images: `ghcr.io/helldweller/enigma:<git sha>` and `:latest`, built by GitHub Actions on every
push to `main`. See [`charts/enigma/values.yaml`](charts/enigma/values.yaml) for the few
options.

## License

MIT
