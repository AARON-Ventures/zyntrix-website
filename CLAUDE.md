# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Überblick

Statische Marketing-Website für **Zyntrix** (Produkt: „Nils“, KI-Mitarbeiter für WhatsApp/Telegram), gehostet auf **GitHub Pages** unter `zyntrix.co` (`CNAME`). Kein Build, kein Package-Manager, keine Tests, kein Linter – Änderungen werden committet und gepusht, GitHub Pages deployt automatisch. Inhalte, Kommentare und Commit-Messages sind auf Deutsch.

Lokale Vorschau (Root-relative Pfade wie `/favicon.ico` brauchen einen Server):

```bash
python3 -m http.server 8000
```

Im Claude-Desktop-Browser: `preview_start` mit `site` (`.claude/launch.json`, Port 8123).

## Corporate Identity – verbindlich

**Die Startseite `index.html` ist die Corporate Identity von Zyntrix.** Jede neue oder überarbeitete Seite, jedes Dokument (PDF, DOCX, PPTX, E-Mail-Vorlage, Grafik …) und jede sonstige Ausgabe übernimmt exakt ihre Elemente, Farben und Schriften. Das gilt immer, auch wenn es in der Anfrage nicht eigens erwähnt wird.

- **Nur bestehende CSS-Klassen der Startseite verwenden.** Keine neuen Klassen, keine eigenen Komponenten, keine Inline-Styles als Ersatz. Markup und Klassen aus `index.html` übernehmen (z. B. `wrap`, `section`, `section-top`, `eyebrow`, `button`, `text-link`, `card`, `step-card`, `value-card`, `grid2`, `grid3`, `faq-list`, `check-card`, `field`, `fields`, `form-button`, `footer`, `site-header`, `brand`). Das CSS kommt 1:1 aus dem `<style>` von `index.html` (Unterseiten binden dafür `assets/css/site.css` ein). Fehlt ein Element: nicht erfinden, sondern beim User nachfragen.
- **Farben – ausschließlich diese** (`:root` in `index.html`):
  - `--ink` `#20434F` (Primär, Text, dunkle Flächen) · `--lime` `#D2E245` (Akzent, Buttons)
  - `--muted` `#556E77` (Fließtext sekundär) · `--line` `#E2E7E8` (Linien, Rahmen) · `--paper`/`--white` `#FFFFFF`
  - Flächen: `#F2F4F4` (Panels, Tags) · `#F9FBEE` (Hover) · `#2A5361` (Fläche auf Dunkel)
  - Nur im jeweiligen Kontext: `#C0474B` Fehler · `#B0791A` Hinweis · `#1F7A5A` Status · `#D9FDD3` WhatsApp-Bubble
- **Schriften:** Space Grotesk (`assets/fonts/space-grotesk.woff2`) für Überschriften, Buttons, Marke; Inter (`assets/fonts/inter.woff2`) für Text. Keine Google-Fonts-Einbindung, keine weiteren Schriften. Radius `--radius` 10px; Abschnittsabstände 64–112px wie in der Referenz-Startseite.
- **Bildsprache/Marke:** Nils-Avatar `assets/img/nils.webp`, Kundenlogos aus `assets/referenzen/`, Tonalität wie auf der Startseite (Kunden werden gesiezt).
- Altlasten (alte Startseiten, Legacy-Design) liegen außerhalb des Repos in `../zyntrix-co archiv/` und sind keine Vorlage.

## `index.html` – Startseite (ehem. „Landingpage 2“)

Normales, handgeschriebenes HTML (~70 KB, eine Datei): gemeinsames CSS in `assets/css/site.css`, Logik in einem Inline-`<script>` am Ende (Vanilla JS, `$()` = `getElementById`). Viele Regeln stehen minifiziert in einer Zeile – Änderungen per exaktem String-Replace. Assets unter `assets/` (`fonts/`, `img/`, `logo/`, `referenzen/`, `team/`, `video/`), relativ referenziert.

