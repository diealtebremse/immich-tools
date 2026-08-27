# Clustering & Ranking für das Retrospektiv-Album

Primärquellen: `immich-app/immich` @ Tag `v3.1.0` (Server-Source + `open-api/immich-openapi-specs.json`), offizielle Docs (`docs/docs/...`). Zusätzliche Quellen (Libraries, Algorithmen) sind explizit als solche markiert.

---

## Teil A — Clustering in Burst-/Near-Duplicate-Gruppen

### A.1 Rein zeitliches Clustering

**Funktionsprinzip:** Assets nach `fileCreatedAt`/`localDateTime` sortieren, dann bei jeder Lücke (Gap) zwischen zwei aufeinanderfolgenden Aufnahmen prüfen, ob sie über einem Schwellwert liegt — wenn ja, neue Gruppe.

**Fixer Schwellwert vs. adaptiv:**
Ein fixer Schwellwert (z. B. "neue Gruppe, wenn Lücke > 5–10 s") ist trivial zu implementieren, hat aber zwei Fehlerrichtungen, die sich nicht gleichzeitig vermeiden lassen:

- Zu kurz gewählt → eine Serie, bei der der fotografierende Elternteil zwischen den Auslösern 8–15 s statt 2–3 s braucht (z. B. weil das Kind sich bewegt und man nachjustiert), wird fälschlich in mehrere „Ereignisse" zerrissen.
- Zu lang gewählt → das im Ticket genannte Gegenbeispiel schlägt zu: auf einer Geburtstagsfeier werden echte, inhaltlich verschiedene Szenen (Kerzen anzünden, Geschenk auspacken, Tortenschlacht) im Sekundentakt fotografiert. Ein Zeit-Threshold kann rein aus dem Zeitstempel nicht unterscheiden „gleiche Szene, mehrfach ausgelöst" von „andere Szene, schnell nacheinander fotografiert" — das ist strukturell unmöglich, weil beide Fälle dasselbe Zeitmuster erzeugen. Rein zeitliches Clustering hat exakt dieses Problem: es hat keinerlei Bildinhalt-Signal.

Ein adaptiver/datengetriebener Schwellwert (z. B. den Threshold pro Session aus der Verteilung der Gaps selbst ableiten — etwa: sortiere alle Gaps aufsteigend, suche den größten relativen Sprung ("Knie") in der Gap-Verteilung, alles darunter zählt als "burst-intern") ist robuster gegenüber unterschiedlichem Aufnahmeverhalten (Serienbild-Modus vs. Einzelbild mit Nachjustieren), löst aber das strukturelle Problem oben nicht — er verschiebt nur die Grenze, löst aber nicht das Henne-Ei-Problem "zeitlich nah + inhaltlich verschieden".

**Fazit A.1:** Zeitliches Clustering erkennt den genannten Kernfall (8 quasi-identische Frames über 30 s) zuverlässig, sofern der Schwellwert grob passt — dafür reicht sogar ein simpler fixer Wert. Es liefert aber **falsch-positive** Gruppierungen bei zeitlich dichten, aber inhaltlich verschiedenen Szenen. Zeit allein reicht nicht als alleiniges Kriterium; sie eignet sich als günstiger **Vorfilter** (grobe Sessions bilden), nicht als alleinige Cluster-Entscheidung.

### A.2 Immich `/api/duplicates` als Clustering-Primitive

Quellen: `server/src/services/duplicate.service.ts`, `server/src/repositories/duplicate.repository.ts`, `server/src/config.ts`, `server/src/utils/misc.ts`, `server/src/controllers/duplicate.controller.ts`, `docs/docs/administration/jobs-workers.md`, `docs/docs/features/duplicates-utility.md`.

**Distanzmetrik & Schwellwert:** `DuplicateRepository.search()` (`server/src/repositories/duplicate.repository.ts:193-220`) führt eine pgvector/vchordrq-Cosine-Distance-Query auf der `smart_search`-Tabelle aus (`smart_search.embedding <=> embedding`), begrenzt auf die `DUPLICATE_SEARCH_LIMIT = 64` nächsten Nachbarn (Zeile 15), und filtert anschließend mit `WHERE distance <= maxDistance`. Der **Default-Schwellwert ist `0.01`** (`server/src/config.ts:306-309`, `duplicateDetection: { enabled: true, maxDistance: 0.01 }`). Das ist eine extrem enge Cosine-Distanz — sie fasst praktisch nur CLIP-Embeddings, die nahezu identisch sind (typischerweise: dieselbe Bilddatei erneut hochgeladen, HEIC+JPEG-Paar desselben Shots, minimale Rekompression), nicht zwei unterschiedliche Frames eines Bursts mit leicht anderer Pose/Mimik/Bildausschnitt.

