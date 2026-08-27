# Album-Kurator

Label: wayfinder:map

> **Status: durch.** Alle fünf Tickets aufgelöst, keine offenen Entscheidungen. Nächster Schritt: `/to-spec`, dann `/implement`.

## Destination

Eine implementierungsreife **Spezifikation** für ein lokal laufendes Web-Tool, das sich per API mit dem eigenen Immich-Server verbindet, aus dem Gesamtbestand einen kuratierten Vorschlag von **75 Fotos (25 pro Lebensjahr, 0–3)** erzeugt, diesen zum Bestätigen und gezielten Austauschen präsentiert und daraus ein **neues Album in Immich** anlegt.

Erreicht ist das Ziel, wenn nichts mehr zu entscheiden ist — der Rest ist eine Implementierungs-Session (`/to-spec`, dann `/implement`).

## Notes

**Domäne:** Immich-API, Fotokuratierung. **Sprache: Deutsch** — Tickets, Antworten und Gespräche auf Deutsch.

**Issue-Tracker:** lokales Markdown (`.scratch/`), da kein Tracker konfiguriert ist. Karte = diese Datei, Tickets = `./issues/NN-*.md`.

**Skills pro Session:** `/grilling` + `/domain-modeling` für HITL-Tickets, `/research` für Recherche-Tickets, `/prototype` für Prototyp-Tickets. Am Ende `/to-spec`.

**Planning only** — diese Karte trifft Entscheidungen, sie baut das Tool nicht. Ausnahme sind `task`-Tickets, die eine Entscheidung erst freischalten.

### Feste Rahmendaten

- **Person:** Antonio, geb. 2023-08-29, `personId=dbe94f2e-672a-4f4e-8df1-911391d0e2c9` (vom Nutzer bestätigt).
- **Zeitraum:** 2023-08-29 bis 2026-08-29.
- **Server:** `http://192.168.178.40:2283`, Immich **v3.1.0**. Zugangsdaten in `/Users/paul/Develop/immich/.env`.
- **Kein Abgabetermin.** Der dritte Geburtstag ist der Anlass, nicht die Frist — Qualität geht vor Geschwindigkeit. Nicht abkürzen, um ein Datum zu treffen.
- **Offene Aufgabe für den Nutzer:** `face.read` zum API-Key hinzufügen, bevor implementiert wird.

### Bereits festgelegt (Charting-Session)

- **Albuminhalt:** Rückblick 0–3 Jahre, chronologisch. Nicht das Geburtstagsfest selbst.
- **Zielgröße:** 25 Fotos pro Lebensjahr, 75 gesamt. Konfigurierbar, aber eine harte Zahl — sie macht die Quotenverteilung erst berechenbar.
- **Kuratierungsrolle:** Tool schlägt vor, Mensch entscheidet. Der emotionale Schnitt bleibt beim Menschen.
- **Hauptsieb:** Person + Clustering gegen Serienredundanz + gleichmäßige Abdeckung über die 36 Monate. ~~Favoriten als Boost~~ — **durch die Messung in Ticket 02 verworfen:** nur 12 Favoriten auf 6350 Bilder, das Signal trägt nicht.
- **Review-Modus:** Vorauswahl bestätigen, einzelne Bilder gegen Alternativen aus demselben Zeitfenster tauschen. Rastermodus (Monat für Monat) als Ausweichweg.
- **Rückschreiben:** ja — neues Album per API anlegen und Assets zuweisen. Nichts im Bestand wird verändert oder gelöscht.
- **Stack:** Vite + React + TypeScript, läuft lokal per `npm run dev` gegen den Immich-Server im LAN. API-Key aus `.env`.
- **Wiederverwendbar, aber schlank:** kein Hardcoding auf ein Datum oder eine Person. Kein Multi-User, kein Deployment, kein Auth-System.

## Decisions so far

<!-- eine Zeile pro geschlossenem Ticket -->

- [Immich-API: Browser-Zugriff und verfügbare Bausteine](./issues/01-immich-api-faehigkeiten.md) — CORS ist im Standard-Setup **aus**, also läuft alles über einen **Vite-`server.proxy`**; Personen + Zeitraum sind ein einziger `POST /api/search/metadata`-Call; Thumbnails per `?apiKey=` direkt in `<img src>`; **kein Qualitäts-Score in der API**; Albumreihenfolge nur auf-/absteigend nach Datum. Bezugsversion v3.1.0, eigene Spec unter `/api/spec.json`.

