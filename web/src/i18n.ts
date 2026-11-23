import { createContext, useContext } from 'react';

const en = {
  'app.tagline': 'Share secrets that self-destruct.',
  'app.themeToLight': 'Switch to light theme',
  'app.themeToDark': 'Switch to dark theme',
  'app.footer': 'Secrets are encrypted at rest and can be opened only once.',
  'app.source': 'Source code on GitHub',
  'app.languageLabel': 'Language',
  'common.loading': 'Loading…',
  'common.copy': 'Copy',
  'common.copied': 'Copied!',
  'common.createNew': 'Create a new secret',
  'ttl.1h': '1 hour',
  'ttl.12h': '12 hours',
  'ttl.1d': '1 day',
  'ttl.3d': '3 days',
  'ttl.5d': '5 days',
  'ttl.7d': '7 days',
  'create.title': 'Share a secret',
  'create.piiWarning': '🛡️ For your safety, do not include personally identifying information (names, emails, phone numbers, account IDs, addresses) in the secret. Share only what’s strictly necessary.',
  'create.secretLabel': 'Secret',
  'create.secretPlaceholder': 'Type the secret you want to share…',
  'create.fileLabel': 'Or attach a file (max 1 MB)',
  'create.attachFile': 'Attach a file',
  'create.remove': 'Remove',
  'create.expiresLabel': 'Expires after',
  'create.passphraseLabel': 'Passphrase (optional)',
  'create.generate': 'Generate',
  'create.passphrasePlaceholder': 'Extra protection',
  'create.submit': 'Create secret link',
  'create.submitting': 'Encrypting…',
  'create.readyTitle': 'Your secret link is ready',
  'create.readyDescriptionBefore': 'Share this link. It can be opened ',
  'create.readyDescriptionOnce': 'once',
  'create.readyDescriptionAfter': ', then it’s gone forever.',
  'create.rememberPassphrase': '🔑 Remember to share the passphrase separately — the recipient needs it to open the secret.',
  'create.shareAnother': 'Share another secret',
  'create.error.fileTooLarge': 'File is too large ({size}). Maximum is 1 MB.',
  'create.error.clearTextFirst': 'Clear the text above before attaching a file.',
  'create.error.emptySubmit': 'Enter a secret or attach a file.',
  'create.error.bothText': 'Share either text or a file, not both.',
  'create.error.generic': 'Failed to create secret.',
  'revealConfirm.title': 'Someone shared a secret with you',
  'revealConfirm.subtitleBeforeFile': 'This is a file that self-destructs after being opened ',
  'revealConfirm.subtitleBeforeText': 'This is a message that self-destructs after being opened ',
  'revealConfirm.subtitleOnce': 'once',
  'revealConfirm.subtitleAfter': '. Make sure you’re ready before revealing it.',
  'revealConfirm.typeLabel': 'Type',
  'revealConfirm.typeFile': 'File',
  'revealConfirm.typeText': 'Text',
  'revealConfirm.expiresLabel': 'Expires',
  'revealConfirm.passphraseRequired': '🔑 A passphrase is required to open it.',
  'revealConfirm.revealCta': 'Reveal the secret',
  'revealConfirm.errorFallback': 'Could not load secret.',
  'revealConfirm.unavailableTitle': 'Secret unavailable',
  'revealConfirm.unavailableMessage': 'This secret no longer exists.',
  'revealSecret.decrypting': 'Decrypting…',
  'revealSecret.expiredMessage': 'This secret has already been opened or has expired.',
  'revealSecret.passphraseTitle': 'Passphrase required',
  'revealSecret.passphraseSubtitle': 'Enter the passphrase to open this secret.',
  'revealSecret.passphrasePlaceholder': 'Passphrase',
  'revealSecret.openBtn': 'Open secret',
  'revealSecret.doneTitle': 'Here is the secret',
  'revealSecret.destroyedNotice': '⚠️ This secret has now been destroyed and cannot be opened again.',
  'revealSecret.download': 'Download file',
  'revealSecret.copyToClipboard': 'Copy to clipboard',
  'revealSecret.errorFallback': 'Could not reveal the secret.',
  'revealSecret.goneFallback': 'This secret no longer exists.',
  'revealSecret.fileFallbackName': 'file',
  'error.PASSPHRASE_REQUIRED': 'A passphrase is required to open this secret.',
  'error.INVALID_PASSPHRASE': 'Incorrect passphrase.',
  'error.INVALID_PASSPHRASE_ATTEMPTS': 'Incorrect passphrase. {attempts} attempt(s) left.',
  'error.SECRET_DESTROYED': 'Too many incorrect passphrase attempts. This secret has been destroyed.',
  'error.RATE_LIMITED': 'Too many requests. Please slow down and try again later.',
  'error.NOT_FOUND': 'Secret not found, already opened, or expired.',
  'error.PAYLOAD_TOO_LARGE': 'Secret payload exceeds the size limit.',
  'error.VALIDATION_ERROR': 'The request could not be processed.',
  'error.INTERNAL_ERROR': 'An unexpected error occurred.',
};