**Konfigurierbar:** Ja, über `DuplicateDetectionConfigSchema` (`server/src/dtos/model-config.dto.ts`, referenziert in `server/src/dtos/system-config.dto.ts:187`) — aber nur als **serverweite Admin-Einstellung** (Machine-Learning-Settings), nicht als Parameter pro Request. `GET /api/duplicates` (`server/src/controllers/duplicate.controller.ts:17-26`) nimmt keinerlei Query-Parameter entgegen; man kann also nicht "on the fly" mit einem lockereren Threshold gegen die API fragen. Man könnte den globalen Server-Wert hochsetzen, das würde aber das eingebaute Duplicates-Review-UI für die gesamte Bibliothek des Nutzers verändern (unerwünschter Nebeneffekt für ein Nutzungsszenario, das nur ein 75-Foto-Album bauen will) — und selbst dann bekäme man nur vorberechnete Gruppen zurück, keine flexible "gib mir Distanz(A,B)"-Abfrage, da rohe CLIP-Embeddings laut bereits etabliertem Fakt nirgends exponiert sind.

**Läuft es automatisch / ist es auf einem typischen Server befüllt?** Ja, automatisch als Teil der Ingest-Job-Pipeline: Laut `docs/docs/administration/jobs-workers.md` (Mermaid-Diagramm) folgt "Duplicate Detection" direkt auf "Smart Search" (`E[Smart Search] --> I[Duplicate Detection]`), d. h. sobald ein Asset ein CLIP-Embedding hat, wird automatisch nach Duplikaten gesucht (`DuplicateService.handleSearchDuplicates`, `server/src/services/duplicate.service.ts:329-385`, Job `JobName.AssetDetectDuplicates` in Queue `QueueName.DuplicateDetection`). Es gibt zusätzlich einen manuell/administrativ auslösbaren "Queue All"-Job (`AssetDetectDuplicatesQueueAll`, Zeile 303-327) für Nachträge (`force`-Flag). Voraussetzung: Duplicate Detection ist per Default aktiviert (`enabled: true`), hängt zusätzlich an Smart Search (`isDuplicateDetectionEnabled` prüft `isSmartSearchEnabled`, `server/src/utils/misc.ts:104-105`). Für einen Standard-Setup ohne abgeschaltete ML-Features ist die Tabelle also bereits befüllt — aber eben nur mit den sehr engen Treffern.

**Transitiv oder paarweise?** Transitiv. `updateDuplicates()` (`server/src/services/duplicate.service.ts:387-411`) sammelt alle `duplicateId`s der gefundenen Nachbarn, wählt eine Ziel-`duplicateId` und ruft `DuplicateRepository.merge()` (`server/src/repositories/duplicate.repository.ts:225-233`) auf, das per `UPDATE asset SET duplicateId = target WHERE duplicateId IN (sourceIds) OR id IN (assetIds)` alle bisherigen Gruppenmitglieder zusammenführt — es ist also ein Union-artiges Merge über bereits bestehende Gruppen, nicht nur eine paarweise Markierung.

**Bewertung als Clustering-Baustein:** Nicht brauchbar für unseren Zweck. Der Threshold 0.01 ist bewusst auf "faktisch dieselbe Datei" getunt (Ziel laut Docs: Speicherplatz sparen durch Erkennung echter Duplikate/Re-Uploads, mit automatischer Keep-Empfehlung nach Dateigröße + EXIF-Feldanzahl, `server/src/utils/duplicate.ts:25-48` — explizit **kein** Qualitätsscore, nur Byte-Größe + EXIF-Vollständigkeit). Acht Burst-Frames mit unterschiedlicher Pose/Mimik werden im CLIP-Embedding-Raum typischerweise weiter als 0.01 auseinanderliegen und tauchen in `/api/duplicates` gar nicht auf. Die Endpoint ist damit **kein Ersatz** für eigenes Clustering, sondern höchstens ein optionaler Zusatzsignal für echte Re-Encodes (die aber ohnehin selten in einer Gesichtserkennungs-gefilterten Foto-Auswahl vorkommen dürften).

