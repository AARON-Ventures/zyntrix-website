/**
 * Zyntrix – Telegram-Lead-Relay (Cloudflare Worker)
 *
 * Nimmt die Kontaktformular-Daten von zyntrix.co entgegen und postet sie
 * als eine gut lesbare Nachricht in eine Telegram-Gruppe. Bot-Token und
 * Chat-ID liegen als Worker-Secrets und tauchen nie im Quelltext der Seite auf.
 *
 * Aufbau der Nachricht (fett: Überschrift und Blocknamen, sonst nichts):
 *   Neue Anfrage von zyntrix.co
 *   [⚠️ Warnzeile, nur wenn die E-Mail nicht bestätigt wurde]
 *   Kontakt · Unternehmen · Angaben · Nachricht · Herkunft (im Spoiler)
 *
 * Nur Felder aus FIELDS kommen in die Nachricht. Neue Formularfelder hier
 * eintragen, sonst fehlen sie (bewusst: so landen keine technischen Felder
 * wie Schlüssel, Rechner- oder Tracking-Werte in der Gruppe).
 *
 * Benötigte Secrets/Variablen (siehe README.md):
 *   TELEGRAM_BOT_TOKEN   – Token von @BotFather            (Secret)
 *   TELEGRAM_CHAT_ID     – Chat-ID der Gruppe, z. B. -1001234567890 (Secret)
 *   ALLOWED_ORIGINS      – kommaseparierte Origins          (Variable)
 *   TELEGRAM_THREAD_ID   – optional: Topic-ID in Foren-Gruppen (Variable)
 */

// Fester Betreff des Formulars (Hidden-Field „subject“) → Überschrift.
const HEADINGS = {
  'Neue Anfrage über zyntrix.co': 'Neue Anfrage'
};
const DEFAULT_HEADING = 'Neue Anfrage';

// Bekannte Formulararten (Feld „formular“, setzt der Browser).
const FORMS = new Set(['anfrage']);

// Feldname → Block, Beschriftung. Reihenfolge = Reihenfolge in der Nachricht.
// Bewusst NICHT enthalten: buerostunden_pro_woche, stundensatz_eur,
// arbeitswert_eur_monat, datenschutzvariante, anzeigen_branche, event_id, dsgvo.
const FIELDS = [
  ['name', 'Kontakt', 'Name'],
  ['firma', 'Kontakt', 'Firma'],
  ['telefon', 'Kontakt', 'Telefon'],
  ['email', 'Kontakt', 'E-Mail'],
  ['website', 'Unternehmen', 'Website'],
  ['quelle', 'Herkunft', 'Quelle'],
  ['einstieg', 'Herkunft', 'Einstieg'],
  ['seite', 'Herkunft', 'Formular auf'],
  ['vorige_seite', 'Herkunft', 'Vorher auf'],
  ['klickpfad', 'Herkunft', 'Klickpfad']
];
const BLOCKS = ['Kontakt', 'Unternehmen', 'Angaben', 'Nachricht', 'Herkunft'];

// Beschriftungen je Formular (über den Betreff), überschreiben FIELDS.
const LABELS_BY_SUBJECT = {};

const PAGE_FIELDS = new Set(['einstieg', 'seite', 'vorige_seite']);
const MAX_VALUE = 500;
const MAX_MESSAGE = 1500;
const MAX_PATH_PAGES = 15;

// Drosselung je Instanz: höchstens 5 Nachrichten je IP in 10 Minuten.
const RATE_LIMIT = 5;
const RATE_WINDOW_MS = 10 * 60 * 1000;
const hits = new Map();

