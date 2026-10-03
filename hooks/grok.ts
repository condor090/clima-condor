// Cuota semanal de Grok Build: la calcula ~/.grok/statusline.py desde el registro de Grok
import type { Agente, Limite } from '../types'

export const LEER_GROK =
  'cd "$HOME/.grok" 2>/dev/null && python3 -c "import json, statusline; print(json.dumps(statusline.load_quota(\'clima-condor\')))" 2>/dev/null'

const SEMANA = 7 * 24 * 3600 * 1000

type Cuota = { used?: number; estimated?: boolean; tier?: string; period_start?: string; period_end?: string; fetched_at?: string }

export function parsearGrok(salida: string, ahora: number): Agente | null {
  let q: Cuota | null
  try {
    q = JSON.parse(salida.trim()) as Cuota | null
  } catch {
    return null
  }
  if (!q || typeof q.used !== 'number') return null
  let fin = q.period_end ? Date.parse(q.period_end) : NaN
  let usado = q.used
  let nota = q.estimated ? 'estimado' : ''
  // El periodo ya cerró y Grok no ha vuelto a medir: el nuevo periodo empieza sin uso
  if (Number.isFinite(fin) && fin <= ahora) {
    while (fin <= ahora) fin += SEMANA
    usado = 0
    nota = 'sin uso este periodo'
  }
  const limites: Limite[] = [{ kind: 'seven_day', percentUsed: usado, ...(Number.isFinite(fin) ? { resetsAt: new Date(fin).toISOString() } : {}) }]
  return { limites, plan: q.tier ?? null, creditos: null, medido: q.fetched_at ?? null, nota: nota || null }
}
