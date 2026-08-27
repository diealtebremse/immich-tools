import { useEffect } from 'react'
import { bildUrl } from '../immich/client'
import type { Slot } from '../domain/types'

type Props = {
  slots: Slot[]
  /** Die gerade angebotenen Alternativen - waechst, wenn nachgeladen wird. */
  auswahl: string[]
  index: number
  setzeIndex: (i: number) => void
  tausche: (id: string) => void
  bestaetige: () => void
  schalteLeer: () => void
  mehrAlternativen: () => void
  fertig: () => void
}

export const Fokus = ({
  slots, auswahl, index, setzeIndex, tausche, bestaetige, schalteLeer, mehrAlternativen, fertig,
}: Props) => {
  const slot = slots[index]

  useEffect(() => {
    const taste = (e: KeyboardEvent) => {
      if (e.metaKey || e.ctrlKey) return
      if (e.key === 'ArrowRight') setzeIndex(Math.min(slots.length - 1, index + 1))
      else if (e.key === 'ArrowLeft') setzeIndex(Math.max(0, index - 1))
      else if (e.key === ' ') { e.preventDefault(); bestaetige() }
      else if (e.key.toLowerCase() === 'x') schalteLeer()
      else if (/^[1-9]$/.test(e.key)) {
        const ziel = auswahl[Number(e.key) - 1]
        if (ziel) tausche(ziel)
      }
    }
    window.addEventListener('keydown', taste)
    return () => window.removeEventListener('keydown', taste)
  }, [index, slots, auswahl, setzeIndex, bestaetige, schalteLeer, tausche])

  // Nachbarn vorladen, damit sich das Blaettern verzoegerungsfrei anfuehlt.
  useEffect(() => {
    for (const n of [index + 1, index - 1]) {
      if (slots[n]) new Image().src = bildUrl(slots[n].aktuell, 'preview')
    }
  }, [index, slots])

  return (
    <div className="fokus">
      <img className="gross" src={bildUrl(slot.aktuell, 'preview')} alt="" />
      <div className="leise">
        Platz {index + 1} von {slots.length} · {slot.monat} · {slot.clusterGroesse}{' '}
        {slot.clusterGroesse === 1 ? 'Aufnahme' : 'Aufnahmen'} von diesem Moment
        {slot.bestaetigt && ' · ✓ bestätigt'}
        {slot.leer && ' · leer gelassen'}
      </div>
      <div className="streifen">
        {auswahl.map((id, i) => (
          <figure key={id}>
            <img src={bildUrl(id, 'thumbnail')} alt="" onClick={() => tausche(id)} />
            <div className="taste">{i + 1}</div>
          </figure>
        ))}
        {slot.aktuell !== slot.vorschlag && (
          <figure>
            <img className="an" src={bildUrl(slot.vorschlag, 'thumbnail')} alt=""
              onClick={() => tausche(slot.vorschlag)} />
            <div className="taste">Original</div>
          </figure>
        )}
      </div>
      <div className="zeile">
        <button onClick={mehrAlternativen} disabled={auswahl.length >= slot.alternativen.length - 1}>
          Mehr Alternativen
        </button>
        <button onClick={schalteLeer}>{slot.leer ? 'Doch belegen' : 'Leer lassen (X)'}</button>
        <button className="haupt" onClick={bestaetige}>Bestätigen (Leertaste)</button>
        <button onClick={fertig}>Zur Gesamtschau →</button>
      </div>
      <div className="leise">← → blättern · Ziffern tauschen · Leertaste bestätigt · X lässt leer</div>
    </div>
  )
}
