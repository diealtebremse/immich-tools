/**
 * Anbindung an Immich. Alle Pfade sind relativ - der Vite-Proxy leitet sie weiter,
 * denn Immich schaltet CORS nur bei IMMICH_ENV=development ein.
 */

declare const __IMMICH_API_KEY__: string
const KEY = __IMMICH_API_KEY__

export type Person = { id: string; name: string; birthDate: string | null }
export type Asset = {
  id: string
  type: 'IMAGE' | 'VIDEO'
  isFavorite: boolean
  fileCreatedAt: string
  localDateTime?: string
}
export type Gesicht = {
  boundingBoxX1: number
  boundingBoxY1: number
  boundingBoxX2: number
  boundingBoxY2: number
  imageWidth: number
  imageHeight: number
  person: { id: string } | null
}

export class ImmichFehler extends Error {
  constructor(
    message: string,
    readonly status: number,
    readonly fehlendeBerechtigung?: string,
  ) {
    super(message)
  }
}

const anfrage = async <T>(pfad: string, init?: RequestInit): Promise<T> => {
  const antwort = await fetch(`/api${pfad}`, {
    ...init,
    headers: { 'x-api-key': KEY, 'Content-Type': 'application/json', ...init?.headers },
  })
  if (!antwort.ok) {
    const text = await antwort.text()
    const fehlend = /Missing required permission: (\S+)/.exec(text)?.[1]
    throw new ImmichFehler(
      fehlend
        ? `Dem API-Key fehlt die Berechtigung "${fehlend}". In Immich unter Einstellungen → API-Keys nachtragen.`
        : `Immich antwortete mit ${antwort.status}: ${text.slice(0, 200)}`,
      antwort.status,
      fehlend,
    )
  }
  return antwort.json() as Promise<T>
}

export const serverVersion = async (): Promise<string> => {
  const spec = await anfrage<{ info: { version: string } }>('/spec.json')
  return spec.info.version
}

export const personen = async (): Promise<Person[]> => {
  const d = await anfrage<{ people: Person[] }>('/people?size=1000&withHidden=false')
  return d.people.filter((p) => p.name)
}

/** Kandidaten: Personen- und Zeitfilter in einer einzigen Abfrage, durchpaginiert. */
export const sucheAssets = async (
  personIds: string[],
  von: Date,
  bis: Date,
  fortschritt?: (geladen: number) => void,
): Promise<Asset[]> => {
  const alle: Asset[] = []
  let page: number | null = 1
  while (page) {
    const d: { assets: { items: Asset[]; nextPage: string | null } } = await anfrage(
      '/search/metadata',
      {
        method: 'POST',
        body: JSON.stringify({
          personIds,
          takenAfter: von.toISOString(),
          takenBefore: bis.toISOString(),
          withExif: true,
          size: 1000,
          page,
        }),
      },
    )
    alle.push(...d.assets.items)
    fortschritt?.(alle.length)
    page = d.assets.nextPage ? Number(d.assets.nextPage) : null
  }
  return alle
}

/** Der Key als Query-Parameter, weil <img> keine eigenen Header senden kann. */
export const bildUrl = (id: string, groesse: 'thumbnail' | 'preview'): string =>
  `/api/assets/${id}/thumbnail?size=${groesse}&apiKey=${encodeURIComponent(KEY)}`

export const gesichter = (assetId: string): Promise<Gesicht[]> =>
  anfrage<Gesicht[]>(`/faces?id=${assetId}`)

export const albenNamen = async (): Promise<string[]> => {
  const alben = await anfrage<{ albumName: string }[]>('/albums')
  return alben.map((a) => a.albumName)
}

export const legeAlbumAn = (albumName: string, assetIds: string[]): Promise<{ id: string }> =>
  anfrage<{ id: string }>('/albums', {
    method: 'POST',
    body: JSON.stringify({ albumName, assetIds }),
  })
