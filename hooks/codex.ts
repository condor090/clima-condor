// Límites de uso de Codex: se leen del último evento token_count de sus sesiones en ~/.codex
import type { Agente, Limite } from '../types'
import { tr } from './idioma'

// Último registro con rate_limits del archivo de sesión más reciente (los de la última semana)
export const LEER_CODEX =
  'f=$(find "$HOME/.codex/sessions" -name "*.jsonl" -mtime -8 -exec stat -f "%m %N" {} + 2>/dev/null | sort -rn | head -1 | cut -d" " -f2-); ' +
  '[ -n "$f" ] && tail -c 20000000 "$f" | grep "\\"rate_limits\\"" | tail -1'

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
