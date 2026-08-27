# Spec: Album-Kurator

Status: ready-for-agent

Quelle: [Wayfinder-Karte](./map.md) und ihre fünf aufgelösten Tickets. Vokabular: [`CONTEXT.md`](../../CONTEXT.md).

## Problem Statement

Ich möchte meinem Sohn zum dritten Geburtstag ein Fotoalbum schenken, das seine ersten drei Lebensjahre erzählt. Auf meinem Immich-Server liegen aus diesem Zeitraum **6350 Fotos**, auf denen er zu sehen ist. Sie einzeln durchzugehen ist keine Frage von Fleiß, sondern von Größenordnung — bei fünf Sekunden pro Bild sind das neun Stunden, und danach hätte ich immer noch keine Auswahl, sondern nur Erschöpfung.

Immich selbst hilft dabei nicht: es zeigt mir eine Zeitleiste, keinen Vorschlag. Die Arbeit, aus tausenden Aufnahmen desselben Kindes die wenigen herauszuziehen, die zusammen eine Geschichte ergeben, bleibt vollständig bei mir.

## Solution

Ein lokal laufendes Web-Werkzeug, das sich per API mit meinem Immich-Server verbindet und mir **75 fertige Vorschläge** vorlegt — 25 pro Lebensjahr, gleichmäßig über alle 37 Monate verteilt, ohne Serienredundanz.

Ich gehe diese 75 durch, nicht die 6350. Jeder Vorschlag zeigt mir ein großes Bild und acht Alternativen aus demselben Moment; ich bestätige per Leertaste oder tausche per Zifferntaste. Am Ende sehe ich das Album als Ganzes und lasse es mit einem Klick in Immich anlegen.

Das Werkzeug maßt sich **nicht** an zu wissen, welches Foto das schönere ist. Es entfernt Unbrauchbares, entfernt Redundanz und sorgt dafür, dass jeder Monat vorkommt. Die Kür bleibt bei mir — nur eben auf 75 Entscheidungen eingedampft statt 6350.

## User Stories

### Einrichtung und Verbindung

1. Als Kurator möchte ich Server-Adresse und API-Key in einer lokalen Konfigurationsdatei hinterlegen, damit ich sie nicht bei jedem Start neu eingeben muss.
2. Als Kurator möchte ich beim Start eine klare Meldung sehen, wenn der Server nicht erreichbar ist, damit ich weiß, ob das Problem beim Werkzeug oder beim Netzwerk liegt.
3. Als Kurator möchte ich eine verständliche Meldung sehen, wenn meinem API-Key eine Berechtigung fehlt, samt Nennung der fehlenden Berechtigung, damit ich sie in Immich nachtragen kann.
4. Als Kurator möchte ich, dass das Werkzeug die Version meines Servers prüft und mich warnt, wenn sie von der erwarteten abweicht, damit ich nicht rätsele, warum eine Abfrage anders antwortet.

### Auswahl von Person und Zeitraum

5. Als Kurator möchte ich die benannten Personen meines Servers als Liste sehen und eine davon auswählen, damit ich das Werkzeug ohne Bearbeitung des Codes auch für ein anderes Kind nutzen kann.
6. Als Kurator möchte ich mehrere Personen gleichzeitig auswählen können, damit ich den Fall abdecke, dass dieselbe Person von der Gesichtserkennung mehrfach angelegt wurde.
7. Als Kurator möchte ich Anfangs- und Enddatum frei setzen, damit ich dasselbe Werkzeug für den vierten Geburtstag oder ein Urlaubsalbum verwenden kann.
8. Als Kurator möchte ich die Zielgröße einstellen (Standard: 25 pro Jahr), damit ich ein größeres oder kleineres Album bauen kann.
9. Als Kurator möchte ich vor dem Start sehen, wie viele Kandidaten mein Filter trifft, damit ich merke, wenn ich Person oder Zeitraum falsch gesetzt habe.

### Kandidaten und Vorbereitung

10. Als Kurator möchte ich, dass Videos automatisch ausgeschlossen werden, damit ich mich nicht mit Standbildern aus Filmen befassen muss.
11. Als Kurator möchte ich während des Ladens einen Fortschrittsbalken mit Restdauer sehen, weil der erste Durchlauf einige Minuten dauert und ich sonst nicht weiß, ob das Werkzeug hängt.
12. Als Kurator möchte ich, dass berechnete Bildmerkmale lokal zwischengespeichert werden, damit ein zweiter Lauf nur die neu hinzugekommenen Fotos kostet.
13. Als Kurator möchte ich den Zwischenspeicher gezielt leeren können, damit ich nach geänderten Einstellungen einen sauberen Durchlauf erzwingen kann.
14. Als Kurator möchte ich, dass einzelne nicht ladbare Fotos den Durchlauf nicht abbrechen, sondern übersprungen und am Ende gezählt werden.

