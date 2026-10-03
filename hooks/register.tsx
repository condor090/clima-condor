import { atom, read, update } from 'claude-code'
import type { EngineInterface, Register, Timer } from 'claude-code'

import type { Agente, Ciclon, Clima, Limite, Lugar, ModoReloj, Sim } from '../types'
import { LEER_CODEX, parsearCodex } from './codex'
import { LEER_GROK, parsearGrok } from './grok'
import { leerAntigravity, parsearAntigravity } from './antigravity'
import {
  SANTIAGO,
  barra,
  cielo,
  colorTemp,
  grados,
  icono,
  tarjeta,
  nombreDia,
  parsear,
  rumbo,
  urlGeocodificar,
  urlPronostico,
} from './clima'
import { agrupar, colorUso, hex, medidoEl, medidor, reinicioCorto, ritmoCorto, ventanas } from './consumo'
import { capas, componer, empaquetar, svgCuadro, svgDe, svgEscena } from './escena'
import type { Capas } from './escena'
import { DOS_CIUDADES, TEMAS, horaEn, offsetDe } from './reloj'
import type { Contexto } from './reloj'
import { celdasVector, svgVector } from './vector'
import type { Dibujo } from './vector'
import { fase as faseLunar, proxima } from './luna'
import { cruce } from './astro'
import { candidatos, estadoMarea, parsearMarea, urlMarea } from './marea'
import {
  COLOR_NIVEL,
  RADIO_INTERES_KM,
  TEXTO_NIVEL,
  URL_NHC,
  cercania,
  claseTexto,
  nivel,
  parsearAviso,
  parsearNhc,
  rumbo16,
  seAcerca,
} from './huracanes'
import { dibujoEspiral, dibujoMarea, dibujoRadar, escalaRadar } from './graficos'

const PANEL = 'clima'
const TITULO = 'Clima'
const CADA_MS = 15 * 60 * 1000
const ACENTO = '#7dd3fc'

const clima = atom({ plugin: 'clima-condor', key: 'clima' } as const, null)
const error = atom({ plugin: 'clima-condor', key: 'error' } as const, null)
const cargando = atom({ plugin: 'clima-condor', key: 'cargando' } as const, false)
const caratulaA = atom({ plugin: 'clima-condor', key: 'caratula' } as const, 0)
const modoA = atom({ plugin: 'clima-condor', key: 'modo' } as const, 'analogico')
// Cambia cada minuto para redibujar el panel
const minutoA = atom({ plugin: 'clima-condor', key: 'minuto' } as const, 0)
const tarjetaA = atom({ plugin: 'clima-condor', key: 'tarjeta' } as const, null)
// Límites de uso (5 horas y semanal) para el medidor bajo el reloj
const limitesA = atom({ plugin: 'clima-condor', key: 'limites' } as const, [])
const MEDIDOR = 28
// Límites de Codex, Grok Build y Antigravity, releídos cada 2 minutos
const codexA = atom({ plugin: 'clima-condor', key: 'codex' } as const, null)
const grokA = atom({ plugin: 'clima-condor', key: 'grok' } as const, null)
const antigravityA = atom({ plugin: 'clima-condor', key: 'antigravity' } as const, null)
const AGENTES_MS = 2 * 60 * 1000
// Marea de la costa más cercana (cada 3 h) y ciclones del NHC (cada 30 min)
const mareaA = atom({ plugin: 'clima-condor', key: 'marea' } as const, null)
const huracanesA = atom({ plugin: 'clima-condor', key: 'huracanes' } as const, null)
// Timelapse del amanecer, el atardecer o la salida de la luna
const simA = atom({ plugin: 'clima-condor', key: 'sim' } as const, null)
const MAREA_MS = 3 * 60 * 60 * 1000
const HURACANES_MS = 30 * 60 * 1000

async function leerAgentes($: EngineInterface): Promise<void> {
  const leer = async (sh: string): Promise<string> => {
    try {
      return (await $.process.run(['sh', '-c', sh], { timeoutMs: 15_000 })).stdout
    } catch {
      return ''
    }
  }
  const [codex, grok, ag] = await Promise.all([leer(LEER_CODEX), leer(LEER_GROK), leer(leerAntigravity($.plugin.root))])
  const ahora = await $.clock.now()
  // Sin el agente instalado o sin datos, su sección queda oculta
  const c: Agente | null = parsearCodex(codex)
  const g: Agente | null = parsearGrok(grok, ahora)
  if (c) await update($, codexA, () => c)
  if (g) await update($, grokA, () => g)
  const a: Agente | null = parsearAntigravity(ag, ahora)
  if (a) await update($, antigravityA, () => a)
}

const copiar = (ls: readonly Limite[]): Limite[] => ls.map(l => ({ kind: l.kind, percentUsed: l.percentUsed, ...(l.resetsAt ? { resetsAt: l.resetsAt } : {}) }))

// --- Fechas cortas en la hora del lugar

const DIAS = ['dom', 'lun', 'mar', 'mié', 'jue', 'vie', 'sáb']
const MESES = ['ene', 'feb', 'mar', 'abr', 'may', 'jun', 'jul', 'ago', 'sep', 'oct', 'nov', 'dic']

function cuando(ms: number, ahora: number, offsetMin: number): string {
  const d = new Date(ms + offsetMin * 60_000)
  const dia = (x: number) => Math.floor((x + offsetMin * 60_000) / 86_400_000)
  const hh = `${String(d.getUTCHours()).padStart(2, '0')}:${String(d.getUTCMinutes()).padStart(2, '0')}`
  const dif = dia(ms) - dia(ahora)
  if (dif === 0) return `hoy ${hh}`
  if (dif === 1) return `mañana ${hh}`
  return `${DIAS[d.getUTCDay()]} ${d.getUTCDate()} ${MESES[d.getUTCMonth()]} ${hh}`
}

