/**
 * Zyntrix – Telegram-Lead-Relay (Cloudflare Worker)
 *
 * Nimmt die Kontaktformular-Daten von zyntrix.co entgegen und postet sie
 * in eine Telegram-Gruppe. Bot-Token und Chat-ID liegen als Worker-Secrets
 * und tauchen dadurch nie im öffentlichen Quelltext der Seite auf.
 *
 * Nachrichtentext nach der Web-Focus-Anleitung (Formular → Telegram-Nachricht):
 * fette Überschrift, ggf. Warnzeile, Blöcke Kontakt · Unternehmen · Angaben ·
 * Nachricht · Herkunft (Spoiler). Nur Felder aus FIELDS erscheinen –
 * neue Formularfelder dort eintragen.
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

export default {
  async fetch(request, env) {
    const origin = request.headers.get('Origin') || '';
    const allowed = allowedOrigins(env);
    const corsOrigin = allowed.includes(origin) ? origin : null;

    if (request.method === 'OPTIONS') {
      return new Response(null, { status: 204, headers: corsHeaders(corsOrigin) });
    }
    if (request.method !== 'POST') {
      return json({ success: false, error: 'method_not_allowed' }, 405, corsOrigin);
    }
    // Origin muss bekannt sein – sonst kann jede fremde Seite den Worker als
    // kostenlosen Telegram-Spamkanal benutzen.
    if (!corsOrigin) {
      return json({ success: false, error: 'origin_not_allowed' }, 403, null);
    }
    if (!env.TELEGRAM_BOT_TOKEN || !env.TELEGRAM_CHAT_ID) {
      return json({ success: false, error: 'not_configured' }, 500, corsOrigin);
    }

    let payload;
    try {
      payload = await readPayload(request);
    } catch (err) {
      return json({ success: false, error: 'invalid_payload' }, 400, corsOrigin);
    }

    // Honeypot: von echten Besuchern immer leer.
    if (String(payload.botcheck || '').trim() !== '') {
      return json({ success: true, skipped: 'honeypot' }, 200, corsOrigin);
    }
    if (!String(payload.name || '').trim() && !String(payload.email || '').trim()) {
      return json({ success: false, error: 'empty_lead' }, 400, corsOrigin);
    }

    const telegramResponse = await fetch(
      `https://api.telegram.org/bot${env.TELEGRAM_BOT_TOKEN}/sendMessage`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          chat_id: env.TELEGRAM_CHAT_ID,
          message_thread_id: env.TELEGRAM_THREAD_ID ? Number(env.TELEGRAM_THREAD_ID) : undefined,
          parse_mode: 'HTML',
          disable_web_page_preview: true,
          text: buildMessage(payload, origin)
        })
      }
    );

    if (!telegramResponse.ok) {
      const detail = await telegramResponse.text();
      console.error('Telegram sendMessage failed', telegramResponse.status, detail);
      return json({ success: false, error: 'telegram_failed' }, 502, corsOrigin);
    }
    return json({ success: true }, 200, corsOrigin);
  }
};

function allowedOrigins(env) {
  return String(env.ALLOWED_ORIGINS || '')
    .split(',')
    .map(o => o.trim())
    .filter(Boolean);
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

async function readPayload(request) {
  const type = request.headers.get('Content-Type') || '';
  if (type.includes('application/json')) return await request.json();
  const form = await request.formData();
  const out = {};
  for (const [key, value] of form.entries()) out[key] = value;
  return out;
}

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
