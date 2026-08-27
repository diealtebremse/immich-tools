# Immich-API: Browser-Zugriff und verfügbare Bausteine

Type: research
Status: resolved
Blocked by: —

## Question

Kann ein rein im Browser laufendes Tool direkt gegen die Immich-API sprechen, oder braucht es einen kleinen lokalen Proxy? Und welche Bausteine liefert die API für die Kuratierung?

Zu klären:

1. **CORS und Auth** — erlaubt Immich Cross-Origin-Requests aus einem Browser (`localhost:5173` gegen den Server im LAN)? Funktioniert die Authentifizierung per `x-api-key`-Header im Browser, oder erzwingt das einen Preflight, den Immich ablehnt? Falls Proxy nötig: welche minimale Form (Vite `server.proxy` reicht vermutlich)?
2. **Personen** — wie findet man die Person-ID zu einem benannten Gesicht, und wie fragt man alle Assets zu dieser Person ab? Lässt sich das mit einem Zeitraumfilter kombinieren?
3. **Suche mit Zeitfilter** — welcher Endpunkt liefert Assets nach Aufnahmedatum, mit Paginierung, und wie viele pro Seite?
4. **Asset-Metadaten** — welche Felder kommen pro Asset zurück? Konkret interessieren: exaktes Aufnahmedatum, Favoriten-Flag, Typ (Bild/Video), EXIF (Kamera, Brennweite, Auflösung), Personen auf dem Bild, und ob es irgendeinen Qualitäts- oder Ähnlichkeits-Score gibt.
5. **Thumbnails** — wie holt man Vorschaubilder in Rastergröße, in welchen Größen, und wie authentifiziert man die Bild-URLs (Header gehen in `<img src>` nicht — gibt es einen Query-Parameter, oder muss über `fetch` + Blob-URL gegangen werden)?
6. **Album schreiben** — Endpunkt zum Anlegen eines Albums und zum Zuweisen von Assets. Gibt es ein Limit pro Request? Ist die Reihenfolge im Album steuerbar oder immer nach Aufnahmedatum sortiert?

Zusätzlich: an welche Immich-Version sind diese Angaben gebunden, und wo steht die maßgebliche API-Referenz (OpenAPI-Schema am Server selbst)?

## Answer

Vollständiger Bericht mit Quellenangaben: [`../research/01-immich-api.md`](../research/01-immich-api.md). Verifiziert gegen den Quellcode, Tag `v3.1.0`.

**1. CORS — architekturentscheidend.** Immich ruft `app.enableCors()` nur bei `IMMICH_ENV=development` auf (`server/src/app.common.ts`). Der Default ist `production`, und das offizielle `docker-compose.yml` setzt die Variable nicht. Ein reines Browser-Frontend kann den Server also **nicht** direkt ansprechen. Lösung: **Vite `server.proxy`** (`target: 'http://<lan-ip>:2283', changeOrigin: true`) — der Browser spricht dann nur same-origin. Kein eigener Proxy-Server nötig, die Architektur bleibt „nur Frontend".

**2. Personen.** `GET /api/people` listet Personen (Pagination bis `size=1000`). Einen `/people/:id/assets`-Endpunkt gibt es nicht mehr — Assets holt man über `POST /api/search/metadata` mit `personIds` **plus** `takenAfter`/`takenBefore` in **einer** Anfrage. Das gesuchte Hauptsieb ist damit tatsächlich ein einziger Call. Mehrfach angelegte Personen lassen sich per `POST /api/people/:id/merge` mit `{ ids: [...] }` zusammenführen.

**3. Suche.** `POST /api/search/metadata` filtert nach **Aufnahmedatum**, nicht Uploaddatum. `page`/`size`, max. 1000 pro Seite, Response mit `items`, `count`, `nextPage`.

**4. Metadaten.** Vorhanden: `fileCreatedAt` und `localDateTime` (zeitzonenbereinigt), `isFavorite`, `type` (IMAGE/VIDEO), volles EXIF nur mit `withExif: true`. **Nicht vorhanden:** irgendein Qualitäts- oder Schärfe-Score. Das `people[]` am Asset enthält **keine** Bounding-Box — die kommt separat über `GET /api/faces?id=<assetId>` mit `boundingBoxX1/X2/Y1/Y2`. Rohe CLIP-Embeddings sind über keine Route erreichbar.

**5. Thumbnails.** `GET /api/assets/:id/thumbnail?size=thumbnail|preview|fullsize`. Query-Parameter-Auth existiert (`?apiKey=<KEY>`, gleichwertig zum Header, belegt in `auth.guard.ts`) — direktes `<img src>` funktioniert, kein Blob-URL-Umweg. Nebenwirkung: der Key steht sichtbar in jeder Bild-URL. Bei einem lokal laufenden Einzelplatz-Tool vertretbar; über den Vite-Proxy lässt er sich alternativ serverseitig anhängen.

**6. Alben.** `POST /api/albums` (optional direkt mit `assetIds`), Nachtragen per `PUT /api/albums/:id/assets` mit `{ ids: [...] }`. Kein Längenlimit für das Array außer dem 10-MB-Body-Cap — bei 75 Fotos irrelevant. **Sortierung nur `order: asc|desc` nach Datum, keine manuelle Reihenfolge.** Für ein chronologisches Rückblickalbum genau richtig.

**7. Version.** Die Angaben beziehen sich auf **v3.1.0**. v3 ist jung (seit ca. Juni 2026) und hat Breaking Changes gegenüber v2. Der eigene Server hostet seine maßgebliche Spec immer selbst: Swagger-UI unter `/doc`, JSON unter `/api/spec.json`. **Diese Spec schlägt jede Dokumentation** und ist vor der Implementierung abzugleichen.
