# Verfahren zur Serien- und Ähnlichkeitserkennung

Type: research
Status: resolved
Blocked by: 01

## Question

Aus acht fast identischen Bildern derselben Minute soll eines im Vorschlag landen — die anderen sieben bleiben als Alternativen für den Austausch-Klick daran hängen. Welche Verfahren sind mit den Daten, die die API tatsächlich liefert, überhaupt möglich?

Zu untersuchen:

- **Rein zeitlich** — Cluster über Lücken zwischen Aufnahmezeitpunkten. Wie robust ist das, und wie wählt man die Schwelle? Reicht das allein?
- **Immichs eigene Duplikaterkennung** — gibt es sie, ist sie per API abfragbar, und erkennt sie „ähnlich" oder nur „identisch"?
- **CLIP-Embeddings** — legt Immich pro Asset ein Embedding an, ist es über die API erreichbar, und ließe sich damit im Browser eine Ähnlichkeitsgruppierung rechnen? Wie teuer wäre das bei einigen tausend Assets?
- **Bildbasiert im Client** — Thumbnails laden und einen Perceptual Hash rechnen. Wie viele Thumbnails muss man dafür ziehen, und was kostet das an Zeit gegen einen LAN-Server?

Zweiter Teil: **Ranking innerhalb eines Clusters.** Welche Signale zur Bildqualität sind erreichbar — Auflösung, EXIF-Hinweise, Schärfemaß aus dem Thumbnail, Größe des erkannten Gesichts, Anzahl Personen im Bild? Was davon ist billig genug, um es für alle Kandidaten zu rechnen?

Ergebnis soll eine Empfehlung mit Begründung und geschätzten Kosten sein, keine Implementierung.

## Answer

Vollständiger Bericht: [`../research/03-clustering-ranking.md`](../research/03-clustering-ranking.md). Verifiziert gegen v3.1.0.

**Immichs `/api/duplicates` fällt aus.** Default `maxDistance = 0.01` CLIP-Cosinus-Distanz (`server/src/config.ts`) — das ist auf fast identische Re-Encodes getrimmt, nicht auf die Varianz innerhalb einer Serie. Nicht pro Request konfigurierbar, und die rohen Distanzen kommen nicht mit. Als Clustering-Primitive unbrauchbar.

**Empfohlene Staffelung**, Kosten steigend:

1. **Alle Kandidaten, gratis** — zeitliche Vorclusterung über `fileCreatedAt`-Abstände plus EXIF-Heuristiken (Auflösung, `exposureTime`, `iso`), die ohnehin schon in der `search/metadata`-Antwort stecken.
2. **Alle Kandidaten, ein Request pro Bild** — `size=thumbnail` (250px WebP, Default in `config.ts`) laden, darauf `blockhash-core` für den Perceptual Hash (reines JS, keine Abhängigkeiten, nimmt browser-`ImageData` direkt, kein WASM) und aus demselben Bild ein grobes Schärfemaß über Laplace-Varianz. **Wichtige Einschränkung:** herunterskalierte Schärfe taugt nur zum Aussortieren klar verwackelter Bilder, nicht zum Feinvergleich zweier brauchbarer Aufnahmen.
3. **Nur die Shortlist (Top 2–3 je Cluster)** — `GET /api/faces` für Gesichtsgröße und -anzahl. Bestätigt: ein Request pro Asset, keine Bulk-Variante (`FaceDto` nimmt eine einzelne `id`).
4. **Nur die engste Auswahl** — `size=preview` (1440px) für eine feinere Schärfeprüfung dort, wo sie zählt.
5. **Gestrichen: Augen offen / Lächeln.** Bräuchte face-api.js oder MediaPipe Face Landmarker (~3,76 MB Modell). Für ein Werkzeug dieser Größe unwirtschaftlich — diese Entscheidung bleibt beim Menschen im Austausch-Dialog.

**Kostenschätzung:** ~2000–4000 Thumbnail-Requests (~20–60 MB, ~30–90 s im LAN) + ~300–900 Face-Requests für die Shortlist (~10–40 s). Gesamtlauf grob 1–3 Minuten.

**Zwei Vorbehalte, die erst Ticket 02 auflöst:**
1. Liegt die Kandidatenzahl deutlich über ~4000, wird Stufe 2 zum Flaschenhals und braucht ein härteres Vorfilter *vor* dem ersten Netzwerkzugriff.
2. Ist die Verteilung der Aufnahmeabstände **bimodal** (klare Serienlücken gegen Sprünge zwischen Ereignissen), genügt der zeitliche Vorfilter. Ist sie **verschmiert**, muss der Perceptual Hash zum primären Clustering-Signal werden und die Zeit nur noch das Vergleichsfenster begrenzen statt hart zu schneiden.
