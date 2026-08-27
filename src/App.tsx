import { useCallback, useEffect, useMemo, useState } from 'react'
import {
  albenNamen, legeAlbumAn, personen as holePersonen, serverVersion, ImmichFehler,
  type Person,
} from './immich/client'
import { erzeugeVorschlag, pruefeGesichter, type Lauf } from './domain/pipeline'
import { STANDARD_OPTIONEN, type Slot } from './domain/types'
import { ladeFortschritt, leereMerkmale, speichereFortschritt, verwirfFortschritt } from './store/cache'
import { Fokus } from './ui/Fokus'
import { FokusMobil } from './ui/FokusMobil'
import { useSchmalesGeraet } from './ui/useSchmalesGeraet'
import { Kontaktbogen } from './ui/Kontaktbogen'
import { Setup } from './ui/Setup'

declare const __IMMICH_URL__: string

type Phase = 'setup' | 'laden' | 'fokus' | 'bogen' | 'fertig'

/** Angebot je Slot; gezeigt werden acht auf einmal, der Rest auf Knopfdruck. */
const ALTERNATIVEN_VORRAT = 24
const SCHRITT = 8
const ERWARTETE_VERSION = '3.1.0'

export const App = () => {
  const schmal = useSchmalesGeraet()
  const [phase, setzePhase] = useState<Phase>('setup')
  const [personen, setzePersonen] = useState<Person[]>([])
  const [gewaehlt, setzeGewaehlt] = useState<string[]>([])
  const [von, setzeVon] = useState('2023-08-29')
  const [bis, setzeBis] = useState('2026-08-29')
  const [proJahr, setzeProJahr] = useState(STANDARD_OPTIONEN.proJahr)
  const [slots, setzeSlots] = useState<Slot[]>([])
  const [index, setzeIndex] = useState(0)
  const [angeboten, setzeAngeboten] = useState<Record<number, number>>({})
  const [lauf, setzeLauf] = useState<Lauf | null>(null)
  const [fehler, setzeFehler] = useState<string | null>(null)
  const [hinweis, setzeHinweis] = useState<string | null>(null)
  const [albumName, setzeAlbumName] = useState('')
  const [albumId, setzeAlbumId] = useState<string | null>(null)
  const [schreibt, setzeSchreibt] = useState(false)

  const schluessel = useMemo(
    () => `${[...gewaehlt].sort().join(',')}|${von}|${bis}|${proJahr}`,
    [gewaehlt, von, bis, proJahr],
  )

  useEffect(() => {
    void (async () => {
      try {
        const version = await serverVersion()
        if (version !== ERWARTETE_VERSION) {
          setzeHinweis(
            `Dein Server läuft auf Immich ${version}, geplant war ${ERWARTETE_VERSION}. ` +
              'Wenn Abfragen fehlschlagen, liegt es vermutlich daran.',
          )
        }
        setzePersonen(await holePersonen())
      } catch (e) {
        setzeFehler(e instanceof Error ? e.message : String(e))
      }
    })()
  }, [])

  // Fortschritt nach jeder Entscheidung sichern - 75 Entscheidungen sind eine halbe Stunde.
  const aktualisiere = useCallback(
    (naechste: Slot[]) => {
      setzeSlots(naechste)
      void speichereFortschritt(schluessel, naechste)
    },
    [schluessel],
  )

  const starte = async () => {
    setzeFehler(null)
    setzePhase('laden')
    try {
      const opt = {
        ...STANDARD_OPTIONEN,
        start: new Date(`${von}T00:00:00`),
        ende: new Date(`${bis}T00:00:00`),
        proJahr,
        alternativen: ALTERNATIVEN_VORRAT,
      }
      const { slots: frische, kandidaten, uebersprungen } = await erzeugeVorschlag(
        gewaehlt, opt, setzeLauf,
      )
      const geprueft = await pruefeGesichter(frische, gewaehlt, setzeLauf)
      const gesichert = await ladeFortschritt(schluessel)
      const passend =
        gesichert?.length === geprueft.length &&
        gesichert.every((s, i) => s.vorschlag === geprueft[i].vorschlag)
      aktualisiere(passend ? gesichert : geprueft)
      setzeIndex(0)
      setzeAngeboten({})
      setzeHinweis(
        `${kandidaten} Kandidaten ausgewertet` +
          (uebersprungen ? `, ${uebersprungen} nicht ladbar und übersprungen` : '') +
          (passend ? ' · vorhandener Fortschritt wiederhergestellt' : ''),
      )
      setzePhase('fokus')
    } catch (e) {
      setzeFehler(
        e instanceof ImmichFehler ? e.message : e instanceof Error ? e.message : String(e),
      )
      setzePhase('setup')
    } finally {
      setzeLauf(null)
    }
  }

  const aendere = (i: number, teil: Partial<Slot>) =>
    aktualisiere(slots.map((s, n) => (n === i ? { ...s, ...teil } : s)))

  const schreibeAlbum = async () => {
    setzeSchreibt(true)
    setzeFehler(null)
    try {
      const ids = slots.filter((s) => !s.leer).map((s) => s.aktuell)
      if (ids.length === 0) throw new Error('Es ist kein einziger Platz belegt.')
      if ((await albenNamen()).includes(albumName)) {
        throw new Error(
          `Ein Album namens "${albumName}" existiert bereits. Wähle einen anderen Namen.`,
        )
      }
      const album = await legeAlbumAn(albumName, ids)
      setzeAlbumId(album.id)
      await verwirfFortschritt(schluessel)
      setzePhase('fertig')
    } catch (e) {
      setzeFehler(e instanceof Error ? e.message : String(e))
    } finally {
      setzeSchreibt(false)
    }
  }

  const belegt = slots.filter((s) => !s.leer).length
  const bestaetigt = slots.filter((s) => s.bestaetigt).length
  const getauscht = slots.filter((s) => s.aktuell !== s.vorschlag).length
  // Was den Slot belegt, gehoert nicht in seinen eigenen Alternativstreifen.
  const angebot = (slots[index]?.alternativen ?? []).filter((id) => id !== slots[index]?.aktuell)
  const sichtbar = Math.min(angeboten[index] ?? SCHRITT, angebot.length)
  // Wischen statt Pfeiltasten unterhalb der Breite, ab der Touch die bessere Bedienung ist.
  const FokusKomponente = schmal ? FokusMobil : Fokus

  return (
    <div className="huelle">
      <h1>Album-Kurator</h1>
      <div className="leise">
        {phase === 'setup' && 'Person und Zeitraum wählen'}
        {phase === 'laden' && 'Vorschlag wird berechnet'}
        {phase === 'fokus' && 'Vorschläge durchgehen'}
        {phase === 'bogen' && 'Gesamtschau vor dem Anlegen'}
        {phase === 'fertig' && 'Album angelegt'}
      </div>

      {fehler && <div className="fehler">{fehler}</div>}
      {hinweis && phase !== 'laden' && (
        <p className="leise" style={{ marginTop: 12 }}>{hinweis}</p>
      )}

      <div style={{ marginTop: 20 }}>
        {phase === 'setup' && (
          <Setup
            personen={personen}
            gewaehlt={gewaehlt}
            setzeGewaehlt={setzeGewaehlt}
            von={von} setzeVon={setzeVon} bis={bis} setzeBis={setzeBis}
            proJahr={proJahr} setzeProJahr={setzeProJahr}
            start={() => void starte()}
            zwischenspeicherLeeren={() => {
              void leereMerkmale()
              setzeHinweis('Zwischenspeicher geleert — der nächste Lauf berechnet alles neu.')
            }}
          />
        )}

        {phase === 'laden' && lauf && (
          <div>
            <div>{lauf.phase}…</div>
            <div className="leise">
              {lauf.gesamt > 0 ? `${lauf.getan} von ${lauf.gesamt}` : `${lauf.getan}`}
            </div>
            {lauf.gesamt > 0 && (
              <div className="balken">
                <div style={{ width: `${(100 * lauf.getan) / lauf.gesamt}%` }} />
              </div>
            )}
          </div>
        )}

        {phase === 'fokus' && slots[index] && (
          <FokusKomponente
            slots={slots}
            auswahl={angebot.slice(0, sichtbar)}
            index={index}
            setzeIndex={setzeIndex}
            tausche={(id) => aendere(index, { aktuell: id, leer: false })}
            bestaetige={() => {
              aendere(index, { bestaetigt: true })
              setzeIndex(Math.min(slots.length - 1, index + 1))
            }}
            schalteLeer={() => aendere(index, { leer: !slots[index].leer })}
            mehrAlternativen={() =>
              setzeAngeboten({ ...angeboten, [index]: sichtbar + SCHRITT })
            }
            fertig={() => {
              const name = personen.find((p) => p.id === gewaehlt[0])?.name ?? 'Rückblick'
              const jahre = new Date(bis).getFullYear() - new Date(von).getFullYear()
              if (!albumName) setzeAlbumName(`${name} — die ersten ${jahre} Jahre`)
              setzePhase('bogen')
            }}
          />
        )}

        {phase === 'bogen' && (
          <>
            <Kontaktbogen
              slots={slots}
              oeffne={(i) => {
                setzeIndex(i)
                setzePhase('fokus')
              }}
            />
            <div className="zeile" style={{ marginTop: 20 }}>
              <input
                value={albumName}
                onChange={(e) => setzeAlbumName(e.target.value)}
                style={{ minWidth: 300 }}
              />
              <button
                className="haupt"
                disabled={schreibt || belegt === 0 || !albumName.trim()}
                onClick={() => void schreibeAlbum()}
              >
                {schreibt ? 'Wird angelegt…' : `${belegt} Fotos als Album anlegen`}
              </button>
              <button onClick={() => setzePhase('fokus')}>← Zurück</button>
            </div>
            <p className="leise" style={{ marginTop: 10 }}>
              Es wird ausschließlich ein neues Album angelegt. Nichts in deinem Bestand wird
              verändert, verschoben oder gelöscht.
            </p>
          </>
        )}

        {phase === 'fertig' && albumId && (
          <p>
            <a href={`${__IMMICH_URL__}/albums/${albumId}`} target="_blank" rel="noreferrer">
              „{albumName}" in Immich öffnen →
            </a>
          </p>
        )}
      </div>

      {(phase === 'fokus' || phase === 'bogen') && (
        <div id="leiste">
          <button onClick={() => setzePhase(phase === 'fokus' ? 'bogen' : 'fokus')}>
            {phase === 'fokus' ? 'Gesamtschau' : 'Weiter durchgehen'}
          </button>
          <span className="stand">
            {bestaetigt}/{slots.length} bestätigt · {getauscht} getauscht ·{' '}
            {slots.length - belegt} leer
          </span>
        </div>
      )}
    </div>
  )
}
