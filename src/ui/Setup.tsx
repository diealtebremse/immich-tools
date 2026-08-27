import { useState } from 'react'
import type { Person } from '../immich/client'

type Props = {
  personen: Person[]
  start: () => void
  gewaehlt: string[]
  setzeGewaehlt: (ids: string[]) => void
  von: string
  setzeVon: (s: string) => void
  bis: string
  setzeBis: (s: string) => void
  proJahr: number
  setzeProJahr: (n: number) => void
  zwischenspeicherLeeren: () => void
}

export const Setup = ({
  personen, start, gewaehlt, setzeGewaehlt, von, setzeVon, bis, setzeBis,
  proJahr, setzeProJahr, zwischenspeicherLeeren,
}: Props) => {
  const [filter, setzeFilter] = useState('')
  const sichtbar = personen.filter((p) =>
    p.name.toLowerCase().includes(filter.toLowerCase()),
  )
  const umschalten = (id: string) =>
    setzeGewaehlt(gewaehlt.includes(id) ? gewaehlt.filter((x) => x !== id) : [...gewaehlt, id])

  return (
    <>
      <div className="feld">
        <label>
          Person — mehrere wählbar, falls die Gesichtserkennung dieselbe Person mehrfach angelegt hat
        </label>
        <input
          placeholder="Namen filtern…"
          value={filter}
          onChange={(e) => setzeFilter(e.target.value)}
          style={{ marginBottom: 8 }}
        />
        <div className="personen">
          {sichtbar.map((p) => (
            <label key={p.id} className={gewaehlt.includes(p.id) ? 'an' : ''}>
              <input
                type="checkbox"
                checked={gewaehlt.includes(p.id)}
                onChange={() => umschalten(p.id)}
              />
              <span>
                {p.name}
                {p.birthDate && <span className="leise"> · {p.birthDate.slice(0, 4)}</span>}
              </span>
            </label>
          ))}
        </div>
      </div>

      <div className="zeile" style={{ marginBottom: 18 }}>
        <div className="feld" style={{ marginBottom: 0 }}>
          <label>Von</label>
          <input type="date" value={von} onChange={(e) => setzeVon(e.target.value)} />
        </div>
        <div className="feld" style={{ marginBottom: 0 }}>
          <label>Bis</label>
          <input type="date" value={bis} onChange={(e) => setzeBis(e.target.value)} />
        </div>
        <div className="feld" style={{ marginBottom: 0 }}>
          <label>Bilder pro Lebensjahr</label>
          <input
            type="number"
            min={1}
            max={200}
            value={proJahr}
            onChange={(e) => setzeProJahr(Number(e.target.value))}
            style={{ width: 90 }}
          />
        </div>
      </div>

      <div className="zeile">
        <button className="haupt" onClick={start} disabled={gewaehlt.length === 0}>
          Vorschlag erzeugen
        </button>
        <button onClick={zwischenspeicherLeeren}>Zwischenspeicher leeren</button>
      </div>
      <p className="leise" style={{ marginTop: 14 }}>
        Der erste Lauf lädt für jedes Bild ein Vorschaubild und dauert einige Minuten. Danach
        kostet nur noch, was seither hinzugekommen ist.
      </p>
    </>
  )
}
