# Ninja Dashboard Widget Injector (lokal)

Diese Extension injiziert eine zusätzliche Widget-Card in das NinjaOne-Dashboard und lädt den Inhalt über ein eingebettetes IFrame (`widget.html`).

## 1) Lokales Backend starten

Im Projekt-Root:

```bash
npm run dev
```

Damit laufen:

- Frontend (Vite) auf `http://localhost:5173`
- Backend (API) auf `http://localhost:3001`

Prüfe API kurz im Browser:

- `http://localhost:3001/api/products`

## 2) Extension laden (Chrome)

1. `chrome://extensions` öffnen
2. **Developer mode** aktivieren
3. **Load unpacked** klicken
4. Ordner auswählen: `browser-extension/ninja-widget-injector`

## 3) Extension laden (Edge)

1. `edge://extensions` öffnen
2. **Entwicklermodus** aktivieren
3. **Entpackte Erweiterung laden** klicken
4. Ordner auswählen: `browser-extension/ninja-widget-injector`

## 4) Im Ninja-Dashboard testen

1. Ninja-Dashboard neu laden
2. Eine neue Card mit Titel **"Net Factory Update-Widget (lokal)"** sollte erscheinen
3. Im IFrame siehst du Produktanzahl, Updates und Major-Updates aus deiner lokalen API

## 5) Wenn nichts erscheint

- Extension nach Code-Änderung auf der Extensions-Seite mit **Reload** neu laden
- Im Ninja-Tab DevTools öffnen und auf Fehler im Content Script prüfen
- Falls Container-Selektor nicht passt, in `content.js` die Liste `CONTAINER_SELECTORS` erweitern

## Hinweis

Die Injektion ist bewusst minimal gehalten (`prepend`). Wenn du lieber unten einfügst, setze in `content.js`:

```js
const INSERT_MODE = "append";
```