- Branchen-Varianten per URL: `?b=handwerk` (Standard), `gastro`, `immo`, `hausverwaltung`, `kanzlei` (`BRANCHES` im Script).
- Anker: `#inhalt`, `#so-funktionierts`, `#beispiele`, `#rechner`, `#datenschutz`, `#referenzen`, `#faq`, `#potenzialcheck`.
- Kontaktformular (Anker `#potenzialcheck`, bewusst beibehalten): einfaches Formular `#form-panel` ohne vorgeschaltete Quiz-Fragen, Bestätigung `#thank-you`. Beide liegen im selben Grid-Feld der `.check-card` → die Kartenhöhe bleibt beim Wechsel gleich; Fehlertexte haben reservierten Platz.
- Vorherige gebündelte Startseite (Claude-Design-/`x-dc`-Export): `../zyntrix-co archiv/archiv/index_bundle_20260915.html`.

## Kontaktformular-Flow (übergreifend)

Im Submit-Handler von `#lead-form` (`index.html`, Script-Ende):

1. Validierung, Honeypot `botcheck`, Telefon-Normalisierung; Rechnerwerte, `datenschutzvariante`, `anzeigen_branche`, `event_id` und die Herkunft (`seite`, `vorige_seite`, `quelle` – nur Pfade, ohne Speicherung, berechnet in `leadOrigin`) werden angehängt.
2. `POST` an Web3Forms (`access_key` als Hidden-Field, Timeout 15 s) → E-Mail. Nur diese Antwort entscheidet über Erfolg/Fehler im Formular.
3. Nach der Antwort von Web3Forms – auch bei Fehler oder Timeout – fire-and-forget `POST` (JSON, ohne `access_key`, plus `formular: 'anfrage'` und `email_ok`) an `TELEGRAM_ENDPOINT` (Cloudflare Worker, `keepalive`, `sendTelegramCopy`). Bei `email_ok: false` trägt die Telegram-Nachricht eine Warnzeile. Fehler dort werden verschluckt; leerer Endpoint = deaktiviert.
4. `handOffLead()` legt `{eventId, ts}` unter `sessionStorage['zyntrix:lead']` ab, zeigt `#thank-you` als Rückfall und leitet nach 250 ms auf `danke.html` weiter.
5. `danke.html` liest/löscht den Token und feuert das Meta-Pixel-`Lead`-Event. Fallback: ist der Token nach 3 s noch da, feuert `index.html` selbst – mit derselben `eventID` zur Deduplizierung. Schlüssel/Logik auf beiden Seiten synchron halten.

Lokal testen: Web3Forms verschickt auch von `localhost` echte E-Mails, und das Pixel-`Lead`-Event feuert ebenfalls (verfälscht Meta-Tracking) – `fetch`/`fbq` im Browser vorher überschreiben. Der Worker lehnt `localhost` ab (403 `origin_not_allowed`, nicht in `ALLOWED_ORIGINS`), das Formular funktioniert trotzdem.

Telefonfeld: Vorwahl-Dropdown (`vorwahl`) wird in `telefon` zusammengeführt und vor dem Senden entfernt (iOS-AutoFill liefert oft nationale Schreibweise).

## `telegram-worker/`

Cloudflare Worker (`worker.js`), der Leads in eine Telegram-Gruppe postet, damit das Bot-Token nicht im öffentlichen Quelltext steht. Nachrichtenaufbau nach `../../Web Focus/web-focus-at/docs/2026-10-10_WF_Anleitung_Formular_Telegram_Nachricht.pdf`: fette Überschrift „Neue Anfrage von zyntrix.co“, ggf. Warnzeile, Blöcke Kontakt · Unternehmen · Angaben · Nachricht · Herkunft (Spoiler). **Nur Felder aus `FIELDS` erscheinen** – neue Formularfelder dort eintragen. Rechnerwerte, `datenschutzvariante`, `anzeigen_branche` bewusst nicht. Technik (Origin-Allowlist `ALLOWED_ORIGINS` in `wrangler.toml`, Honeypot `botcheck`, HTML-Escaping) unverändert. Secrets: `TELEGRAM_BOT_TOKEN`, `TELEGRAM_CHAT_ID`.

```bash
cd telegram-worker
npx wrangler deploy
npx wrangler tail            # Logs
```

Test-`curl` und Fehlercodes: `telegram-worker/README.md`.

## Weitere Dateien

