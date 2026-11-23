import { StrictMode, useEffect, useRef, useState } from 'react';
import type { DragEvent, FormEvent } from 'react';
import { createRoot } from 'react-dom/client';
import { BrowserRouter, Link, Navigate, Route, Routes, useNavigate, useParams } from 'react-router';
import { LANGUAGES, LanguageContext, initialLanguage, saveLanguage, useT } from './i18n.ts';
import type { Key, Language } from './i18n.ts';
import './styles.css';

const REPO_URL = 'https://github.com/helldweller/enigma';
const MAX_FILE = 1024 * 1024;
const TTLS = ['1h', '12h', '1d', '3d', '5d', '7d'] as const;

// ---------- API ----------

class ApiError extends Error {
  code: string;
  constructor(code: string, message: string) {
    super(message);
    this.code = code;
  }
}

async function call<T>(path: string, body?: object): Promise<T> {
  const res = await fetch(path, body ? { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) } : {});
  const json = await res.json().catch(() => null);
  if (!res.ok) throw new ApiError(json?.error?.code ?? 'UNKNOWN', json?.error?.message ?? `Request failed (${res.status}).`);
  return json as T;
}

type Meta = { hasPassphrase: boolean; isFile: boolean; expiresAt: string };
type Revealed = { isFile: false; data: string } | { isFile: true; data: string; filename?: string; contentType?: string };

const api = {
  create: (body: object) => call<{ token: string }>('/api/secrets', body),
  meta: (token: string) => call<Meta>(`/api/secrets/${encodeURIComponent(token)}/meta`),
  reveal: (token: string, passphrase?: string) =>
    call<Revealed>(`/api/secrets/${encodeURIComponent(token)}/reveal`, passphrase ? { passphrase } : {}),
};

const KNOWN_ERRORS = new Set(['PASSPHRASE_REQUIRED', 'SECRET_DESTROYED', 'RATE_LIMITED', 'NOT_FOUND', 'PAYLOAD_TOO_LARGE', 'VALIDATION_ERROR', 'INTERNAL_ERROR']);

function useErrorText() {
  const t = useT();
  return (err: unknown, fallback: Key) => {
    if (!(err instanceof ApiError)) return t(fallback);
    if (err.code === 'INVALID_PASSPHRASE') {
      const left = err.message.match(/(\d+)/);
      return left ? t('error.INVALID_PASSPHRASE_ATTEMPTS', { attempts: left[1] }) : t('error.INVALID_PASSPHRASE');
    }
    return KNOWN_ERRORS.has(err.code) ? t(`error.${err.code}` as Key) : err.message;
  };
}

// ---------- helpers ----------

const PASS_ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz23456789';

function generatePassphrase(length = 20) {
  const limit = 256 - (256 % PASS_ALPHABET.length); // rejection sampling: no modulo bias
  let out = '';
  while (out.length < length) {
    for (const b of crypto.getRandomValues(new Uint8Array(length - out.length))) {
      if (b < limit) out += PASS_ALPHABET[b % PASS_ALPHABET.length];
    }
  }
  return out;
}

function formatSize(n: number) {
  if (n < 1024) return `${n} B`;
  if (n < 1024 * 1024) return `${(n / 1024).toFixed(1)} KB`;
  return `${(n / 1024 / 1024).toFixed(2)} MB`;
}

function readBase64(file: File) {
  return new Promise<string>((resolve, reject) => {
    const r = new FileReader();
    r.onload = () => resolve(String(r.result).split(',', 2)[1] ?? '');
    r.onerror = () => reject(r.error);
    r.readAsDataURL(file);
  });
}

function downloadBase64(data: string, name: string, type?: string) {
  const bytes = Uint8Array.from(atob(data), (c) => c.charCodeAt(0));
  const url = URL.createObjectURL(new Blob([bytes], { type: type || 'application/octet-stream' }));
  const a = document.createElement('a');
  a.href = url;
  a.download = name;
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
}

function useCopy() {
  const [copied, setCopied] = useState(false);
  const copy = async (text: string) => {
    await navigator.clipboard.writeText(text);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };
  return [copied, copy] as const;
}

// ---------- pages ----------

