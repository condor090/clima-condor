import { describe, expect, mock, test } from 'claude-code/testing'

import { barra, nombreDia, parsear, rumbo, SANTIAGO } from '../hooks/clima'

const RESPUESTA = {
  current: {
    time: '2026-10-02T14:15', temperature_2m: 21.4, apparent_temperature: 20.1, relative_humidity_2m: 38,
    wind_speed_10m: 12, wind_gusts_10m: 25, wind_direction_10m: 225, weather_code: 0, is_day: 1, uv_index: 6.2,
  },
  hourly: {
    time: Array.from({ length: 48 }, (_, i) => `2026-10-0${2 + Math.floor(i / 24)}T${String(i % 24).padStart(2, '0')}:00`),
    temperature_2m: Array.from({ length: 48 }, (_, i) => 10 + (i % 24) / 2),
    weather_code: Array.from({ length: 48 }, () => 2),
    precipitation_probability: Array.from({ length: 48 }, () => 10),
  },
  daily: {
    time: ['2026-10-02', '2026-10-03', '2026-10-04'],
    weather_code: [0, 61, 3],
    temperature_2m_max: [24, 18, 20],
    temperature_2m_min: [8, 9, 7],
    precipitation_probability_max: [0, 80, 10],
    sunrise: ['2026-10-02T07:10', '2026-10-03T07:09', '2026-10-04T07:08'],
    sunset: ['2026-10-02T19:45', '2026-10-03T19:46', '2026-10-04T19:47'],
  },
}