export default {
  async fetch(request, env) {
    const origin = request.headers.get('Origin');
    const corsOrigin = origin && isAllowedOrigin(origin, env) ? origin : null;

    if (request.method === 'OPTIONS') {
      return new Response(null, { status: 204, headers: corsHeaders(corsOrigin) });
    }
    // 1. Nur POST
    if (request.method !== 'POST') {
      return json({ success: false, error: 'method_not_allowed' }, 405, corsOrigin);
    }
    // 2. Herkunft: eigene Domain, localhost; ohne Origin-Header erlaubt
    if (origin && !corsOrigin) {
      return json({ success: false, error: 'origin_not_allowed' }, 403, null);
    }
    // 3. JSON-Objekt
    let payload;
    try {
      payload = await request.json();
    } catch (err) {
      payload = null;
    }
    if (!payload || typeof payload !== 'object' || Array.isArray(payload)) {
      return json({ success: false, error: 'invalid_payload' }, 400, corsOrigin);
    }
    // 4. Drosselung
    if (rateLimited(request.headers.get('CF-Connecting-IP') || 'unbekannt')) {
      return json({ success: false, error: 'rate_limited' }, 429, corsOrigin);
    }
    // 5. Honeypot: von echten Besuchern immer leer
    if (String(payload.botcheck || '').trim() !== '') {
      return json({ success: true, skipped: 'honeypot' }, 200, corsOrigin);
    }
    // 6. Pflichtangaben
    if (!oneLine(payload.telefon) || !FORMS.has(String(payload.formular || ''))) {
      return json({ success: false, error: 'missing_fields' }, 400, corsOrigin);
    }
    // 7. Konfiguration
    const token = String(env.TELEGRAM_BOT_TOKEN || '');
    const chatId = String(env.TELEGRAM_CHAT_ID || '');
    if (!/^\d+:[\w-]{20,}$/.test(token) || !/^-?\d+$/.test(chatId)) {
      console.error('Telegram nicht konfiguriert: Token oder Chat-ID fehlt oder ungültig');
      return json({ success: false, error: 'not_configured' }, 500, corsOrigin);
    }

    const body = JSON.stringify({
      chat_id: chatId,
      message_thread_id: env.TELEGRAM_THREAD_ID ? Number(env.TELEGRAM_THREAD_ID) : undefined,
      parse_mode: 'HTML',
      link_preview_options: { is_disabled: true },
      text: buildMessage(payload, origin)
    });
    const sent = await sendWithRetry(`https://api.telegram.org/bot${token}/sendMessage`, body);
    return sent
      ? json({ success: true }, 200, corsOrigin)
      : json({ success: false, error: 'telegram_failed' }, 502, corsOrigin);
  }
};

/* ---------- Senden ---------- */

async function sendWithRetry(url, body) {
  for (let attempt = 1; attempt <= 2; attempt++) {
    let wait = 0;
    try {
      const res = await fetch(url, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body });
      if (res.ok) return true;
      const detail = await res.text();
      console.error('Telegram sendMessage fehlgeschlagen', res.status, detail);
      if (res.status === 429) {
        let retryAfter = Infinity;
        try { retryAfter = Number(JSON.parse(detail).parameters?.retry_after); } catch (e) {}
        if (!(retryAfter <= 5)) return false;
        wait = retryAfter * 1000;
      } else if (res.status >= 500) {
        wait = 1000;
      } else {
        return false; // z. B. falscher Token, ungültiges HTML: nicht wiederholen
      }
    } catch (err) {
      console.error('Telegram nicht erreichbar', String(err));
      wait = 1000;
    }
    if (attempt === 2) return false;
    await new Promise(resolve => setTimeout(resolve, wait));
  }
  return false;
}

function rateLimited(ip) {
  const now = Date.now();
  const recent = (hits.get(ip) || []).filter(t => now - t < RATE_WINDOW_MS);
  if (recent.length >= RATE_LIMIT) {
    hits.set(ip, recent);
    return true;
  }
  recent.push(now);
  hits.set(ip, recent);
  if (hits.size > 5000) hits.clear();
  return false;
}

/* ---------- Nachrichtentext ---------- */

function buildMessage(payload, origin) {
  const subject = oneLine(payload.subject);
  const heading = HEADINGS[subject] || DEFAULT_HEADING;
  const labels = LABELS_BY_SUBJECT[subject] || {};
  const lines = [`<b>${esc(heading)} von ${esc(domainOf(origin))}</b>`];

  if (payload.email_ok === false || payload.email_ok === 'false') {
    lines.push('⚠️ E-Mail-Versand fehlgeschlagen – die Anfrage liegt nur hier vor.');
  }

  const blocks = Object.fromEntries(BLOCKS.map(b => [b, []]));
  for (const [key, block, label] of FIELDS) {
    const value = formatValue(key, payload[key]);
    if (value) blocks[block].push(`${esc(labels[key] || label)}: ${esc(value)}`);
  }
  // Freier Text: eigene Zeilen ohne Beschriftung. Entfällt, wenn er nur einen
  // anderen Wert wiederholt.
  const message = multiLine(payload.nachricht);
  const shown = FIELDS.map(([key]) => oneLine(payload[key])).filter(Boolean);
  if (message && !shown.includes(oneLine(message))) blocks.Nachricht.push(esc(message));

  for (const block of BLOCKS) {
    if (!blocks[block].length) continue;
    lines.push('', `<b>${block}</b>`);
    if (block === 'Herkunft') lines.push(`<tg-spoiler>${blocks[block].join('\n')}</tg-spoiler>`);
    else lines.push(...blocks[block]);
  }
  return lines.join('\n');
}

