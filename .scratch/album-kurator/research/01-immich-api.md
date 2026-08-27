# Immich API — Recherche für "Album Kurator"-Tool

Alle Aussagen sind gegen den Immich-Quellcode (Tag `v3.1.0`, Repo `immich-app/immich`) sowie das offizielle Docker-Compose-Deployment geprüft. Zitierte Pfade sind relativ zum Repo-Root; Permalinks folgen dem Muster `https://github.com/immich-app/immich/blob/v3.1.0/<pfad>`.

Aktuelle Version zum Zeitpunkt der Recherche (27.08.2026): **v3.1.0**, veröffentlicht 2026-07-29. Quelle: `https://api.github.com/repos/immich-app/immich/releases/latest`.

---

## 1. CORS und Authentifizierung aus dem Browser

**Ergebnis: Nein — ein Standard-Self-Hosted-Immich-Server (Docker, Produktions-Modus) sendet KEINE CORS-Header. Ein Vite-Dev-Proxy ist zwingend erforderlich.** Das entscheidet die Architektur.

Beweis im Server-Bootstrap-Code, `server/src/app.common.ts`, Funktion `configureExpress`:

```ts
if (configRepository.isDev()) {
  app.enableCors();
}
```

`app.enableCors()` (NestJS/Express) wird **nur** aufgerufen, wenn `configRepository.isDev()` `true` liefert. Andernfalls existiert überhaupt kein CORS-Middleware-Aufruf — es werden keinerlei `Access-Control-Allow-*`-Header gesetzt, unabhängig davon ob die Anfrage einfach oder mit Preflight ist.

`isDev()` ist in `server/src/repositories/config.repository.ts` definiert:

```ts
isDev() {
  return this.getEnv().environment === ImmichEnvironment.Development;
}
```

Das Environment wird aus der Env-Var `IMMICH_ENV` gelesen, mit explizitem Default `Production` (`server/src/repositories/config.repository.ts`, Zeile ~194: `const environment = dto.IMMICH_ENV || ImmichEnvironment.Production;`).

Das offizielle `docker/docker-compose.yml` (Tag v3.1.0) setzt `IMMICH_ENV` **nicht**. Jede Standard-Self-Hosted-Installation läuft also im `production`-Environment → CORS ist aus.

**Konsequenz für x-api-key:** Die Frage, ob der custom Header `x-api-key` einen Preflight auslöst, ist zweitrangig — selbst ein einfacher `GET` ohne custom Header würde von Chrome/Firefox blockiert, weil gar kein `Access-Control-Allow-Origin`-Header in der Antwort steht. Mit `x-api-key` (nicht CORS-safelisted) kommt zusätzlich ein Preflight (`OPTIONS`) hinzu, der ebenfalls ohne Antwort-Header scheitern würde.

**Theoretischer Ausweg (nicht empfohlen):** `IMMICH_ENV=development` im eigenen Compose-Setup setzen würde `app.enableCors()` ohne Argumente aktivieren (NestJS-Default = alle Origins erlaubt, Headers werden reflektiert). Das ist aber ein inoffizieller Eingriff in den Server-Modus (aktiviert zusätzlich Dev-Verhalten wie das Schreiben der OpenAPI-Spec-Datei) und nicht der vorgesehene Weg für Produktivbetrieb.

**Empfohlene Lösung: Vite `server.proxy`.** Der Browser spricht ausschließlich `http://localhost:5173` an; Vite leitet serverseitig (kein Browser-CORS-Problem, da es sich nicht um eine Browser-Anfrage handelt) an den LAN-Server weiter:

```ts
// vite.config.ts
import { defineConfig } from 'vite';

export default defineConfig({
  server: {
    proxy: {
      '/api': {
        target: 'http://<LAN-IP>:2283',
        changeOrigin: true,
      },
    },
  },
});
```

Der Client ruft dann relative URLs auf (`fetch('/api/people')` statt `fetch('http://<LAN-IP>:2283/api/people')`), der `x-api-key`-Header wird im Request an den Proxy mitgeschickt wie gewohnt — aus Sicht des Browsers ist alles same-origin, es gibt keinerlei CORS-Vorgang mehr. `changeOrigin: true` sorgt dafür, dass der `Host`-Header beim Weiterleiten auf das Ziel angepasst wird, was NestJS' `trust proxy`-Konfiguration (`app.set('trust proxy', ...)`, ebenfalls in `app.common.ts`) unterstützt.