### Der Vorschlag

15. Als Kurator möchte ich, dass aus mehreren fast identischen Aufnahmen desselben Moments nur eine im Vorschlag landet, damit ich nicht achtmal dasselbe beurteile.
16. Als Kurator möchte ich, dass jeder Monat des Zeitraums vertreten ist, damit das Album die ganze Zeit erzählt und nicht nur die fotogensten Wochen.
17. Als Kurator möchte ich, dass ein einzelner Tag nicht mehrere Plätze belegt, damit ein Urlaub nicht einen ganzen Monat verdrängt.
18. Als Kurator möchte ich, dass Momente, die ich häufig fotografiert habe, bevorzugt werden, weil die Zahl meiner Auslösungen das Einzige ist, was ich je über Bedeutung gesagt habe.
19. Als Kurator möchte ich, dass erkennbar verwackelte Aufnahmen aussortiert werden, solange dadurch kein Moment ganz verschwindet.
20. Als Kurator möchte ich, dass derselbe Bestand immer denselben Vorschlag ergibt, damit ich nachvollziehen kann, warum ein Bild da ist — und warum ein anderes nicht.

### Durchsehen und Austauschen

21. Als Kurator möchte ich immer genau einen Vorschlag groß sehen, weil ich an einem kleinen Bild nicht beurteilen kann, ob es ein gutes Foto ist.
22. Als Kurator möchte ich unter dem großen Bild acht Alternativen aus demselben Moment sehen, damit ich die Auswahl beurteilen kann, ohne zu suchen.
23. Als Kurator möchte ich per Pfeiltasten blättern, per Zifferntaste tauschen und per Leertaste bestätigen, damit ich 75 Entscheidungen in einem Rutsch treffen kann, ohne zur Maus zu greifen.
24. Als Kurator möchte ich, dass beim Blättern die Nachbarbilder vorgeladen werden, damit sich das Durchgehen verzögerungsfrei anfühlt.
25. Als Kurator möchte ich weitere Alternativen nachladen können, wenn mir keine der acht gefällt.
26. Als Kurator möchte ich einen Platz leer lassen können, damit ich nicht gezwungen bin, ein Foto zu nehmen, das ich nicht will.
27. Als Kurator möchte ich, dass ein leer gelassener Platz **nicht** automatisch nachbesetzt wird, weil das meine Ablehnung stillschweigend rückgängig machen würde.
28. Als Kurator möchte ich jederzeit sehen, wie viele Plätze ich bestätigt, getauscht und leer gelassen habe.
29. Als Kurator möchte ich zu einem bereits bestätigten Platz zurückspringen und ihn ändern können.
30. Als Kurator möchte ich, dass mein Fortschritt einen Neuladen der Seite überlebt, weil 75 Entscheidungen eine halbe Stunde Arbeit sind.

### Abschluss

31. Als Kurator möchte ich am Ende alle Plätze gemeinsam als Kontaktbogen sehen, damit mir auffällt, wenn ein Jahr nur Innenräume enthält oder sich Motive wiederholen.
32. Als Kurator möchte ich aus dem Kontaktbogen heraus einzelne Plätze noch einmal aufrufen und ändern können.
33. Als Kurator möchte ich dem Album einen Namen geben, mit einem sinnvollen Vorschlag vorbelegt.
34. Als Kurator möchte ich das Album mit einem Klick in Immich anlegen lassen, damit ich nichts von Hand nachbauen muss.
35. Als Kurator möchte ich, dass leer gelassene Plätze beim Schreiben übersprungen werden, sodass das Album entsprechend kleiner ausfällt.
36. Als Kurator möchte ich nach dem Schreiben einen direkten Link in das neue Album bekommen.
37. Als Kurator möchte ich sicher sein, dass das Werkzeug ausschließlich ein neues Album anlegt und nichts an meinem Bestand ändert, löscht oder umbenennt.
38. Als Kurator möchte ich gewarnt werden, wenn bereits ein Album gleichen Namens existiert, statt versehentlich ein zweites anzulegen.
39. Als Kurator möchte ich eine verständliche Meldung samt Möglichkeit zum Wiederholen bekommen, wenn das Schreiben teilweise fehlschlägt.

## Implementation Decisions

### Architektur

