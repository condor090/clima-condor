// Funciones puras del clima: URLs, parseo de Open-Meteo y formato
import type { Clima, Dia, Hora, Lugar, Tarjeta } from '../types'

export const SANTIAGO: Lugar = { nombre: 'Santiago, Chile', lat: -33.4489, lon: -70.6693 }

type Cielo = { dia: string; noche: string; texto: string; color: string }

// Códigos WMO que entrega Open-Meteo
const CIELOS: Array<[number[], Cielo]> = [
  [[0], { dia: '☀️', noche: '🌙', texto: 'Despejado', color: '#fbbf24' }],
  [[1], { dia: '🌤️', noche: '🌙', texto: 'Mayormente despejado', color: '#fcd34d' }],
  [[2], { dia: '⛅', noche: '☁️', texto: 'Parcialmente nublado', color: '#cbd5e1' }],
  [[3], { dia: '☁️', noche: '☁️', texto: 'Nublado', color: '#94a3b8' }],
  [[45, 48], { dia: '🌫️', noche: '🌫️', texto: 'Niebla', color: '#a8a29e' }],
  [[51, 53, 55, 56, 57], { dia: '🌦️', noche: '🌧️', texto: 'Llovizna', color: '#7dd3fc' }],
  [[61, 63, 66, 80, 81], { dia: '🌧️', noche: '🌧️', texto: 'Lluvia', color: '#38bdf8' }],
  [[65, 67, 82], { dia: '🌧️', noche: '🌧️', texto: 'Lluvia intensa', color: '#3b82f6' }],
  [[71, 73, 75, 77, 85, 86], { dia: '🌨️', noche: '🌨️', texto: 'Nieve', color: '#e0f2fe' }],
  [[95, 96, 99], { dia: '⛈️', noche: '⛈️', texto: 'Tormenta', color: '#c084fc' }],
]

export function cielo(codigo: number): Cielo {
  const hallado = CIELOS.find(([codigos]) => codigos.includes(codigo))
  return hallado ? hallado[1] : { dia: '🌡️', noche: '🌡️', texto: 'Desconocido', color: '#e5e7eb' }
}

export function icono(codigo: number, esDia = true): string {
  const c = cielo(codigo)
  return esDia ? c.dia : c.noche
}

// Color según la temperatura, de frío a calor
export function colorTemp(t: number): string {
  if (t < 0) return '#a5b4fc'
  if (t < 8) return '#7dd3fc'
  if (t < 14) return '#5eead4'
  if (t < 20) return '#86efac'
  if (t < 25) return '#fde047'
  if (t < 30) return '#fdba74'
  return '#f87171'
}

const RUMBOS = ['N', 'NE', 'E', 'SE', 'S', 'SO', 'O', 'NO']
export function rumbo(grados: number): string {
  return RUMBOS[Math.round((((grados % 360) + 360) % 360) / 45) % 8] ?? 'N'
}

const DIAS = ['Dom', 'Lun', 'Mar', 'Mié', 'Jue', 'Vie', 'Sáb']
export function nombreDia(fecha: string, indice: number): string {
  if (indice === 0) return 'Hoy'
  if (indice === 1) return 'Mañana'
  const [a, m, d] = fecha.split('-').map(Number)
  return DIAS[new Date(Date.UTC(a ?? 2000, (m ?? 1) - 1, d ?? 1)).getUTCDay()] ?? fecha
}

export function urlPronostico(l: Lugar): string {
  const p = new URLSearchParams({
    latitude: String(l.lat),
    longitude: String(l.lon),
    current: 'temperature_2m,apparent_temperature,relative_humidity_2m,wind_speed_10m,wind_gusts_10m,wind_direction_10m,weather_code,is_day,uv_index',
    hourly: 'temperature_2m,weather_code,precipitation_probability',
    daily: 'weather_code,temperature_2m_max,temperature_2m_min,precipitation_probability_max,sunrise,sunset',
    timezone: 'auto',
    forecast_days: '7',
  })
  return `https://api.open-meteo.com/v1/forecast?${p.toString()}`
}

export function urlGeocodificar(nombre: string): string {
  const p = new URLSearchParams({ name: nombre, count: '1', language: 'es', format: 'json' })
  return `https://geocoding-api.open-meteo.com/v1/search?${p.toString()}`
}

