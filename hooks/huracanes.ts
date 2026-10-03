// Ciclones tropicales activos del Centro Nacional de Huracanes (NHC): Atlántico, Pacífico Este y Central
// Posición actual de CurrentStorms.json y la trayectoria pronosticada del aviso de pronóstico (texto)
import type { Ciclon, Lugar, Punto } from '../types'
import { distanciaKm, rumboGrados } from './marea'

export const URL_NHC = 'https://www.nhc.noaa.gov/CurrentStorms.json'
// Más allá de esto no vale la pena bajar su trayectoria
export const RADIO_INTERES_KM = 3000

const KT = 1.852

type Tormenta = {
  id?: string
  binNumber?: string
  name?: string
  classification?: string
  intensity?: string
  pressure?: string
  latitudeNumeric?: number
  longitudeNumeric?: number
  movementDir?: number
  movementSpeed?: number
  lastUpdate?: string
  forecastAdvisory?: { url?: string }
  forecastGraphics?: { url?: string }
}

export type Basico = Omit<Ciclon, 'pronostico' | 'radio34Km' | 'cercania'> & { urlAviso: string }

export function parsearNhc(l: Lugar, json: unknown): Basico[] {
  const lista = ((json as { activeStorms?: Tormenta[] }).activeStorms ?? []).filter(
    t => typeof t.latitudeNumeric === 'number' && typeof t.longitudeNumeric === 'number',
  )
  return lista
    .map(t => {
      const p = { lat: t.latitudeNumeric ?? 0, lon: t.longitudeNumeric ?? 0 }
      const kt = Number(t.intensity ?? 0) || 0
      return {
        id: t.id ?? t.name ?? '?',
        nombre: t.name ?? 'Sin nombre',
        clase: t.classification ?? '',
        vientoKmh: Math.round(kt * KT),
        categoria: categoria(t.classification ?? '', kt),
        presion: Number(t.pressure ?? 0) || null,
        lat: p.lat,
        lon: p.lon,
        km: Math.round(distanciaKm(l, p)),
        rumbo: rumboGrados(l, p),
        mueveHacia: t.movementDir ?? null,
        mueveKmh: typeof t.movementSpeed === 'number' ? Math.round(t.movementSpeed * KT) : null,
        actualizado: t.lastUpdate ?? '',
        url: t.forecastGraphics?.url ?? 'https://www.nhc.noaa.gov/',
        urlAviso: t.forecastAdvisory?.url ?? '',
      }
    })
    .sort((a, b) => a.km - b.km)
}

// Escala Saffir-Simpson por viento sostenido en nudos
export function categoria(clase: string, kt: number): number {
  if (clase !== 'HU' && kt < 64) return 0
  if (kt >= 137) return 5
  if (kt >= 113) return 4
  if (kt >= 96) return 3
  if (kt >= 83) return 2
  if (kt >= 64) return 1
  return 0
}

const CLASES: Record<string, string> = {
  HU: 'Huracán',
  TS: 'Tormenta tropical',
  TD: 'Depresión tropical',
  STS: 'Tormenta subtropical',
  SS: 'Tormenta subtropical',
  SD: 'Depresión subtropical',
  PTC: 'Potencial ciclón tropical',
  PC: 'Potencial ciclón tropical',
  PT: 'Ciclón postropical',
}

export function claseTexto(c: { clase: string; categoria: number }): string {
  const base = CLASES[c.clase] ?? 'Ciclón'
  return c.categoria > 0 ? `${base} cat. ${c.categoria}` : base
}

