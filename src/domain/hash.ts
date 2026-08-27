/**
 * Merkmale aus dem 250px-Vorschaubild. Beide Verfahren sind gegen den echten Bestand
 * kalibriert (siehe .scratch/album-kurator/issues/04-auswahlalgorithmus.md); wer sie
 * aendert, entwertet die Hamming-Schwelle.
 */

const grauwerte = (bild: ImageData): Float64Array => {
  const g = new Float64Array(bild.width * bild.height)
  for (let i = 0; i < g.length; i++) {
    const p = i * 4
    // ITU-R 601-2, wie PIL bei der Kalibrierung.
    g[i] = 0.299 * bild.data[p] + 0.587 * bild.data[p + 1] + 0.114 * bild.data[p + 2]
  }
  return g
}

const skaliere = (quelle: HTMLImageElement | ImageBitmap, b: number, h: number): ImageData => {
  const c = new OffscreenCanvas(b, h)
  const ctx = c.getContext('2d')
  if (!ctx) throw new Error('Kein 2D-Kontext verfuegbar')
  ctx.drawImage(quelle, 0, 0, b, h)
  return ctx.getImageData(0, 0, b, h)
}

/**
 * 64-Bit dHash: 9x8 Graustufen, jedes Pixel gegen seinen rechten Nachbarn.
 * Kodiert Struktur statt Farbe und ueberlebt damit Belichtungsunterschiede.
 */
export const dHash = (quelle: HTMLImageElement | ImageBitmap): bigint => {
  const g = grauwerte(skaliere(quelle, 9, 8))
  let hash = 0n
  for (let y = 0; y < 8; y++) {
    for (let x = 0; x < 8; x++) {
      hash <<= 1n
      if (g[y * 9 + x + 1] > g[y * 9 + x]) hash |= 1n
    }
  }
  return hash
}

/**
 * Laplace-Varianz auf 64x64 als Schaerfemass. Bewusst grob: auf einem 250px-Bild
 * trennt das nur klar Verwackeltes, nicht zwei brauchbare Aufnahmen.
 */
export const schaerfe = (quelle: HTMLImageElement | ImageBitmap): number => {
  const n = 64
  const g = grauwerte(skaliere(quelle, n, n))
  const werte: number[] = []
  for (let y = 1; y < n - 1; y++) {
    for (let x = 1; x < n - 1; x++) {
      werte.push(
        -4 * g[y * n + x] +
          g[(y - 1) * n + x] +
          g[(y + 1) * n + x] +
          g[y * n + x - 1] +
          g[y * n + x + 1],
      )
    }
  }
  const mittel = werte.reduce((a, b) => a + b, 0) / werte.length
  return werte.reduce((a, w) => a + (w - mittel) ** 2, 0) / werte.length
}