Quelle: `server/src/app.common.ts`, `server/src/repositories/config.repository.ts`, `server/src/enum.ts` (Enum `ImmichEnvironment`), `docker/docker-compose.yml`.

---

## 2. People / Gesichtserkennung

**Alle Personen auflisten:** `GET /api/people` (Query-Params: `withHidden`, `closestPersonId`, `closestAssetId`, `page` [≥1], `size` [1–1000, Default 500]). Antwort: `{ total, hidden, people: PersonResponseDto[], hasNextPage }`.
Quelle: `server/src/controllers/person.controller.ts`, `server/src/dtos/person.dto.ts` (`PersonSearchSchema`, `PeopleResponseSchema`).

Alternative Namenssuche: `GET /api/search/person?name=<Name>&withHidden=<bool>` → `PersonResponseDto[]`. Quelle: `server/src/controllers/search.controller.ts`.

**Personen-ID ermitteln:** Aus `PersonResponseDto.id` (UUID) der obigen Listen. `PersonResponseDto`-Felder: `id, name, birthDate, thumbnailPath, isHidden, isFavorite, color, updatedAt`.

**Assets zu einer Person-ID:** Es gibt **keinen** dedizierten Endpoint `GET /people/:id/assets` mehr in v3.1.0. Der Weg führt über die Metadaten-Suche (siehe Abschnitt 3) mit `personIds: [id]` im Body von `POST /api/search/metadata`.

**Kombination Person + Datum in einer Anfrage: Ja, serverseitig, in einer einzigen Anfrage.** `MetadataSearchDto` (erweitert `BaseSearchSchema`) enthält gleichzeitig `personIds: uuid[]` und `takenAfter` / `takenBefore` (ISO-Datetime). Kein Client-seitiges Filtern nötig. Quelle: `server/src/dtos/search.dto.ts`.

**Personen zusammenführen (merge):** `POST /api/people/:id/merge` mit Body `{ ids: uuid[] }` (`MergePersonDto`) — führt die angegebenen Personen-IDs in die Person aus dem Pfad-Parameter zusammen. Antwort: `BulkIdResponseDto[]`. Relevant für das genannte Problem "mehrere Personen-Cluster für dasselbe Kleinkind" — dafür ist genau dieser Endpoint gedacht.
Quelle: `server/src/controllers/person.controller.ts` (`mergePerson`), `server/src/dtos/person.dto.ts` (`MergePersonSchema`).

---

## 3. Suche mit Datumsfilter und Pagination

**Endpoint:** `POST /api/search/metadata` (Body `MetadataSearchDto`, nicht Query-Parameter). Es filtert nach **Aufnahmedatum** (`takenAfter`/`takenBefore`, gemappt auf `fileCreatedAt`/EXIF `dateTimeOriginal`), nicht nach Upload-Datum (`createdAfter`/`createdBefore` filtert separat nach Upload-/DB-Erstellungszeit).

Relevante Body-Felder (Auszug aus `BaseSearchSchema` + `MetadataSearchSchema`, Datei `server/src/dtos/search.dto.ts`):
```jsonc
{
  "personIds": ["<uuid>"],
  "takenAfter": "2023-01-01T00:00:00.000Z",
  "takenBefore": "2026-01-01T00:00:00.000Z",
  "type": "IMAGE",            // optional, Enum AssetType
  "withExif": true,
  "withPeople": true,
  "order": "asc",             // AssetOrder: asc | desc, Default desc
  "page": 1,
  "size": 1000                // max. 1000, min. 1
}
```

**Pagination:** Parameter `page` (1-basiert) und `size` (**max. 1000 pro Seite**, per Zod-Schema `z.int().min(1).max(1000)` erzwungen). Antwortstruktur `SearchResponseDto`:
```jsonc
{
  "assets": {
    "count": 234,          // Anzahl in dieser Seite
    "items": [ /* AssetResponseDto[] */ ],
    "nextPage": "2",        // Token für nächste Seite, null wenn Ende erreicht
    "total": 500,           // deprecated seit v3.0.0, nicht mehr verlässlich
    "facets": []
  },
  "albums": { /* analog, hier nicht relevant */ }
}
```
Quelle: `server/src/controllers/search.controller.ts` (`searchAssets`), `server/src/dtos/search.dto.ts` (`SearchAssetResponseSchema`, `SearchResponseSchema`, `MetadataSearchSchema`).

