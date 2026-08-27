# Review-UI: Vorschlag bestätigen und Bilder austauschen

Type: prototype
Status: resolved
Blocked by: 04

## Question

Wie sieht der Bestätigungs-Modus konkret aus? Ziel ist, dass ein Durchgang über 75 Vorschläge in einem Abend erledigt ist, ohne dass Bilder einzeln durchgeklickt werden müssen.

Zu klären, am besten an einem billigen, echten Artefakt (Skizze oder lauffähiger Stub):

- **Grundansicht** — chronologisches Raster über alle 75 auf einmal, oder Jahr für Jahr / Monat für Monat?
- **Der Austausch-Klick** — was passiert beim Klick auf ein Bild? Overlay mit den Geschwistern aus dem Cluster, Inline-Aufklappen, Seitenleiste? Wie viele Alternativen zeigt man?
- **Verwerfen ohne Ersatz** — kann ein Slot leer bleiben, oder rückt automatisch der Nächstbeste nach?
- **Manuell dazunehmen** — braucht es einen Weg, ein Bild einzuschleusen, das der Algorithmus gar nicht vorgeschlagen hat? Das ist der Ausweich-Rastermodus aus der Charting-Runde — gehört er in v1?
- **Fortschritt** — sieht man, was schon bestätigt ist und was noch nicht?
- **Der Abschluss** — wie sieht der Schritt „Album jetzt in Immich anlegen" aus, und was zeigt das Tool danach?

## Answer

Prototyp (Wegwerfcode, als Primärquelle aufbewahrt): [`../prototype/`](../prototype/) — `pipeline.py` fährt die Pipeline aus Ticket 04 über den echten Bestand, `build_html.py` erzeugt `index.html` mit drei gegensätzlichen UI-Varianten und echten Thumbnails. Lauf vom 2026-08-27: 6350 Kandidaten → 4341 Cluster → 75 Slots, 629 Thumbnails.

**Gewählt: Variante C — Fokus.** Ein Slot groß, Alternativen als Streifen darunter, tastaturgetrieben (Pfeiltasten blättern, 1–8 tauschen, Leertaste bestätigt, X lässt leer). Begründung des Nutzers: das große Vorschaubild trägt das Urteil. Verworfen: A (Kontaktbogen) und B (Monatsstreifen, Alternativen dauerhaft sichtbar).

Daraus folgend entschieden:

- **Auflösung** — großes Bild aus `size=preview` (1440px), Alternativstreifen aus `size=thumbnail` (250px). In Variante C ist immer nur ein großes Bild sichtbar, das kostet einen Request pro Blättern. Die beiden Nachbarslots vorladen.
- **Abschlussansicht** — nach dem Durchgang ein **Kontaktbogen über alle 75** (die verworfene Variante A), bevor geschrieben wird. Variante C allein zeigt nie das Album als Ganzes; ohne diese Schau merkt man nicht, dass ein Jahr nur Innenräume enthält. Kein Moduswechsel während der Arbeit, nur am Ende.
- **Kein passender Vorschlag** — Slot darf **leer bleiben**, plus Knopf „mehr Alternativen" für die nächsten acht. **Kein automatisches Nachrücken:** das würde eine Ablehnung stillschweigend rückgängig machen.
- **Persistenz** — Fortschritt nach jeder Entscheidung in IndexedDB, neben dem Hash-Cache. 75 Entscheidungen sind rund eine halbe Stunde Arbeit; ein Reload darf sie nicht kosten. *(Schließt den gleichnamigen Nebelpunkt der Karte.)*
- **Rastermodus zum manuellen Einschleusen** — **nicht in v1.** Acht Alternativen plus Nachladen erreichen alles im selben Monat. Ein Browser über 6350 Bilder wäre genau das Durchgehen, das vermieden werden sollte.
- **Abschluss** — Namensfeld mit Vorschlag („Antonio — die ersten drei Jahre"), `POST /api/albums` mit allen bestätigten Assets in einem Rutsch, danach Verlinkung ins Album in Immich. Leere Slots werden übersprungen.

### Was der Prototyplauf über den Algorithmus verraten hat

Über alle Kandidaten liegt die mittlere Clustergröße bei nur 1,46 — die meisten Cluster sind Einzelbilder. Die **gewinnenden** Cluster haben aber eine Mediangröße von **6**, und nur 3 von 75 Slots stammen aus einem Einzelbild-Cluster. Das Bedeutungsmaß aus Q12 trennt also tatsächlich, ohne dass man ihm ein Gewicht geben musste. Alle 37 Monate sind vertreten, exakt 25 pro Lebensjahr, kein Tag belegt mehr als einen Slot.