### A.3 Perceptual Hashing im Client

**Kosten-Schätzung:**
Thumbnail-Defaults laut `server/src/config.ts:369-375`: `size=thumbnail` → WebP, 250 px Langkante, Qualität 80. Für ein fotografisches Motiv bei dieser Auflösung/Qualität liegt die Dateigröße erfahrungsgemäß bei ca. 8–20 KB (Schätzung, nicht am Immich-Server gemessen).

Für die im Ticket genannte Kandidatenmenge von ~2000–4000 Assets:
- Requests: 2000–4000 (ein `GET /api/assets/:id/thumbnail?size=thumbnail`-Aufruf pro Asset, authentifiziert per `?apiKey=` wie bereits etabliert).
- Payload gesamt: ~20–60 MB.
- Wall-Clock im LAN: Der Flaschenhals ist nicht die Bandbreite (Gigabit-LAN verarbeitet 60 MB in Sekunden), sondern die Anzahl der Requests × Roundtrip. Browser limitieren parallele Verbindungen pro Origin (HTTP/1.1 typischerweise 6); über Vite's `server.proxy` bleibt das Verhalten im Wesentlichen HTTP/1.1-artig, sofern kein HTTP/2 durchgereicht wird. Mit angenommenen ~30–80 ms pro Request (LAN, Thumbnail bereits von Immich vorgeneriert, keine Live-Transkodierung) und 6 parallelen Requests ergibt sich überschlägig: 3000 Requests / 6 × ~50 ms ≈ 25 s, realistisch mit Verarbeitungs-Overhead eher 30–90 s für den kompletten Abruf. Das ist für ein gelegentlich laufendes lokales Tool akzeptabel, aber nicht vernachlässigbar — und hängt direkt an der noch unbekannten tatsächlichen Kandidatenzahl (siehe Teil C, offene Abhängigkeiten).
- Hash-Berechnung selbst ist gegenüber dem Netzwerk-Overhead vernachlässigbar (< 5 ms pro Bild bei 250 px).

**Bibliothek:** `blockhash-core` (npm, Quelle: `https://github.com/LinusU/blockhash-core`, README abgerufen). Reine JS-Implementierung des Blockhash-Algorithmus, **keine Abhängigkeiten**, nimmt direkt ein natives Browser-`ImageData`-Objekt entgegen (`bmvbhash(imageData, bits)` → Hex-String-Hash) — exakt das, was `canvas.getContext('2d').getImageData(...)` liefert. Kein WASM, kein Node-only-Verhalten (keine `fs`/native-Bindings wie bei `sharp`-basierten pHash-Paketen). Letzte Veröffentlichung laut npm-Registry: `2019-12-07`, Version `0.1.0` — sehr klein, seit Jahren stabil, kein aktiver Wartungsbedarf zu erwarten für einen simplen, gut verstandenen Algorithmus. Alternative, die noch weniger Abhängigkeits-Fußabdruck hat: dHash von Hand implementieren (Graustufen-Downsample auf 9×8 Pixel via Canvas, benachbarte Helligkeitswerte vergleichen → 64-Bit-Hash) — für diesen Anwendungsfall (75-Foto-Album, kein Produkt) eine legitime Alternative zu einer zusätzlichen Dependency, funktional aber austauschbar. Hamming-Distanz zwischen zwei Hashes = Anzahl unterschiedlicher Bits, günstig zu berechnen (XOR + Popcount).

**Fazit A.3:** Technisch günstig genug für die genannte Größenordnung, solange sie wirklich im Bereich 2000–4000 bleibt. Löst — anders als A.1 und A.2 — tatsächlich den Bildinhalt-Vergleich und kann damit sowohl den "8 Frames in 30 s"-Fall korrekt zusammenfassen als auch den Geburtstagsfall korrekt trennen (unterschiedliche Szenen ergeben unterschiedliche Hashes trotz naher Zeitstempel).

### Empfehlung Teil A

Kombination, nicht Einzelverfahren:

1. **Grobes zeitliches Vorclustering** (A.1) auf den bereits vorhandenen EXIF-Daten (`fileCreatedAt`) — kostenlos, kein zusätzlicher Request, reduziert die Menge der Paare, die visuell verglichen werden müssen, von O(n²) auf O(Cluster-intern).
2. **Perceptual Hashing** (A.3) *innerhalb* jedes Zeit-Clusters (und optional über kurze Cluster-Grenzen hinweg mit etwas Toleranz), um a) echte Bursts zu bestätigen/zusammenzuführen und b) zeitlich nahe, aber inhaltlich verschiedene Aufnahmen (Geburtstagsfall) zu trennen.
3. **`/api/duplicates` (A.2) nicht als primäres Clustering-Werkzeug verwenden** — Threshold zu eng, kein Zugriff auf rohe Distanzen, nicht per-Request konfigurierbar. Optional: vorhandene Duplicate-Groups rein informativ nutzen (z. B. um zu wissen, welche Assets laut Immich bereits als Byte-nahes Duplikat markiert sind), aber nicht darauf verlassen.

---

## Teil B — Ranking innerhalb eines Clusters

### EXIF-Signale (kostenlos, schon vorhanden)

Quelle: `server/src/dtos/exif.dto.ts` (`ExifResponseSchema`) — das ist exakt das Objekt, das `withExif: true` in `POST /api/search/metadata` liefert. Enthaltene Felder u. a.: `exifImageWidth`/`exifImageHeight`, `fileSizeInByte`, `fNumber`, `focalLength`, `iso`, `exposureTime` (String, z. B. `"1/500"`), `make`/`model`, `lensModel`, `rating`.

Was davon korreliert plausibel mit "besseres Foto":

- **Auflösung (`exifImageWidth`/`Height`) / `fileSizeInByte`**: schwaches, aber kostenloses Signal — höhere Auflösung/Dateigröße deutet oft auf das Original-Foto statt eine nachträglich herunterskalierte Kopie/Screenshot/WhatsApp-Re-Upload hin. Genau dieses Signal nutzt Immich selbst als Haupt-Heuristik für die Duplicate-Keep-Empfehlung (`server/src/utils/duplicate.ts:25-48`).
- **`exposureTime`**: indirektes Unschärfe-Risiko-Signal. Lange Verschlusszeiten (z. B. `"1/15"` bei einem sich bewegenden Kind) korrelieren mit Bewegungsunschärfe; das lässt sich als grober Malus im Scoring nutzen, ohne ein einziges Byte Bild laden zu müssen.
- **`iso`**: hohe ISO-Werte deuten auf Low-Light-Aufnahmen hin, die tendenziell mehr Rauschen/weniger Detail haben — ebenfalls ein schwaches, aber kostenloses Signal.
- **`fNumber` (Blende) und `focalLength`**: kaum direkte Aussagekraft über "Keeper oder nicht" bei Smartphone-/Kompaktkamera-Aufnahmen mit meist fixer oder automatisch geregelter Blende; bei Wechselobjektiv-Kameras allenfalls indirekt (sehr offene Blende → geringe Schärfentiefe → Risiko, dass das Gesicht knapp außerhalb der Fokusebene liegt), aber das ist spekulativ und nicht zuverlässig genug, um als eigenständiges Signal zu gewichten.
- **`make`/`model` (Kamerahersteller/-modell)**: kein Qualitätssignal per se, aber nützlich, um z. B. Screenshots oder Messenger-Re-Uploads (oft ohne Kamerahersteller-EXIF oder mit generischem Wert) von echten Kamera-/Smartphone-Originalen zu unterscheiden.

Alles hiervon ist **bereits im Response von `/api/search/metadata`** enthalten (bestätigter Fakt aus dem Vorticket) — es kostet keinen zusätzlichen Request und sollte für **alle** Kandidaten berechnet werden.

### Gesichtsgröße/-anzahl via `GET /api/faces`

Quelle: `server/src/controllers/face.controller.ts` (`GET /faces` → `getFaces`, Query-DTO `FaceDto` mit einzigem Feld `id` — `server/src/dtos/person.dto.ts:126-130`, `FaceSchema = z.object({ id: z.uuidv4() })`). Es gibt **keinen Bulk-Parameter** — der Endpoint nimmt exakt eine Asset-ID pro Aufruf entgegen, keine Liste. Das deckt sich mit dem bereits etablierten Fakt "ein HTTP-Request pro Asset" und bestätigt: es gibt in v3.1.0 keinen alternativen Weg, Face-Bounding-Boxen für mehrere Assets in einem Request zu bekommen.

Bei 2000–4000 Kandidaten wäre das ein weiterer Batch von 2000–4000 zusätzlichen Requests — spürbar teuer, aber im Vergleich zum Thumbnail-Abruf (Teil A.3) mit noch kleinerer Payload (reines JSON, keine Bilddaten) potenziell sogar schneller pro Request, in Summe aber ein zweiter kompletter Durchlauf über alle Kandidaten.