Hinweis: Es existiert zusätzlich ein mächtigerer, filterbasierter Suchmechanismus (`SearchFilterSchema` mit `IdsFilter`, `DateFilter` usw., ebenfalls in `search.dto.ts`) für komplexere Und/Oder-Verknüpfungen — für den beschriebenen Anwendungsfall (eine Person, ein Datumsbereich) reicht `POST /search/metadata` aus.

---

## 4. Asset-Metadaten-Felder

Struktur `AssetResponseDto`, Quelle `server/src/dtos/asset-response.dto.ts`:

| Frage | Ergebnis |
|---|---|
| Exakter Aufnahmezeitpunkt | **Ja**, zwei Felder: `fileCreatedAt` (UTC-Zeitstempel, EXIF-Timezone bereits eingerechnet — "authoritative timestamp for chronological sorting") und `localDateTime` (Wanduhrzeit am Aufnahmeort, timezone-agnostisch, für Kalender-/Tagesgruppierung). Zusätzlich in `exifInfo.dateTimeOriginal` und `exifInfo.timeZone` (roher EXIF-Timezone-String, z.B. `"+02:00"`), falls `withExif: true` angefragt wurde. |
| Favoriten-Flag | **Ja**: `isFavorite: boolean` (Top-Level am Asset). Zusätzlich existiert `isFavorite` auch am `PersonResponseDto`. |
| Asset-Typ (Bild/Video) | **Ja**: `type: AssetType` (`IMAGE` \| `VIDEO`), plus `duration` (Millisekunden, `null` bei Bildern) als Zusatzindikator. |
| EXIF: Kamera, Brennweite, Maße, Orientierung | **Ja**, im Unterobjekt `exifInfo` (nur wenn `withExif: true` im Suchrequest gesetzt ist): `make`, `model`, `lensModel`, `focalLength`, `fNumber`, `iso`, `exposureTime`, `exifImageWidth`, `exifImageHeight`, `orientation` (String), `dateTimeOriginal`, `modifyDate`, `timeZone`, `latitude`, `longitude`, `city`, `state`, `country`, `description`, `rating`, `projectionType`, `fileSizeInByte`. Quelle: `server/src/dtos/exif.dto.ts` (`ExifResponseSchema`). Zusätzlich `width`/`height` (aktuelle Pixelmaße, ggf. nach Rotation) direkt am Asset-Objekt (Top-Level), getrennt von `exifImageWidth/Height`. |
| Erkannte Personen | **Ja**: `people: PersonResponseDto[]` am Asset (nur `id, name, birthDate, thumbnailPath, isHidden, isFavorite, color, updatedAt` — **keine** Bounding-Box hier). |
| Face-Bounding-Box-Größe | **Nicht** im normalen Asset-/Such-Response enthalten. Dafür separater Endpoint: `GET /api/faces?id=<assetId>` → `AssetFaceResponseDto[]` mit `boundingBoxX1/X2/Y1/Y2`, `imageWidth`, `imageHeight`, `person`. Quelle: `server/src/controllers/face.controller.ts` (`getFaces`), `server/src/services/person.service.ts` (`getFacesById`), `server/src/dtos/person.dto.ts` (`AssetFaceResponseSchema`). Aus den Bounding-Box-Koordinaten lässt sich die Gesichtsgröße relativ zum Bildbereich berechnen (nützlich als Proxy für "Gesicht groß/scharf im Bild"). |
| Qualitäts-/Ästhetik-/Schärfe-Score | **Nicht vorhanden.** Kein entsprechendes Feld in `AssetResponseDto` oder `ExifResponseDto`. Immich berechnet keinen öffentlich zugänglichen Ästhetik-/Schärfe-Score über die API. Eine eigene Heuristik (z.B. Auflösung, Bounding-Box-Größe, Blur-Detection auf dem Thumbnail) müsste clientseitig implementiert werden. |
| Duplikat-Erkennung | **Ja**, aber nur als vorberechnete, gelesene Liste, kein On-Demand-"finde Ähnliche zu Asset X"-Endpoint: `GET /api/duplicates` → `DuplicateResponseDto[]` mit `duplicateId, assets, suggestedKeepAssetIds`. Basiert auf **Ähnlichkeit über CLIP-Embeddings (Smart Search)**, nicht auf exaktem Hash-Vergleich: Das interne Repository-Interface `AssetDuplicateResult` (`server/src/repositories/search.repository.ts`) hat ein Feld `distance: number` (Vektordistanz), und die Aktivierung ist an `isDuplicateDetectionEnabled` (= Smart-Search/ML aktiviert) gekoppelt (`server/src/services/duplicate.service.ts`, `server/src/utils/misc.ts`). Das ist also "ähnlich", nicht nur "identisch" (identische Dateien werden separat schon beim Upload über den `x-immich-checksum`-Header/SHA1 erkannt, das ist ein anderer Mechanismus). Zusätzlich `POST /api/duplicates/resolve` zum automatischen Auflösen — **als `alpha` seit v3.0.0 markiert**, also noch instabil. |
| CLIP-Embeddings über API | **Nein.** Kein Feld für rohe Embedding-Vektoren in `AssetResponseDto`, `DuplicateResponseDto` oder sonst einem Response-DTO gefunden. Die Vektoren liegen nur intern in Postgres/pgvector und werden für Smart Search (`POST /search/smart`) und Duplikat-Erkennung serverseitig genutzt, aber nicht exportiert. |