export type Key = keyof typeof en;

const ru: Record<Key, string> = {
  'app.tagline': 'Делитесь секретами, которые исчезают после прочтения.',
  'app.themeToLight': 'Переключить на светлую тему',
  'app.themeToDark': 'Переключить на тёмную тему',
  'app.footer': 'Секреты хранятся в зашифрованном виде и открываются только один раз.',
  'app.source': 'Исходный код на GitHub',
  'app.languageLabel': 'Язык',
  'common.loading': 'Загрузка…',
  'common.copy': 'Копировать',
  'common.copied': 'Скопировано!',
  'common.createNew': 'Создать новый секрет',
  'ttl.1h': '1 час',
  'ttl.12h': '12 часов',
  'ttl.1d': '1 день',
  'ttl.3d': '3 дня',
  'ttl.5d': '5 дней',
  'ttl.7d': '7 дней',
  'create.title': 'Поделитесь секретом',
  'create.piiWarning': '🛡️ Для безопасности не указывайте в секрете персональные данные: имена, электронные адреса, номера телефонов, идентификаторы аккаунтов, адреса. Делитесь только тем, что действительно нужно.',
  'create.secretLabel': 'Секрет',
  'create.secretPlaceholder': 'Введите секрет…',
  'create.fileLabel': 'Или прикрепите файл (до 1 МБ)',
  'create.attachFile': 'Прикрепить файл',
  'create.remove': 'Убрать',
  'create.expiresLabel': 'Срок действия',
  'create.passphraseLabel': 'Кодовая фраза (необязательно)',
  'create.generate': 'Сгенерировать',
  'create.passphrasePlaceholder': 'Дополнительная защита',
  'create.submit': 'Создать ссылку',
  'create.submitting': 'Шифрование…',
  'create.readyTitle': 'Ссылка на секрет готова',
  'create.readyDescriptionBefore': 'Отправьте ссылку. Открыть её можно ',
  'create.readyDescriptionOnce': 'только один раз',
  'create.readyDescriptionAfter': ' — после этого она исчезнет навсегда.',
  'create.rememberPassphrase': '🔑 Не забудьте передать кодовую фразу отдельно — без неё секрет не открыть.',
  'create.shareAnother': 'Создать ещё один секрет',
  'create.error.fileTooLarge': 'Файл слишком большой ({size}). Максимум — 1 МБ.',
  'create.error.clearTextFirst': 'Сначала очистите текст выше, потом прикрепляйте файл.',
  'create.error.emptySubmit': 'Введите секрет или прикрепите файл.',
  'create.error.bothText': 'Что-то одно: либо текст, либо файл.',
  'create.error.generic': 'Не удалось создать секрет.',
  'revealConfirm.title': 'Кто-то поделился с вами секретом',
  'revealConfirm.subtitleBeforeFile': 'Этот файл самоуничтожится после того, как его откроют ',
  'revealConfirm.subtitleBeforeText': 'Это сообщение самоуничтожится после того, как его откроют ',
  'revealConfirm.subtitleOnce': 'один раз',
  'revealConfirm.subtitleAfter': '. Прежде чем открывать, убедитесь, что готовы.',
  'revealConfirm.typeLabel': 'Тип',
  'revealConfirm.typeFile': 'Файл',
  'revealConfirm.typeText': 'Текст',
  'revealConfirm.expiresLabel': 'Истекает',
  'revealConfirm.passphraseRequired': '🔑 Понадобится кодовая фраза.',
  'revealConfirm.revealCta': 'Показать секрет',
  'revealConfirm.errorFallback': 'Не удалось загрузить секрет.',
  'revealConfirm.unavailableTitle': 'Секрет недоступен',
  'revealConfirm.unavailableMessage': 'Такого секрета больше нет.',
  'revealSecret.decrypting': 'Расшифровка…',
  'revealSecret.expiredMessage': 'Секрет уже открыли или срок его действия истёк.',
  'revealSecret.passphraseTitle': 'Нужна кодовая фраза',
  'revealSecret.passphraseSubtitle': 'Введите кодовую фразу, чтобы открыть секрет.',
  'revealSecret.passphrasePlaceholder': 'Кодовая фраза',
  'revealSecret.openBtn': 'Открыть секрет',
  'revealSecret.doneTitle': 'Вот секрет',
  'revealSecret.destroyedNotice': '⚠️ Секрет уничтожен — открыть его снова не получится.',
  'revealSecret.download': 'Скачать файл',
  'revealSecret.copyToClipboard': 'Копировать в буфер обмена',
  'revealSecret.errorFallback': 'Не удалось открыть секрет.',
  'revealSecret.goneFallback': 'Такого секрета больше нет.',
  'revealSecret.fileFallbackName': 'файл',
  'error.PASSPHRASE_REQUIRED': 'Чтобы открыть секрет, нужна кодовая фраза.',
  'error.INVALID_PASSPHRASE': 'Неверная кодовая фраза.',
  'error.INVALID_PASSPHRASE_ATTEMPTS': 'Неверная кодовая фраза. Осталось попыток: {attempts}.',
  'error.SECRET_DESTROYED': 'Слишком много неверных попыток — секрет уничтожен.',
  'error.RATE_LIMITED': 'Слишком много запросов. Попробуйте позже.',
  'error.NOT_FOUND': 'Секрет не найден — возможно, уже открыт или устарел.',
  'error.PAYLOAD_TOO_LARGE': 'Секрет слишком большой.',
  'error.VALIDATION_ERROR': 'Не удалось обработать запрос.',
  'error.INTERNAL_ERROR': 'Произошла непредвиденная ошибка.',
};

export const LANGUAGES = { en, ru } as const;
export type Language = keyof typeof LANGUAGES;
const STORAGE_KEY = 'enigma-language';

export function initialLanguage(): Language {
  try {
    const saved = localStorage.getItem(STORAGE_KEY);
    if (saved && saved in LANGUAGES) return saved as Language;
  } catch {}
  return 'en';
}

export function saveLanguage(lang: Language) {
  document.documentElement.lang = lang;
  try {
    localStorage.setItem(STORAGE_KEY, lang);
  } catch {}
}

export function translate(lang: Language, key: Key, vars?: Record<string, string | number>) {
  const text: string = LANGUAGES[lang][key] ?? en[key];
  return vars ? text.replace(/\{(\w+)\}/g, (m, name) => (name in vars ? String(vars[name]) : m)) : text;
}

export const LanguageContext = createContext<Language>('en');

export function useT() {
  const lang = useContext(LanguageContext);
  return (key: Key, vars?: Record<string, string | number>) => translate(lang, key, vars);
}