// --- Animación: en la terminal el cielo va a 8 cuadros por segundo y los relojes se re-blitean;
// en el escritorio todo se mueve solo con SMIL y el panel se redibuja al cambiar el minuto

const CIELO = { columnas: 40, filas: 10 }
let animacion: Timer | null = null
let cuadro = 0
let ultimoTic = -1

const aMinutos = (hhmm: string, defecto: number): number => {
  const [h, m] = hhmm.split(':').map(Number)
  return Number.isFinite(h) && Number.isFinite(m) ? (h ?? 0) * 60 + (m ?? 0) : defecto
}

const solDe = (c: Clima) => ({ amanecer: aMinutos(c.dias[0]?.amanecer ?? '', 420), atardecer: aMinutos(c.dias[0]?.atardecer ?? '', 1170) })

// El reloj del cielo: el real, o el del timelapse si hay uno corriendo
const tiempoEscena = (ahora: number, sim: Sim | null): number => (sim ? Math.min(sim.hasta, sim.desde + (ahora - sim.real) * sim.vel) : ahora)

// Las capas del cielo cambian poco: se rehacen cada 30 s de la escena
let capasGuardadas: { clave: string; capas: Capas } | null = null
function capasDe(c: Clima, ahora: number): Capas {
  const clave = `${c.lugar.lat},${c.lugar.lon},${c.actual.codigo},${Math.floor(ahora / 30_000)}`
  if (capasGuardadas?.clave === clave) return capasGuardadas.capas
  const t = horaEn(ahora, c.offsetMin)
  const nuevas = capas(
    { codigo: c.actual.codigo, lat: c.lugar.lat, lon: c.lugar.lon, minutos: t.h * 60 + t.m + t.s / 60, ...solDe(c), cuadro: Math.floor(ahora / 125), ms: ahora },
    CIELO.columnas,
    CIELO.filas * 2,
  )
  capasGuardadas = { clave, capas: nuevas }
  return nuevas
}

// La otra ciudad de «Dos ciudades»: la de las opciones del mod (segunda_ciudad, segunda_zona)
let segunda = { nombre: 'Santiago', zona: 'America/Santiago' }
function otraCiudad(): { nombre: string; zona: string } {
  return segunda
}

type Reloj = { key: string; nombre: string; texto: string; dibujo: Dibujo; lado: number }

function relojesDe(c: Clima, temaIdx: number, modo: ModoReloj, ahora: number): Reloj[] {
  const tema = TEMAS[temaIdx] ?? TEMAS[0]!
  const car = modo === 'analogico' ? tema.analogico : tema.digital
  const sol = solDe(c)
  const ctx = (offset: number): Contexto => ({ ...horaEn(ahora, offset), ms: ahora % 1000, ...sol })
  const texto = (x: Contexto) => `${String(x.h).padStart(2, '0')}:${String(x.m).padStart(2, '0')}`
  const ciudad = c.lugar.nombre.split(',')[0] ?? c.lugar.nombre
  const local = ctx(c.offsetMin)
  if (tema.id !== DOS_CIUDADES) {
    return [{ key: 'reloj', nombre: ciudad, texto: texto(local), dibujo: car.dibujar(local, false), lado: modo === 'analogico' ? 5 : 4 }]
  }
  const otra = otraCiudad()
  const lejos = ctx(offsetDe(otra.zona, ahora))
  const lado = modo === 'analogico' ? 4 : 5
  return [
    { key: 'reloj-a', nombre: ciudad, texto: texto(local), dibujo: car.dibujar(local, true), lado },
    { key: 'reloj-b', nombre: otra.nombre, texto: texto(lejos), dibujo: car.dibujar(lejos, true), lado },
  ]
}

async function cuadroSiguiente($: EngineInterface): Promise<void> {
  const c = await read($, clima)
  if (!c) return
  cuadro++
  const ahora = await $.clock.now()
  const sim = await read($, simA)
  const r = await $.ui.blit({ requestId: PANEL, key: 'cielo', cells: empaquetar(componer(capasDe(c, tiempoEscena(ahora, sim)), cuadro)), ...CIELO })
  if (r.deny) {
    // El panel ya no está a la vista: paramos hasta que se vuelva a dibujar
    animacion?.cancel()
    animacion = null
    return
  }
  // Analógico a 4 cuadros por segundo para que el segundero barra; digital una vez por segundo
  const modo = await read($, modoA)
  const tic = modo === 'analogico' ? Math.floor(ahora / 250) : Math.floor(ahora / 1000)
  if (tic === ultimoTic) return
  ultimoTic = tic
  if (sim) await revisarSim($, ahora, sim)
  const minuto = Math.floor(ahora / 60_000)
  if (minuto !== (await read($, minutoA))) await update($, minutoA, () => minuto)
  for (const rel of relojesDe(c, await read($, caratulaA), modo, ahora)) {
    await $.ui.blit({ requestId: PANEL, key: rel.key, cells: celdasVector(rel.dibujo), columns: rel.dibujo.ancho, rows: rel.dibujo.alto / 2 })
  }
}

function animar($: EngineInterface): void {
  if (animacion) return
  animacion = $.clock.every(125, () => void cuadroSiguiente($))
}