describe('clima', () => {
  test('parsea la respuesta de Open-Meteo', async () => {
    const c = parsear(SANTIAGO, RESPUESTA)
    expect(c.actual.temp).toBe(21.4)
    expect(c.actual.esDia).toBe(true)
    expect(c.actualizado).toBe('14:15')
    expect(c.horas[0]?.hora).toBe('16h')
    expect(c.horas.length).toBe(8)
    expect(c.dias.length).toBe(3)
    expect(c.dias[1]?.lluvia).toBe(80)
    expect(c.dias[0]?.amanecer).toBe('07:10')
  })

  test('formatos auxiliares', async () => {
    expect(rumbo(225)).toBe('SO')
    expect(rumbo(359)).toBe('N')
    expect(nombreDia('2026-10-02', 0)).toBe('Hoy')
    expect(nombreDia('2026-10-04', 2)).toBe('Dom')
    const [a, r, d] = barra(8, 24, 7, 24, 14)
    expect((a + r + d).length).toBe(14)
    expect(r.length > 0).toBe(true)
  })

  test('/clima <ciudad> no responde con la lectura en curso del lugar anterior', async ($, on) => {
    const guardado = new Map<string, unknown>()
    let soltar = (): void => {}
    const espera = new Promise<void>(r => {
      soltar = r
    })
    const ok = (j: unknown) => ({ value: { status: 200, ok: true, headers: {}, text: JSON.stringify(j) } })
    on('http.fetch', async (_$, e) => {
      if (e.url.includes('ipwho.is')) {
        await espera
        return ok({ success: true, city: 'Santiago', region: 'RM', latitude: -33.45, longitude: -70.67 })
      }
      if (e.url.includes('geocoding')) return ok({ results: [{ name: 'Madrid', admin1: 'Madrid', latitude: 40.42, longitude: -3.7 }] })
      return ok(RESPUESTA)
    })
    on('store.get', (_$, e) => ({ value: guardado.get(e.key) }))
    on('store.set', (_$, e) => {
      guardado.set(e.key, e.value)
      return { value: undefined }
    })
    on('store.delete', (_$, e) => {
      guardado.delete(e.key)
      return { value: undefined }
    })
    on('ui.open', () => ({ value: { isPlaced: true } }) as const)
    on('ui.status', () => ({ value: undefined }))
    on('ui.blit', () => ({ value: {} }))
    mock.clock(on, { now: Date.parse('2026-10-02T17:15:00Z') })
    // La primera lectura queda esperando la ubicación por IP (Santiago)
    const primera = $.command.run({ command: 'clima', args: '' } as never)
    const madrid = $.command.run({ command: 'clima', args: 'Madrid' } as never)
    soltar()
    expect((await primera).text).toContain('Santiago')
    expect((await madrid).text).toContain('Madrid')
    // El panel también queda en Madrid
    const ui = await $.ui.mount({ plugin: 'clima-condor', surface: 'terminal', component: 'Pane', props: {} as never, requestId: 'clima' })
    expect(await ui.find({ type: 'Text', text: /Madrid/ })).toBeDefined()
    await ui.unmount()
  })

  test('el panel dibuja el clima con la red simulada', async ($, on) => {
    on('http.fetch', async (_$, e) => {
      const url = e.url
      const text = url.includes('ipwho.is')
        ? JSON.stringify({ success: true, city: 'Santiago', region: 'RM', latitude: -33.45, longitude: -70.67 })
        : JSON.stringify(RESPUESTA)
      return { value: { status: 200, ok: true, headers: {}, text } }
    })
    on('ui.open', () => ({ value: { isPlaced: true } }) as const)
    on('ui.status', () => ({ value: undefined }))
    on('store.get', () => ({ value: undefined }))
    on('store.set', () => ({ value: undefined }))
    on('ui.blit', () => ({ value: {} }))
    mock.clock(on, { now: Date.parse('2026-10-02T17:15:00Z') })
    const r = await $.command.run({ command: 'clima', args: '' } as never)
    expect(r.text).toContain('21°')

    const ui = await $.ui.mount({ plugin: 'clima-condor', surface: 'terminal', component: 'Pane', props: {} as never, requestId: 'clima' })
    expect(await ui.find({ type: 'Text', text: /Santiago, RM/ })).toBeDefined()
    expect(await ui.find({ type: 'Text', text: /Despejado/ })).toBeDefined()
    expect(await ui.find({ type: 'Text', text: /Próximos 7 días/ })).toBeDefined()
    expect(await ui.find({ type: 'Raster', key: 'cielo' } as never)).toBeDefined()
    expect(await ui.find({ type: 'Text', text: /Fósforo/ })).toBeDefined()
    expect(await ui.find({ type: 'Text', text: /Radar/ })).toBeDefined()
    await ui.press({ key: 'car-sig' })
    expect(await ui.find({ type: 'Text', text: /Despertador/ })).toBeDefined()
    expect(await ui.find({ type: 'Raster', key: 'reloj' } as never)).toBeDefined()
    await ui.press({ key: 'sim-amanecer' })
    expect(await ui.find({ type: 'Text', text: /Amanecer/ })).toBeDefined()
    await ui.press({ key: 'sim-fin' })
    expect(await ui.find({ type: 'Text', text: /Ver en 40 s/ })).toBeDefined()
    await ui.press({ key: 'modo-d' })
    expect(await ui.find({ type: 'Text', text: /LED rojo/ })).toBeDefined()
    expect(await ui.find({ type: 'Text', text: /iluminada/ })).toBeDefined()
    await ui.unmount()

    // El escritorio no tiene Raster: cielo, reloj y medidores salen como SVG
    const esc = await $.ui.mount({ plugin: 'clima-condor', surface: 'desktop', component: 'Pane', props: {} as never, requestId: 'clima' })
    const svg = (await esc.find({ type: 'Svg' } as never)) as { props: { alt: string; source: string } } | undefined
    expect(svg?.props.alt).toContain('Cielo de Santiago')
    expect(svg?.props.source).toContain('<rect')
    // El cielo se anima solo en el escritorio
    expect((svg?.props as { isInteractive?: boolean }).isInteractive).toBe(true)
    expect(await esc.find({ type: 'Text', text: /Reloj/ })).toBeDefined()
    expect(await esc.find({ type: 'Text', text: /Combustible/ })).toBeDefined()
    await esc.unmount()
  })
})

import { celdas, svgDe } from '../hooks/escena'

describe('svg del escritorio', () => {
  test('convierte las celdas del Raster en rects', async () => {
    // Una celda ▀: arriba naranja, abajo azul; otra vacía
    const cells = celdas(Uint32Array.of(0x2580, 0xff8800, 0x0000ff, 0x20, 0x01000000, 0x01000000))
    const svg = svgDe(cells, 2, 1, 4)
    expect(svg).toContain('width="8" height="8"')
    expect(svg).toContain('<rect x="0" y="0" width="4" height="4" fill="#ff8800"/>')
    expect(svg).toContain('<rect x="0" y="4" width="4" height="4" fill="#0000ff"/>')
    expect(svg.match(/<rect/g)?.length).toBe(2)
  })
})

import { capas, escena, empaquetar, luz, paisajeDe, svgCuadro, svgEscena } from '../hooks/escena'
import { LIENZO, TEMAS, horaEn } from '../hooks/reloj'
import { celdasVector, rasterizar, svgVector } from '../hooks/vector'

