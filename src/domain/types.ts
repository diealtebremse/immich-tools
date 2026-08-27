/** Vokabular siehe CONTEXT.md im Wurzelverzeichnis. */

export type AssetId = string

/** Ein Bild, das durch das Personen- und Zeitsieb gekommen ist. Videos sind nie Kandidaten. */
export type Kandidat = {
  id: AssetId
  /** Aufnahmezeitpunkt, zeitzonenbereinigt. */
  zeit: Date
  /** 64-Bit dHash des 250px-Vorschaubilds. */
  hash: bigint
  /** Laplace-Varianz des 250px-Vorschaubilds. Groesser ist schaerfer. */
  schaerfe: number
}

/**
 * Die Gruppe von Kandidaten, die demselben Moment zugeordnet wird.
 * Ein Cluster ueberspannt nie mehr als einen Kalendertag.
 */
export type Cluster = {
  tag: string
  /** Alle Mitglieder, chronologisch. Die Groesse ist das Bedeutungsmass. */
  mitglieder: Kandidat[]
  /** Die nach dem Veto verbliebenen Mitglieder, chronologisch. Nie leer. */
  verblieben: Kandidat[]
  /** Der Kandidat, den das Werkzeug stellvertretend anbietet. */
  repraesentant: Kandidat
}

/** Ein Platz im kuenftigen Album. Der Slot bleibt, sein Vorschlag wird getauscht. */
export type Slot = {
  jahr: number
  monat: string
  tag: string
  /** Wie oft fuer diesen Moment ausgeloest wurde. */
  clusterGroesse: number
  /** Der urspruengliche Repraesentant. Aendert sich nie. */
  vorschlag: AssetId
  /** Was den Slot gerade belegt. Anfangs identisch mit vorschlag. */
  aktuell: AssetId
  alternativen: AssetId[]
  bestaetigt: boolean
  /** Bewusst leer gelassen; wird beim Schreiben uebersprungen. */
  leer: boolean
}

export type KuratierOptionen = {
  start: Date
  ende: Date
  /** Slots je Lebensjahr. */
  proJahr: number
  /** Maximaler Hamming-Abstand, bei dem zwei Kandidaten denselben Moment zeigen. */
  hammingSchwelle: number
  /** Ein Kandidat faellt unter diesem Anteil der Cluster-Medianschaerfe. */
  vetoFaktor: number
  /** Wie viele Alternativen je Slot angeboten werden. */
  alternativen: number
}

export const STANDARD_OPTIONEN: Omit<KuratierOptionen, 'start' | 'ende'> = {
  proJahr: 25,
  hammingSchwelle: 16,
  vetoFaktor: 0.6,
  alternativen: 8,
}