- [Verfahren zur Serien- und Ähnlichkeitserkennung](./issues/03-aehnlichkeitserkennung.md) — Immichs `/api/duplicates` ist zu eng getrimmt und fällt aus; stattdessen **gestaffelt**: zeitliche Vorclusterung + EXIF gratis für alle, dann `blockhash-core`-Perceptual-Hash auf 250px-Thumbnails, Gesichtsgrößen per `/api/faces` nur für die Shortlist. Augen-offen-Erkennung gestrichen. Gesamtlauf 1–3 Minuten.

- [Zugang herstellen und die eigene Datenlage vermessen](./issues/02-datenlage-vermessen.md) — **6350 Bilder** (+1025 Videos) von Antonio (geb. 2023-08-29) über 37 Monate; Server v3.1.0 bestätigt. **Kein leerer Monat** → Monatsquote trägt. **Nur 12 Favoriten** → Favoriten-Boost verworfen. **Abstandsverteilung verschmiert, 49 % unter 10s** → Perceptual Hash wird primäres Clustering-Signal, Zeit nur noch Fenstergrenze. `face.read` fehlt im Key.

- [Der Auswahl-Algorithmus](./issues/04-auswahlalgorithmus.md) — **Veto statt Feinranking.** Pipeline: Kandidaten → dHash je Tagesfenster (Hamming ≤ 16, kalibriert: null Falsch-Verschmelzungen) → schwaches relatives Verwackelt-Veto → **letzter** Kandidat vertritt seinen Cluster → 25 Slots/Jahr starr auf Kalendermonate → größter Cluster gewinnt, Tageskappe erzwingt Streuung → 8 Alternativen je Slot → Gesichtsgröße nur nachgelagert für ~225 Bilder. Deterministisch. Hash-Durchlauf gemessen: 89 MB, 3,2 min.

- [Review-UI](./issues/05-review-ui.md) — **Variante C (Fokus)**: ein Slot groß, tastaturgetrieben, großes Bild aus `size=preview`. Danach ein **Kontaktbogen über alle 75** als Abschlussschau. Leere Slots erlaubt, kein Nachrücken, „mehr Alternativen" auf Knopfdruck. **Fortschritt in IndexedDB.** Kein manueller Bilderbrowser in v1. Prototyp unter [`./prototype/`](./prototype/).

## Not yet specified

_Leer — die Karte ist durch. Nichts ist mehr zu entscheiden._

## Bekannte Restrisiken (gehören in die Spec, sind aber keine offenen Entscheidungen)

- **Zweite Identität für Antonio** — der Server kennt 1242 Personen, meist unbenannt. Ob er ein zweites Mal als unbenannte Person existiert, ist ungeprüft. Nicht fatal: Jahr 1 hat bereits 1434 Bilder unter der bekannten ID.
- **Duplikate mit verschobenem Zeitstempel** — das Tagesfenster fängt Kopien nur, wenn sie denselben Aufnahmetag tragen. Eine WhatsApp-Kopie mit Empfangsdatum entkommt ihm. Ungeprüft, ob das praktisch vorkommt.
- **`face.read` fehlt dem API-Key** — Schritt 9 der Pipeline ist deshalb nie gegen echte Daten gelaufen.
- **Fehlerbehandlung beim Schreiben** — Album existiert bereits, Zuweisung schlägt teilweise fehl. Implementierungsdetail, keine Entscheidung.

## Out of scope

- **Videos** — bleiben komplett draußen, auch nicht als Nebenliste.
- **Print/PDF-Export oder Fotobuch-Erzeugung** — das Ziel ist ein Album *in Immich*.
- **Multi-User, Hosting, Deployment, Login** — das Tool läuft lokal für genau eine Person.
- **Veränderungen am Immich-Bestand** — kein Löschen, Taggen, Favorisieren oder Umbenennen. Nur ein neues Album schreiben.
- **Manueller Bilderbrowser über den Gesamtbestand** — in Ticket 05 aus v1 verworfen; wäre genau das Durchgehen, das vermieden werden soll.
- **Thematischer zweiter Pass per CLIP-Smart-Search** — „Kuchen", „erste Schritte", „Strand" als gezielte Höhepunkt-Ergänzung. Eigenständiges Merkmal jenseits des jetzt vollständig entschiedenen v1; wenn überhaupt, dann als neue Karte.