function CreatePage() {
  const t = useT();
  const errorText = useErrorText();
  const [text, setText] = useState('');
  const [file, setFile] = useState<File | null>(null);
  const [ttl, setTtl] = useState<(typeof TTLS)[number]>('1d');
  const [passphrase, setPassphrase] = useState('');
  const [showPass, setShowPass] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [link, setLink] = useState<string | null>(null);
  const [dragOver, setDragOver] = useState(false);
  const [linkCopied, copyLink] = useCopy();
  const [passCopied, copyPass] = useCopy();
  const fileInput = useRef<HTMLInputElement>(null);
  const dragDepth = useRef(0);
  const hasText = text.trim() !== '';

  const clearFile = () => {
    setFile(null);
    if (fileInput.current) fileInput.current.value = '';
  };
  const pickFile = (f: File | null) => {
    setError(null);
    if (f && f.size > MAX_FILE) {
      setError(t('create.error.fileTooLarge', { size: formatSize(f.size) }));
      clearFile();
      return;
    }
    setFile(f);
  };

  const isFileDrag = (e: DragEvent) => e.dataTransfer.types.includes('Files');
  const onDragEnter = (e: DragEvent) => {
    if (!isFileDrag(e)) return;
    e.preventDefault();
    dragDepth.current += 1;
    if (!hasText) setDragOver(true);
  };
  const onDragOver = (e: DragEvent) => {
    if (!isFileDrag(e)) return;
    e.preventDefault();
    e.dataTransfer.dropEffect = hasText ? 'none' : 'copy';
  };
  const onDragLeave = (e: DragEvent) => {
    if (!isFileDrag(e)) return;
    dragDepth.current = Math.max(0, dragDepth.current - 1);
    if (dragDepth.current === 0) setDragOver(false);
  };
  const onDrop = (e: DragEvent) => {
    if (!isFileDrag(e)) return;
    e.preventDefault();
    dragDepth.current = 0;
    setDragOver(false);
    if (hasText) return setError(t('create.error.clearTextFirst'));
    const f = e.dataTransfer.files?.[0];
    if (f) pickFile(f);
  };

  const onSubmit = async (e: FormEvent) => {
    e.preventDefault();
    setError(null);
    if (!file && !hasText) return setError(t('create.error.emptySubmit'));
    if (file && hasText) return setError(t('create.error.bothText'));
    setSubmitting(true);
    try {
      const body = file
        ? { file: { data: await readBase64(file), name: file.name, type: file.type }, ttl, passphrase: passphrase || undefined }
        : { content: text, ttl, passphrase: passphrase || undefined };
      const { token } = await api.create(body);
      setLink(`${window.location.origin}/s/${token}/r`);
    } catch (err) {
      setError(errorText(err, 'create.error.generic'));
    } finally {
      setSubmitting(false);
    }
  };

  const reset = () => {
    setText('');
    clearFile();
    setPassphrase('');
    setShowPass(false);
    setTtl('1d');
    setLink(null);
    setError(null);
  };

  if (link) {
    return (
      <section className="card">
        <h1>{t('create.readyTitle')}</h1>
        <p className="muted">
          {t('create.readyDescriptionBefore')}
          <strong>{t('create.readyDescriptionOnce')}</strong>
          {t('create.readyDescriptionAfter')}
        </p>
        <div className="link-row">
          <input className="link-input" readOnly value={link} onFocus={(e) => e.target.select()} />
          <button type="button" className="btn" onClick={() => copyLink(link)}>
            {t(linkCopied ? 'common.copied' : 'common.copy')}
          </button>
        </div>
        {passphrase && <p className="notice">{t('create.rememberPassphrase')}</p>}
        <button type="button" className="btn btn-secondary" onClick={reset}>
          {t('create.shareAnother')}
        </button>
      </section>
    );
  }

  return (
    <section className="card">
      <h1>{t('create.title')}</h1>
      <p className="info-banner">{t('create.piiWarning')}</p>
      <form
        className={`form${dragOver ? ' form-dragover' : ''}`}
        autoComplete="off"
        onSubmit={onSubmit}
        onDragEnter={onDragEnter}
        onDragOver={onDragOver}
        onDragLeave={onDragLeave}
        onDrop={onDrop}
      >
        <label className="field">
          <span className="field-label">{t('create.secretLabel')}</span>
          <textarea
            className="textarea"
            placeholder={t('create.secretPlaceholder')}
            value={text}
            onChange={(e) => setText(e.target.value)}
            rows={10}
            disabled={!!file}
          />
        </label>

        <div className="field">
          <span className="field-label">{t('create.fileLabel')}</span>
          <input ref={fileInput} type="file" hidden onChange={(e) => pickFile(e.target.files?.[0] ?? null)} />
          {file ? (
            <div className="file-chip">
              <span>
                📎 {file.name} <span className="muted">({formatSize(file.size)})</span>
              </span>
              <button type="button" className="link-btn" onClick={clearFile}>
                {t('create.remove')}
              </button>
            </div>
          ) : (
            <button type="button" className="btn btn-secondary" onClick={() => fileInput.current?.click()} disabled={hasText}>
              {t('create.attachFile')}
            </button>
          )}
        </div>

        <div className="grid-2">
          <label className="field">
            <span className="field-label">{t('create.expiresLabel')}</span>
            <select className="select" value={ttl} onChange={(e) => setTtl(e.target.value as typeof ttl)}>
              {TTLS.map((v) => (
                <option key={v} value={v}>
                  {t(`ttl.${v}`)}
                </option>
              ))}
            </select>
          </label>
          <label className="field">
            <span className="field-label-row">
              <span className="field-label">{t('create.passphraseLabel')}</span>
              <span className="field-label-actions">
                <button
                  type="button"
                  className="link-btn link-btn-muted"
                  onClick={() => {
                    setPassphrase(generatePassphrase());
                    setShowPass(true);
                  }}
                >
                  {t('create.generate')}
                </button>
                {passphrase && (
                  <button type="button" className="link-btn link-btn-muted" onClick={() => copyPass(passphrase)}>
                    {t(passCopied ? 'common.copied' : 'common.copy')}
                  </button>
                )}
              </span>
            </span>
            <input
              className={`input${showPass ? '' : ' input-masked'}`}
              type="text"
              placeholder={t('create.passphrasePlaceholder')}
              value={passphrase}
              onChange={(e) => setPassphrase(e.target.value)}
              autoComplete="off"
              data-lpignore="true"
              data-1p-ignore
            />
          </label>
        </div>

        {error && <p className="error">{error}</p>}
        <button type="submit" className="btn btn-primary" disabled={submitting}>
          {t(submitting ? 'create.submitting' : 'create.submit')}
        </button>
      </form>
    </section>
  );
}