// En el escritorio: un redibujo justo al cambiar cada minuto (los segundos los mueve el SVG)
let minuteroListo = false
function minutero($: EngineInterface): void {
  void (async () => {
    const ahora = await $.clock.now()
    $.clock.after(60_000 - (ahora % 60_000) + 150, () => {
      void (async () => {
        const t = await $.clock.now()
        await update($, minutoA, () => Math.floor(t / 60_000))
        minutero($)
      })()
    })
  })()
}
function pulsoEscritorio($: EngineInterface): void {
  if (minuteroListo) return
  minuteroListo = true
  minutero($)
}

// --- Timelapse: 2 horas del cielo en ~40 segundos

type Evento = 'amanecer' | 'atardecer' | 'luna'
const EVENTOS: Record<Evento, { nombre: string; cuerpo: 'sol' | 'luna'; sube: boolean; antes: number; despues: number }> = {
  amanecer: { nombre: 'Amanecer', cuerpo: 'sol', sube: true, antes: 75, despues: 45 },
  atardecer: { nombre: 'Atardecer', cuerpo: 'sol', sube: false, antes: 45, despues: 75 },
  luna: { nombre: 'Salida de la luna', cuerpo: 'luna', sube: true, antes: 30, despues: 90 },
}
const DURACION_SIM_S = 40

let pulsoSim: Timer | null = null

async function iniciarSim($: EngineInterface, ev: Evento): Promise<string> {
  const c = await read($, clima)
  if (!c) return 'Todavía no tengo el clima.'
  const ahora = await $.clock.now()
  const e = EVENTOS[ev]
  // El próximo, buscando desde un poco antes para incluir uno que está ocurriendo
  const t = cruce(e.cuerpo, ahora - e.despues * 60_000, c.lugar.lat, c.lugar.lon, e.sube)
  if (t === null) return `No encontré el próximo ${e.nombre.toLowerCase()} en 36 horas.`
  const desde = t - e.antes * 60_000
  const hasta = t + e.despues * 60_000
  const sim: Sim = { nombre: e.nombre, real: ahora, desde, hasta, vel: (hasta - desde) / (DURACION_SIM_S * 1000) }
  await update($, simA, () => sim)
  capasGuardadas = null
  // En el escritorio el cielo se redibuja 4 veces por segundo mientras dura
  pulsoSim?.cancel()
  pulsoSim = $.clock.every(250, () => {
    void (async () => {
      const s = await read($, simA)
      const ya = await $.clock.now()
      if (!s) {
        pulsoSim?.cancel()
        pulsoSim = null
        return
      }
      await update($, minutoA, () => -Math.floor(ya / 250))
      await revisarSim($, ya, s)
    })()
  })
  return `${e.nombre} acelerado: ${cuando(t, ahora, c.offsetMin)}, visto en ${DURACION_SIM_S} segundos.`
}

// Al llegar al final se queda 4 s en el último cuadro y vuelve a la hora real
async function revisarSim($: EngineInterface, ahora: number, sim: Sim): Promise<void> {
  if (ahora - sim.real > DURACION_SIM_S * 1000 + 4000) await detenerSim($)
}

async function detenerSim($: EngineInterface): Promise<void> {
  pulsoSim?.cancel()
  pulsoSim = null
  await update($, simA, () => null)
  capasGuardadas = null
  const ahora = await $.clock.now()
  await update($, minutoA, () => Math.floor(ahora / 60_000))
}

async function cambiarCaratula($: EngineInterface, paso: number): Promise<void> {
  const n = ((await read($, caratulaA)) + paso + TEMAS.length) % TEMAS.length
  await update($, caratulaA, () => n)
  await $.store.set('caratula', n)
}

async function cambiarModo($: EngineInterface, modo: ModoReloj): Promise<void> {
  await update($, modoA, () => modo)
  await $.store.set('modo', modo)
  ultimoTic = -1
}

// Ubicación: la fijada con /clima <ciudad>, o la detectada por IP, o Santiago
async function ubicar($: EngineInterface): Promise<Lugar> {
  const fijada = (await $.store.get('lugar')) as Lugar | undefined
  if (fijada && typeof fijada.lat === 'number') return fijada

  try {
    const r = await $.http.fetch('https://ipwho.is/')
    if (r.ok) {
      const j = JSON.parse(r.text) as { success?: boolean; city?: string; region?: string; latitude?: number; longitude?: number }
      if (j.success !== false && typeof j.latitude === 'number' && typeof j.longitude === 'number') {
        return { nombre: [j.city, j.region].filter(Boolean).join(', ') || 'Tu ubicación', lat: j.latitude, lon: j.longitude }
      }
    }
  } catch {
    // probamos el siguiente proveedor
  }
  try {
    const r = await $.http.fetch('http://ip-api.com/json/?fields=city,regionName,lat,lon')
    if (r.ok) {
      const j = JSON.parse(r.text) as { city?: string; regionName?: string; lat?: number; lon?: number }
      if (typeof j.lat === 'number' && typeof j.lon === 'number') {
        return { nombre: [j.city, j.regionName].filter(Boolean).join(', ') || 'Tu ubicación', lat: j.lat, lon: j.lon }
      }
    }
  } catch {
    // caemos a Santiago
  }
  return SANTIAGO
}

async function geocodificar($: EngineInterface, nombre: string): Promise<Lugar | null> {
  const r = await $.http.fetch(urlGeocodificar(nombre))
  if (!r.ok) return null
  const j = JSON.parse(r.text) as {
    results?: Array<{ name: string; admin1?: string; country?: string; latitude: number; longitude: number }>
  }
  const p = j.results?.[0]
  if (!p) return null
  return { nombre: [p.name, p.admin1 ?? p.country].filter(Boolean).join(', '), lat: p.latitude, lon: p.longitude }
}

