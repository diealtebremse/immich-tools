import type { Cluster, Kandidat, KuratierOptionen, Slot } from './types'

const tagVon = (d: Date): string =>
  `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`

const monatVon = (tag: string): string => tag.slice(0, 7)

export const hamming = (a: bigint, b: bigint): number => {
  let x = a ^ b
  let n = 0
  while (x) {
    x &= x - 1n
    n++
  }
  return n
}

/**
 * Gruppiert die Kandidaten eines Tages zu Momenten. Transitiv: was mit demselben
 * Kandidaten verwandt ist, landet im selben Cluster.
 */
const clustereTag = (kandidaten: Kandidat[], schwelle: number): Kandidat[][] => {
  const eltern = kandidaten.map((_, i) => i)
  const finde = (i: number): number => {
    while (eltern[i] !== i) {
      eltern[i] = eltern[eltern[i]]
      i = eltern[i]
    }
    return i
  }
  for (let i = 0; i < kandidaten.length; i++) {
    for (let j = i + 1; j < kandidaten.length; j++) {
      if (finde(i) === finde(j)) continue
      if (hamming(kandidaten[i].hash, kandidaten[j].hash) <= schwelle) {
        eltern[finde(j)] = finde(i)
      }
    }
  }
  const eimer = new Map<number, Kandidat[]>()
  kandidaten.forEach((k, i) => {
    const wurzel = finde(i)
    const vorhanden = eimer.get(wurzel)
    if (vorhanden) vorhanden.push(k)
    else eimer.set(wurzel, [k])
  })
  return [...eimer.values()]
}

const median = (werte: number[]): number => {
  const s = [...werte].sort((a, b) => a - b)
  const m = Math.floor(s.length / 2)
  return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2
}

/**
 * Entfernt erkennbar verwackelte Aufnahmen - bewusst zahnlos. Auf 250px-Vorschaubildern
 * trennt das Schaerfemass nur klar Verwackeltes, nicht zwei brauchbare Aufnahmen
 * (gemessen: zwischen Median und 5. Perzentil liegt nur Faktor 1,9). Deshalb relativ
 * zum eigenen Cluster statt absolut, und nie bis zur Leere.
 */
const veto = (mitglieder: Kandidat[], faktor: number): Kandidat[] => {
  if (mitglieder.length < 2) return mitglieder
  const schwelle = faktor * median(mitglieder.map((k) => k.schaerfe))
  const verblieben = mitglieder.filter((k) => k.schaerfe >= schwelle)
  return verblieben.length > 0 ? verblieben : mitglieder
}

/** Kanonische Reihenfolge. Ohne sie haengt das Ergebnis an der Reihenfolge der Eingabe. */
const chronologisch = (kandidaten: Kandidat[]): Kandidat[] =>
  [...kandidaten].sort(
    (a, b) => a.zeit.getTime() - b.zeit.getTime() || (a.id < b.id ? -1 : a.id > b.id ? 1 : 0),
  )

const baueCluster = (kandidaten: Kandidat[], opt: KuratierOptionen): Cluster[] => {
  const nachTag = new Map<string, Kandidat[]>()
  for (const k of chronologisch(kandidaten)) {
    const tag = tagVon(k.zeit)
    const vorhanden = nachTag.get(tag)
    if (vorhanden) vorhanden.push(k)
    else nachTag.set(tag, [k])
  }
  const cluster: Cluster[] = []
  for (const [tag, gruppe] of [...nachTag].sort(([a], [b]) => (a < b ? -1 : 1))) {
    for (const mitglieder of clustereTag(gruppe, opt.hammingSchwelle)) {
      const verblieben = veto(mitglieder, opt.vetoFaktor)
      cluster.push({
        tag,
        mitglieder,
        verblieben,
        // Man drueckt weiter ab, bis es passt: das letzte Bild traegt die Entscheidung.
        repraesentant: verblieben[verblieben.length - 1],
      })
    }
  }
  return cluster
}

/** Verteilt `gesamt` Plaetze moeglichst gleichmaessig auf `anzahl` Faecher. */
const groessterRest = (anzahl: number, gesamt: number): number[] => {
  const roh = Array.from({ length: anzahl }, () => gesamt / anzahl)
  const basis = roh.map((x) => Math.floor(x))
  const rest = gesamt - basis.reduce((a, b) => a + b, 0)
  const reihenfolge = roh
    .map((x, i) => ({ i, r: x - basis[i] }))
    .sort((a, b) => b.r - a.r)
  for (let n = 0; n < rest; n++) basis[reihenfolge[n].i]++
  return basis
}