function Unavailable({ message }: { message: string }) {
  const t = useT();
  return (
    <section className="card">
      <h1>{t('revealConfirm.unavailableTitle')}</h1>
      <p className="muted">{message}</p>
      <Link to="/" className="btn btn-primary">
        {t('common.createNew')}
      </Link>
    </section>
  );
}

// /s/:token/r: shows what the link is without consuming it, so link-preview bots can't burn the secret.
function ConfirmPage() {
  const t = useT();
  const errorText = useErrorText();
  const { token = '' } = useParams();
  const navigate = useNavigate();
  const [meta, setMeta] = useState<Meta | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    api.meta(token).then(setMeta, (err) => setError(errorText(err, 'revealConfirm.errorFallback')));
  }, [token]);

  if (error) return <Unavailable message={error} />;
  if (!meta) return <section className="card">{t('common.loading')}</section>;
  return (
    <section className="card">
      <h1>{t('revealConfirm.title')}</h1>
      <p className="muted">
        {t(meta.isFile ? 'revealConfirm.subtitleBeforeFile' : 'revealConfirm.subtitleBeforeText')}
        <strong>{t('revealConfirm.subtitleOnce')}</strong>
        {t('revealConfirm.subtitleAfter')}
      </p>
      <ul className="meta-list">
        <li>
          {t('revealConfirm.typeLabel')}: {t(meta.isFile ? 'revealConfirm.typeFile' : 'revealConfirm.typeText')}
        </li>
        <li>
          {t('revealConfirm.expiresLabel')}: {new Date(meta.expiresAt).toUTCString()}
        </li>
        {meta.hasPassphrase && <li>{t('revealConfirm.passphraseRequired')}</li>}
      </ul>
      <button type="button" className="btn btn-primary" onClick={() => navigate(`/s/${token}`)}>
        {t('revealConfirm.revealCta')}
      </button>
    </section>
  );
}

type RevealState = 'loading' | 'revealing' | 'need-passphrase' | 'done' | 'gone';