// --- Marea

let mareaLeida: { clave: string; ms: number } | null = null
async function leerMarea($: EngineInterface, lugar: Lugar, forzar = false): Promise<void> {
  const ahora = await $.clock.now()
  const clave = `${lugar.lat},${lugar.lon}`
  if (!forzar && mareaLeida?.clave === clave && ahora - mareaLeida.ms < MAREA_MS) return
  mareaLeida = { clave, ms: ahora }
  try {
    const r = await $.http.fetch(urlMarea(candidatos(lugar)))
    if (!r.ok) return
    const m = parsearMarea(lugar, JSON.parse(r.text))
    await update($, mareaA, () => m)
  } catch {
    // sin marea: la sección queda oculta
  }
}

// --- Ciclones tropicales

let huracanesLeidos: { clave: string; ms: number } | null = null
async function leerHuracanes($: EngineInterface, lugar: Lugar, forzar = false): Promise<void> {
  const ahora = await $.clock.now()
  const clave = `${lugar.lat},${lugar.lon}`
  if (!forzar && huracanesLeidos?.clave === clave && ahora - huracanesLeidos.ms < HURACANES_MS - 60_000) return
  huracanesLeidos = { clave, ms: ahora }
  try {
    const r = await $.http.fetch(URL_NHC)
    if (!r.ok) throw new Error(`el NHC respondió ${r.status}`)
    const ciclones: Ciclon[] = []
    for (const b of parsearNhc(lugar, JSON.parse(r.text))) {
      const { urlAviso, ...resto } = b
      let aviso = { puntos: [] as Ciclon['pronostico'], radio34Km: null as number | null }
      // La trayectoria solo de los que están a menos de 3.000 km
      if (b.km <= RADIO_INTERES_KM && urlAviso) {
        try {
          const a = await $.http.fetch(urlAviso)
          if (a.ok) aviso = parsearAviso(a.text, ahora)
        } catch {
          // sin trayectoria: queda la posición actual
        }
      }
      const c: Ciclon = { ...resto, pronostico: aviso.puntos, radio34Km: aviso.radio34Km, cercania: null }
      ciclones.push({ ...c, cercania: aviso.puntos.length > 0 ? cercania(lugar, c, aviso.puntos, ahora) : null })
    }
    await update($, huracanesA, () => ({ ciclones, consultado: ahora, error: null }))
    await avisarCiclon($, ciclones, ahora)
  } catch (err) {
    const antes = await read($, huracanesA)
    const msg = err instanceof Error ? err.message : String(err)
    await update($, huracanesA, () => ({ ciclones: antes?.ciclones ?? [], consultado: antes?.consultado ?? 0, error: msg }))
  }
  await actualizarTarjeta($)
}

// Un aviso emergente por ciclón y nivel al día, cuando entra en vigilancia o alerta
async function avisarCiclon($: EngineInterface, cs: Ciclon[], ahora: number): Promise<void> {
  const c = cs[0]
  if (!c) return
  const n = nivel(c)
  if (n !== 'alerta' && n !== 'vigilancia') return
  const clave = `${c.id}:${n}:${Math.floor(ahora / 86_400_000)}`
  const vistos = ((await $.store.get('avisosCiclon')) as string[] | undefined) ?? []
  if (vistos.includes(clave)) return
  $.ui.toast(`🌀 ${TEXTO_NIVEL[n]}: ${claseTexto(c)} ${c.nombre} a ${c.km} km al ${rumbo16(c.rumbo)} · /clima para ver el radar`, { timeoutMs: 12_000 })
  await $.store.set('avisosCiclon', [...vistos.slice(-20), clave])
}

// La tarjeta de la barra suma el ciclón más cercano si está a menos de 1.500 km
async function actualizarTarjeta($: EngineInterface): Promise<void> {
  const c = await read($, clima)
  if (!c) return
  const base = tarjeta(c)
  const cerca = (await read($, huracanesA))?.ciclones[0]
  const extra = cerca && nivel(cerca) !== 'lejos' ? `🌀 ${cerca.nombre} a ${cerca.km} km` : ''
  await update($, tarjetaA, () => ({ ...base, detalle: [extra, base.detalle].filter(Boolean).join(' · ') }))
}

let enCurso: Promise<Clima | null> | null = null

async function refrescar($: EngineInterface, forzar = false): Promise<Clima | null> {
  // Con un lugar nuevo, la lectura en curso puede ser del anterior: se espera y se lee de nuevo
  while (forzar && enCurso) await enCurso
  if (enCurso) return enCurso
  enCurso = (async () => {
    await update($, cargando, () => true)
    try {
      const lugar = await ubicar($)
      const r = await $.http.fetch(urlPronostico(lugar))
      if (!r.ok) throw new Error(`Open-Meteo respondió ${r.status}`)
      const nuevo = parsear(lugar, JSON.parse(r.text))
      await update($, clima, () => nuevo)
      await update($, error, () => null)
      await actualizarTarjeta($)
      void leerMarea($, lugar, forzar)
      void leerHuracanes($, lugar, forzar)
      return nuevo
    } catch (err) {
      await update($, error, () => (err instanceof Error ? err.message : String(err)))
      return null
    } finally {
      await update($, cargando, () => false)
      enCurso = null
    }
  })()
  return enCurso
}