- **Vite + React + TypeScript**, lokal per `npm run dev`. Kein Backend-Prozess, kein Deployment, kein Login.
- **Immich erlaubt im Standard-Setup kein CORS** — `enableCors()` läuft nur bei `IMMICH_ENV=development`, was das offizielle Compose-File nicht setzt. Der Zugriff läuft deshalb über **Vites eingebauten `server.proxy`** mit `changeOrigin: true`; der Client spricht ausschließlich relative Pfade an und ist damit same-origin. Ein eigener Proxy-Server ist nicht nötig.
- **Konfiguration** aus `.env`: Server-URL und API-Key. Der Key wird nicht eingecheckt.
- **Zielversion Immich 3.1.0.** Die maßgebliche Schnittstellenbeschreibung liefert der Server selbst unter `/api/spec.json`; bei Abweichung gilt sie, nicht diese Spec.

### Benötigte API-Berechtigungen

Zwingend: `person.read`, `asset.read`, `asset.view`, `album.create`, `albumAsset.create`, `album.read`. Zusätzlich `face.read` für die Gesichtsprüfung und `person.merge`, falls Personen zusammengeführt werden. **Kein schreibender Zugriff auf den Bestand** — weder `asset.download` noch irgendein `*.delete` oder `*.update` auf Assets.

### Datenbeschaffung

- Kandidaten kommen aus **einer** Abfrage: Metadatensuche mit Personen-IDs *und* Aufnahmezeitraum, mit EXIF, paginiert à 1000. Ein eigener Endpunkt für „Assets einer Person" existiert nicht mehr.
- Gefiltert wird auf Bilder; Videos fallen raus.
- Vorschaubilder in zwei Größen: **250px** für Merkmalsberechnung und Alternativstreifen, **1440px** für das große Bild. Die Bild-Endpunkte akzeptieren den API-Key als Abfrageparameter, `<img src>` funktioniert also direkt.

### Die Pipeline

Reine Rechnerei, in dieser Reihenfolge:

1. **Merkmale** — je Kandidat aus dem 250px-Vorschaubild ein Perceptual Hash und ein Schärfemaß (Laplace-Varianz). Empfohlen: `blockhash-core` (reines JS, nimmt `ImageData` direkt, kein WASM).
2. **Clustern** — je **Kalendertag**, transitiv über **Hamming ≤ 16**. Ein Cluster ist ein Moment; ein Moment überspannt keine Tage. *Kalibriert am echten Bestand: bis Schwelle 20 null Falsch-Verschmelzungen über Szenenwechsel hinweg.*
3. **Veto** — ein Kandidat fällt nur, wenn seine Schärfe unter 60 % des **Medians seines eigenen Clusters** liegt, und nie, wenn der Cluster dadurch leer würde. Absolute Schwellen sind untauglich: gemessen liegt zwischen Median und 5. Perzentil nur Faktor 1,9.
4. **Repräsentant** — der zeitlich **letzte** verbliebene Kandidat des Clusters. Man drückt weiter ab, bis es passt.
5. **Quote** — Zielgröße je Lebensjahr, **gleichmäßig** über die berührten Kalendermonate verteilt (Largest Remainder). Gewichtung nach Fotodichte wurde geprüft und verworfen: bei dieser Granularität liefert sie praktisch dasselbe Ergebnis mit mehr beweglichen Teilen.
6. **Platzvergabe je Monat** — größter Cluster zuerst, danach der größte mit ausreichendem zeitlichem Abstand; **höchstens ein Platz je Kalendertag**, solange der Monat mehr fotografierte Tage als Plätze hat.
7. **Alternativen** — acht je Platz, chronologisch, gestaffelt aus Cluster-Geschwistern → selber Tag → selber Monat. Nachladen liefert die nächsten acht.
8. **Gesichtsprüfung, nachgelagert** — nur für die Vorschläge plus je zwei Alternativen (~225 Abfragen). Schwelle: **0,5 % der Bildfläche**, an den 75 echten Vorschlägen gemessen (Median 2,08 %, p10 0,69 %, p5 0,48 %). Sie fängt die klaren Hintergrundfälle; jeder höhere Wert überstimmt normale Bildausschnitte — 1,5 % hätte 27 % der Vorschläge getauscht. Findet sich kein passendes Gesicht, wird **behalten**, nicht getauscht: das widerspräche der Personensuche, die das Asset geliefert hat. Die Gesichtsabfrage kostet **eine Anfrage pro Asset** und hat keine Sammelvariante; ein Volldurchlauf ist deshalb ausgeschlossen. Ist die Person im Vorschlag nur ein Fleck im Hintergrund, rückt die nächste Alternative nach.

