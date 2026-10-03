// Fase de la Luna con efemérides de baja precisión (error de pocas horas)
// Elongación = longitud de la Luna − longitud del Sol: 0° nueva, 90° cuarto creciente, 180° llena

const DIA = 86_400_000
const J2000 = Date.UTC(2000, 0, 1, 12, 0, 0)
const RAD = Math.PI / 180

const norm = (g: number): number => ((g % 360) + 360) % 360

export function elongacion(ms: number): number {
  const d = (ms - J2000) / DIA
  // Luna: longitud media, anomalía media y la ecuación del centro principal
  const L = 218.316 + 13.176396 * d
  const M = 134.963 + 13.064993 * d
  const D = 297.85 + 12.190749 * d
  const luna = L + 6.289 * Math.sin(M * RAD) + 1.274 * Math.sin((2 * D - M) * RAD) + 0.658 * Math.sin(2 * D * RAD)
  // Sol
  const g = 357.529 + 0.98560028 * d
  const q = 280.459 + 0.98564736 * d
  const sol = q + 1.915 * Math.sin(g * RAD) + 0.02 * Math.sin(2 * g * RAD)
  return norm(luna - sol)
}

export type Fase = {
  elongacion: number // 0–360
  iluminada: number // 0–1
  creciente: boolean
  nombre: string
  emoji: string
}

import { idioma } from './idioma'

const NOMBRES = ['Luna nueva', 'Luna creciente', 'Cuarto creciente', 'Gibosa creciente', 'Luna llena', 'Gibosa menguante', 'Cuarto menguante', 'Luna menguante']
const NOMBRES_EN = ['New moon', 'Waxing crescent', 'First quarter', 'Waxing gibbous', 'Full moon', 'Waning gibbous', 'Last quarter', 'Waning crescent']
const EMOJIS_NORTE = ['🌑', '🌒', '🌓', '🌔', '🌕', '🌖', '🌗', '🌘']
// En el hemisferio sur la parte iluminada se ve del otro lado
const EMOJIS_SUR = ['🌑', '🌘', '🌗', '🌖', '🌕', '🌔', '🌓', '🌒']

export function fase(ms: number, lat = 0): Fase {
  const e = elongacion(ms)
  const i = Math.floor(norm(e + 22.5) / 45) % 8
  return {
    elongacion: e,
    iluminada: (1 - Math.cos(e * RAD)) / 2,
    creciente: e < 180,
    nombre: (idioma() === 'en' ? NOMBRES_EN : NOMBRES)[i] ?? 'Luna',
    emoji: (lat < 0 ? EMOJIS_SUR : EMOJIS_NORTE)[i] ?? '🌙',
  }
}

// Próximo instante en que la elongación cruza `objetivo` (180 llena, 0 nueva), con precisión de minutos
export function proxima(ms: number, objetivo: number): number {
  const dif = (t: number) => norm(elongacion(t) - objetivo + 180) - 180
  let a = ms
  let da = dif(a)
  for (let paso = 0; paso < 24 * 31; paso++) {
    const b = a + 3_600_000
    const db = dif(b)
    if (da < 0 && db >= 0) {
      // Bisección dentro de la hora
      let lo = a
      let hi = b
      for (let k = 0; k < 12; k++) {
        const mid = (lo + hi) / 2
        if (dif(mid) < 0) lo = mid
        else hi = mid
      }
      return hi
    }
    a = b
    da = db
  }
  return ms + 29.53 * DIA
}