Quelle zusätzlich: `server/src/controllers/asset.controller.ts` (`GET /assets/:id`), `server/src/services/asset.service.ts` (lädt `faces: { person: true }`, mappt aber über `mapAsset`/`peopleFromFaces` auf `PersonResponseDto`, nicht auf Bounding-Boxen).

---

## 5. Thumbnails

**Endpoint:** `GET /api/assets/:id/thumbnail?size=<size>` (Query-Param `size`, Enum `AssetMediaSize`: `thumbnail` | `preview` | `fullsize` | `original`; `original` ist seit v3 deprecated zugunsten von `GET /api/assets/:id/original`). Zusätzlicher Query-Param `edited` (bool, Default `false`) für bearbeitete Versionen.
Quelle: `server/src/controllers/asset-media.controller.ts` (`viewAsset`), `server/src/dtos/asset-media.dto.ts` (`AssetMediaSizeSchema`, `AssetMediaOptionsSchema`).

**`<img src>` und Authentifizierung — definitiv geklärt: Es gibt eine Query-Parameter-Form der API-Key-Auth, `fetch`+Blob-URL ist NICHT nötig.**

Beweis in `server/src/middleware/auth.guard.ts`:
```ts
const apiKey = (headers[ImmichHeader.ApiKey] || queryParams[ImmichQuery.ApiKey]) as string;
```
und in `server/src/enum.ts`:
```ts
export enum ImmichHeader { ApiKey = 'x-api-key', ... }
export enum ImmichQuery  { ApiKey = 'apiKey', ... }
```

Der Server akzeptiert den API-Key also gleichwertig als Header `x-api-key` **oder** als Query-Parameter `?apiKey=<KEY>`. Für `<img src>`-Tags (die keine Custom-Header setzen können) funktioniert daher direkt:
```
<img src="/api/assets/<id>/thumbnail?size=thumbnail&apiKey=<API_KEY>">
```
(über den Vite-Proxy als Pfad relativ zu `localhost:5173`, siehe Abschnitt 1).

**Sicherheitshinweis (eigene Einschätzung, nicht aus dem Code):** Der API-Key landet dadurch in der Browser-URL-Leiste bei direkten Navigationsversuchen, ggf. im Verlauf und in Proxy-/Zugriffs-Logs. Für ein rein lokales Tool auf dem eigenen LAN ist das ein akzeptables Risiko, sollte aber nicht in produktiv geteilte/öffentliche Deployments übernommen werden.

---

## 6. Album erstellen und Assets zuweisen

**Album erstellen:** `POST /api/albums`, Body (`CreateAlbumDto`):
```jsonc
{
  "albumName": "Mein Album",     // erforderlich
  "description": "optional",
  "assetIds": ["<uuid>", "..."], // optional, initiale Assets gleich beim Erstellen
  "albumUsers": []                // optional, Freigaben
}
```
Antwort: `AlbumResponseDto` (enthält u.a. `id`, `order`).

