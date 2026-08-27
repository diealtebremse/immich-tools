# CONTEXT

Glossar für den **Album-Kurator** — ein lokales Werkzeug, das aus einem Immich-Bestand ein kuratiertes Rückblickalbum vorschlägt.

Reines Vokabular. Keine Implementierungsdetails, keine Entscheidungen — die stehen in `.scratch/album-kurator/`.

## Begriffe

**Kandidat** — ein Bild, das durch das Personen- und Zeitsieb gekommen ist. Videos sind nie Kandidaten.

**Moment** — ein zusammenhängendes Stück Wirklichkeit, das fotografiert wurde: ein Kind am Strand, ein Kuchen mit Kerzen. Der fachliche Begriff; sein technisches Gegenstück ist der Cluster.

**Cluster** — die Gruppe von Kandidaten, die das Werkzeug demselben Moment zuordnet. Ein Cluster überspannt nie mehr als einen Kalendertag.

**Repräsentant** — der eine Kandidat eines Clusters, den das Werkzeug stellvertretend anbietet.

**Slot** — einer der Plätze im künftigen Album. Ihre Zahl steht vorab fest und wird auf Zeitfenster verteilt; ein Slot ist eine Position, kein Bild.

**Vorschlag** — der Kandidat, der einen Slot gerade belegt.

**Alternative** — ein Kandidat, der für einen Slot anstelle des Vorschlags angeboten wird. Alternativen stammen bevorzugt aus demselben Cluster.

**Quote** — die Zahl der Slots, die einem Zeitfenster zusteht. Sichert zu, dass das Album den ganzen Zeitraum erzählt und nicht nur seine fotogensten Wochen.

**Tageskappe** — die Obergrenze an Slots, die ein einzelner Kalendertag belegen darf. Verhindert, dass ein Ereignis einen ganzen Zeitraum verdrängt.

**Veto** — das Aussortieren eines Kandidaten wegen erkennbar mangelhafter Bildqualität. Bewusst schwach: es entfernt Schrott, es rangiert nicht.

## Abgrenzungen

**Kandidat vs. Vorschlag** — jeder Vorschlag ist ein Kandidat, aber von tausenden Kandidaten werden nur wenige zum Vorschlag.

**Slot vs. Vorschlag** — der Slot bleibt, sein Vorschlag wird ausgetauscht. Wer beides verwechselt, kann den Austausch nicht beschreiben.

**Veto vs. Ranking** — das Werkzeug maßt sich nicht an zu wissen, welches von zwei brauchbaren Fotos das schönere ist. Es entfernt Unbrauchbares und überlässt die Kür dem Menschen.