describe('escena y relojes', () => {
  test('la escena sigue la hora y el lugar', async () => {
    expect(paisajeDe(27.08, -109.44)).toBe('desierto')
    expect(paisajeDe(-33.45, -70.67)).toBe('andes')
    expect(luz(13 * 60, 420, 1140).esDia).toBe(true)
    expect(luz(23 * 60, 420, 1140).esDia).toBe(false)
    const l = escena({ codigo: 61, lat: 27.08, lon: -109.44, minutos: 600, amanecer: 400, atardecer: 1120, cuadro: 3 })
    expect(l.px.length).toBe(40 * 20)
    // 40×10 celdas × 12 bytes en base64
    expect(empaquetar(l).length).toBe(Math.ceil((40 * 10 * 12) / 3) * 4)
  })

  test('el cielo del escritorio es un SVG animado y cabe en el límite', async () => {
    const ms = Date.parse('2026-10-03T04:30:00Z')
    for (const codigo of [0, 3, 61, 71, 95]) {
      for (const [lat, lon] of [[27.08, -109.44], [-33.45, -70.67], [40.4, -3.7]] as const) {
        const svg = svgEscena(capas({ codigo, lat, lon, minutos: 21 * 60 + 30, amanecer: 400, atardecer: 1120, cuadro: 0, ms }), 8, ms)
        expect(svg.length < 131072).toBe(true)
        expect(svg.startsWith('<svg')).toBe(true)
      }
    }
    const lluvia = svgEscena(capas({ codigo: 61, lat: 27.08, lon: -109.44, minutos: 600, amanecer: 400, atardecer: 1120, cuadro: 0, ms }), 8, ms)
    expect(lluvia).toContain('animateTransform')
  })

  test('los 8 temas dibujan analógico y digital, y se mueven', async () => {
    const t = horaEn(Date.parse('2026-10-02T15:42:07Z'), -420)
    expect(t).toEqual({ h: 8, m: 42, s: 7 })
    expect(TEMAS.length).toBe(8)
    const ctx = { ...t, ms: 250, amanecer: 400, atardecer: 1120 }
    for (const tema of TEMAS) {
      for (const car of [tema.analogico, tema.digital]) {
        for (const chico of [false, true]) {
          const d = car.dibujar(ctx, chico)
          const L = car === tema.analogico ? (chico ? LIENZO.analogicoChico : LIENZO.analogico) : chico ? LIENZO.digitalChico : LIENZO.digital
          expect([d.ancho, d.alto]).toEqual([L.ancho, L.alto])
          expect(d.alto % 2).toBe(0)
          // La terminal: celdas del tamaño justo y algo pintado
          expect(celdasVector(d).length).toBe(Math.ceil(((d.ancho * d.alto) / 2) * 12 / 3) * 4)
          expect(rasterizar(d).px.some(v => v !== 0x01000000)).toBe(true)
          // El escritorio: SVG con SMIL
          const svg = svgVector(d, 4)
          expect(svg.length < 131072).toBe(true)
          expect(/<animate/.test(svg)).toBe(true)
        }
      }
    }
    // Cambia la hora, cambia el dibujo
    const a = TEMAS[0]!.digital.dibujar(ctx)
    const b = TEMAS[0]!.digital.dibujar({ ...ctx, m: 43 })
    expect(celdasVector(a)).not.toBe(celdasVector(b))
  })
})

import { cruce, luna as posLuna, sol as posSol } from '../hooks/astro'

