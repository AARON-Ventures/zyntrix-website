# Telegram-Lead-Relay

Postet jede Anfrage aus dem Kontaktformular von zyntrix.co zusätzlich zur
E-Mail (Web3Forms) in eine Telegram-Gruppe.

Die Seite läuft auf GitHub Pages und ist rein statisch – es gibt also keinen
Server, der ein Bot-Token geheim halten könnte. Deshalb steht dieser kleine
Cloudflare Worker dazwischen: Die Seite postet den Lead an die Worker-URL,
der Worker hält Token und Chat-ID als Secrets und ruft damit die Telegram-API.
Im öffentlichen Quelltext steht nur die Worker-URL.

```
Browser ──► Web3Forms ──► E-Mail
      └───► Cloudflare Worker ──► Telegram-Gruppe
```

## 1. Telegram-Bot anlegen

1. In Telegram [@BotFather](https://t.me/BotFather) öffnen → `/newbot`,
   Namen vergeben. BotFather liefert das **Bot-Token**
   (`123456789:AAF...`). Das Token ist ein Passwort – nicht ins Repo committen.
2. Den Bot in die Zielgruppe einladen und dort zum **Administrator** machen
   (oder mindestens den Privacy-Mode über BotFather → `/setprivacy` → `Disable`
   abschalten), damit er posten darf.
3. **Chat-ID der Gruppe ermitteln:** irgendeine Nachricht in der Gruppe
   schreiben und dann aufrufen:

   ```
   https://api.telegram.org/bot<DEIN_TOKEN>/getUpdates
   ```

   In der Antwort steht `"chat":{"id":-1001234567890,...}`. Diese Zahl
   inklusive Minuszeichen ist die Chat-ID. (Bei Supergruppen beginnt sie
   mit `-100`.)

## 2. Worker deployen

Voraussetzung: ein kostenloser Cloudflare-Account.

```bash
cd telegram-worker
npx wrangler login
npx wrangler secret put TELEGRAM_BOT_TOKEN   # Token einfügen
npx wrangler secret put TELEGRAM_CHAT_ID     # z. B. -1001234567890
npx wrangler deploy
```

`wrangler deploy` gibt die URL aus, z. B.
`https://zyntrix-telegram-lead.<dein-subdomain>.workers.dev`.

Nutzt die Gruppe Topics, zusätzlich in `wrangler.toml` die
`TELEGRAM_THREAD_ID` setzen und erneut deployen.

## 3. URL in der Website eintragen

In `index.html` die Zeile

```js
static TELEGRAM_ENDPOINT = '';
```

auf die Worker-URL setzen:

```js
static TELEGRAM_ENDPOINT = 'https://zyntrix-telegram-lead.office-21e.workers.dev';
```

Solange der Wert leer ist, ist der Telegram-Versand einfach inaktiv – das
Formular funktioniert unverändert per E-Mail weiter.

Danach committen und pushen; GitHub Pages baut automatisch neu.

## 4. Testen

```bash
curl -X POST https://zyntrix-telegram-lead.office-21e.workers.dev \
  -H 'Content-Type: application/json' \
  -H 'Origin: https://zyntrix.co' \
  -d '{"name":"Testlauf","firma":"Testfirma","email":"test@example.com","telefon":"+43 660 1234567","zeitfresser":"Angebote schreiben"}'
```

Erwartet: `{"success":true}` und eine Nachricht in der Gruppe. Danach das
Formular auf zyntrix.co einmal echt abschicken.

## Schutzmechanismen

* **Origin-Prüfung** – nur die in `ALLOWED_ORIGINS` gelisteten Domains werden
  angenommen, fremde Seiten bekommen 403.
* **Honeypot** – ein ausgefülltes `botcheck`-Feld wird stillschweigend verworfen.
* **Feldlängen** werden auf 1500 Zeichen gekürzt, HTML wird escaped.

Die Origin-Prüfung hält Browser-Aufrufe fremder Seiten ab, nicht aber
direkte `curl`-Requests (der Origin-Header ist frei wählbar). Wer zusätzlich
absichern will, aktiviert vor dem Worker eine Cloudflare-Rate-Limiting-Regel
oder Turnstile.

## Logs / Fehlersuche

```bash
npx wrangler tail
```

| Antwort | Bedeutung |
| --- | --- |
| `origin_not_allowed` | Origin fehlt in `ALLOWED_ORIGINS` |
| `not_configured` | Secrets nicht gesetzt |
| `telegram_failed` | Telegram lehnt ab – meist falsche Chat-ID oder Bot nicht in der Gruppe |
