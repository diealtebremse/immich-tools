# Der Auswahl-Algorithmus: von den Kandidaten zu 25 pro Jahr

Type: grilling
Status: resolved
Blocked by: 02, 03

## Question

Das Herzstück. Wie kommt das Tool von der gesiebten Kandidatenmenge zu genau 75 Vorschlägen, die drei Jahre erzählen?

Zu entscheiden:

- **Quotenverteilung** — 25 pro Jahr ist gesetzt. Aber wie verteilen sie sich innerhalb eines Jahres? Starr ~2 pro Monat, oder proportional zur Fotodichte? (Ticket 02 hat gemessen: **kein Monat ist leer oder dünn**, Min 24, Median 152, Max 495 — die Frage nach verfallenden oder wandernden Quoten entfällt damit. Interessant bleibt, ob ein 495er-Monat mehr Plätze verdient als ein 24er.)
- **Reihenfolge der Schritte** — erst clustern, dann quotieren, dann ranken? Oder ranken innerhalb der Monatsfenster?
- **Cluster-Schwelle** — Ticket 02 zeigt eine **verschmierte, nicht bimodale** Abstandsverteilung. Der Perceptual Hash wird damit primär, die Zeit begrenzt nur das Vergleichsfenster. Zu entscheiden: Hamming-Schwelle und Fensterbreite.
- **Vorfilter vor dem Netzwerkzugriff** — 6350 Bilder heißt 6350 Thumbnail-Requests (~100 MB, mehrere Minuten). Reicht das, oder muss vorher billig ausgedünnt werden — und wenn ja, wonach, ohne dass ein guter Moment verlorengeht?
- ~~Favoriten als Boost~~ — **erledigt durch Ticket 02:** 12 Favoriten auf 6350 Bilder. Signal zu dünn, fällt ersatzlos weg. Damit fehlt dem Ranking jedes menschliche Qualitätssignal — das erhöht das Gewicht der konstruierten Signale aus Ticket 03.
- **Ereignisse gegen Alltag** — ein Urlaubstag mit 200 Fotos darf nicht drei Monate Alltag verdrängen. Braucht es eine Obergrenze pro Tag?
- **Deterministisch?** — soll derselbe Bestand denselben Vorschlag ergeben, oder darf ein „Neu würfeln"-Knopf variieren?
- **Was hängt an jedem Vorschlag?** — der Austausch-Klick braucht Alternativen. Kommen die aus demselben Cluster, demselben Tag oder demselben Monat?

## Answer

Kalibrierungsdaten zu diesem Ticket: Messung am Monat 2025-01 (495 Bilder), siehe Zahlen unten.

### Die Pipeline

1. **Kandidaten holen** — `POST /api/search/metadata` mit `personIds=[Antonio]`, `takenAfter`/`takenBefore`, `withExif: true`, paginiert à 1000. Videos verwerfen. Ergebnis: ~6350 Kandidaten.
2. **Hash-Durchlauf** — für jeden Kandidaten `size=thumbnail` (250px) laden, daraus 64-Bit-dHash und Laplace-Varianz. Gemessen: **89 MB, ~3,2 Minuten** bei 16 parallelen Verbindungen. Hashes in IndexedDB zwischenspeichern; Folgeläufe kosten nur die neu hinzugekommenen Bilder.
3. **Clustern** — je **Kalendertag**, transitiv (Union-Find) über **Hamming ≤ 16**. Ein Cluster ist fachlich *ein Moment*; ein Moment überspannt keine Tage. Tagesfenster nicht aus Kostengründen, sondern aus Bedeutungsgründen.
4. **Veto (bewusst schwach)** — innerhalb eines Clusters fliegt ein Kandidat nur, wenn seine Laplace-Varianz unter 60 % des **Cluster-Medians** liegt, und nie, wenn der Cluster dadurch leer würde. Absolute Schwellen wären Willkür: gemessen beträgt der Abstand zwischen Median und 5. Perzentil nur Faktor 1,9.
5. **Repräsentant** — der zeitlich **letzte** verbliebene Kandidat des Clusters. Man drückt weiter ab, bis es passt; die Reihenfolge innerhalb einer Serie kodiert eine menschliche Entscheidung.
6. **Quote** — 25 Slots je Lebensjahr, **starr** über die 12 Kalendermonate verteilt (Largest-Remainder: elf Monate à 2, einer à 3). Gemessen: gewichtete Verfahren liefern bei dieser Granularität praktisch dasselbe Ergebnis, nur mit mehr beweglichen Teilen. Lebensjahre in Kalendermonaten, angeschnittene Ränder werden hingenommen.
7. **Slot-Vergabe je Monat** — Slot 1 an den **größten** Cluster; Slot 2 an den größten Cluster mit ausreichendem zeitlichem Abstand. Clustergröße ist das Bedeutungsmaß: wie oft abgedrückt wurde, ist die einzige Bedeutungsangabe, die je gemacht wurde. Zusätzlich **Tageskappe**: höchstens ein Slot je Kalendertag, solange der Monat mehr fotografierte Tage als Slots hat.
8. **Alternativen** — je Slot die ersten **acht**, chronologisch, gestaffelt aus: Cluster-Geschwister → nächstbeste Kandidaten desselben Tages → desselben Monats. So hat jeder Slot immer etwas anzubieten, auch bei einelementigen Clustern.
9. **Gesichtsprüfung, nachgelagert** — `GET /api/faces` für die 75 Vorschläge plus je zwei Alternativen, rund **225 Requests**. Ist Antonio im Vorschlag nur ein Fleck im Hintergrund, rückt die nächste Alternative nach. Ein Volldurchlauf über alle 6350 wäre ein zweiter Netzwerk-Marathon und ist es nicht wert.
10. **Deterministisch** — kein Zufallselement, kein „Neu würfeln". Bei acht Alternativen je Slot liegt die Kontrolle beim Menschen, und reproduzierbare Ergebnisse sind erklärbar.

### Leitentscheidung: Veto statt Feinranking

Nach dem Wegfall der Favoriten (Ticket 02) gibt es kein menschliches Qualitätssignal mehr, und die konstruierten Signale sind grob. Eine gewichtete Punktzahl aus drei groben Signalen sähe präzise aus und wäre es nicht — sie würde vortäuschen, das Werkzeug wisse, welches Foto schöner ist. Es weiß es nicht. Also: **Schrott raus, Redundanz raus, gleichmäßig über die Zeit verteilen — die Kür macht der Mensch.**

### Kalibrierung (Monat 2025-01, 495 Bilder)

dHash-Hamming benachbarter Aufnahmen: Median **15** bei Abstand <10s, **32** bei Abstand 1–24h. Bis Schwelle 20 **null** Falsch-Verschmelzungen über Szenenwechsel hinweg; Schwelle 16 fängt 54,5 % der Serienpaare.

**Der wichtigste Nebenbefund:** die andere Hälfte der <10s-Paare sieht visuell deutlich verschieden aus (ein Kleinkind bewegt sich, die Kamera schwenkt). Diese Paare *sollen* getrennt bleiben — es sind zwei Momente, keine Redundanz. Rein zeitliches Clustern hätte sie verschmolzen und einen davon verworfen. Das ist die nachträgliche Rechtfertigung dafür, dass der Perceptual Hash primär ist und die Zeit nur das Fenster begrenzt.