type Serie<T> = T[] | undefined
type Respuesta = {
  utc_offset_seconds?: number
  current?: Record<string, number | string>
  hourly?: { time?: string[]; temperature_2m?: number[]; weather_code?: number[]; precipitation_probability?: Serie<number | null> }
  daily?: {
    time?: string[]
    weather_code?: number[]
    temperature_2m_max?: number[]
    temperature_2m_min?: number[]
    precipitation_probability_max?: Serie<number | null>
    sunrise?: string[]
    sunset?: string[]
  }
}

const num = (v: unknown): number => (typeof v === 'number' && Number.isFinite(v) ? v : 0)
const hhmm = (iso: string | undefined): string => (iso ?? '').slice(11, 16)

// Convierte la respuesta de Open-Meteo al modelo del panel
export function parsear(lugar: Lugar, json: unknown, cuantasHoras = 8, paso = 2): Clima {
  const r = json as Respuesta
  const c = r.current ?? {}
  const ahora = String(c['time'] ?? '')
  const horaActual = ahora.slice(0, 13)

  const tiempos = r.hourly?.time ?? []
  let desde = tiempos.findIndex(t => t.slice(0, 13) >= horaActual)
  if (desde < 0) desde = 0
  const horas: Hora[] = []
  for (let i = desde + paso; i < tiempos.length && horas.length < cuantasHoras; i += paso) {
    horas.push({
      hora: (tiempos[i] ?? '').slice(11, 13) + 'h',
      temp: num(r.hourly?.temperature_2m?.[i]),
      codigo: num(r.hourly?.weather_code?.[i]),
      lluvia: num(r.hourly?.precipitation_probability?.[i]),
    })
  }

  const d = r.daily ?? {}
  const dias: Dia[] = (d.time ?? []).map((fecha, i) => ({
    fecha,
    min: num(d.temperature_2m_min?.[i]),
    max: num(d.temperature_2m_max?.[i]),
    codigo: num(d.weather_code?.[i]),
    lluvia: num(d.precipitation_probability_max?.[i]),
    amanecer: hhmm(d.sunrise?.[i]),
    atardecer: hhmm(d.sunset?.[i]),
  }))

  return {
    lugar,
    actual: {
      temp: num(c['temperature_2m']),
      sensacion: num(c['apparent_temperature']),
      humedad: num(c['relative_humidity_2m']),
      viento: num(c['wind_speed_10m']),
      rafagas: num(c['wind_gusts_10m']),
      dirViento: num(c['wind_direction_10m']),
      codigo: num(c['weather_code']),
      esDia: num(c['is_day']) === 1,
      uv: num(c['uv_index']),
    },
    horas,
    dias,
    actualizado: hhmm(ahora),
    offsetMin: Math.round(num(r.utc_offset_seconds) / 60),
  }
}

// Barra de rango min–max de un día sobre la escala de toda la semana
export function barra(min: number, max: number, bajo: number, alto: number, ancho = 14): [string, string, string] {
  const escala = Math.max(1, alto - bajo)
  const ini = Math.max(0, Math.min(ancho - 1, Math.round(((min - bajo) / escala) * (ancho - 1))))
  const fin = Math.max(ini + 1, Math.min(ancho, Math.round(((max - bajo) / escala) * (ancho - 1)) + 1))
  return ['─'.repeat(ini), '━'.repeat(fin - ini), '─'.repeat(ancho - fin)]
}

export const grados = (t: number): string => `${Math.round(t)}°`

// Tarjeta de la barra, con el color de la temperatura actual
export function tarjeta(c: Clima): Tarjeta {
  const ciudad = c.lugar.nombre.split(',')[0] ?? c.lugar.nombre
  const hoy = c.dias[0]
  const lluvia = Math.max(0, ...c.horas.slice(0, 6).map(h => h.lluvia))
  const partes = [hoy ? `hoy ${grados(hoy.min)} / ${grados(hoy.max)}` : '', `lluvia ${Math.round(lluvia)}%`, `UV ${Math.round(c.actual.uv)}`]
  return {
    titulo: `${icono(c.actual.codigo, c.actual.esDia)} ${grados(c.actual.temp)} ${ciudad} · ${cielo(c.actual.codigo).texto.toLowerCase()}`,
    detalle: partes.filter(Boolean).join(' · '),
    color: colorTemp(c.actual.temp),
  }
}

export function lineaEstado(c: Clima): string {
  const ciudad = c.lugar.nombre.split(',')[0] ?? c.lugar.nombre
  return `${icono(c.actual.codigo, c.actual.esDia)} ${grados(c.actual.temp)} ${ciudad}`
}