Die Pipeline ist **deterministisch**. Kein Zufall, kein „Neu würfeln".

### Leitentscheidung: Veto statt Feinranking

Es gibt kein menschliches Qualitätssignal (im gemessenen Bestand: 12 Favoriten auf 6350 Bilder) und keinen Qualitäts-Score in der API. Die konstruierten Signale sind grob. Eine gewichtete Punktzahl daraus sähe präzise aus und wäre es nicht — sie würde vortäuschen, das Werkzeug wisse, welches Foto schöner ist. Daher: **Unbrauchbares entfernen, Redundanz entfernen, gleichmäßig verteilen — die Kür macht der Mensch.**

### Zustand

Aus dem Prototyp übernommen, weil es die Entscheidung genauer festhält als Prosa (Slot und Vorschlag sind verschiedene Dinge — der Slot bleibt, sein Vorschlag wird getauscht):

```ts
type Slot = {
  monat: string          // "2025-01"
  tag: string            // "2025-01-14"
  clusterGroesse: number // Bedeutungsmaß: wie oft ausgelöst wurde
  vorschlag: AssetId     // ursprünglicher Repräsentant
  aktuell: AssetId       // nach Austausch; anfangs === vorschlag
  alternativen: AssetId[]
  bestaetigt: boolean
  leer: boolean          // bewusst leer gelassen
}
```

- **Bildmerkmale** und **Kuratier-Fortschritt** liegen in IndexedDB. Merkmale sind an die Asset-ID gebunden und über Läufe hinweg gültig; der Fortschritt wird nach jeder Entscheidung geschrieben.
- Kein Server-Zustand, keine geteilte Sitzung.

### Oberfläche

- **Ein Platz zur Zeit**, großes Bild aus der 1440px-Größe, darunter acht Alternativen als 250px-Streifen. Nachbarplätze werden vorgeladen.
- **Tastatur führt**: Pfeiltasten blättern, Ziffern 1–8 tauschen, Leertaste bestätigt und springt weiter, eine Taste lässt leer. Maus tut dasselbe, ist aber nicht der Hauptweg.
- **Abschlussansicht**: Kontaktbogen über alle Plätze, chronologisch, mit Rücksprung in einzelne Plätze. Erst danach das Schreiben.
- Kein Bilderbrowser über den Gesamtbestand.

### Schreiben

Album anlegen und die bestätigten Assets zuweisen; die Zahl der Assets ist unkritisch, ein Längenlimit existiert praktisch nicht. **Die Reihenfolge innerhalb eines Immich-Albums ist nicht frei wählbar** — nur auf- oder absteigend nach Aufnahmedatum. Für ein chronologisches Rückblickalbum genügt das; eine eigene Sortierung ist nicht umsetzbar und wird nicht versprochen.

## Testing Decisions

**Eine Naht, so hoch wie möglich:** die Kuratierungsfunktion — Kandidaten (Zeitstempel, Perceptual Hash, Schärfewert, Favoritenflag) rein, Plätze mit Alternativen raus. Rein, ohne Netzwerk, ohne DOM, ohne Uhr.

Ein guter Test hier prüft **beobachtbares Verhalten**, nicht den Weg dorthin: er behauptet etwas über die erzeugten Plätze, nie über Zwischenschritte wie die Cluster-Zwischenstruktur oder die Aufrufreihenfolge. Schwellenwerte sind Parameter der Funktion, keine im Test nachgebauten Konstanten.

Abzudeckende Fälle:

- Eine Serie fast gleicher Aufnahmen ergibt genau einen Platz; die übrigen erscheinen als Alternativen desselben Platzes.
- Zwei visuell ähnliche Aufnahmen an **verschiedenen Tagen** werden **nicht** verschmolzen.
- Jeder Monat mit Kandidaten erhält mindestens einen Platz; die Gesamtzahl trifft die Zielgröße exakt.
- Kein Kalendertag belegt mehr als einen Platz, solange der Monat genug fotografierte Tage hat — und die Kappe greift *nicht*, wenn er zu wenige hat.
- Bei gleicher Eingabe ist die Ausgabe identisch (Determinismus).
- Ein Cluster, in dem alle Kandidaten unter der Schärfeschwelle liegen, verliert keinen Platz — das Veto darf nie den letzten Kandidaten entfernen.
- Jeder Platz hat Alternativen, auch wenn sein Cluster nur ein Element hat.
- Ein Monat mit weniger Clustern als Plätzen führt zu weniger Plätzen, nicht zu Doppelbelegung oder Absturz.