**Assets zu bestehendem Album hinzufügen:** `PUT /api/albums/:id/assets`, Body `BulkIdsDto`: `{ "ids": ["<uuid>", ...] }`. Antwort: `BulkIdResponseDto[]` (pro Asset `id, success, error?`).
Quelle: `server/src/controllers/album.controller.ts`, `server/src/dtos/album.dto.ts`, `server/src/dtos/asset-ids.response.dto.ts` (`BulkIdsSchema`).

**Limit pro Request:** Im Zod-Schema (`BulkIdsSchema: z.object({ ids: z.array(z.uuidv4()) })`) ist **keine explizite Maximallänge** für das `ids`-Array gesetzt. Die einzige harte Grenze im Code ist der globale JSON-Body-Size-Limit von **10 MB** (`app.use(json({ limit: '10mb' }))`, `server/src/app.common.ts`) — für ~75 UUIDs (~40 Byte je Eintrag) völlig unkritisch. Es gibt also praktisch keine relevante Obergrenze für diesen Anwendungsfall; eine Konvention à la "in Batches von z.B. 100–500 senden" ist reine Vorsicht, keine Server-Vorgabe.

**Reihenfolge innerhalb des Albums:** **Nicht frei steuerbar, nur `asc`/`desc` nach Datum.** Das Album-Objekt hat ein Feld `order: AssetOrder`, und `AssetOrder` ist ein Enum mit genau zwei Werten:
```ts
export enum AssetOrder { Asc = 'asc', Desc = 'desc' }
```
(`server/src/enum.ts`). Es gibt keinen "custom"/manuellen Positions-Wert und im gesamten `album.service.ts` keinen Code-Pfad für Drag&Drop-Neuordnung oder eine `position`-Spalte pro Asset-Album-Zuordnung. Die Sortierung innerhalb eines Albums ist also ausschließlich chronologisch (nach Aufnahmedatum), auf/absteigend umschaltbar über `PATCH /api/albums/:id` mit `{ "order": "asc" | "desc" }`. Eine gewünschte kuratierte Reihenfolge (abweichend vom Aufnahmedatum) lässt sich über die API **nicht** direkt abbilden.

---

## 7. Versionierung

**Geprüfte Version:** `v3.1.0` (Server-`package.json`: `"version": "3.1.0"`), aktuellstes GitHub-Release, veröffentlicht 2026-07-29.

**Was kürzlich als potenziell instabil auffiel:**
- `v3.0.0` selbst ist erst vor gut einem Monat erschienen (`v3.0.0` → `v3.0.3` → `v3.1.0`, Releases zwischen 2026-06 und 2026-07) und brachte laut Code-Kommentaren mehrere Breaking Changes: das `rating`-Filterfeld akzeptiert seit v3 keinen `-1`-Wert mehr; `SearchAssetResponseDto.total` ist seit v3.0.0 deprecated (nicht mehr verlässlich befüllt, `count`/`nextPage` stattdessen nutzen); der Person-Update-Endpoint `PUT /people/:id` ist zugunsten von `PATCH /people/:id` (v3) deprecated.
- `POST /api/duplicates/resolve` ist noch als **alpha** (v3.0.0) markiert — als instabil zu behandeln, für dieses Tool aber ohnehin nicht benötigt.
- Der Server nutzt intern ein `HistoryBuilder`-System (`added/beta/stable/deprecated` pro Endpoint/Feld, sichtbar in den Zod-Metadaten), das signalisiert: Immich verfolgt API-Stabilität pro Major-Version bewusst und dokumentiert Änderungen strukturiert — ein Hinweis darauf, dass sich Feld-/Endpoint-Semantik zwischen Major-Versionen (v1→v2→v3) tatsächlich ändert und Code entsprechend defensiv geschrieben werden sollte (z.B. `total` nicht für Paginierungslogik verwenden, `nextPage`-Token stattdessen).

**Wie der User die für SEINEN Server verbindliche Spec bekommt (wichtiger als jede Doku):**
Der Server hostet seine eigene OpenAPI-Spec und Swagger-UI **immer**, unabhängig vom Environment (`useSwagger(...)` wird in `configureExpress` unconditional aufgerufen, nur das Schreiben einer lokalen Datei ist dev-only). Quelle: `server/src/utils/misc.ts`, Funktion `useSwagger`.