**Empfehlung:** Nicht auf allen Kandidaten, sondern **nur auf der Shortlist** berechnen — d. h. erst nachdem Clustering (Teil A) und die kostenlose EXIF-Vorsortierung die Menge auf realistisch wenige Kandidaten pro Cluster (z. B. die besten 2–3 pro Cluster, statt alle Cluster-Mitglieder) reduziert haben. Die Gesichtsgröße relativ zur Bildfläche (aus `boundingBoxX1/X2/Y1/Y2`, bereits etablierter Fakt) ist inhaltlich das direkteste verfügbare Signal für "ist mein Sohn groß/deutlich im Bild zu sehen" — relevanter als generische Schärfe für ein Portrait-Retrospektiv-Album — und rechtfertigt daher den Mehraufwand, aber eben nur für die engere Auswahl.

### Schärfe aus dem Thumbnail

**Methode:** Varianz des Laplace-Operators (3×3-Laplace-Kernel auf Graustufenbild falten, Varianz der Antwort berechnen) — Standardverfahren aus Pech-Pacheco et al., "Diatom autofocusing in brightfield microscopy: a comparative study", *Proceedings 15th ICPR*, 2000 (Sekundärquelle/Algorithmus-Referenz, verifiziert über Sekundärbeschreibungen wie PyImageSearch "Blur detection with OpenCV", die den Originalalgorithmus korrekt wiedergeben: Bild mit Laplace falten, Varianz der Antwort niedrig ⇒ wenig hochfrequente Kanten ⇒ unscharf). Im Browser via `<canvas>` umsetzbar: Bild zeichnen, `getImageData()`, in Graustufen wandeln, 3×3-Faltung anwenden, Varianz berechnen — kein zusätzlicher Netzwerk-Request nötig, wenn das Thumbnail ohnehin schon für das Perceptual Hashing (Teil A.3) geladen wurde.

**Ist `size=thumbnail` (250 px) dafür groß genug — kritisch betrachtet:** Nein, nicht uneingeschränkt, und das sollte man offen so sagen:

- Für **grobe** Unterscheidungen ("dieses eine Bild aus der Serie ist eindeutig verwackelt/unscharf, die anderen sieben nicht") funktioniert Laplace-Varianz auch auf 250 px zuverlässig genug — starke Bewegungsunschärfe oder Fehlfokus bleibt auch nach dem serverseitigen Downscaling (WebP, 250 px Langkante, `server/src/config.ts:370-375`) als globaler Kontrastverlust sichtbar.
- Für **feine** Unterscheidungen ("welches von zwei fast gleich guten Bildern ist die minimal schärfere Aufnahme") ist Downscaling problematisch: Die Verkleinerung auf 250 px wirkt wie ein Tiefpassfilter und unterdrückt genau die hochfrequenten Detailunterschiede, die zwei ansonsten beide "scharf wirkende" Aufnahmen unterscheiden würden. Nach dem Downscaling können zwei Bilder, die im Original deutlich unterschiedliche Schärfe haben, nahezu identische Laplace-Varianz zeigen — das Signal "verflacht" gerade in dem Bereich, in dem man innerhalb eines Bursts am meisten differenzieren möchte.
- Downscaled Sharpness ist also **kein verlässlicher Proxy** für die Schärfe des Originals im Sinne einer feinen Rangfolge — nur im Sinne eines groben Ausreißer-Filters ("klar unscharf" vs. "Rest"). Für eine belastbarere Fein-Unterscheidung müsste man `size=preview` (1440 px, JPEG, `server/src/config.ts:376-381`) laden — deutlich größere Payload (grob 4–6× die Thumbnail-Dateigröße) und damit nur für eine kleine Shortlist vertretbar, nicht für 2000–4000 Kandidaten.

**Empfehlung:** Laplace-Varianz auf dem ohnehin geladenen `thumbnail` als groben Ausreißer-Filter für **alle** Kandidaten in einem Cluster nutzen (kostenlos, da Bild schon im Speicher). Für die finale Fein-Entscheidung innerhalb der letzten 2–3 Shortlist-Kandidaten pro Cluster zusätzlich `size=preview` laden und dort erneut Laplace-Varianz berechnen — das sind dann sehr wenige zusätzliche Requests.

