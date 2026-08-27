import { bildUrl } from '../immich/client'
import type { Slot } from '../domain/types'

type Props = { slots: Slot[]; oeffne: (i: number) => void }

/**
 * Die Gesamtschau vor dem Schreiben. Variante C zeigt immer nur einen Platz -
 * ohne diesen Blick merkt man nicht, dass ein Jahr nur Innenraeume enthaelt.
 */
export const Kontaktbogen = ({ slots, oeffne }: Props) => (
  <>
    {[1, 2, 3].map((jahr) => {
      const jahresSlots = slots.filter((s) => s.jahr === jahr)
      if (jahresSlots.length === 0) return null
      const belegt = jahresSlots.filter((s) => !s.leer).length
      return (
        <section key={jahr} style={{ marginBottom: 26 }}>
          <div className="leise" style={{ marginBottom: 8 }}>
            Lebensjahr {jahr} — {belegt} von {jahresSlots.length} Plätzen belegt
          </div>
          <div className="bogen">
            {jahresSlots.map((s) => (
              <div
                key={s.vorschlag}
                className={`zelle${s.leer ? ' leer' : ''}`}
                onClick={() => oeffne(slots.indexOf(s))}
              >
                <img src={bildUrl(s.aktuell, 'thumbnail')} alt="" loading="lazy" />
                <span className="marke">{s.monat.slice(5)}</span>
              </div>
            ))}
          </div>
        </section>
      )
    })}
  </>
)
