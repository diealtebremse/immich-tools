# Zugang herstellen und die eigene Datenlage vermessen

Type: task
Status: resolved
Blocked by: 01

## Question

Nichts am Auswahlverfahren lässt sich entscheiden, ohne die tatsächlichen Zahlen zu kennen. Vor diesem Ticket ist jede Diskussion über Clustering und Quoten Spekulation.

Herzustellen:

- **Serverversion und Spec abgleichen** — `GET /api/spec.json` vom eigenen Server ziehen und gegen die Befunde aus Ticket 01 (dort: v3.1.0) halten. v3 ist jung und hat Breaking Changes gegenüber v2; weicht die Version ab, gelten die Endpunktangaben aus 01 nicht ungeprüft.
- **API-Key** in den Immich-Einstellungen erzeugen und lokal ablegen (`.env`, nicht eingecheckt). Server-URL festhalten. Benötigte Berechtigungen (hergeleitet aus dem Quellcode, Details und Quellen im Nachtrag von [`../research/01-immich-api.md`](../research/01-immich-api.md)):
  - **zwingend:** `person.read`, `asset.read`, `asset.view`, `album.create`, `albumAsset.create`, `album.read`
  - **bedingt:** `face.read` und `duplicate.read` (falls Ticket 03 sie braucht), `person.merge` (falls mehrere Personen zusammenzuführen sind), `person.statistics` (bequemer Zähler für genau diese Vermessung)
  - **nicht nötig:** `asset.download`, alle `*.delete`/`*.update` auf Assets, `all`. Kein schreibender Zugriff auf den Bestand.
  - Für diese Vermessung allein genügen `person.read`, `asset.read` und `person.statistics` — die Album-Rechte braucht erst die Implementierung.
- **Person-ID** des Sohnes über `GET /api/people` ermitteln. Achtung auf den in Runde 2 genannten Fallstrick: Immich legt für ein Kleinkind oft **mehrere getrennte Personen** an, weil sich das Gesicht zwischen 0 und 3 Jahren stark verändert. Prüfen, ob es mehrere Einträge gibt, und wenn ja: alle IDs sammeln oder per `POST /api/people/:id/merge` zusammenführen.

Zu messen (per Skript gegen `POST /api/search/metadata` mit `personIds` + `takenAfter`/`takenBefore` und `withExif: true`, Ergebnisse im Answer festhalten):

- Wie viele Assets liegen insgesamt im Zeitraum Geburt bis dritter Geburtstag?
- Wie viele davon tragen die Person(en) des Sohnes?
- Wie verteilen sich diese über die 36 Monate? Gibt es **leere oder sehr dünne Monate** — und wenn ja, wie viele? (Das entscheidet, ob eine starre Monatsquote überhaupt funktioniert.)
- Wie viele sind Favoriten, und wie verteilen sich die?
- Wie viele sind Videos (fliegen raus, aber die Zahl beeinflusst die Restmenge)?
- Wie sehen die Zeitabstände zwischen aufeinanderfolgenden Aufnahmen aus? Erkennt man Serienaufnahmen klar an einer Lücke im Histogramm?

## Answer

**Zugang steht.** Server `http://192.168.178.40:2283`, Key in `/Users/paul/Develop/immich/.env`. Serverversion per `/api/spec.json` bestätigt: **3.1.0** — exakt die Bezugsversion aus Ticket 01, die Endpunktangaben gelten also unverändert.

**Berechtigungen des Keys (abgetastet):** `person.read`, `asset.read`, `album.read` und `search/metadata` funktionieren. **`face.read` fehlt** (403) — wird für Stufe 3 der Pipeline aus Ticket 03 gebraucht und muss nachgetragen werden. `duplicate.read` fehlt ebenfalls, ist aber egal, weil Ticket 03 `/api/duplicates` verworfen hat. `server.about` fehlt, irrelevant.

**Person:** Antonio, `birthDate=2023-08-29`, `id=dbe94f2e-672a-4f4e-8df1-911391d0e2c9`. Zeitraum der Messung: 2023-08-29 bis 2026-08-29.

### Die Zahlen

- **7375 Assets** mit dieser Person im Zeitraum: **6350 Bilder**, 1025 Videos (Videos sind out of scope).
- **Favoriten: 12.** In drei Jahren. Siehe unten — das ist der folgenreichste Befund.
- **Keine leeren Monate, kein Monat unter 24 Bildern.** 37 Monate, Median 152/Monat, Min 24, Max 495.
- **Sieb-Faktoren je Lebensjahr:** Jahr 1: 1434 Bilder (57:1), Jahr 2: 2932 (117:1), Jahr 3: 1984 (79:1).
- **Abstände zwischen aufeinanderfolgenden Aufnahmen** (n=6349): <2s 17,6 % · 2–10s 31,3 % · 10–60s 15,1 % · 1–5min 7,6 % · 5–60min 8,3 % · 1–24h 15,0 % · >1 Tag 5,2 %. Median 11s. **49 % aller Abstände liegen unter 10 Sekunden.**

### Folgen für die Karte

1. **Die Monatsquote funktioniert.** Kein Monat ist leer oder dünn, also braucht es keine Regel für verfallende oder wandernde Quoten. Die entsprechende Teilfrage in Ticket 04 entfällt.
2. **Favoriten als Boost ist tot.** 12 Favoriten auf 6350 Bilder, verteilt über 10 Monate — das Signal ist zu dünn, um irgendetwas zu ranken, und würde die 25 Plätze eines Jahres willkürlich verzerren. Die Charting-Entscheidung „Favoriten wirken als Boost" ist damit hinfällig.
3. **Serienaufnahmen dominieren, aber die Verteilung ist verschmiert, nicht bimodal.** Es gibt kein sauberes Tal zwischen „Serie" und „nächste Szene" — der Übergang von 2–10s über 10–60s zu 1–5min ist ein Kontinuum. Damit greift ausdrücklich Vorbehalt 2 aus Ticket 03: **der Perceptual Hash muss das primäre Clustering-Signal werden**, die Zeit darf nur noch das Vergleichsfenster begrenzen, nicht hart schneiden.
4. **6350 Bilder liegen über der 4000er-Schwelle aus Ticket 03.** Vorbehalt 1 greift: ein Thumbnail-Abruf für jedes Bild ist der Flaschenhals (grob 6350 Requests, ~100 MB, mehrere Minuten). Ob ein härteres Vorfilter *vor* dem Netzwerkzugriff nötig ist, gehört nach Ticket 04.

### Offener Restzweifel

Der Server kennt **1242 Personen**, die meisten unbenannt. Ob Antonio als **zweite, unbenannte Person** ein weiteres Mal existiert (der Babygesicht-Fallstrick), ist nicht abschließend geprüft. Entwarnung mit Vorbehalt: Jahr 1 hat bereits 1434 Bilder unter der bekannten ID — für 25 Plätze reichlich. Eine zweite Identität würde die Auswahl also bereichern, aber ihr Fehlen macht das Album nicht kaputt.