- **Gemeinsames Design:** Alle fünf aktiven HTML-Seiten binden `assets/css/site.css` ein. Keine CSS-Kopien in den HTML-Seiten anlegen.
- **Footer:** auf allen fünf Seiten identisch (`.footer` in `site.css`); Unterseiten verlinken `/#anker`, Rechtsseiten setzen `aria-current="page"`. Die große Wortmarke füllt über `21.23cqw` exakt die Inhaltsbreite (Breite 4,71 em – bei Änderung von Schrift oder `letter-spacing` der `.brand` neu berechnen). Die Wortmarke ist bewusst kein Link (Tippen soll nicht scrollen): Hover färbt Buchstaben lime, auf Touch-Geräten übernimmt das ein Snippet (Zustandsklasse `is-active`). Dieses und das Uhrzeit-Snippet (`#footer-clock`, Ortszeit Wien, Rückfall „24/7“) stehen am Script-Ende jeder Seite – Markup und Snippets immer in allen fünf Seiten nachziehen.
- `danke.html` – Danke-Seite nach dem Formular, `noindex`, nur Klassen der Startseite; Datenschutz-Umschalter und -Dialog per kleinem Inline-Script. Links auf `/` bzw. `/#anker`.
- `impressum.html`, `datenschutz.html`, `agb.html` – Rechtsseiten, im Footer aller Seiten verlinkt. Der kurze `#privacy-dialog` in `index.html`/`danke.html` (Link an der Einwilligungs-Checkbox) nennt ebenfalls die eingesetzten Dienste – bei neuen Diensten/Trackern Dialog und `datenschutz.html` gemeinsam anpassen.
- **Archiv außerhalb des Repos:** `../zyntrix-co archiv/` enthält `archiv/` (alte Startseiten), `_backup/` (altes Repo `zyntrix-website` inkl. Git-Bundle), `docs/` (PDFs, `design-refresh.md`, `landing2-umsetzung.md`) und `team-platzhalter/`. Im Repo bleibt nur, was die Website bzw. der Worker braucht – Nicht-Benötigtes dorthin verschieben, nicht ins Repo legen.
- `.vercelignore` – nimmt `telegram-worker/`, `.claude/`, `CLAUDE.md`, `.github/` vom Deployment aus. Das GitHub-Repo ist öffentlich, dort bleibt alles sichtbar.
- `assets/icons/` – Favicon-PNGs und `site.webmanifest` (in allen Seiten root-relativ referenziert). `favicon.ico` und `apple-touch-icon.png` bleiben bewusst im Root, weil Browser und Crawler sie dort fest erwarten.
- Favicons (Logo `assets/logo/zyntrix-logo-transparent-1600.png` auf Weiß, Rand oben/unten 102 px von 512, inkl. `assets/icons/favicon.svg`) und Sharecard `assets/img/og-image.jpg` (Logo + Wortmarke in `--ink` auf Weiß, Verhältnisse wie `.brand`) werden mit `../zyntrix-co archiv/tools/` erzeugt (`favicon/build.py`, `sharecard/build.sh`, siehe README dort). Nicht von Hand bearbeiten; danach `?v=…` an den Icon-Links aller Seiten hochzählen.
- Im Root liegen nur die fünf HTML-Seiten, `CLAUDE.md`, `favicon.ico`, `apple-touch-icon.png`, `CNAME`, `.gitignore`, `.vercelignore`; alles andere in Unterordnern (`assets/`, `telegram-worker/`, `.github/README.md`).
- `assets/` – `fonts/` (Inter, Space Grotesk), `img/` (Nils-Avatar `nils.webp`, OG-Bild `og-image.jpg`), `referenzen/` (Kundenlogos), `logo/` (eigenes Zyntrix-Logo), `team/` (Teamfotos), `icons/` (Favicons), `video/` (Erklärvideo). Achtung: alles im Repo außer den Einträgen in `.vercelignore` ist öffentlich unter `zyntrix.co/…` erreichbar.
- HTML-Seiten bleiben im Root, damit ihre öffentlichen URLs stabil bleiben.
- Tracking in jeder Seite im `<head>` – bei neuen Seiten beides übernehmen: Google Analytics (gtag, `G-1M1GFKZNW0`, ganz oben) und Meta Pixel (ID `1392514952248366`).