function RevealPage() {
  const t = useT();
  const errorText = useErrorText();
  const { token = '' } = useParams();
  const [state, setState] = useState<RevealState>('loading');
  const [secret, setSecret] = useState<Revealed | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [passphrase, setPassphrase] = useState('');
  const [copied, copy] = useCopy();
  const started = useRef(false);

  const reveal = async (pass?: string) => {
    setState('revealing');
    setError(null);
    try {
      setSecret(await api.reveal(token, pass));
      setState('done');
    } catch (err) {
      setError(errorText(err, 'revealSecret.errorFallback'));
      const retryable =
        err instanceof ApiError &&
        (err.code === 'INVALID_PASSPHRASE' || err.code === 'PASSPHRASE_REQUIRED' || (err.code === 'RATE_LIMITED' && pass !== undefined));
      setState(retryable ? 'need-passphrase' : 'gone');
    }
  };

  useEffect(() => {
    if (started.current) return; // StrictMode runs effects twice; revealing twice would burn the secret
    started.current = true;
    api.meta(token).then(
      (m) => (m.hasPassphrase ? setState('need-passphrase') : reveal()),
      (err) => {
        setError(errorText(err, 'revealSecret.goneFallback'));
        setState('gone');
      },
    );
  }, [token]);

  if (state === 'loading' || state === 'revealing') return <section className="card">{t('revealSecret.decrypting')}</section>;
  if (state === 'gone') return <Unavailable message={error ?? t('revealSecret.expiredMessage')} />;
  if (state === 'need-passphrase') {
    return (
      <section className="card">
        <h1>{t('revealSecret.passphraseTitle')}</h1>
        <p className="muted">{t('revealSecret.passphraseSubtitle')}</p>
        <form
          className="form"
          autoComplete="off"
          onSubmit={(e) => {
            e.preventDefault();
            reveal(passphrase);
          }}
        >
          <input
            className="input"
            type="password"
            placeholder={t('revealSecret.passphrasePlaceholder')}
            value={passphrase}
            onChange={(e) => setPassphrase(e.target.value)}
            autoComplete="off"
            data-lpignore="true"
            data-1p-ignore
            autoFocus
          />
          {error && <p className="error">{error}</p>}
          <button type="submit" className="btn btn-primary" disabled={!passphrase}>
            {t('revealSecret.openBtn')}
          </button>
        </form>
      </section>
    );
  }
  return (
    <section className="card">
      <h1>{t('revealSecret.doneTitle')}</h1>
      <p className="notice">{t('revealSecret.destroyedNotice')}</p>
      {secret?.isFile ? (
        <div className="file-reveal">
          <p>
            📎 <strong>{secret.filename || t('revealSecret.fileFallbackName')}</strong>
          </p>
          <button type="button" className="btn btn-primary" onClick={() => downloadBase64(secret.data, secret.filename || 'secret', secret.contentType)}>
            {t('revealSecret.download')}
          </button>
        </div>
      ) : (
        <>
          <pre className="secret-output">{secret?.data}</pre>
          <button type="button" className="btn" onClick={() => secret && copy(secret.data)}>
            {t(copied ? 'common.copied' : 'revealSecret.copyToClipboard')}
          </button>
        </>
      )}
    </section>
  );
}

// ---------- shell ----------

function App() {
  const [lang, setLang] = useState<Language>(initialLanguage);
  const [theme, setTheme] = useState(() => document.documentElement.dataset.theme === 'dark' ? 'dark' : 'light');

  useEffect(() => saveLanguage(lang), [lang]);
  useEffect(() => {
    document.documentElement.dataset.theme = theme;
    try {
      localStorage.setItem('enigma-theme', theme);
    } catch {}
  }, [theme]);

  return (
    <LanguageContext.Provider value={lang}>
      <Shell lang={lang} setLang={setLang} theme={theme} toggleTheme={() => setTheme(theme === 'dark' ? 'light' : 'dark')} />
    </LanguageContext.Provider>
  );
}

function Shell(props: { lang: Language; setLang: (l: Language) => void; theme: string; toggleTheme: () => void }) {
  const t = useT();
  const themeLabel = t(props.theme === 'dark' ? 'app.themeToLight' : 'app.themeToDark');
  return (
    <div className="app">
      <header className="header">
        <Link to="/" className="logo">
          🔐 Enigma
        </Link>
        <span className="tagline">{t('app.tagline')}</span>
        <div className="header-actions">
          <select
            className="language-select"
            value={props.lang}
            onChange={(e) => props.setLang(e.target.value as Language)}
            aria-label={t('app.languageLabel')}
            title={t('app.languageLabel')}
          >
            {Object.keys(LANGUAGES).map((code) => (
              <option key={code} value={code}>
                {code.toUpperCase()}
              </option>
            ))}
          </select>
          <button type="button" className="theme-toggle" onClick={props.toggleTheme} aria-label={themeLabel} title={themeLabel}>
            {props.theme === 'dark' ? '☀️' : '🌙'}
          </button>
        </div>
      </header>
      <main className="main">
        <Routes>
          <Route path="/" element={<CreatePage />} />
          <Route path="/s/:token/r" element={<ConfirmPage />} />
          <Route path="/s/:token" element={<RevealPage />} />
          <Route path="*" element={<Navigate to="/" replace />} />
        </Routes>
      </main>
      <footer className="footer">
        {t('app.footer')}{' '}
        <a href={REPO_URL} target="_blank" rel="noopener noreferrer">
          {t('app.source')}
        </a>
      </footer>
    </div>
  );
}

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <BrowserRouter>
      <App />
    </BrowserRouter>
  </StrictMode>,
);
