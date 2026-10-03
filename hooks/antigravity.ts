// Cuota de Antigravity por familia de modelos, desde la copia que guarda su app de escritorio
import type { Agente, Limite } from '../types'

// `root`: la carpeta del mod ($.plugin.root), esté donde esté instalado
export const leerAntigravity = (root: string): string => `python3 "${root.replace(/"/g, '\\"')}/hooks/antigravity.py" 2>/dev/null`

// En el plan Pro la cuota se renueva cada 5 horas
const VENTANA = 5 * 3600 * 1000

const FAMILIAS: Array<{ kind: string; etiqueta: string; es: RegExp }> = [
  { kind: 'ag-pro', etiqueta: 'Gemini Pro', es: /gemini.*pro/i },
  { kind: 'ag-flash', etiqueta: 'Gemini Flash', es: /gemini.*flash/i },
  { kind: 'ag-otros', etiqueta: 'Claude/GPT', es: /claude|gpt/i },
]

type Salida = { plan?: string | null; guardado?: number; modelos?: Array<{ nombre: string; restante: number; reinicio: number | null }> }

export function parsearAntigravity(salida: string, ahora: number): Agente | null {
  let s: Salida | null
  try {
    s = JSON.parse(salida.trim()) as Salida | null
  } catch {
    return null
  }
  if (!s?.modelos?.length) return null
  let renovada = false
  const limites: Limite[] = []
  for (const f of FAMILIAS) {
    const ms = s.modelos.filter(m => f.es.test(m.nombre))
    if (!ms.length) continue
    // La familia queda como su modelo más gastado
    const peor = ms.reduce((a, b) => (b.restante < a.restante ? b : a))
    let usado = Math.round((1 - peor.restante) * 1000) / 10
    let fin = peor.reinicio ? peor.reinicio * 1000 : NaN
    // La ventana ya pasó: la cuota se renovó entera aunque la copia no lo sepa
    if (Number.isFinite(fin) && fin <= ahora) {
      while (fin <= ahora) fin += VENTANA
      usado = 0
      renovada = true
    }
    limites.push({ kind: f.kind, etiqueta: f.etiqueta, largoMs: VENTANA, percentUsed: usado, ...(Number.isFinite(fin) ? { resetsAt: new Date(fin).toISOString() } : {}) })
  }
  return {
    limites,
    plan: s.plan ?? null,
    creditos: null,
    medido: s.guardado ? new Date(s.guardado * 1000).toISOString() : null,
    nota: renovada ? 'ya renovado · abre la app para el dato real' : null,
  }
}
