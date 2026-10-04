import { describe, expect, test } from 'claude-code/testing'

import { abrirCarpeta, filtroCodex, parsearCodex, ultimaConLimites } from '../hooks/codex'
import { parsearGrok } from '../hooks/grok'
import { parsearAntigravity, rutasAntigravity } from '../hooks/antigravity'
import { agrupar, medidoEl, ventanas } from '../hooks/consumo'
import { esWindows, pythons, unir } from '../hooks/sistema'
import type { Sistema } from '../hooks/sistema'

const MAC: Sistema = { windows: false, home: '/Users/ana', appdata: null }
const WIN: Sistema = { windows: true, home: 'C:\\Users\\ana', appdata: 'C:\\Users\\ana\\AppData\\Roaming' }

describe('sistema', () => {
  test('reconoce Windows por la unidad de la carpeta del mod', () => {
    expect(esWindows('C:\\Users\\ana\\.claude\\plugins\\clima-condor')).toBe(true)
    expect(esWindows('/Users/ana/.claude/plugins/clima-condor')).toBe(false)
  })

  test('une rutas con el separador de cada sistema', () => {
    expect(unir(WIN, WIN.home, '.codex', 'sessions')).toBe('C:\\Users\\ana\\.codex\\sessions')
    expect(unir(MAC, MAC.home, '.codex', 'sessions')).toBe('/Users/ana/.codex/sessions')
  })

  test('en Windows prueba py antes que el python de la Store', () => {
    expect(pythons(WIN)[0]).toEqual(['py', '-3'])
    expect(pythons(MAC)).toEqual([['python3']])
  })

  test('busca Antigravity en %APPDATA%, Application Support y .config', () => {
    expect(rutasAntigravity(WIN)).toEqual(['C:\\Users\\ana\\AppData\\Roaming\\Antigravity\\User\\globalStorage\\state.vscdb'])
    expect(rutasAntigravity(MAC)).toEqual([
      '/Users/ana/Library/Application Support/Antigravity/User/globalStorage/state.vscdb',
      '/Users/ana/.config/Antigravity/User/globalStorage/state.vscdb',
    ])
  })
})

describe('sesiones de codex', () => {
  const ahora = Date.parse('2026-10-03T12:00:00Z')

  test('abre las carpetas AAAA/MM/DD recientes y salta las viejas', () => {
    expect(abrirCarpeta('', '2026', ahora)).toBe('2026')
    expect(abrirCarpeta('2026', '09', ahora)).toBe('2026-09')
    expect(abrirCarpeta('2026-09', '30', ahora)).toBe('2026-09-30')
    expect(abrirCarpeta('2026', '07', ahora)).toBeNull()
    expect(abrirCarpeta('', '2025', ahora)).toBeNull()
    expect(abrirCarpeta('2026-09-30', '01', ahora)).toBeNull()
    expect(abrirCarpeta('2026', 'archivadas', ahora)).toBeNull()
  })

  test('toma la última línea con rate_limits', () => {
    const texto = ['{"a":1,"rate_limits":1}', '{"b":2,"rate_limits":2}', '{"c":3}', ''].join('\n')
    expect(ultimaConLimites(texto)).toBe('{"b":2,"rate_limits":2}')
    expect(ultimaConLimites('{"c":3}')).toBe('')
  })

  test('en Windows el filtro no lleva comillas dobles, que la línea de comandos quita', () => {
    expect(filtroCodex(WIN)[0]).toBe('powershell')
    expect(filtroCodex(WIN).at(-1)).not.toContain('"')
    expect(filtroCodex(MAC)[0]).toBe('sh')
  })
})

describe('codex', () => {
  test('lee la ventana semanal, el plan y los créditos', () => {
    const linea = JSON.stringify({
      timestamp: '2026-10-02T21:54:24.836Z',
      payload: { type: 'token_count', rate_limits: { primary: { used_percent: 1, window_minutes: 10080, resets_at: 1791580508 }, secondary: null, credits: { has_credits: true, unlimited: false, balance: '62436.04' }, plan_type: 'pro' } },
    })
    const c = parsearCodex(linea)
    expect(c?.limites).toEqual([{ kind: 'seven_day', percentUsed: 1, resetsAt: new Date(1791580508 * 1000).toISOString() }])
    expect(c?.plan).toBe('pro')
    expect(c?.creditos).toBe('62.436')
  })

  test('sin datos no inventa nada', () => {
    expect(parsearCodex('')).toBeNull()
    expect(parsearCodex('{"payload":{}}')).toBeNull()
  })
})