### Augen offen / lächelnd

Ohne clientseitiges Face-Detection-/Landmark-Modell nicht erreichbar — dafür gibt es in der Immich-API laut bereits etabliertem Fakt keinerlei Score (kein Blink/Smile/Aesthetic-Feld irgendwo in der API). Die einzigen realistischen Optionen wären:

- **face-api.js** (TensorFlow.js-basiert): laut Recherche (README/GitHub, Sekundärquelle: `justadudewhohacks/face-api.js`) ist allein das quantisierte "Tiny Face Detector"-Modell ~190 KB — das deckt aber nur Face-Detection ab, nicht Landmarks/Expression. Für Eyes-open/Smiling bräuchte man zusätzlich die Landmark-/Expression-Modelle desselben Pakets, die zusätzliche Downloads und TensorFlow.js als Laufzeit-Abhängigkeit (WebGL/WASM-Backend) mitbringen.
- **MediaPipe Face Landmarker** (`@mediapipe/tasks-vision`, Google): liefert 478 3D-Landmarks plus 52 Blendshape-Scores (u. a. `eyeBlinkLeft`/`eyeBlinkRight`, `smile`-artige Koeffizienten) — laut offizieller Doku (`ai.google.dev/edge/mediapipe/solutions/vision/face_landmarker`, Sekundärquelle) im Browser lauffähig. Das kombinierte Modellbundle (`face_landmarker.task`, float16-Variante) wiegt laut direktem Download-Header-Check (`storage.googleapis.com/mediapipe-models/...`) **~3,76 MB**, muss beim ersten Lauf heruntergeladen/gecacht werden, und benötigt eine WASM-Runtime im Browser.

**Bewertung — bewusst kritisch:** Für ein 75-Foto-Album, das gelegentlich auf einem Laptop für eine Person läuft, lohnt sich das nicht. Man würde ein mehrere-MB-Modell laden, eine zusätzliche Inferenz-Pipeline pro Kandidatenbild bauen und wahrscheinlich Build-/Bundling-Aufwand (WASM-Assets, Modell-Hosting oder CDN-Abhängigkeit) in Kauf nehmen — für ein Signal, das am Ende nur eine von mehreren Auswahlheuristiken ist, in einem Workflow, der ohnehin eine manuelle Review-/Swap-UI hat. Das ist genau der Fall "5 % besser, aber Modell-Download und Build-Aufwand nötig" — nicht sinnvoll. Besser: Gesichtsgröße (aus `/api/faces`, ohnehin schon für die Shortlist abgerufen) plus Schärfe grob vorsortieren und dem Menschen die letzte, subjektive Entscheidung ("lächelt es, sind die Augen offen") in der Swap-UI überlassen — dafür ist die Swap-UI ja explizit gebaut.

### `isFavorite`

Bereits etabliert als Boost, nicht Filter — passt hier als zusätzlicher additiver Bonus im finalen Score (z. B. "falls `isFavorite === true`, Score-Bonus", ohne dass Nicht-Favoriten kategorisch ausgeschlossen werden).

---

## Teil C — Empfehlung

### Gestufte Pipeline

| Stufe | Signal | Für wen berechnet | Zusätzliche Requests |
|---|---|---|---|
| 1 | `fileCreatedAt`/`localDateTime`-Gaps (zeitliches Vorclustering) | alle Kandidaten | 0 (Daten schon aus `search/metadata`) |
| 2 | EXIF-Heuristiken (Auflösung, `fileSizeInByte`, `exposureTime`, `iso`) | alle Kandidaten | 0 |
| 3 | Perceptual Hash (`blockhash-core` o. handgerolltes dHash) auf `size=thumbnail` | alle Kandidaten (bzw. alle innerhalb eines Zeit-Clusters) | 1 Thumbnail-Request/Kandidat |
| 4 | Laplace-Varianz-Schärfe auf demselben Thumbnail | alle Kandidaten | 0 (Bild aus Stufe 3 wiederverwendet) |
| 5 | `isFavorite`-Bonus | alle Kandidaten | 0 |
| 6 | Gesichtsgröße/-anzahl via `GET /api/faces` | nur Shortlist (Top 2–3 je Cluster) | 1 Request/Shortlist-Kandidat |
| 7 | Feinere Schärfe auf `size=preview` (1440 px) | nur engste Shortlist (Top 1–2 je Cluster) | 1 Request/Shortlist-Kandidat |
| — | Augen offen/Lächeln | **nicht automatisiert** — Mensch entscheidet in der Swap-UI | — |

