import { describe, expect, it } from 'vitest'
import { kuratiere } from './kuratiere'
import type { Kandidat } from './types'
import { STANDARD_OPTIONEN } from './types'

const JAHR = { start: new Date('2024-01-01T00:00:00'), ende: new Date('2025-01-01T00:00:00') }

/** Hash mit n gesetzten Bits ab Position 0 - erlaubt exakte Hamming-Abstaende im Test. */
const bits = (n: number): bigint => (n === 0 ? 0n : (1n << BigInt(n)) - 1n)

const kandidat = (
  id: string,
  zeit: string,
  hash: bigint = 0n,
  schaerfe = 1000,
): Kandidat => ({ id, zeit: new Date(zeit), hash, schaerfe })

/** n Aufnahmen desselben Moments, im Sekundentakt. */
const serie = (praefix: string, beginn: string, n: number, hash: bigint): Kandidat[] =>
  Array.from({ length: n }, (_, i) =>
    kandidat(`${praefix}-${i}`, new Date(new Date(beginn).getTime() + i * 3000).toISOString(), hash),
  )

const opts = (over: Partial<typeof STANDARD_OPTIONEN> = {}) => ({
  ...STANDARD_OPTIONEN,
  ...JAHR,
  ...over,
})

describe('kuratiere', () => {
  it('macht aus einer Serie fast gleicher Aufnahmen einen Slot und bietet den Rest als Alternativen an', () => {
    const serie = [
      kandidat('a', '2024-03-10T14:00:00', bits(0)),
      kandidat('b', '2024-03-10T14:00:03', bits(1)),
      kandidat('c', '2024-03-10T14:00:06', bits(2)),
      kandidat('d', '2024-03-10T14:00:09', bits(3)),
      kandidat('e', '2024-03-10T14:00:12', bits(4)),
    ]

    const slots = kuratiere(serie, opts({ proJahr: 1 }))

    expect(slots).toHaveLength(1)
    expect(slots[0].clusterGroesse).toBe(5)
    expect(slots[0].alternativen).toHaveLength(4)
    expect([slots[0].aktuell, ...slots[0].alternativen].sort()).toEqual([
      'a', 'b', 'c', 'd', 'e',
    ])
  })

  it('laesst einen einzelnen Tag keine zwei Plaetze belegen, solange andere Tage frei sind', () => {
    // Zwei Momente am 10., einer am 20. Nach Groesse allein gewaennen beide vom 10.
    const kandidaten = [
      ...serie('gross', '2024-03-10T10:00:00', 10, bits(0)),
      ...serie('mittel', '2024-03-10T18:00:00', 8, bits(40)),
      ...serie('klein', '2024-03-20T10:00:00', 3, bits(0)),
    ]

    const slots = kuratiere(kandidaten, opts({ proJahr: 2 }))

    expect(slots.map((s) => s.tag)).toEqual(['2024-03-10', '2024-03-20'])
    expect(slots.map((s) => s.clusterGroesse)).toEqual([10, 3])
  })

  it('uebergeht eine verwackelte letzte Aufnahme und bietet sie auch nicht als Alternative an', () => {
    const kandidaten = [
      kandidat('scharf-1', '2024-03-10T10:00:00', bits(0), 1000),
      kandidat('scharf-2', '2024-03-10T10:00:03', bits(0), 1000),
      kandidat('scharf-3', '2024-03-10T10:00:06', bits(0), 1000),
      kandidat('verwackelt', '2024-03-10T10:00:09', bits(0), 100),
    ]

    const slots = kuratiere(kandidaten, opts({ proJahr: 1 }))

    expect(slots[0].aktuell).toBe('scharf-3')
    expect(slots[0].alternativen).not.toContain('verwackelt')
    // Die Groesse bleibt das Bedeutungsmass - auch Ausschuss zaehlt als Ausloesung.
    expect(slots[0].clusterGroesse).toBe(4)
  })

  it('behaelt den einzigen Kandidaten eines Clusters, auch wenn er unscharf ist', () => {
    const slots = kuratiere(
      [kandidat('allein', '2024-03-10T10:00:00', bits(0), 1)],
      opts({ proJahr: 1 }),
    )

    expect(slots).toHaveLength(1)
    expect(slots[0].aktuell).toBe('allein')
  })

  it('verschmilzt zwei aehnliche Aufnahmen nicht, wenn sie an verschiedenen Tagen entstanden', () => {
    // Identischer Hash, aber ein Moment ueberspannt keine Tage.
    const kandidaten = [
      kandidat('montag', '2024-03-10T10:00:00', bits(0)),
      kandidat('dienstag', '2024-03-11T10:00:00', bits(0)),
    ]

    const slots = kuratiere(kandidaten, opts({ proJahr: 2 }))

    expect(slots).toHaveLength(2)
    expect(slots.map((s) => s.clusterGroesse)).toEqual([1, 1])
  })

  it('trifft die Zielgroesse und laesst keinen Monat aus', () => {
    // Zwoelf Monate, je vier eigenstaendige Momente an verschiedenen Tagen.
    const kandidaten = Array.from({ length: 12 }, (_, m) =>
      Array.from({ length: 4 }, (_, d) =>
        serie(
          `m${m}-d${d}`,
          `2024-${String(m + 1).padStart(2, '0')}-0${d + 1}T10:00:00`,
          2,
          bits(d * 20),
        ),
      ).flat(),
    ).flat()

    const slots = kuratiere(kandidaten, opts({ proJahr: 25 }))

    expect(slots).toHaveLength(25)
    expect(new Set(slots.map((s) => s.monat)).size).toBe(12)
  })

  it('vergibt je Lebensjahr die volle Zielgroesse ueber einen Mehrjahreszeitraum', () => {
    const kandidaten = Array.from({ length: 36 }, (_, i) => {
      const jahr = 2024 + Math.floor(i / 12)
      const monat = String((i % 12) + 1).padStart(2, '0')
      return Array.from({ length: 3 }, (_, d) =>
        serie(`j${i}-${d}`, `${jahr}-${monat}-0${d + 1}T10:00:00`, 2, bits(d * 20)),
      ).flat()
    }).flat()

    const slots = kuratiere(kandidaten, {
      ...STANDARD_OPTIONEN,
      start: new Date('2024-01-01T00:00:00'),
      ende: new Date('2027-01-01T00:00:00'),
      proJahr: 25,
    })

    expect(slots).toHaveLength(75)
    expect([1, 2, 3].map((j) => slots.filter((s) => s.jahr === j).length)).toEqual([25, 25, 25])
  })

  it('vergibt weniger Plaetze als die Quote, wenn ein Monat zu wenig Momente hat', () => {
    const slots = kuratiere(
      serie('einziger', '2024-03-10T10:00:00', 3, bits(0)),
      opts({ proJahr: 5 }),
    )

    expect(slots).toHaveLength(1)
  })

  it('bietet auch einem einelementigen Cluster Alternativen aus seiner Umgebung an', () => {
    const kandidaten = [
      kandidat('allein', '2024-03-10T10:00:00', bits(0)),
      ...serie('anderer-tag', '2024-03-20T10:00:00', 5, bits(40)),
    ]

    const slots = kuratiere(kandidaten, opts({ proJahr: 1 }))

    expect(slots[0].alternativen.length).toBeGreaterThan(0)
    expect(slots[0].alternativen).not.toContain(slots[0].aktuell)
  })

  it('liefert bei gleicher Eingabe dieselbe Ausgabe', () => {
    const kandidaten = Array.from({ length: 40 }, (_, i) =>
      kandidat(
        `k${i}`,
        `2024-0${(i % 9) + 1}-1${i % 10}T1${i % 10}:00:00`,
        bits(i % 60),
        500 + (i % 7) * 100,
      ),
    )

    const a = kuratiere(kandidaten, opts())
    const b = kuratiere([...kandidaten].reverse(), opts())

    expect(a).toEqual(b)
  })
})