- **Swagger-UI (interaktiv, mit "Try it out"):** `http://<lan-ip>:2283/doc`
- **OpenAPI-JSON-Spec:** `http://<lan-ip>:2283/api/spec.json`
- **OpenAPI-YAML-Spec:** `http://<lan-ip>:2283/api/spec.yaml`

Diese Endpunkte sind exakt für die tatsächlich laufende Server-Version generiert (inkl. aller lokalen Abweichungen, Plugins etc.) und damit zuverlässiger als die separat gehostete Doku unter `immich.app/docs` oder das `open-api/`-Verzeichnis im Repo, die beide dem jeweiligen Release-Tag hinterherhinken können. **Empfehlung: Vor Implementierungsbeginn `http://<lan-ip>:2283/api/spec.json` vom eigenen Server abrufen und gegen diese Recherche gegenprüfen.**

---

## Offene Punkte / nicht abschließend geklärt

- Das exakte Verhalten des `cors`-npm-Package-Defaults (welche Header/Methoden bei `app.enableCors()` ohne Argumente konkret reflektiert werden) wurde nicht bis ins letzte Detail nachvollzogen — irrelevant, da dieser Pfad im Produktionsbetrieb ohnehin nie erreicht wird (siehe Abschnitt 1). Falls der User dennoch `IMMICH_ENV=development` erwägt, sollte er das am eigenen Server verifizieren statt sich auf diese Recherche zu verlassen.
- Kein automatisierter Live-Test gegen einen echten Immich-Server wurde durchgeführt (kein Zugriff auf den LAN-Server des Users aus dieser Umgebung heraus). Alle Aussagen basieren auf Quellcode-Lektüre des Tags `v3.1.0`. Abweichungen sind möglich, falls der User eine ältere/neuere Version oder einen Fork betreibt — Abgleich über `/api/spec.json` am eigenen Server ist der zuverlässigste nächste Schritt.

---

## Nachtrag: Benötigte API-Key-Berechtigungen

Nachträglich erhoben aus `server/src/enum.ts` (`Permission`-Enum) und den `@Authenticated({ permission: ... })`-Dekoratoren der jeweiligen Controller. **Achtung:** diese Abfrage lief gegen den `main`-Branch, nicht gegen den Tag `v3.1.0` wie der Rest dieses Dokuments. Gegen `/api/spec.json` des eigenen Servers gegenprüfen (Aufgabe von Ticket 02).

### Zwingend erforderlich

| Berechtigung | Route | Wofür |
|---|---|---|
| `person.read` | `GET /api/people`, `GET /api/people/:id` (`person.controller.ts`) | Person-ID des Sohnes finden |
| `asset.read` | `POST /api/search/metadata` (`search.controller.ts`) | Das Hauptsieb: Personen- und Zeitraumfilter |
| `asset.view` | `GET /api/assets/:id/thumbnail` (`asset-media.controller.ts`) | Vorschaubilder in der Review-UI |
| `album.create` | `POST /api/albums` (`album.controller.ts`) | Album anlegen |
| `albumAsset.create` | `PUT /api/albums/:id/assets` (`album.controller.ts`) | Fotos zuweisen |
| `album.read` | `GET /api/albums`, `GET /api/albums/:id` (`album.controller.ts`) | Prüfen, ob das Album schon existiert; Ergebnis zurücklesen |

### Bedingt, je nach offenen Entscheidungen

| Berechtigung | Route | Bedingung |
|---|---|---|
| `face.read` | `GET /api/faces` | Nur wenn das Ranking Gesichtsgrößen nutzt — offen in Ticket 03 |
| `duplicate.read` | `GET /api/duplicates` | Nur wenn das Clustering darauf aufsetzt — offen in Ticket 03 |
| `person.merge` | `POST /api/people/:id/merge` | Nur wenn der Sohn als mehrere Personen angelegt ist — zeigt Ticket 02 |
| `person.statistics` | `GET /api/people/:id/statistics` | Bequemer Zähler für die Vermessung in Ticket 02 |

### Ausdrücklich NICHT nötig

`asset.download` (Originale werden nie geladen, nur Thumbnails), sämtliche `*.delete`- und `*.update`-Berechtigungen auf Assets, und `all`. Der Schlüssel braucht **keinerlei schreibenden Zugriff auf den Bestand** — die einzigen Schreibrechte betreffen das neue Album. Das deckt sich mit der Scope-Regel der Karte: keine Veränderungen am Bestand.
