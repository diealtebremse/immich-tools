import { useEffect, useState } from 'react'

/**
 * True unterhalb der Breite, ab der Wischen sinnvoller ist als Pfeiltasten.
 * Bewusst an der Fensterbreite festgemacht, nicht am Touch-Support: ein
 * schmales Fenster auf dem Desktop soll dieselbe Bedienung bekommen wie ein Handy.
 */
const SCHWELLE = 700

export const useSchmalesGeraet = (): boolean => {
  const [schmal, setzeSchmal] = useState(
    () => typeof window !== 'undefined' && window.innerWidth < SCHWELLE,
  )
  useEffect(() => {
    const abfrage = window.matchMedia(`(max-width: ${SCHWELLE - 1}px)`)
    const aktualisiere = () => setzeSchmal(abfrage.matches)
    aktualisiere()
    abfrage.addEventListener('change', aktualisiere)
    return () => abfrage.removeEventListener('change', aktualisiere)
  }, [])
  return schmal
}
