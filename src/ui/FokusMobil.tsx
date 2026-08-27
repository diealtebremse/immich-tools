import { useEffect, useRef, useState } from 'react'
import { bildUrl } from '../immich/client'
import type { Slot } from '../domain/types'

type Props = {
  slots: Slot[]
  auswahl: string[]
  index: number
  setzeIndex: (i: number) => void
  tausche: (id: string) => void
  bestaetige: () => void
  schalteLeer: () => void
  mehrAlternativen: () => void
  fertig: () => void
}

const WISCH_SCHWELLE = 55

/**
 * Touch-Variante. Dieselbe Aufgabe wie Fokus, aber: Wischen ersetzt die Pfeiltasten,
 * das Bild bekommt so viel Hoehe wie moeglich, und alles Bedienbare sitzt unten
 * in Daumenreichweite.
 */
export const FokusMobil = ({
  slots, auswahl, index, setzeIndex, tausche, bestaetige, schalteLeer, mehrAlternativen, fertig,
}: Props) => {
  const slot = slots[index]
  const start = useRef<{ x: number; y: number } | null>(null)
  const [wisch, setzeWisch] = useState(0)

  useEffect(() => setzeWisch(0), [index])

  const bei = {
    onTouchStart: (e: React.TouchEvent) => {
      const t = e.touches[0]
      start.current = { x: t.clientX, y: t.clientY }
    },
    onTouchMove: (e: React.TouchEvent) => {
      if (!start.current) return
      const t = e.touches[0]
      const dx = t.clientX - start.current.x
      // Nur mitziehen, wenn die Geste wirklich waagerecht ist - sonst blockiert
      // sie das Scrollen im Alternativstreifen.
      if (Math.abs(dx) > Math.abs(t.clientY - start.current.y)) setzeWisch(dx)
    },
    onTouchEnd: () => {
      if (Math.abs(wisch) > WISCH_SCHWELLE) {
        const ziel = wisch < 0 ? index + 1 : index - 1
        if (slots[ziel]) setzeIndex(ziel)
      }
      setzeWisch(0)
      start.current = null
    },
  }

  return (
    <div className="mobil">
      <div className="mobil-kopf">
        <span>
          {index + 1} / {slots.length}
        </span>
        <span className="leise">
          {slot.monat} · {slot.clusterGroesse}{' '}
          {slot.clusterGroesse === 1 ? 'Aufnahme' : 'Aufnahmen'}
        </span>
        <button onClick={fertig}>Gesamtschau</button>
      </div>

      <div className="mobil-buehne" {...bei}>
        <img
          src={bildUrl(slot.aktuell, 'preview')}
          alt=""
          style={{
            transform: `translateX(${wisch * 0.35}px)`,
            opacity: 1 - Math.min(0.5, Math.abs(wisch) / 400),
          }}
        />
        {(slot.bestaetigt || slot.leer) && (
          <span className={`mobil-marke${slot.leer ? ' leer' : ''}`}>
            {slot.leer ? 'leer gelassen' : '✓ bestätigt'}
          </span>
        )}
      </div>

      <div className="mobil-streifen">
        {auswahl.map((id) => (
          <img key={id} src={bildUrl(id, 'thumbnail')} alt="" onClick={() => tausche(id)} />
        ))}
        {slot.aktuell !== slot.vorschlag && (
          <img
            className="an"
            src={bildUrl(slot.vorschlag, 'thumbnail')}
            alt=""
            onClick={() => tausche(slot.vorschlag)}
          />
        )}
        {auswahl.length < slot.alternativen.length - 1 && (
          <button className="mobil-mehr" onClick={mehrAlternativen}>
            mehr
          </button>
        )}
      </div>

      <div className="mobil-fuss">
        <button onClick={() => setzeIndex(Math.max(0, index - 1))} disabled={index === 0}>
          ←
        </button>
        <button onClick={schalteLeer}>{slot.leer ? 'Belegen' : 'Leer'}</button>
        <button className="haupt breit" onClick={bestaetige}>
          Bestätigen
        </button>
        <button
          onClick={() => setzeIndex(Math.min(slots.length - 1, index + 1))}
          disabled={index === slots.length - 1}
        >
          →
        </button>
      </div>
      <div className="leise mobil-hinweis">Wischen blättert · Tippen tauscht</div>
    </div>
  )
}
