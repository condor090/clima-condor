// Límites de uso de Codex: se leen del último evento token_count de sus sesiones en ~/.codex
import type { Agente, Limite } from '../types'
import { tr } from './idioma'
import type { Sistema } from './sistema'

const DIA = 24 * 3600 * 1000
// Solo cuentan las sesiones escritas en la última semana
export const VIGENCIA_CODEX = 8 * DIA
// $.fs.read lee hasta 4 MiB; un archivo mayor lo filtra el sistema
export const LECTURA_CODEX = 4 * 1024 * 1024

// Las carpetas AAAA/MM/DD de ~/.codex/sessions con más de 40 días ni se abren
export function abrirCarpeta(fecha: string, nombre: string, ahora: number): string | null {
  if (!/^\d+$/.test(nombre) || fecha.split('-').length >= 3) return null
  const sub = fecha ? `${fecha}-${nombre}` : nombre
  const desde = new Date(ahora - 40 * DIA).toISOString().slice(0, sub.length)
  return sub >= desde ? sub : null
}

export function ultimaConLimites(texto: string): string {
  const lineas = texto.split('\n')
  for (let i = lineas.length - 1; i >= 0; i--) if (lineas[i]!.includes('"rate_limits"')) return lineas[i]!
  return ''
}

// Para un archivo grande: la última línea con rate_limits, filtrada por el sistema (la ruta va en CLIMA_CODEX).
// Windows quita las comillas dobles de la línea de comandos: en PowerShell van simples y [char]34 es "
export const filtroCodex = (s: Sistema): string[] =>
  s.windows
    ? ['powershell', '-NoProfile', '-NonInteractive', '-Command',
        "(Select-String -LiteralPath $env:CLIMA_CODEX -SimpleMatch -Pattern ([char]34 + 'rate_limits' + [char]34) | Select-Object -Last 1).Line"]
    : ['sh', '-c', 'tail -c 20000000 "$CLIMA_CODEX" | grep "\\"rate_limits\\"" | tail -1']

type Ventana = { used_percent?: number; window_minutes?: number; resets_at?: number }

// Ventanas de Codex en minutos → las mismas claves que usa Claude
const KIND: Record<number, string> = { 300: 'five_hour', 10080: 'seven_day' }

// 62436 → 62.436
const miles = (n: number): string => String(n).replace(/\B(?=(\d{3})+(?!\d))/g, '.')

export function parsearCodex(linea: string): Agente | null {
  let j: { timestamp?: string; payload?: { rate_limits?: { primary?: Ventana | null; secondary?: Ventana | null; plan_type?: string; credits?: { balance?: string; unlimited?: boolean } | null } } }
  try {
    j = JSON.parse(linea.trim())
  } catch {
    return null
  }
  const rl = j.payload?.rate_limits
  if (!rl) return null
  const limites: Limite[] = []
  for (const v of [rl.primary, rl.secondary]) {
    const kind = v?.window_minutes ? KIND[v.window_minutes] : undefined
    if (!v || !kind || typeof v.used_percent !== 'number') continue
    limites.push({ kind, percentUsed: v.used_percent, ...(v.resets_at ? { resetsAt: new Date(v.resets_at * 1000).toISOString() } : {}) })
  }
  const saldo = rl.credits?.balance ? Number(rl.credits.balance) : NaN
  return {
    limites,
    plan: rl.plan_type ?? null,
    creditos: rl.credits?.unlimited ? tr('ilimitados', 'unlimited') : Number.isFinite(saldo) ? miles(Math.floor(saldo)) : null,
    medido: j.timestamp ?? null,
    nota: null,
  }
}
