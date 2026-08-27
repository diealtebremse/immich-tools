import { bildUrl, gesichter, sucheAssets, type Asset } from '../immich/client'
import { ladeMerkmale, speichereMerkmale, type Merkmal } from '../store/cache'
import { dHash, schaerfe } from './hash'
import { kuratiere } from './kuratiere'
import type { Kandidat, KuratierOptionen, Slot } from './types'

export type Lauf = { phase: string; getan: number; gesamt: number }

const GLEICHZEITIG = 16

const ladeBild = (url: string): Promise<HTMLImageElement> =>
  new Promise((ja, nein) => {
    const bild = new Image()
    bild.onload = () => ja(bild)
    bild.onerror = () => nein(new Error(`Vorschaubild nicht ladbar: ${url}`))
    bild.src = url
  })

/** Arbeitet die Liste mit fester Parallelitaet ab, statt tausende Anfragen loszulassen. */
const inHaeppchen = async <T>(
  posten: T[],
  arbeit: (p: T) => Promise<void>,
  melde: (getan: number) => void,
): Promise<void> => {
  let naechster = 0
  let getan = 0
  await Promise.all(
    Array.from({ length: Math.min(GLEICHZEITIG, posten.length) }, async () => {
      while (naechster < posten.length) {
        const p = posten[naechster++]
        await arbeit(p).catch(() => undefined)
        melde(++getan)
      }
    }),
  )
}

export const zeitVon = (a: Asset): Date => new Date(a.localDateTime ?? a.fileCreatedAt)

export const erzeugeVorschlag = async (
  personIds: string[],
  opt: KuratierOptionen,
  melde: (l: Lauf) => void,
): Promise<{ slots: Slot[]; kandidaten: number; uebersprungen: number }> => {
  melde({ phase: 'Kandidaten suchen', getan: 0, gesamt: 0 })
  const assets = await sucheAssets(personIds, opt.start, opt.ende, (n) =>
    melde({ phase: 'Kandidaten suchen', getan: n, gesamt: 0 }),
  )
  const bilder = assets.filter((a) => a.type === 'IMAGE')

  const zwischenspeicher = await ladeMerkmale()
  const fehlende = bilder.filter((a) => !zwischenspeicher.has(a.id))
  const neue = new Map<string, Merkmal>()

  melde({ phase: 'Bildmerkmale berechnen', getan: 0, gesamt: fehlende.length })
  await inHaeppchen(
    fehlende,
    async (a) => {
      const bild = await ladeBild(bildUrl(a.id, 'thumbnail'))
      neue.set(a.id, { hash: dHash(bild).toString(), schaerfe: schaerfe(bild) })
    },
    (getan) => melde({ phase: 'Bildmerkmale berechnen', getan, gesamt: fehlende.length }),
  )
  await speichereMerkmale(neue)

  const alle = new Map([...zwischenspeicher, ...neue])
  const kandidaten: Kandidat[] = bilder.flatMap((a) => {
    const m = alle.get(a.id)
    return m ? [{ id: a.id, zeit: zeitVon(a), hash: BigInt(m.hash), schaerfe: m.schaerfe }] : []
  })

  melde({ phase: 'Auswahl berechnen', getan: 0, gesamt: 0 })
  return {
    slots: kuratiere(kandidaten, opt),
    kandidaten: kandidaten.length,
    uebersprungen: bilder.length - kandidaten.length,
  }
}

/**
 * Anteil der Bildflaeche, unter dem die Person als Beiwerk im Hintergrund gilt.
 * Am echten Bestand gemessen (75 Vorschlaege): Median 2,08 %, p10 0,69 %, p5 0,48 %.
 * 0,5 % trifft die 7 % klarer Hintergrundfaelle; jeder hoehere Wert faengt an,
 * normale Bildausschnitte zu ueberstimmen (1,5 % haette 27 % getauscht).
 */
export const GESICHT_MINDESTANTEIL = 0.005

/**
 * Nachgelagerte Gesichtspruefung. Nur fuer die Vorschlaege und je zwei Alternativen -
 * die Gesichtsabfrage kostet eine Anfrage pro Asset und hat keine Sammelvariante.
 */
export const pruefeGesichter = async (
  slots: Slot[],
  personIds: string[],
  melde: (l: Lauf) => void,
): Promise<Slot[]> => {
  const zuPruefen = new Map<string, Slot[]>()
  for (const s of slots) {
    for (const id of [s.aktuell, ...s.alternativen.slice(0, 2)]) {
      const liste = zuPruefen.get(id)
      if (liste) liste.push(s)
      else zuPruefen.set(id, [s])
    }
  }
  const anteil = new Map<string, number>()
  const ids = [...zuPruefen.keys()]
  melde({ phase: 'Gesichter pruefen', getan: 0, gesamt: ids.length })
  await inHaeppchen(
    ids,
    async (id) => {
      const gefunden = await gesichter(id)
      const meine = gefunden.filter((g) => g.person && personIds.includes(g.person.id))
      // Kein passendes Gesicht widerspricht der Personensuche, die das Asset geliefert hat.
      // Dann liegt ein Datenwiderspruch vor, kein zu kleines Gesicht - also behalten.
      if (meine.length === 0) return
      anteil.set(
        id,
        Math.max(
          ...meine.map(
            (g) =>
              ((g.boundingBoxX2 - g.boundingBoxX1) * (g.boundingBoxY2 - g.boundingBoxY1)) /
              (g.imageWidth * g.imageHeight),
          ),
        ),
      )
    },
    (getan) => melde({ phase: 'Gesichter pruefen', getan, gesamt: ids.length }),
  )

  return slots.map((s) => {
    if ((anteil.get(s.aktuell) ?? 1) >= GESICHT_MINDESTANTEIL) return s
    const ersatz = s.alternativen
      .slice(0, 2)
      .find((id) => (anteil.get(id) ?? 1) >= GESICHT_MINDESTANTEIL)
    return ersatz ? { ...s, aktuell: ersatz } : s
  })
}