describe('grok', () => {
  const cuota = { used: 12.5, estimated: true, tier: 'SuperGrok', period_end: '2026-09-30T06:47:34Z', fetched_at: '2026-09-24T06:48:14Z' }

  test('dentro del periodo usa lo medido', () => {
    const g = parsearGrok(JSON.stringify(cuota), Date.parse('2026-09-25T00:00:00Z'))
    expect(g?.limites[0]).toEqual({ kind: 'seven_day', percentUsed: 12.5, resetsAt: '2026-09-30T06:47:34.000Z' })
    expect(g?.nota).toBe('estimado')
    expect(g?.plan).toBe('SuperGrok')
  })

  test('con el periodo cerrado pasa a la semana vigente sin uso', () => {
    const g = parsearGrok(JSON.stringify(cuota), Date.parse('2026-10-02T22:00:00Z'))
    expect(g?.limites[0]).toEqual({ kind: 'seven_day', percentUsed: 0, resetsAt: '2026-10-07T06:47:34.000Z' })
  })

  test('sin datos no inventa nada', () => {
    expect(parsearGrok('', 0)).toBeNull()
    expect(parsearGrok('null', 0)).toBeNull()
  })
})

describe('antigravity', () => {
  const salida = JSON.stringify({
    plan: 'Google AI Pro',
    guardado: 1779835188,
    modelos: [
      { nombre: 'Gemini 3.1 Pro (High)', restante: 0.4, reinicio: 1778201414 },
      { nombre: 'Gemini 3.1 Pro (Low)', restante: 0.9, reinicio: 1778201414 },
      { nombre: 'Gemini 3 Flash', restante: 1, reinicio: 1778201414 },
      { nombre: 'Claude Opus 4.6 (Thinking)', restante: 0.75, reinicio: 1778201414 },
    ],
  })

  test('agrupa por familia con el modelo más gastado', () => {
    const a = parsearAntigravity(salida, 1778201414_000 - 3600_000)
    expect(a?.plan).toBe('Google AI Pro')
    expect(a?.limites.map(l => [l.etiqueta, l.percentUsed])).toEqual([['Gemini Pro', 60], ['Gemini Flash', 0], ['Claude/GPT', 25]])
    expect(a?.nota).toBeNull()
  })

  test('con la ventana vencida la da por renovada', () => {
    const a = parsearAntigravity(salida, Date.parse('2026-10-02T22:00:00Z'))
    expect(a?.limites.every(l => l.percentUsed === 0)).toBe(true)
    expect(Date.parse(a!.limites[0]!.resetsAt!)).toBeGreaterThan(Date.parse('2026-10-02T22:00:00Z'))
    expect(a?.nota).toContain('renovado')
  })

  test('el medidor usa la etiqueta y la ventana propias', () => {
    const a = parsearAntigravity(salida, 1778201414_000 - 3600_000)
    const v = ventanas(a!.limites, 1778201414_000 - 3600_000)
    expect(v.map(x => x.nombre)).toEqual(['Gemini Pro', 'Gemini Flash', 'Claude/GPT'])
    expect(Math.round((v[0]?.transcurrido ?? 0) * 10)).toBe(8)
  })

  test('sin datos no inventa nada', () => {
    expect(parsearAntigravity('null', 0)).toBeNull()
  })
})

describe('diseño', () => {
  test('agrupa ventanas idénticas y fecha lo antiguo por día', () => {
    const base = { kind: 'a', nombre: 'Gemini Pro', usado: 0, transcurrido: 0.5, reinicio: 10, ritmo: null }
    expect(agrupar([base, { ...base, kind: 'b' }], 'Todos').map(v => v.nombre)).toEqual(['Todos'])
    expect(agrupar([base, { ...base, kind: 'b', usado: 5 }], 'Todos')).toHaveLength(2)
    const ahora = Date.parse('2026-10-02T22:00:00Z')
    expect(medidoEl(Date.parse('2026-09-24T06:48:14Z'), ahora, 0)).toBe('24 sep')
    expect(medidoEl(ahora - 3600_000, ahora, 0)).toBe('21:00')
  })
})