// FORECAST VALID 03/0600Z 19.4N 111.6W  /  OUTLOOK VALID ...  /  34 KT...120NE 120SE 110SW 120NW.
export function parsearAviso(texto: string, ahora: number): { puntos: Punto[]; radio34Km: number | null } {
  const limpio = texto.replace(/<[^>]*>/g, '')
  const base = new Date(ahora)
  const puntos: Punto[] = []
  const re = /(?:FORECAST|OUTLOOK) VALID (\d{2})\/(\d{2})(\d{2})Z\s+(\d+(?:\.\d+)?)([NS])\s+(\d+(?:\.\d+)?)([EW])(?:\s*\n\s*MAX WIND\s+(\d+)\s*KT)?/g
  for (const m of limpio.matchAll(re)) {
    const dia = Number(m[1])
    // El aviso solo trae día y hora: el mes es el actual, o el siguiente si el día ya pasó de largo
    let mes = base.getUTCMonth()
    let anio = base.getUTCFullYear()
    if (dia < base.getUTCDate() - 10) {
      mes++
      if (mes > 11) {
        mes = 0
        anio++
      }
    }
    const ms = Date.UTC(anio, mes, dia, Number(m[2]), Number(m[3]))
    const lat = Number(m[4]) * (m[5] === 'S' ? -1 : 1)
    const lon = Number(m[6]) * (m[7] === 'W' ? -1 : 1)
    puntos.push({ ms, lat, lon, vientoKmh: m[8] ? Math.round(Number(m[8]) * KT) : null })
  }
  // Radio de vientos de tormenta tropical (34 kt) actual: el mayor de los cuatro cuadrantes
  const r34 = /34 KT\.+\s*(\d+)NE\s+(\d+)SE\s+(\d+)SW\s+(\d+)NW/.exec(limpio)
  const radio34Km = r34 ? Math.round(Math.max(...r34.slice(1, 5).map(Number)) * KT) : null
  return { puntos, radio34Km }
}

// Punto de máxima cercanía entre la posición actual y la trayectoria pronosticada
export function cercania(l: Lugar, c: { lat: number; lon: number; km: number }, puntos: Punto[], ahora: number): { km: number; ms: number } {
  let mejor = { km: c.km, ms: ahora }
  const ruta = [{ ms: ahora, lat: c.lat, lon: c.lon }, ...puntos.filter(p => p.ms > ahora)]
  for (let i = 0; i + 1 < ruta.length; i++) {
    const a = ruta[i]!
    const b = ruta[i + 1]!
    // Por el camino corto: una trayectoria que cruza la línea de cambio de fecha no da la vuelta al mundo
    const dLon = ((b.lon - a.lon + 540) % 360) - 180
    for (let k = 1; k <= 12; k++) {
      const t = k / 12
      const p = { lat: a.lat + (b.lat - a.lat) * t, lon: a.lon + dLon * t }
      const km = distanciaKm(l, p)
      if (km < mejor.km) mejor = { km: Math.round(km), ms: a.ms + (b.ms - a.ms) * t }
    }
  }
  return mejor
}

export type Nivel = 'alerta' | 'vigilancia' | 'atento' | 'lejos'

// Alerta: los vientos de tormenta tropical podrían llegar; vigilancia: a menos de 800 km
export function nivel(c: Ciclon): Nivel {
  const r = (c.radio34Km ?? 150) + 75
  const k = Math.min(c.km, c.cercania?.km ?? c.km)
  if (k <= r) return 'alerta'
  if (k <= 800) return 'vigilancia'
  if (k <= 1500) return 'atento'
  return 'lejos'
}

export const COLOR_NIVEL: Record<Nivel, string> = {
  alerta: '#f87171',
  vigilancia: '#fb923c',
  atento: '#fde047',
  lejos: '#94a3b8',
}

export const TEXTO_NIVEL: Record<Nivel, string> = {
  alerta: 'ALERTA',
  vigilancia: 'Vigilancia',
  atento: 'Atento',
  lejos: 'Lejos',
}

const RUMBOS = ['N', 'NNE', 'NE', 'ENE', 'E', 'ESE', 'SE', 'SSE', 'S', 'SSO', 'SO', 'OSO', 'O', 'ONO', 'NO', 'NNO']
export const rumbo16 = (g: number): string => RUMBOS[Math.round((((g % 360) + 360) % 360) / 22.5) % 16] ?? 'N'

// ¿Se acerca? El movimiento apunta a menos de 60° de la línea tormenta → lugar
export function seAcerca(c: Ciclon): boolean {
  if (c.mueveHacia === null) return false
  const haciaMi = (c.rumbo + 180) % 360
  const d = Math.abs(((c.mueveHacia - haciaMi + 540) % 360) - 180)
  return d < 60
}