function formatValue(key, raw) {
  if (key === 'klickpfad') return formatClickPath(raw);
  let value = oneLine(raw);
  if (!value) return '';
  if (key === 'telefon') value = formatPhone(value);
  if (PAGE_FIELDS.has(key)) value = toPath(value);
  return truncate(value, MAX_VALUE);
}

// Klickpfad: Pfade mit Pfeilen, höchstens 15 Seiten, nie mitten in einer Seite abgeschnitten.
function formatClickPath(raw) {
  let pages = Array.isArray(raw) ? raw : oneLine(raw).split(/\s*(?:→|->|,|\|)\s*/);
  pages = pages.map(oneLine).filter(Boolean).map(toPath);
  if (!pages.length) return '';
  const cut = pages.length > MAX_PATH_PAGES;
  pages = pages.slice(-MAX_PATH_PAGES);
  return (cut ? '… → ' : '') + pages.join(' → ');
}

// +43 664 123 45 67 / 0043 (0)664 … → +436641234567. Ohne Ländervorwahl,
// mit Text oder unplausibler Länge bleibt die Eingabe unverändert.
function formatPhone(value) {
  if (!/^(\+|00)/.test(value) || /[^\d\s()+\/.–—-]/.test(value)) return value;
  const digits = value.replace(/\(0\)/g, '').replace(/\D/g, '').replace(/^00/, '');
  if (digits.length < 8 || digits.length > 15) return value;
  return '+' + digits;
}

// Immer als Pfad: /branchen/tischler, Startseite als /, ohne .html.
function toPath(value) {
  let path = value;
  try { path = new URL(value, 'https://zyntrix.co').pathname; } catch (e) { return value; }
  path = path.replace(/\/index\.html?$/, '/').replace(/\.html?$/, '');
  if (path.length > 1) path = path.replace(/\/+$/, '');
  return path || '/';
}

function domainOf(origin) {
  try {
    const host = new URL(origin).hostname.replace(/^www\./, '');
    if (host && host !== 'localhost' && host !== '127.0.0.1') return host;
  } catch (e) {}
  return 'zyntrix.co';
}

function oneLine(value) {
  if (value === undefined || value === null) return '';
  return String(value).replace(/\s+/g, ' ').trim();
}

function multiLine(value) {
  if (value === undefined || value === null) return '';
  const text = String(value)
    .replace(/\r\n?/g, '\n')
    .split('\n')
    .map(line => line.replace(/[ \t\f\v]+/g, ' ').trim())
    .filter(Boolean)
    .join('\n');
  return truncate(text, MAX_MESSAGE);
}

function truncate(value, max) {
  return value.length > max ? value.slice(0, max).trimEnd() + ' …' : value;
}

function esc(value) {
  return String(value)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');
}

/* ---------- CORS / Antworten ---------- */

function isAllowedOrigin(origin, env) {
  const list = String(env.ALLOWED_ORIGINS || '').split(',').map(o => o.trim()).filter(Boolean);
  if (list.includes(origin)) return true;
  return /^http:\/\/(localhost|127\.0\.0\.1)(:\d+)?$/.test(origin);
}

function corsHeaders(origin) {
  const headers = {
    'Access-Control-Allow-Methods': 'POST, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type',
    'Access-Control-Max-Age': '86400',
    Vary: 'Origin'
  };
  if (origin) headers['Access-Control-Allow-Origin'] = origin;
  return headers;
}

function json(body, status, origin) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json', ...corsHeaders(origin) }
  });
}