### Kostenschätzung (Gesamtlauf)

Ausgangsannahme (noch nicht verifiziert, siehe unten): 2000–4000 Kandidaten nach Personen-/Datumsfilter.

- Metadaten (`search/metadata`, `withExif: true`, 1000/Seite): 2–4 Requests, Sekunden.
- Thumbnail-Abruf für Clustering + grobe Schärfe (Stufe 3+4): 2000–4000 Requests, ~20–60 MB, geschätzt **30–90 s** im LAN (Annahme: ~6 parallele Verbindungen, ~30–80 ms Latenz pro Request, Thumbnails bereits serverseitig vorgeneriert).
- Face-Requests für Shortlist (Stufe 6): abhängig von der Cluster-Anzahl, grob geschätzt 150–300 Cluster × 2–3 Kandidaten ≈ 300–900 Requests, kleine JSON-Payloads, geschätzt **10–40 s**.
- Preview-Requests für Feinschärfe (Stufe 7): sehr wenige (~150–300 Requests, nur größte Kandidaten), wenige Sekunden bis niedrige Zehnersekunden.

**Gesamtschätzung für einen kompletten Lauf: grob 1–3 Minuten**, für ein gelegentlich lokal gestartetes Kuratierungs-Tool akzeptabel.

### Offene Abhängigkeiten von der noch ausstehenden Messung

Zwei Zahlen aus dem separaten Mess-Ticket verändern diese Empfehlung konkret:

1. **Tatsächliche Kandidatenzahl.** Die obige Schätzung geht von 2000–4000 aus. Liegt die reale Zahl deutlich höher (z. B. 8000–15000, denkbar bei täglichen Fotos über drei Jahre), wird Stufe 3 (Thumbnail-Abruf für *alle* Kandidaten) zum Flaschenhals — dann lohnt sich, den EXIF-/Zeit-Vorfilter (Stufen 1–2) *härter* zu ziehen, bevor überhaupt ein Bild geladen wird, z. B. indem zeitliche Singleton-Punkte (Assets ohne Nachbarn innerhalb eines engen Zeitfensters) direkt ohne Hash-Vergleich als eigene "Cluster der Größe 1" übernommen werden und nur Assets *innerhalb* eng beieinanderliegender Zeit-Cluster überhaupt gehasht werden. Ist die Zahl dagegen niedriger (z. B. unter 1000), kann man sich den zeitlichen Vorfilter fast sparen und stattdessen deutlich großzügiger hashen.
2. **Verteilung der Inter-Shot-Gaps.** Ob ein fixer Zeit-Threshold (Teil A.1) überhaupt taugt, hängt davon ab, ob die Gap-Verteilung klar bimodal ist (viele Gaps < 5 s innerhalb von Bursts, dann große Sprünge zwischen Ereignissen) oder eher kontinuierlich verschmiert (Elternteil fotografiert z. B. alle 20–40 s während eines ganzen Ereignisses, ohne klare Burst-Grenzen). Im ersten Fall reicht ein einfacher fixer oder leicht-adaptiver Threshold für das Vorclustering aus dem A.1-Abschnitt. Im zweiten Fall würde ein reiner Zeit-Threshold entweder zu grob (ein ganzes Ereignis wird ein einziger "Cluster", zu viele echte Bild-Varianten würden über den Perceptual-Hash-Schritt gefiltert) oder zu fein (fast jedes Bild ein eigener Cluster, Redundanz bleibt bestehen) — dann sollte der Perceptual-Hash-Vergleich (Teil A.3) das primäre Cluster-Kriterium werden und die Zeit nur noch als Kandidatenmengen-Einschränkung dienen (z. B. "vergleiche visuell nur Assets, die höchstens 2 Minuten auseinanderliegen", statt sich auf einen scharfen Gap-Cutoff zu verlassen).

Beide Werte sollten aus der Messung übernommen werden, bevor die konkreten Zahlenwerte (Sekunden-Schwellwert, Cluster-Größenannahme, Request-Anzahl) in eine Implementierung einfließen — die hier vorgeschlagene *Struktur* der Pipeline (gestufter Kostenaufbau: kostenlos → Thumbnail → Shortlist-Faces → Shortlist-Preview) ist von diesen Zahlen unabhängig und bleibt so bestehen.