describe('astro', () => {
  test('el sol y la luna salen y se ponen a su hora real', async () => {
    const lat = 27.08
    const lon = -109.44
    const ahora = Date.parse('2026-10-03T03:00:00Z') // 2 oct, 20:00 en Navojoa
    // Open-Meteo: sale 06:11 y se pone 18:01 (hora de Navojoa) el 3 oct
    const sale = cruce('sol', ahora, lat, lon, true)!
    expect(Math.abs(sale - Date.parse('2026-10-03T13:11:00Z')) < 3 * 60_000).toBe(true)
    const pone = cruce('sol', ahora, lat, lon, false)!
    expect(Math.abs(pone - Date.parse('2026-10-04T01:01:00Z')) < 3 * 60_000).toBe(true)
    // A mediodía el sol está alto y al sur
    const mediodia = posSol(Date.parse('2026-10-03T19:06:00Z'), lat, lon)
    expect(mediodia.alt > 55 && mediodia.alt < 63).toBe(true)
    expect(Math.abs(mediodia.az - 180) < 5).toBe(true)
    // La luna menguante sale cerca de la medianoche y sube hacia el este
    const lunaSale = cruce('luna', ahora, lat, lon, true)!
    expect(lunaSale > ahora && lunaSale < ahora + 6 * 3_600_000).toBe(true)
    const subiendo = posLuna(lunaSale + 3_600_000, lat, lon)
    expect(subiendo.alt > 5).toBe(true)
    expect(subiendo.az > 45 && subiendo.az < 135).toBe(true)
  })

  test('la escena muestra la luna cuando está arriba y el resplandor al amanecer', async () => {
    const lat = 27.08
    const lon = -109.44
    const base = { codigo: 0, lat, lon, minutos: 0, amanecer: 0, atardecer: 0, cuadro: 0 }
    const madrugada = capas({ ...base, ms: Date.parse('2026-10-03T12:00:00Z') })
    expect(madrugada.altLuna > 30).toBe(true)
    const noche = capas({ ...base, ms: Date.parse('2026-10-03T03:00:00Z') })
    expect(noche.altLuna < 0).toBe(true)
    expect(noche.estrellas.length > 10).toBe(true)
    // Al salir el sol hay haces de luz; a mediodía no
    const alba = capas({ ...base, ms: Date.parse('2026-10-03T13:11:00Z') })
    expect(alba.fuerzaHaces > 0.2).toBe(true)
    expect(capas({ ...base, ms: Date.parse('2026-10-03T19:00:00Z') }).fuerzaHaces).toBe(0)
  })

  test('en el escritorio el sol y la luna son vectores lisos, no píxeles', async () => {
    const base = { codigo: 0, lat: 27.08, lon: -109.44, minutos: 0, amanecer: 0, atardecer: 0, cuadro: 0 }
    const ms = Date.parse('2026-10-03T15:30:00Z')
    const c = capas({ ...base, ms })
    expect(c.astros.sol).not.toBeNull()
    expect(c.astros.luna).not.toBeNull()
    // El cielo limpio no lleva los discos: difiere del fondo de la terminal
    expect(c.limpio.px.some((v, i) => v !== c.fondo.px[i])).toBe(true)
    const svg = svgEscena(c, 8, ms)
    expect(svg).toContain('<ellipse')
    expect(svg).toContain('clipPath id="ccFase"')
    expect(svg).toContain('geometricPrecision')
    expect(svgCuadro(c, 0, 8)).toContain('url(#ccSol)')
  })
})

import { fase, proxima } from '../hooks/luna'

describe('luna', () => {
  test('fases conocidas', async () => {
    // Luna llena: 26 sep 2026 16:49 UTC; nueva: 11 oct 2026 03:50 UTC
    expect(fase(Date.parse('2026-09-26T16:49:00Z')).nombre).toBe('Luna llena')
    expect(fase(Date.parse('2026-10-11T03:50:00Z')).nombre).toBe('Luna nueva')
    const llena = proxima(Date.parse('2026-09-20T00:00:00Z'), 180)
    expect(Math.abs(llena - Date.parse('2026-09-26T16:49:00Z')) < 4 * 3_600_000).toBe(true)
    // Menguante: iluminada a la izquierda en el norte, a la derecha en el sur
    const f = fase(Date.parse('2026-10-03T06:00:00Z'), 27)
    expect(f.creciente).toBe(false)
    expect(fase(Date.parse('2026-10-03T06:00:00Z'), -33).emoji).not.toBe(f.emoji)
  })
})

import { candidatos, estadoMarea, extremos, parsearMarea } from '../hooks/marea'

describe('marea', () => {
  test('elige la costa con datos y encuentra pleamar y bajamar', async () => {
    const lugar = { nombre: 'Navojoa', lat: 27.08, lon: -109.44 }
    expect(candidatos(lugar).length).toBe(41)
    const horas = Array.from({ length: 72 }, (_, i) => `2026-10-01T${String(i % 24).padStart(2, '0')}:00`)
    const seno = horas.map((_, i) => 0.7 + 0.45 * Math.sin((i / 12.42) * 2 * Math.PI))
    const json = [
      { latitude: 27.04, longitude: -109.46, utc_offset_seconds: -25200, hourly: { time: horas, sea_level_height_msl: horas.map(() => null) } },
      { latitude: 26.7, longitude: -109.62, utc_offset_seconds: -25200, hourly: { time: horas, sea_level_height_msl: seno } },
    ]
    const m = parsearMarea(lugar, json)
    expect(m?.lat).toBe(26.7)
    expect((m?.km ?? 0) > 30 && (m?.km ?? 0) < 60).toBe(true)
    const ex = extremos(m!)
    expect(ex.some(e => e.tipo === 'alta')).toBe(true)
    expect(ex.some(e => e.tipo === 'baja')).toBe(true)
    const e = estadoMarea(m!, Date.parse('2026-10-02T12:00:00-07:00'))
    expect(e.proximas.length).toBe(2)
    expect(parsearMarea(lugar, [json[0]])).toBe(null)
  })
})