**Nicht** durch Tests abgedeckt und stattdessen von Hand gegen den echten Server geprüft: die Immich-Anbindung (Paginierung, Berechtigungsfehler, Album-Anlage). Attrappen dafür müssten bei jeder Immich-Version nachgezogen werden, und v3 bewegt sich schnell — sie würden Sicherheit vortäuschen, die sie nicht liefern.

Es gibt keine Prior Art im Repo; dies ist der erste Code.

## Out of Scope

- **Videos** — vollständig ausgeschlossen, auch nicht als Nebenliste.
- **Print, PDF, Fotobuch** — das Ziel ist ein Album *in* Immich.
- **Mehrbenutzerbetrieb, Hosting, Deployment, Anmeldung** — läuft lokal für eine Person.
- **Jede Veränderung am Bestand** — kein Löschen, Taggen, Favorisieren, Umbenennen, Zusammenführen. Nur ein neues Album.
- **Manueller Bilderbrowser über alle Kandidaten** — wäre genau das Durchgehen, das vermieden werden soll.
- **Thematische Suche als zweiter Durchgang** („Kuchen", „erste Schritte") — eigenständiges Merkmal, gegebenenfalls eine eigene Planung.
- **Eigene Sortierung innerhalb des Albums** — von Immich nicht unterstützt.

## Further Notes

### Bekannte Restrisiken

1. **Mögliche zweite Identität.** Immich legt für ein Kleinkind oft mehrere Personen an, weil sich das Gesicht in drei Jahren stark verändert. Im gemessenen Bestand stehen 1242 Personen, überwiegend unbenannt; ob eine davon dieselbe Person ist, wurde nicht geprüft. Deshalb erlaubt das Werkzeug die Auswahl mehrerer Personen (Story 6). Nicht fatal — das erste Lebensjahr hatte bereits 1434 Kandidaten unter der bekannten Identität.
2. **Duplikate mit verschobenem Zeitstempel.** Das Tagesfenster fängt Kopien nur, wenn sie denselben Aufnahmetag tragen. Eine Messenger-Kopie mit Empfangsdatum entkommt ihm und könnte zweimal im Album landen. Ungeprüft, ob das praktisch vorkommt; die Abschlussansicht (Story 31) ist die Rückfallebene.
3. ~~Die Gesichtsprüfung ist nie gegen echte Daten gelaufen.~~ **Bei der Umsetzung nachgeholt.** Alle 75 Vorschläge tragen ein zuordenbares Gesicht; die zunächst geschätzte Schwelle von 1,5 % war deutlich zu scharf und wurde auf den gemessenen Rand der Verteilung korrigiert.
5. **Die Hamming-Schwelle wurde mit PIL kalibriert, das Werkzeug rechnet mit Canvas.** Beide skalieren das Vorschaubild unterschiedlich, der wirksame Abstand kann also leicht abweichen. Risiko gering — die gemessene Trennung war sehr breit (Median 15 gegen 32, null Falsch-Verschmelzungen bis 20) —, aber ungeprüft, weil dafür ein Browser nötig wäre.
4. **Das Schärfemaß ist schwach.** Auf 250px-Vorschaubildern trennt es nur klar Verwackeltes; es taugt ausdrücklich nicht zum Feinvergleich zweier brauchbarer Aufnahmen. Deshalb ist das Veto bewusst zahnlos gehalten. Wer es später schärfen will, braucht die 1440px-Größe und damit einen zweiten Volldurchlauf.

### Belege aus der Planung

Alle Zahlen stammen aus Messungen am echten Bestand, nicht aus Schätzungen: 6350 Kandidaten und 1025 Videos über 37 Monate; kein Monat unter 24 Bildern; 12 Favoriten; 49 % der Aufnahmeabstände unter 10 Sekunden bei **verschmierter, nicht bimodaler** Verteilung; Merkmalsdurchlauf 89 MB in 3,2 Minuten bei 16 parallelen Verbindungen; Probelauf ergab 4341 Cluster und 75 Plätze, deren gewinnende Cluster eine Mediangröße von 6 haben.

Der bemerkenswerteste Befund der Kalibrierung: **die Hälfte der Aufnahmen aus derselben Sekunde sieht visuell deutlich verschieden aus** — ein Kleinkind bewegt sich, die Kamera schwenkt. Rein zeitliches Clustern, der naheliegende Ansatz, hätte diese Momente verschmolzen und die Hälfte davon verworfen. Das ist der Grund, warum der Perceptual Hash primär ist und die Zeit nur das Vergleichsfenster begrenzt.