export const register: Register = (on, options) => {
  const nombre = typeof options.segunda_ciudad === 'string' ? options.segunda_ciudad.trim() : ''
  const zona = typeof options.segunda_zona === 'string' ? options.segunda_zona.trim() : ''
  if (nombre && zona) segunda = { nombre, zona }

  on('session.start', async ($, e, next) => {
    await $.command.register({
      name: 'clima',
      description: 'Clima, luna, marea y huracanes: /clima, /clima <ciudad>, /clima amanecer | atardecer | luna, /clima auto, /clima cerrar',
    })
    const guardada = (await $.store.get('caratula')) as number | undefined
    if (typeof guardada === 'number') await update($, caratulaA, () => guardada % TEMAS.length)
    const modo = (await $.store.get('modo')) as ModoReloj | undefined
    if (modo === 'analogico' || modo === 'digital') await update($, modoA, () => modo)
    void refrescar($)
    $.clock.every(CADA_MS, () => void refrescar($))
    // Los ciclones se revisan aunque el clima no cambie
    $.clock.every(HURACANES_MS, () => {
      void (async () => {
        const c = await read($, clima)
        if (c) await leerHuracanes($, c.lugar)
      })()
    })
    void $.session.usage().then(u => update($, limitesA, () => copiar(u.rateLimits)))
    void leerAgentes($)
    $.clock.every(AGENTES_MS, () => void leerAgentes($))

    return next(e)
  })

  // El motor avisa cuando un límite se mueve un punto entero
  on('session.measure', async ($, e, next) => {
    if (e.changed.includes('rateLimits')) await update($, limitesA, () => copiar(e.rateLimits))
    return next(e)
  })

  on('command.run', { command: 'clima' }, async ($, e) => {
    const arg = e.args.trim()

    if (arg.toLowerCase() === 'cerrar') {
      await $.ui.close({ id: PANEL })
      return { text: 'Panel del clima cerrado. La barra de estado sigue activa.' }
    }

    const ev = arg.toLowerCase()
    if (ev === 'amanecer' || ev === 'atardecer' || ev === 'luna') {
      await $.ui.open({ id: PANEL, title: TITULO })
      return { text: await iniciarSim($, ev) }
    }

    if (arg.toLowerCase() === 'auto') {
      await $.store.delete('lugar')
    } else if (arg) {
      const lugar = await geocodificar($, arg)
      if (!lugar) return { text: `No encontré "${arg}". Prueba con otro nombre.` }
      await $.store.set('lugar', lugar)
    }

    const c = await refrescar($, Boolean(arg))
    await $.ui.open({ id: PANEL, title: TITULO })
    if (!c) return { text: `No pude obtener el clima: ${(await read($, error)) ?? 'error desconocido'}` }

    const cie = cielo(c.actual.codigo)
    const hoy = c.dias[0]
    const resumen = hoy ? ` · hoy ${grados(hoy.min)} / ${grados(hoy.max)}` : ''
    return { text: `${icono(c.actual.codigo, c.actual.esDia)} ${c.lugar.nombre}: ${grados(c.actual.temp)}, ${cie.texto.toLowerCase()}${resumen}` }
  })

  on('ui.render', { component: 'Pane', requestId: PANEL }, async ($, e) => {
    const el = $.ui.resolve(e)
    const { Box, Text, Button, Link } = el
    const Raster = e.surface === 'terminal' ? $.ui.resolve(e).Raster : null
    // Sin Raster (escritorio, VS Code, móvil) las mismas celdas se dibujan como SVG
    const Svg = !Raster && 'Svg' in el ? el.Svg : null
    const pixeles = (key: string, cells: string, columnas: number, filas: number, alt: string, lado = 4) =>
      Raster ? (
        <Raster key={key} columns={columnas} rows={filas} cells={cells} />
      ) : Svg ? (
        <Svg key={key} source={svgDe(cells, columnas, filas, lado)} alt={alt} width={columnas * lado} height={filas * 2 * lado} />
      ) : null
    // Un dibujo vectorial: SVG animado en el escritorio, píxeles en la terminal
    const vector = (key: string, d: Dibujo, alt: string, lado: number) =>
      Raster ? (
        <Raster key={key} columns={d.ancho} rows={d.alto / 2} cells={celdasVector(d)} />
      ) : Svg ? (
        <Svg key={key} source={svgVector(d, lado)} alt={alt} width={d.ancho * lado} height={d.alto * lado} isInteractive />
      ) : null
    const c = await read($, clima)
    const fallo = await read($, error)
    const ocupado = await read($, cargando)

    if (!c) {
      return (
        <Box flexDirection="column" paddingX={1}>
          <Text color={ACENTO} bold>Clima</Text>
          {fallo ? <Text color="#f87171">No pude obtener el clima: {fallo}</Text> : <Text dimColor>Mirando el cielo…</Text>}
          {fallo && <Button key="reintentar" label="Reintentar" hotkey="r" onPress={() => void refrescar($)} />}
        </Box>
      )
    }

    const a = c.actual
    const cie = cielo(a.codigo)
    const hoy = c.dias[0]
    const bajo = Math.min(...c.dias.map(d => d.min))
    const alto = Math.max(...c.dias.map(d => d.max))
    const ahora = await $.clock.now()
    const indice = await read($, caratulaA)
    const modo = await read($, modoA)
    await read($, minutoA)
    const tema = TEMAS[indice] ?? TEMAS[0]!
    const caratula = modo === 'analogico' ? tema.analogico : tema.digital
    const relojes = relojesDe(c, indice, modo, ahora)
    const consumo = ventanas(await read($, limitesA), ahora)
    const agentes = [
      { id: 'x', nombre: 'Codex', color: '#10a37f', datos: await read($, codexA) },
      { id: 'g', nombre: 'Grok Build', color: '#e5e7eb', datos: await read($, grokA) },
      { id: 'a', nombre: 'Antigravity', color: '#8ab4f8', datos: await read($, antigravityA) },
    ]
    if (Raster) animar($)
    else if (Svg) pulsoEscritorio($)
    const graficos = Boolean(Raster || Svg)

    // Luna: fase de hoy y la próxima llena (o nueva, si ya va menguando)
    const luna = faseLunar(ahora, c.lugar.lat)
    const siguiente = proxima(ahora, luna.creciente ? 180 : 0)
    const lunaSale = cruce('luna', ahora, c.lugar.lat, c.lugar.lon, true)
    const lunaPone = cruce('luna', ahora, c.lugar.lat, c.lugar.lon, false)

    // Timelapse en curso
    const sim = await read($, simA)
    const tEscena = tiempoEscena(ahora, sim)
    const cielito = capasDe(c, tEscena)

    // Marea de la costa más cercana
    const marea = await read($, mareaA)
    const em = marea ? estadoMarea(marea, ahora) : null

    // Ciclones: el más cercano manda el nivel
    const hur = await read($, huracanesA)
    const ciclones = hur?.ciclones ?? []
    const principal = ciclones[0]
    const nivelPrincipal = principal ? nivel(principal) : 'lejos'
    const urgente = nivelPrincipal === 'alerta' || nivelPrincipal === 'vigilancia'

    // Una ventana de uso en una línea: nombre, medidor, lo que queda, reinicio y ritmo
    const fila = (p: string, v: (typeof consumo)[number]) => {
      if (!graficos) return null
      const r = ritmoCorto(v, ahora, c.offsetMin)
      const queda = Math.max(0, Math.round(100 - v.usado))
      return (
        <Box key={`v-${p}-${v.kind}`} gap={1}>
          <Box width={2} />
          <Box width={12}>
            <Text>{v.nombre}</Text>
          </Box>
          {pixeles(`m-${p}-${v.kind}`, medidor(v, MEDIDOR), MEDIDOR, 1, `${v.nombre}: ${Math.round(v.usado)}% usado`, 6)}
          <Box width={5} justifyContent="flex-end">
            <Text color={hex(colorUso(v.usado))} bold>{queda}%</Text>
          </Box>
          <Text dimColor>{reinicioCorto(v, ahora, c.offsetMin)}</Text>
          {r ? <Text color={r.color}>{r.texto}</Text> : null}
        </Box>
      )
    }

    // Encabezado de cada agente: nombre en su color y los datos en gris
    const encabezado = (key: string, nombre: string, color: string, datos: string[]) => (
      <Box key={key} marginTop={1} gap={1}>
        <Text color={color} bold>◆ {nombre}</Text>
        <Text dimColor>{datos.filter(Boolean).join(' · ')}</Text>
      </Box>
    )

    // Marea: altímetro chico a la izquierda y los datos a la derecha
    const seccionMarea =
      marea && em ? (
        <Box key="marea" marginTop={1} gap={2}>
          {graficos ? vector('marea-g', dibujoMarea(marea, ahora), `Marea: ${em.subiendo ? 'subiendo' : 'bajando'}, ${em.altura.toFixed(2)} m`, 4) : null}
          <Box flexDirection="column" flexShrink={1}>
            <Box gap={1}>
              <Text color="#38bdf8" bold>🌊 Marea</Text>
              <Text dimColor>costa a {marea.km} km al {rumbo16(marea.rumbo)}</Text>
            </Box>
            <Text>
              <Text color={em.subiendo ? '#38bdf8' : '#94a3b8'} bold>{em.subiendo ? '↑ Subiendo' : '↓ Bajando'}</Text>
              <Text> {em.altura.toFixed(2)} m</Text>
            </Text>
            {em.proximas.map(x => (
              <Text key={`ex-${x.ms}`}>
                <Text color={x.tipo === 'alta' ? '#fde047' : '#a78bfa'}>●</Text>
                <Text dimColor> {x.tipo === 'alta' ? 'Pleamar' : 'Bajamar'} {cuando(x.ms, ahora, c.offsetMin)} · {x.altura.toFixed(2)} m</Text>
              </Text>
            ))}
            <Text dimColor>modelo global, no sirve para navegar</Text>
          </Box>
        </Box>
      ) : null

    const seccionHuracanes = (
      <Box key="huracanes" flexDirection="column" marginTop={1}>
        <Box gap={1}>
          {Svg && principal ? vector('espiral', dibujoEspiral(c.lugar.lat < 0, Number.parseInt(COLOR_NIVEL[nivelPrincipal].slice(1), 16)), 'Ciclón activo', 2) : <Text>🌀</Text>}
          <Text color={principal ? COLOR_NIVEL[nivelPrincipal] : ACENTO} bold>Huracanes</Text>
          {principal ? <Text color={COLOR_NIVEL[nivelPrincipal]} bold>{TEXTO_NIVEL[nivelPrincipal]}</Text> : null}
          <Text dimColor>NHC{hur?.consultado ? ` · ${cuando(hur.consultado, ahora, c.offsetMin).replace(/^hoy /, '')}` : ''}{hur?.error ? ' · sin conexión' : ''}</Text>
        </Box>
        {!hur ? (
          <Text dimColor>Consultando el Centro Nacional de Huracanes…</Text>
        ) : ciclones.length === 0 ? (
          <Text dimColor>Sin ciclones activos en el Atlántico ni en el Pacífico.</Text>
        ) : (
          <Box marginTop={1} gap={2}>
            {graficos ? (
              <Box flexDirection="column" alignItems="center">
                {vector('radar', dibujoRadar(ciclones, c.lugar, ahora), `Radar de ciclones: ${principal?.nombre ?? ''} a ${principal?.km ?? 0} km`, 4)}
                <Text dimColor>anillos cada {Math.round(escalaRadar(ciclones) / 3)} km</Text>
              </Box>
            ) : null}
            <Box flexDirection="column" flexShrink={1}>
              {ciclones.slice(0, 3).map(cc => {
                const n = nivel(cc)
                const masCerca = cc.cercania && cc.cercania.ms > ahora + 3_600_000 && cc.cercania.km < cc.km - 50
                return (
                  <Box key={`c-${cc.id}`} flexDirection="column" marginBottom={1}>
                    <Text>
                      <Text color={COLOR_NIVEL[n]} bold>● {cc.nombre}</Text>
                      <Text> · {claseTexto(cc)} · {cc.vientoKmh} km/h</Text>
                    </Text>
                    <Text dimColor>
                      A {cc.km.toLocaleString('es-MX')} km al {rumbo16(cc.rumbo)}
                      {cc.mueveHacia !== null ? ` · va al ${rumbo16(cc.mueveHacia)}${cc.mueveKmh ? ` a ${cc.mueveKmh} km/h` : ''}` : ''}
                      {cc.mueveHacia !== null ? (seAcerca(cc) ? ' · se acerca' : ' · se aleja') : ''}
                    </Text>
                    {masCerca && cc.cercania ? (
                      <Text color={COLOR_NIVEL[n]}>Lo más cerca: {cc.cercania.km.toLocaleString('es-MX')} km, {cuando(cc.cercania.ms, ahora, c.offsetMin)}</Text>
                    ) : null}
                    <Link key={`l-${cc.id}`} href={cc.url} label="Pronóstico del NHC" />
                  </Box>
                )
              })}
              {ciclones.length > 3 ? <Text dimColor>y {ciclones.length - 3} más lejos</Text> : null}
            </Box>
          </Box>
        )}
      </Box>
    )

    return (
      <Box flexDirection="column" paddingX={1}>
        <Box borderStyle="round" borderColor={cie.color} paddingX={1} flexDirection="column">
          <Text color={ACENTO} bold>📍 {c.lugar.nombre}</Text>
          {graficos ? (
            <Box marginTop={1}>
              {Raster ? (
                <Raster key="cielo" columns={CIELO.columnas} rows={CIELO.filas} cells={empaquetar(componer(cielito, cuadro))} />
              ) : Svg && sim ? (
                // Durante el timelapse: imagen fija que cambia 4 veces por segundo (sin recargar un marco)
                <Svg key="cielo-sim" source={svgCuadro(cielito, Math.floor(ahora / 125), 8)} alt={`${sim.nombre} acelerado`} width={CIELO.columnas * 8} height={CIELO.filas * 16} />
              ) : Svg ? (
                <Svg
                  key="cielo"
                  source={svgEscena(cielito, 8, ahora)}
                  alt={`Cielo de ${c.lugar.nombre}: ${cie.texto}, ${luna.nombre.toLowerCase()}`}
                  width={CIELO.columnas * 8}
                  height={CIELO.filas * 16}
                  isInteractive
                />
              ) : null}
            </Box>
          ) : null}
          {graficos ? (
            sim ? (
              <Box gap={1}>
                <Text color="#fbbf24" bold>⏩ {sim.nombre}</Text>
                <Text>{cuando(tEscena, ahora, c.offsetMin)}</Text>
                <Text dimColor>×{Math.round(sim.vel)} · sol {cielito.altSol.toFixed(1)}° · luna {cielito.altLuna.toFixed(1)}°</Text>
                <Button key="sim-fin" label="■ Detener" plain onPress={() => void detenerSim($)} />
              </Box>
            ) : (
              <Box gap={1}>
                <Text dimColor>Ver en 40 s:</Text>
                <Button key="sim-amanecer" label="▶ Amanecer" plain onPress={() => void iniciarSim($, 'amanecer')} />
                <Button key="sim-atardecer" label="▶ Atardecer" plain onPress={() => void iniciarSim($, 'atardecer')} />
                <Button key="sim-luna" label="▶ Salida de luna" plain onPress={() => void iniciarSim($, 'luna')} />
              </Box>
            )
          ) : null}
          <Box marginTop={1} gap={2}>
            <Text>{icono(a.codigo, a.esDia)}</Text>
            <Text color={colorTemp(a.temp)} bold>{grados(a.temp)}</Text>
            <Text color={cie.color}>{cie.texto}</Text>
          </Box>
          <Text dimColor>
            Sensación {grados(a.sensacion)} · Humedad {Math.round(a.humedad)}%
          </Text>
          <Text dimColor>
            Viento {Math.round(a.viento)} km/h {rumbo(a.dirViento)} · Ráfagas {Math.round(a.rafagas)} · UV {Math.round(a.uv)}
          </Text>
          {hoy && (
            <Text dimColor>
              🌅 {hoy.amanecer}  🌇 {hoy.atardecer}
            </Text>
          )}
          <Text>
            <Text>{luna.emoji} </Text>
            <Text color="#e5e7eb">{luna.nombre}</Text>
            <Text dimColor> · {Math.round(luna.iluminada * 100)}% iluminada · {luna.creciente ? 'llena' : 'nueva'} {cuando(siguiente, ahora, c.offsetMin)}</Text>
          </Text>
          <Text dimColor>
            {cielito.altLuna > 0 ? `Luna a ${Math.round(cielito.altLuna)}° sobre el horizonte` : 'Luna bajo el horizonte'}
            {lunaSale ? ` · sale ${cuando(lunaSale, ahora, c.offsetMin)}` : ''}
            {lunaPone ? ` · se pone ${cuando(lunaPone, ahora, c.offsetMin)}` : ''}
          </Text>
          {seccionMarea}
        </Box>

        {urgente ? seccionHuracanes : null}

        <Text color={ACENTO} bold>Próximas horas</Text>
        <Box flexDirection="row" flexWrap="wrap">
          {c.horas.map(hr => (
            <Box key={`h-${hr.hora}`} flexDirection="column" width={6} alignItems="center">
              <Text dimColor>{hr.hora}</Text>
              <Text>{icono(hr.codigo, true)}</Text>
              <Text color={colorTemp(hr.temp)}>{grados(hr.temp)}</Text>
              <Text color={hr.lluvia >= 40 ? '#38bdf8' : undefined} dimColor={hr.lluvia < 40}>{Math.round(hr.lluvia)}%</Text>
            </Box>
          ))}
        </Box>

        <Box marginTop={1}>
          <Text color={ACENTO} bold>Próximos 7 días</Text>
        </Box>
        {c.dias.map((d, i) => {
          const [antes, rango, despues] = barra(d.min, d.max, bajo, alto)
          return (
            <Box key={`d-${d.fecha}`} gap={1}>
              <Box width={7}>
                <Text bold={i === 0}>{nombreDia(d.fecha, i)}</Text>
              </Box>
              <Text>{icono(d.codigo, true)}</Text>
              <Box width={4} justifyContent="flex-end">
                <Text color={colorTemp(d.min)}>{grados(d.min)}</Text>
              </Box>
              <Text>
                <Text dimColor>{antes}</Text>
                <Text color={colorTemp((d.min + d.max) / 2)}>{rango}</Text>
                <Text dimColor>{despues}</Text>
              </Text>
              <Box width={4}>
                <Text color={colorTemp(d.max)}>{grados(d.max)}</Text>
              </Box>
              {d.lluvia >= 20 && <Text color="#38bdf8">💧{Math.round(d.lluvia)}%</Text>}
            </Box>
          )
        })}

        {urgente ? null : seccionHuracanes}

        {graficos ? (
          <Box flexDirection="column" marginTop={1}>
            <Box gap={1}>
              <Text color={ACENTO} bold>Reloj</Text>
              <Button key="modo-a" label="Analógico" variant={modo === 'analogico' ? 'primary' : 'secondary'} onPress={() => void cambiarModo($, 'analogico')} />
              <Button key="modo-d" label="Digital" variant={modo === 'digital' ? 'primary' : 'secondary'} onPress={() => void cambiarModo($, 'digital')} />
            </Box>
            <Box gap={1}>
              <Button key="car-ant" label="◀" plain onPress={() => void cambiarCaratula($, -1)} />
              <Text bold>{tema.nombre}</Text>
              <Text dimColor>· {caratula.nombre}</Text>
              <Button key="car-sig" label="▶" plain onPress={() => void cambiarCaratula($, 1)} />
              <Text dimColor>{indice + 1}/{TEMAS.length}</Text>
            </Box>
            <Box marginTop={1} gap={2}>
              {relojes.map(rel => (
                <Box key={`b-${rel.key}`} flexDirection="column" alignItems="center">
                  {vector(rel.key, rel.dibujo, `Reloj de ${rel.nombre}: ${rel.texto}`, rel.lado)}
                  <Text dimColor>{rel.nombre}</Text>
                </Box>
              ))}
            </Box>
            <Box marginTop={1} gap={2}>
              <Text color={ACENTO} bold>Combustible</Text>
              <Text dimColor>% que queda · barra de arriba lo gastado, la de abajo el tiempo</Text>
            </Box>
            {encabezado('h-claude', 'Claude', '#d97757', [consumo.length === 0 ? 'aparece tras la primera respuesta (solo con suscripción)' : 'en vivo'])}
            {consumo.map(v => fila('c', v))}
            {agentes.map(ag =>
              ag.datos ? (
                <Box key={`ag-${ag.id}`} flexDirection="column">
                  {encabezado(`h-${ag.id}`, ag.nombre, ag.color, [
                    ag.datos.plan ? `plan ${ag.datos.plan}` : '',
                    ag.datos.creditos ? `créditos ${ag.datos.creditos}` : '',
                    ag.datos.medido ? `medido ${medidoEl(Date.parse(ag.datos.medido), ahora, c.offsetMin)}` : '',
                    ag.datos.nota ?? '',
                  ])}
                  {agrupar(ventanas(ag.datos.limites, ahora), 'Todos').map(v => fila(ag.id, v))}
                </Box>
              ) : null,
            )}
          </Box>
        ) : null}

        <Box marginTop={1} gap={1}>
          <Text dimColor>
            {ocupado ? 'Actualizando…' : `Actualizado ${c.actualizado}`}
            {fallo ? ' · sin conexión' : ''}
          </Text>
          <Button key="actualizar" label="Actualizar" hotkey="r" dimColor onPress={() => void refrescar($, true)} />
          <Button key="cerrar" label="Cerrar" hotkey="x" dimColor onPress={() => void $.ui.close({ id: PANEL })} />
        </Box>
        <Text dimColor>Open-Meteo · NHC · /clima &lt;ciudad&gt; para cambiar</Text>
      </Box>
    )
  })
}
