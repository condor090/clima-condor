// Medidor de consumo de tus límites de uso (5 horas y semanal) en pixel-art: medio bloque (▀)
// Fila de arriba: lo gastado. Fila de abajo: el tiempo transcurrido de la ventana.
// Si lo gastado va por delante del tiempo, vas más rápido de lo que alcanza.
import type { Limite } from '../types'
import { DEFECTO, empaquetar } from './escena'

const MIN = 60_000
const HORA = 60 * MIN
const DIA = 24 * HORA
const DIAS = ['dom', 'lun', 'mar', 'mié', 'jue', 'vie', 'sáb']

const VENTANAS: Record<string, { nombre: string; largo: number }> = {
  five_hour: { nombre: '5 horas', largo: 5 * HORA },
  seven_day: { nombre: 'Semana', largo: 7 * DIA },
}

export type Ventana = {
  kind: string
  nombre: string
  usado: number // 0–100
  transcurrido: number | null // 0–1 de la ventana, si se sabe cuándo reinicia
  reinicio: number | null // ms
  // Lo que pasará a este ritmo: se agota antes del reinicio, o cuánto sobra
  ritmo: { agota: number } | { sobra: number } | null
}

export function ventanas(limites: Limite[], ahora: number): Ventana[] {
  // Un límite trae su propia ventana (Antigravity) o usa la conocida de Claude
  const de = (l: Limite) => (l.largoMs ? { nombre: l.etiqueta ?? l.kind, largo: l.largoMs } : VENTANAS[l.kind])
  return limites
    .filter(l => de(l))
    .sort((a, b) => (de(a)?.largo ?? 0) - (de(b)?.largo ?? 0))
    .map(l => {
      const v = de(l)!
      const reinicio = l.resetsAt ? Date.parse(l.resetsAt) : NaN
      if (!Number.isFinite(reinicio)) return { kind: l.kind, nombre: v.nombre, usado: l.percentUsed, transcurrido: null, reinicio: null, ritmo: null }
      const inicio = reinicio - v.largo
      const transcurrido = Math.max(0, Math.min(1, (ahora - inicio) / v.largo))
      let ritmo: Ventana['ritmo'] = null
      // Con menos del 3 % de la ventana, el ritmo aún no dice nada
      if (transcurrido >= 0.03 && l.percentUsed > 0) {
        const porMs = l.percentUsed / (ahora - inicio)
        const agota = ahora + (100 - l.percentUsed) / porMs
        ritmo = agota < reinicio ? { agota } : { sobra: Math.max(0, Math.round(100 - l.percentUsed / transcurrido)) }
      }
      return { kind: l.kind, nombre: v.nombre, usado: l.percentUsed, transcurrido, reinicio, ritmo }
    })
}

// Verde con holgura, ámbar pasado el 60 %, rojo pasado el 85 % (xterm-256 exactos)
export function colorUso(usado: number): number {
  if (usado >= 85) return 0xff5f5f
  if (usado >= 60) return 0xffaf00
  return 0x5fd75f
}
export const hex = (c: number): string => `#${c.toString(16).padStart(6, '0')}`

const PISTA = 0x303030
const TIEMPO = 0x6c6c6c
const PISTA_TIEMPO = 0x1c1c1c
const AHORA = 0xffffff

export function medidor(v: Ventana, ancho: number): string {
  const px = new Uint32Array(ancho * 2).fill(DEFECTO)
  const lleno = Math.round((Math.min(100, v.usado) / 100) * ancho)
  for (let x = 0; x < ancho; x++) px[x] = x < lleno ? colorUso(v.usado) : PISTA
  if (v.transcurrido !== null) {
    const t = Math.min(ancho - 1, Math.round(v.transcurrido * ancho))
    for (let x = 0; x < ancho; x++) px[ancho + x] = x < t ? TIEMPO : PISTA_TIEMPO
    px[ancho + t] = AHORA
  }
  return empaquetar({ ancho, alto: 2, px })
}

const dosDigitos = (n: number) => String(n).padStart(2, '0')

// Hora local con el desfase de la ciudad del panel; la semanal lleva el día
export function cuando(ms: number, ahora: number, offsetMin: number): string {
  const d = new Date(ms + offsetMin * MIN)
  const hhmm = `${dosDigitos(d.getUTCHours())}:${dosDigitos(d.getUTCMinutes())}`
  return ms - ahora < 20 * HORA ? hhmm : `${DIAS[d.getUTCDay()]} ${hhmm}`
}

export function enCuanto(ms: number): string {
  const min = Math.max(0, Math.round(ms / MIN))
  if (min < 60) return `${min} min`
  const h = Math.floor(min / 60)
  if (h < 48) return min % 60 ? `${h} h ${min % 60} min` : `${h} h`
  return `${Math.round(h / 24)} días`
}

export function textoRitmo(v: Ventana, ahora: number, offsetMin: number): { texto: string; color: string } {
  if (!v.ritmo) return { texto: 'midiendo el ritmo…', color: '#9ca3af' }
  if ('agota' in v.ritmo) return { texto: `⚠ a este ritmo se agota ${cuando(v.ritmo.agota, ahora, offsetMin)}`, color: '#ff5f5f' }
  return { texto: `✓ a este ritmo alcanza · sobra ~${v.ritmo.sobra}%`, color: '#5fd75f' }
}

const MESES = ['ene', 'feb', 'mar', 'abr', 'may', 'jun', 'jul', 'ago', 'sep', 'oct', 'nov', 'dic']

// Cuándo se midió: la hora si fue hoy, si no el día ("24 sep")
export function medidoEl(ms: number, ahora: number, offsetMin: number): string {
  if (ahora - ms < 20 * HORA) return cuando(ms, ahora, offsetMin)
  const d = new Date(ms + offsetMin * MIN)
  return `${d.getUTCDate()} ${MESES[d.getUTCMonth()]}`
}

// Reinicio en corto: "21:50 · en 3 h 59 min"
export function reinicioCorto(v: Ventana, ahora: number, offsetMin: number): string {
  return v.reinicio ? `↻ ${cuando(v.reinicio, ahora, offsetMin)} · en ${enCuanto(v.reinicio - ahora)}` : ''
}

// El ritmo solo cuando dice algo: advertencia o lo que sobra
export function ritmoCorto(v: Ventana, ahora: number, offsetMin: number): { texto: string; color: string } | null {
  if (!v.ritmo) return null
  if ('agota' in v.ritmo) return { texto: `⚠ se agota ${cuando(v.ritmo.agota, ahora, offsetMin)}`, color: '#ff5f5f' }
  return { texto: `✓ sobra ~${v.ritmo.sobra}%`, color: '#5fd75f' }
}

// Varias ventanas idénticas (los modelos de Antigravity) se muestran como una sola
export function agrupar(vs: Ventana[], nombre: string): Ventana[] {
  const [a, ...resto] = vs
  if (!a || resto.length === 0) return vs
  const iguales = resto.every(v => v.usado === a.usado && v.reinicio === a.reinicio)
  return iguales ? [{ ...a, nombre }] : vs
}