import { categoria, cercania, nivel, parsearAviso, parsearNhc, seAcerca } from '../hooks/huracanes'

describe('huracanes', () => {
  test('lee el NHC, la trayectoria y calcula el nivel', async () => {
    const lugar = { nombre: 'Navojoa', lat: 27.08, lon: -109.44 }
    const json = { activeStorms: [{ id: 'ep182026', name: 'Rachel', classification: 'HU', intensity: '90', pressure: '963', latitudeNumeric: 19.3, longitudeNumeric: -111.1, movementDir: 265, movementSpeed: 5, forecastAdvisory: { url: 'https://www.nhc.noaa.gov/text/MIATCMEP3.shtml' }, forecastGraphics: { url: 'https://www.nhc.noaa.gov/graphics_ep3.shtml' } }] }
    const [b] = parsearNhc(lugar, json)
    expect(b?.categoria).toBe(2)
    expect(b?.vientoKmh).toBe(167)
    expect((b?.km ?? 0) > 850 && (b?.km ?? 0) < 900).toBe(true)
    const aviso = `HURRICANE CENTER LOCATED NEAR 19.3N 111.1W AT 02/2100Z
34 KT.......130NE 120SE 120SW 130NW.
FORECAST VALID 03/0600Z 19.4N 111.6W
MAX WIND  80 KT...GUSTS 100 KT.
FORECAST VALID 03/1800Z 22.5N 110.0W
MAX WIND  75 KT...GUSTS  90 KT.
OUTLOOK VALID 06/1800Z 21.0N 120.0W`
    const ahora = Date.parse('2026-10-02T22:00:00Z')
    const r = parsearAviso(aviso, ahora)
    expect(r.puntos.length).toBe(3)
    expect(r.puntos[0]?.ms).toBe(Date.parse('2026-10-03T06:00:00Z'))
    expect(r.puntos[0]?.vientoKmh).toBe(148)
    expect(r.radio34Km).toBe(241)
    const { urlAviso: _u, ...resto } = b!
    const c = { ...resto, pronostico: r.puntos, radio34Km: r.radio34Km, cercania: null }
    const cc = cercania(lugar, c, r.puntos, ahora)
    expect(cc.km < c.km).toBe(true)
    expect(nivel({ ...c, cercania: cc })).toBe('vigilancia')
    expect(nivel(c)).toBe('atento')
    expect(seAcerca(c)).toBe(false)
    expect(categoria('TS', 50)).toBe(0)
    expect(categoria('HU', 140)).toBe(5)
  })
})

import { medidor, textoRitmo, ventanas } from '../hooks/consumo'

describe('combustible', () => {
  test('calcula lo que queda y el ritmo de cada ventana', async () => {
    const ahora = Date.parse('2026-10-02T18:00:00Z')
    const vs = ventanas(
      [
        // Semana: 30 % gastado con la mitad de la semana pasada → alcanza
        { kind: 'seven_day', percentUsed: 30, resetsAt: new Date(ahora + 3.5 * 86_400_000).toISOString() },
        // 5 horas: 80 % gastado en 2 h → se agota antes del reinicio
        { kind: 'five_hour', percentUsed: 80, resetsAt: new Date(ahora + 3 * 3_600_000).toISOString() },
      ],
      ahora,
    )
    expect(vs.map(v => v.nombre)).toEqual(['5 horas', 'Semana'])
    expect(vs[0]!.ritmo && 'agota' in vs[0]!.ritmo).toBe(true)
    expect(vs[1]!.ritmo).toEqual({ sobra: 40 })
    expect(textoRitmo(vs[1]!, ahora, -420).texto).toContain('sobra ~40%')
    expect(medidor(vs[0]!, 34).length).toBe(Math.ceil((34 * 12) / 3) * 4)
  })
})