const tagesAbstand = (a: string, b: string): number =>
  Math.abs((Date.parse(a) - Date.parse(b)) / 86_400_000)

/**
 * Waehlt die Cluster, die die Plaetze eines Monats belegen. Groesse entscheidet,
 * aber ein Tag belegt hoechstens einen Platz, solange genug Tage da sind - sonst
 * fraesse ein einzelner Urlaubstag den ganzen Monat. Der Mindestabstand wird
 * gelockert, bis die Quote gefuellt ist.
 */
const waehleMonatsCluster = (nachGroesse: Cluster[], plaetze: number): Cluster[] => {
  const tage = new Set(nachGroesse.map((c) => c.tag)).size
  const einTagEinPlatz = tage >= plaetze
  const gewaehlt: Cluster[] = []
  for (const mindestAbstand of [5, 2, 0]) {
    for (const c of nachGroesse) {
      if (gewaehlt.length >= plaetze) break
      if (gewaehlt.includes(c)) continue
      if (einTagEinPlatz && gewaehlt.some((g) => g.tag === c.tag)) continue
      if (mindestAbstand > 0 && gewaehlt.some((g) => tagesAbstand(g.tag, c.tag) < mindestAbstand)) {
        continue
      }
      gewaehlt.push(c)
    }
    if (gewaehlt.length >= plaetze) break
  }
  return gewaehlt
}

const sammleAlternativen = (
  cluster: Cluster,
  monatsCluster: Cluster[],
  anzahl: number,
): string[] => {
  const gesehen = new Set([cluster.repraesentant.id])
  const alternativen: string[] = []
  const geschwister = [...cluster.verblieben].reverse()
  const selberTag = monatsCluster
    .filter((c) => c !== cluster && c.tag === cluster.tag)
    .flatMap((c) => c.verblieben)
  const selberMonat = monatsCluster
    .filter((c) => c !== cluster && c.tag !== cluster.tag)
    .flatMap((c) => c.verblieben)
  for (const topf of [geschwister, selberTag, selberMonat]) {
    for (const k of topf) {
      if (alternativen.length >= anzahl) return alternativen
      if (gesehen.has(k.id)) continue
      gesehen.add(k.id)
      alternativen.push(k.id)
    }
  }
  return alternativen
}

export const kuratiere = (kandidaten: Kandidat[], opt: KuratierOptionen): Slot[] => {
  const cluster = baueCluster(kandidaten, opt)
  const slots: Slot[] = []

  for (let jahr = 1; ; jahr++) {
    const von = new Date(opt.start)
    von.setFullYear(von.getFullYear() + jahr - 1)
    if (von >= opt.ende) break
    const bis = new Date(opt.start)
    bis.setFullYear(bis.getFullYear() + jahr)

    const jahresCluster = cluster.filter((c) => {
      const t = c.repraesentant.zeit
      return t >= von && t < bis && t < opt.ende
    })
    const monate = [...new Set(jahresCluster.map((c) => monatVon(c.tag)))].sort()
    if (monate.length === 0) continue
    const quote = groessterRest(monate.length, opt.proJahr)

    monate.forEach((monat, idx) => {
      const monatsCluster = jahresCluster
        .filter((c) => monatVon(c.tag) === monat)
        // Die Clustergroesse ist das Bedeutungsmass: haeufig fotografiert = wichtig.
        // Der Repraesentant entscheidet Gleichstaende, damit die Wahl eindeutig bleibt.
        .sort(
          (a, b) =>
            b.mitglieder.length - a.mitglieder.length ||
            a.repraesentant.zeit.getTime() - b.repraesentant.zeit.getTime() ||
            (a.repraesentant.id < b.repraesentant.id ? -1 : 1),
        )
      for (const c of waehleMonatsCluster(monatsCluster, quote[idx])) {
        slots.push({
          jahr,
          monat,
          tag: c.tag,
          clusterGroesse: c.mitglieder.length,
          vorschlag: c.repraesentant.id,
          aktuell: c.repraesentant.id,
          alternativen: sammleAlternativen(c, monatsCluster, opt.alternativen),
          bestaetigt: false,
          leer: false,
        })
      }
    })
  }

  return slots.sort(
    (a, b) => (a.tag < b.tag ? -1 : a.tag > b.tag ? 1 : 0) || (a.vorschlag < b.vorschlag ? -1 : 1),
  )
}
