/**
 * Zyntrix – Telegram-Lead-Relay (Cloudflare Worker)
 *
 * Nimmt die Kontaktformular-Daten von zyntrix.co entgegen und postet sie
 * in eine Telegram-Gruppe. Bot-Token und Chat-ID liegen als Worker-Secrets
 * und tauchen dadurch nie im öffentlichen Quelltext der Seite auf.
 *
 * Benötigte Secrets/Variablen (siehe README.md):
 *   TELEGRAM_BOT_TOKEN   – Token von @BotFather            (Secret)
 *   TELEGRAM_CHAT_ID     – Chat-ID der Gruppe, z. B. -1001234567890 (Secret)
 *   ALLOWED_ORIGINS      – kommaseparierte Origins          (Variable)
 *   TELEGRAM_THREAD_ID   – optional: Topic-ID in Foren-Gruppen (Variable)
 */

const FIELD_LABELS = [
  ['name', 'Name'],
  ['firma', 'Firma / Branche'],
  ['email', 'E-Mail'],
  ['telefon', 'Telefon'],
  ['zeitfresser', 'Zeitfresser']
];

// Felder, die nur der Formular-Mechanik dienen und nicht in die Gruppe gehören.
const IGNORED_FIELDS = new Set([
  'access_key', 'subject', 'from_name', 'botcheck', 'dsgvo', 'redirect'
]);

const MAX_FIELD_LENGTH = 1500;

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
  const lines = ['🟢 <b>Neue Anfrage über zyntrix.co</b>', ''];

  for (const [key, label] of FIELD_LABELS) {
    const value = clean(payload[key]);
    if (value) lines.push(`<b>${label}:</b> ${esc(value)}`);
  }

  // Alles, was das Formular sonst noch mitschickt (z. B. später ergänzte Felder).
  for (const key of Object.keys(payload)) {
    if (IGNORED_FIELDS.has(key)) continue;
    if (FIELD_LABELS.some(([f]) => f === key)) continue;
    const value = clean(payload[key]);
    if (value) lines.push(`<b>${esc(key)}:</b> ${esc(value)}`);
  }

  lines.push('', `<i>${esc(origin || 'zyntrix.co')} · ${new Date().toLocaleString('de-AT', { timeZone: 'Europe/Vienna' })}</i>`);
  return lines.join('\n');
}

function clean(value) {
  if (value === undefined || value === null) return '';
  return String(value).trim().slice(0, MAX_FIELD_LENGTH);
}

function esc(value) {
  return String(value)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');
}
