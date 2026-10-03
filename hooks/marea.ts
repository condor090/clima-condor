// Marea de la costa más cercana con la API marina de Open-Meteo (sea_level_height_msl)
// Es un modelo global: sirve para ver la tendencia, no para navegar
import type { Lugar, Marea } from '../types'

const RAD = Math.PI / 180

export function distanciaKm(a: { lat: number; lon: number }, b: { lat: number; lon: number }): number {
  const dLat = (b.lat - a.lat) * RAD
  const dLon = (b.lon - a.lon) * RAD
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(a.lat * RAD) * Math.cos(b.lat * RAD) * Math.sin(dLon / 2) ** 2
  return 2 * 6371 * Math.asin(Math.min(1, Math.sqrt(h)))
}

// Rumbo de a hacia b en grados (0 = norte)
export function rumboGrados(a: { lat: number; lon: number }, b: { lat: number; lon: number }): number {
  const y = Math.sin((b.lon - a.lon) * RAD) * Math.cos(b.lat * RAD)
  const x = Math.cos(a.lat * RAD) * Math.sin(b.lat * RAD) - Math.sin(a.lat * RAD) * Math.cos(b.lat * RAD) * Math.cos((b.lon - a.lon) * RAD)
  return ((Math.atan2(y, x) / RAD) % 360 + 360) % 360
}

// Puntos candidatos: el lugar y anillos de 8 rumbos hasta ~1,5° (unos 165 km)
export function candidatos(l: Lugar): Array<{ lat: number; lon: number }> {
  const puntos = [{ lat: l.lat, lon: l.lon }]
  for (const r of [0.25, 0.5, 0.75, 1, 1.5]) {
    for (let k = 0; k < 8; k++) {
      const a = (k * 45 * Math.PI) / 180
      const lat = l.lat + r * Math.cos(a)
      const lon = l.lon + (r * Math.sin(a)) / Math.max(0.2, Math.cos(l.lat * RAD))
      puntos.push({ lat: Math.round(lat * 1000) / 1000, lon: Math.round(lon * 1000) / 1000 })
    }
  }
  return puntos
}

export function urlMarea(puntos: Array<{ lat: number; lon: number }>): string {
  const p = new URLSearchParams({
    latitude: puntos.map(x => x.lat).join(','),
    longitude: puntos.map(x => x.lon).join(','),
    hourly: 'sea_level_height_msl',
    timezone: 'auto',
    past_days: '1',
    forecast_days: '2',
  })
  return `https://marine-api.open-meteo.com/v1/marine?${p.toString()}`
}

type Respuesta = {
  latitude?: number
  longitude?: number
  utc_offset_seconds?: number
  hourly?: { time?: string[]; sea_level_height_msl?: Array<number | null> }
}

// Elige el punto con datos más cercano al lugar; null si no hay mar a la vista
export function parsearMarea(l: Lugar, json: unknown): Marea | null {
  const lista = (Array.isArray(json) ? json : [json]) as Respuesta[]
  let mejor: Marea | null = null
  let mejorKm = Infinity
  for (const r of lista) {
    const serie = r.hourly?.sea_level_height_msl ?? []
    const validos = serie.filter((v): v is number => typeof v === 'number')
    if (validos.length < serie.length * 0.9 || validos.length < 24) continue
    const p = { lat: r.latitude ?? l.lat, lon: r.longitude ?? l.lon }
    const km = distanciaKm(l, p)
    if (km >= mejorKm) continue
    mejorKm = km
    let ultimo = validos[0] ?? 0
    mejor = {
      lat: p.lat,
      lon: p.lon,
      km: Math.round(km),
      rumbo: rumboGrados(l, p),
      inicio: (r.hourly?.time ?? [])[0] ?? '',
      offsetMin: Math.round((r.utc_offset_seconds ?? 0) / 60),
      alturas: serie.map(v => (typeof v === 'number' ? (ultimo = v) : ultimo)),
    }
  }
  return mejor
}

// Inicio de la serie en ms UTC (la hora viene en hora local de la costa)
const inicioMs = (m: Marea): number => Date.parse(`${m.inicio}:00Z`) - m.offsetMin * 60_000

// Altura en un instante, interpolada con un coseno entre horas (la marea es suave)
export function alturaEn(m: Marea, ms: number): number {
  const x = (ms - inicioMs(m)) / 3_600_000
  const i = Math.max(0, Math.min(m.alturas.length - 2, Math.floor(x)))
  const t = Math.max(0, Math.min(1, x - i))
  const a = m.alturas[i] ?? 0
  const b = m.alturas[i + 1] ?? a
  return a + (b - a) * (1 - Math.cos(Math.PI * t)) / 2
}

export type Extremo = { tipo: 'alta' | 'baja'; ms: number; altura: number }

// Pleamares y bajamares: máximos y mínimos locales, afinados con una parábola
export function extremos(m: Marea): Extremo[] {
  const h = m.alturas
  const t0 = inicioMs(m)
  const res: Extremo[] = []
  for (let i = 1; i < h.length - 1; i++) {
    const a = h[i - 1] ?? 0
    const b = h[i] ?? 0
    const c = h[i + 1] ?? 0
    const alta = b > a && b >= c
    const baja = b < a && b <= c
    if (!alta && !baja) continue
    const den = a - 2 * b + c
    const dx = den === 0 ? 0 : (0.5 * (a - c)) / den
    res.push({ tipo: alta ? 'alta' : 'baja', ms: t0 + (i + dx) * 3_600_000, altura: b - 0.25 * (a - c) * dx })
  }
  return res
}

export type EstadoMarea = {
  altura: number
  subiendo: boolean
  proximas: Extremo[] // las dos siguientes
  min: number
  max: number
  // Fracción entre la última bajamar y la siguiente pleamar (o al revés), 0–1
  avance: number
}

export function estadoMarea(m: Marea, ahora: number): EstadoMarea {
  const altura = alturaEn(m, ahora)
  const subiendo = alturaEn(m, ahora + 600_000) > altura
  const ex = extremos(m)
  const antes = [...ex].reverse().find(e => e.ms <= ahora)
  const proximas = ex.filter(e => e.ms > ahora).slice(0, 2)
  const sig = proximas[0]
  const avance = antes && sig ? Math.max(0, Math.min(1, (ahora - antes.ms) / Math.max(1, sig.ms - antes.ms))) : 0.5
  return { altura, subiendo, proximas, min: Math.min(...m.alturas), max: Math.max(...m.alturas), avance }
}

// Curva de las próximas `horas` horas (una muestra por columna) para el gráfico
export function curva(m: Marea, desde: number, horas: number, columnas: number): number[] {
  return Array.from({ length: columnas }, (_, i) => alturaEn(m, desde + (i / (columnas - 1)) * horas * 3_600_000))
}
