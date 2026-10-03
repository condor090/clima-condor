// Relojes: 8 temas, cada uno con carátula analógica y digital
// Se describen como dibujos vectoriales animados (ver vector.ts): en el escritorio se mueven solos con SMIL,
// en la terminal se rasterizan a píxeles cada segundo
import type { Dibujo, Forma } from './vector'
import { tr } from './idioma'

export type Hora = { h: number; m: number; s: number }

export function horaEn(ms: number, offsetMin: number): Hora {
  const d = new Date(ms + offsetMin * 60_000)
  return { h: d.getUTCHours(), m: d.getUTCMinutes(), s: d.getUTCSeconds() }
}

export const textoHora = (t: Hora): string => `${String(t.h).padStart(2, '0')}:${String(t.m).padStart(2, '0')}`

// Desfase de una zona horaria; si Intl no está, Chile usa horario de verano de septiembre a marzo
export function offsetDe(zona: string, ms: number): number {
  try {
    const partes = new Intl.DateTimeFormat('en-US', { timeZone: zona, hourCycle: 'h23', year: 'numeric', month: 'numeric', day: 'numeric', hour: 'numeric', minute: 'numeric' }).formatToParts(new Date(ms))
    const v = (t: string) => Number(partes.find(p => p.type === t)?.value ?? 0)
    const local = Date.UTC(v('year'), v('month') - 1, v('day'), v('hour'), v('minute'))
    return Math.round((local - Math.floor(ms / 60_000) * 60_000) / 60_000)
  } catch {
    if (zona === 'America/Hermosillo') return -420
    const mes = new Date(ms).getUTCMonth() + 1
    return mes >= 4 && mes <= 8 ? -240 : -180
  }
}

// Lo que necesita una carátula para dibujarse
export type Contexto = {
  h: number
  m: number
  s: number
  ms: number // milésimas del segundo actual
  amanecer: number // minutos locales
  atardecer: number
}

export type Caratula = { nombre: string; dibujar: (c: Contexto, chico?: boolean) => Dibujo }

export type Tema = { id: string; nombre: string; analogico: Caratula; digital: Caratula }

// --- Fases de cada manecilla (0–1 de su vuelta)

const fases = (c: Contexto) => {
  const seg = (c.s + c.ms / 1000) / 60
  const min = (c.m + seg) / 60
  const hora = ((c.h % 12) + min) / 12
  const dia = (c.h * 60 + c.m + seg) / 1440
  return { seg, min, hora, dia, medio: c.ms / 1000 }
}

const esDia = (c: Contexto): boolean => {
  const t = c.h * 60 + c.m
  return t >= c.amanecer && t < c.atardecer
}

// --- Piezas analógicas

type Esfera = { cx: number; cy: number; r: number }
const GRANDE: Esfera = { cx: 15.5, cy: 15.5, r: 15 }
const CHICA: Esfera = { cx: 11.5, cy: 11.5, r: 11 }

function manecilla(e: Esfera, largo: number, cola: number, grosor: number, color: number, periodo: number, fase: number, extra: Forma[] = [], pasos?: number): Forma {
  return {
    t: 'grupo',
    anim: { tipo: 'girar', cx: e.cx, cy: e.cy, periodo, fase, ...(pasos ? { pasos } : {}) },
    hijos: [{ t: 'linea', x1: e.cx, y1: e.cy + cola, x2: e.cx, y2: e.cy - largo, color, grosor }, ...extra],
  }
}

const punto = (e: Esfera, ang: number, r: number) => ({ x: e.cx + Math.sin((ang * Math.PI) / 180) * r, y: e.cy - Math.cos((ang * Math.PI) / 180) * r })

function marcas(e: Esfera, r: number, radio: number, color: number, cardinal?: { radio: number; color: number }, cuantas = 12): Forma[] {
  return Array.from({ length: cuantas }, (_, i) => {
    const p = punto(e, (i * 360) / cuantas, r)
    const card = cardinal !== undefined && i % (cuantas / 4) === 0
    return { t: 'circulo', cx: p.x, cy: p.y, r: card ? cardinal.radio : radio, relleno: card ? cardinal.color : color } as Forma
  })
}

type Colores = { hora: number; minuto: number; segundo?: number; cola?: number; tic?: boolean; punta?: number }

// Las tres manecillas con sus periodos reales
function tresManecillas(e: Esfera, c: Contexto, k: Colores, largo = { h: 0.45, m: 0.72, s: 0.82 }, grosor = { h: 1.8, m: 1.2, s: 0.6 }): Forma[] {
  const f = fases(c)
  const R = e.r
  const formas: Forma[] = [manecilla(e, R * largo.h, 0, grosor.h, k.hora, 43_200, f.hora), manecilla(e, R * largo.m, 0, grosor.m, k.minuto, 3600, f.min)]
  if (k.segundo !== undefined) {
    const extra: Forma[] = k.punta !== undefined ? [{ t: 'circulo', cx: e.cx, cy: e.cy - R * largo.s, r: 0.9, relleno: k.punta }] : []
    formas.push(manecilla(e, R * largo.s, k.cola ?? 2.5, grosor.s, k.segundo, 60, f.seg, extra, k.tic ? 60 : undefined))
  }
  return formas
}

// --- Piezas digitales: siete segmentos

const DIGITOS = ['abcdef', 'bc', 'abdeg', 'abcdg', 'bcfg', 'acdfg', 'acdefg', 'abc', 'abcdefg', 'abcdfg']

type Medidas = { trazo: number; ancho: number; alto: number; entre: number; puntos: number }
const M_GRANDE: Medidas = { trazo: 2, ancho: 6, alto: 12, entre: 2, puntos: 2 }
const M_FINO: Medidas = { trazo: 1, ancho: 6, alto: 12, entre: 2, puntos: 2 }
const M_CHICO: Medidas = { trazo: 1, ancho: 3, alto: 5, entre: 1, puntos: 1 }

// Tamaños de cada lienzo en píxeles (la terminal usa dos por celda en vertical)
export const LIENZO = {
  analogico: { ancho: 31, alto: 32 },
  analogicoChico: { ancho: 23, alto: 24 },
  digital: { ancho: 36, alto: 18 },
  digitalChico: { ancho: 19, alto: 8 },
}

function segmentos(m: Medidas, x: number, y: number, cuales: string, color: number, brillo = 0): Forma[] {
  const { trazo: k, ancho: w, alto: h } = m
  const medio = Math.floor((h - k) / 2)
  const r = (sx: number, sy: number, sw: number, sh: number): Forma => ({ t: 'rect', x: sx - brillo, y: sy - brillo, w: sw + 2 * brillo, h: sh + 2 * brillo, color })
  const out: Forma[] = []
  for (const s of cuales) {
    if (s === 'a') out.push(r(x, y, w, k))
    if (s === 'd') out.push(r(x, y + h - k, w, k))
    if (s === 'g') out.push(r(x, y + medio, w, k))
    if (s === 'f') out.push(r(x, y, k, medio + k))
    if (s === 'b') out.push(r(x + w - k, y, k, medio + k))
    if (s === 'e') out.push(r(x, y + medio, k, h - medio))
    if (s === 'c') out.push(r(x + w - k, y + medio, k, h - medio))
  }
  return out
}

type Estilo = {
  color: number
  segundos: number
  fantasma?: number // segmentos apagados visibles, como un LCD
  brillo?: number // halo de neón alrededor de cada segmento
  pista?: number
  medidas?: Medidas
  barra?: boolean
}

// HH:MM con los dos puntos que laten cada segundo y la barra que se llena en el minuto
function sieteSegmentos(c: Contexto, e: Estilo, x0: number, y0: number, chico = false): Forma[] {
  const m = chico ? M_CHICO : (e.medidas ?? M_GRANDE)
  const f = fases(c)
  const formas: Forma[] = []
  const halo: Forma[] = []
  let x = x0
  const digito = (n: number) => {
    if (e.fantasma !== undefined) formas.push(...segmentos(m, x, y0, 'abcdefg', e.fantasma))
    if (e.brillo !== undefined && !chico) halo.push(...segmentos(m, x, y0, DIGITOS[n] ?? '', e.brillo, 1))
    formas.push(...segmentos(m, x, y0, DIGITOS[n] ?? '', e.color))
    x += m.ancho + m.entre
  }
  digito(Math.floor(c.h / 10))
  digito(c.h % 10)
  x += m.puntos - m.entre
  const sep = Math.floor(m.alto / 4)
  formas.push({
    t: 'grupo',
    anim: { tipo: 'parpadeo', periodo: 1, fase: f.medio, encendido: 0.5 },
    hijos: [
      { t: 'rect', x, y: y0 + sep, w: m.trazo, h: m.trazo, color: e.segundos },
      { t: 'rect', x, y: y0 + m.alto - sep - m.trazo, w: m.trazo, h: m.trazo, color: e.segundos },
    ],
  })
  x += m.trazo + m.puntos
  digito(Math.floor(c.m / 10))
  digito(c.m % 10)
  if (e.barra !== false && !chico) {
    const largo = x - m.entre - x0
    const y = y0 + m.alto + 2
    formas.push({ t: 'rect', x: x0, y, w: largo, h: 1, color: e.pista ?? 0x3a3a3a })
    formas.push({ t: 'rect', x: x0, y, w: largo, h: 1, color: e.segundos, anim: { tipo: 'crecer', periodo: 60, fase: f.seg } })
  }
  return [...halo, ...formas]
}

const digitalSimple = (e: Estilo) => (c: Contexto, chico = false): Dibujo => {
  const L = chico ? LIENZO.digitalChico : LIENZO.digital
  return { ...L, nitido: true, formas: sieteSegmentos(c, e, 1, 1, chico) }
}

const lienzoAnalogico = (chico?: boolean) => (chico ? LIENZO.analogicoChico : LIENZO.analogico)

// --- Los 8 temas

const fosforo: Tema = {
  id: 'fosforo',
  nombre: 'Fósforo',
  analogico: {
    nombre: 'Radar',
    dibujar: (c, chico) => {
      const e = chico ? CHICA : GRANDE
      const f = fases(c)
      const R = e.r
      return {
        ...lienzoAnalogico(chico),
        formas: [
          { t: 'circulo', cx: e.cx, cy: e.cy, r: R, relleno: 0x03170a, borde: 0x1f7a3f, grosor: 1 },
          { t: 'circulo', cx: e.cx, cy: e.cy, r: R * 0.66, borde: 0x0f3d20, grosor: 0.6 },
          { t: 'circulo', cx: e.cx, cy: e.cy, r: R * 0.33, borde: 0x0f3d20, grosor: 0.6 },
          { t: 'linea', x1: e.cx - R + 1, y1: e.cy, x2: e.cx + R - 1, y2: e.cy, color: 0x0f3d20, grosor: 0.5 },
          { t: 'linea', x1: e.cx, y1: e.cy - R + 1, x2: e.cx, y2: e.cy + R - 1, color: 0x0f3d20, grosor: 0.5 },
          // Haz del radar: barre una vuelta por minuto dejando estela
          {
            t: 'grupo',
            anim: { tipo: 'girar', cx: e.cx, cy: e.cy, periodo: 60, fase: f.seg },
            hijos: [
              { t: 'arco', cx: e.cx, cy: e.cy, r: (R - 1) / 2, desde: -40, hasta: 0, color: 0x07361a, grosor: R - 1 },
              { t: 'arco', cx: e.cx, cy: e.cy, r: (R - 1) / 2, desde: -18, hasta: 0, color: 0x0d5a2a, grosor: R - 1 },
              { t: 'linea', x1: e.cx, y1: e.cy, x2: e.cx, y2: e.cy - R + 1, color: 0x7dff9e, grosor: 0.7 },
            ],
          },
          ...marcas(e, R - 2, 0.5, 0x2e8b57),
          ...tresManecillas(e, c, { hora: 0xa7ffbd, minuto: 0x5fd75f }),
          { t: 'circulo', cx: e.cx, cy: e.cy, r: 1.1, relleno: 0xcfffdb },
        ],
      }
    },
  },
  digital: { nombre: 'LCD fósforo', dibujar: digitalSimple({ color: 0x5fd75f, segundos: 0x87ff87, fantasma: 0x0d2615, pista: 0x0d2615 }) },
}

const despertador: Tema = {
  id: 'despertador',
  nombre: 'Despertador',
  analogico: {
    nombre: 'Campanas',
    dibujar: (c, chico) => {
      const e: Esfera = chico ? { cx: 11.5, cy: 13, r: 9.5 } : { cx: 15.5, cy: 17.5, r: 12.5 }
      const k = chico ? 0.75 : 1
      const formas: Forma[] = [
        // Campanas, martillo y patas
        { t: 'circulo', cx: e.cx - 9 * k, cy: e.cy - 11 * k, r: 3.2 * k, relleno: 0xd4a017 },
        { t: 'circulo', cx: e.cx + 9 * k, cy: e.cy - 11 * k, r: 3.2 * k, relleno: 0xd4a017 },
        { t: 'linea', x1: e.cx, y1: e.cy - e.r - 0.5, x2: e.cx, y2: e.cy - e.r - 2.5 * k, color: 0x9ca3af, grosor: 1 },
        { t: 'linea', x1: e.cx - 6 * k, y1: e.cy + e.r - 1, x2: e.cx - 9 * k, y2: e.cy + e.r + 1.6, color: 0x9ca3af, grosor: 1.2 },
        { t: 'linea', x1: e.cx + 6 * k, y1: e.cy + e.r - 1, x2: e.cx + 9 * k, y2: e.cy + e.r + 1.6, color: 0x9ca3af, grosor: 1.2 },
        { t: 'circulo', cx: e.cx, cy: e.cy, r: e.r, relleno: 0xfdf6e3, borde: 0xc81e1e, grosor: 1.8 },
        ...marcas(e, e.r - 2.4, 0.45, 0x6b7280, { radio: 0.8, color: 0x1f2937 }),
      ]
      if (!chico) {
        for (const [i, txt] of [[0, '12'], [3, '3'], [6, '6'], [9, '9']] as const) {
          const p = punto(e, i * 30, e.r - 5.2)
          formas.push({ t: 'texto', x: p.x, y: p.y, texto: txt, color: 0x1f2937, tam: 3.6 })
        }
      }
      // El segundero avanza a saltos, como un despertador de cuerda
      formas.push(...tresManecillas(e, c, { hora: 0x111827, minuto: 0x111827, segundo: 0xdc2626, tic: true, cola: 2.5 }))
      formas.push({ t: 'circulo', cx: e.cx, cy: e.cy, r: 1, relleno: 0xdc2626 })
      return { ...lienzoAnalogico(chico), formas }
    },
  },
  digital: { nombre: 'LED rojo', dibujar: digitalSimple({ color: 0xff1f1f, segundos: 0xff5f00, fantasma: 0x2a0606, pista: 0x2a0606 }) },
}

const evolucion: Tema = {
  id: 'evolucion',
  nombre: 'Centro Evolución',
  analogico: {
    nombre: 'Oro y violeta',
    dibujar: (c, chico) => {
      const e = chico ? CHICA : GRANDE
      const R = e.r
      return {
        ...lienzoAnalogico(chico),
        formas: [
          { t: 'circulo', cx: e.cx, cy: e.cy, r: R - 0.5, relleno: 0x120d1f, borde: 0xffaf00, grosor: 1.4 },
          { t: 'circulo', cx: e.cx, cy: e.cy, r: R - 2.6, borde: 0x4c3a86, grosor: 0.6 },
          ...marcas(e, R - 4.4, 0.7, 0xffd75f, { radio: 1.2, color: 0xaf87ff }),
          ...tresManecillas(e, c, { hora: 0xffd75f, minuto: 0xffaf00, segundo: 0xaf87ff, punta: 0xffd75f, cola: 2 }),
          { t: 'circulo', cx: e.cx, cy: e.cy, r: 1.6, relleno: 0xffd75f },
          { t: 'circulo', cx: e.cx, cy: e.cy, r: 0.7, relleno: 0xaf87ff },
        ],
      }
    },
  },
  digital: { nombre: 'Dorado CE', dibujar: digitalSimple({ color: 0xffaf00, segundos: 0xaf87ff, pista: 0x2b2340 }) },
}

const hielo: Tema = {
  id: 'hielo',
  nombre: 'Hielo',
  analogico: {
    nombre: 'Minimal',
    dibujar: (c, chico) => {
      const e = chico ? CHICA : GRANDE
      const R = e.r
      const f = fases(c)
      const raya = (ang: number): Forma => {
        const a = punto(e, ang, R - 0.5)
        const b = punto(e, ang, R - 3)
        return { t: 'linea', x1: a.x, y1: a.y, x2: b.x, y2: b.y, color: 0x87d7ff, grosor: 1 }
      }
      return {
        ...lienzoAnalogico(chico),
        formas: [
          ...marcas(e, R - 1.5, 0.45, 0x35607d),
          raya(0),
          raya(90),
          raya(180),
          raya(270),
          ...tresManecillas(e, c, { hora: 0xe0f4ff, minuto: 0x87d7ff }, { h: 0.45, m: 0.78, s: 0.85 }, { h: 1.4, m: 0.9, s: 0.5 }),
          // Segundero continuo con contrapeso
          manecilla(e, R * 0.85, 3.5, 0.5, 0x5fafff, 60, f.seg, [{ t: 'circulo', cx: e.cx, cy: e.cy + 3.5, r: 1.1, borde: 0x5fafff, grosor: 0.5 }]),
          { t: 'circulo', cx: e.cx, cy: e.cy, r: 0.9, relleno: 0x5fafff },
        ],
      }
    },
  },
  digital: { nombre: 'Trazo fino', dibujar: digitalSimple({ color: 0x87d7ff, segundos: 0x5fafff, medidas: M_FINO, pista: 0x1d3446 }) },
}

const AMBAR = 0xffb84d
const NAVY = 0x1e2a5a

const solLuna: Tema = {
  id: 'sol',
  nombre: 'Sol y luna',
  analogico: {
    nombre: '24 horas',
    dibujar: (c, chico) => {
      const e = chico ? CHICA : GRANDE
      const R = e.r
      const f = fases(c)
      // Medianoche abajo, mediodía arriba
      const ang = (min: number) => (min / 1440) * 360 + 180
      const dia = esDia(c)
      const ra = chico ? 1.6 : 2.1
      const astro: Forma[] = dia
        ? [{ t: 'circulo', cx: e.cx, cy: e.cy - R * 0.62, r: ra, relleno: 0xffcc33 }]
        : [
            { t: 'circulo', cx: e.cx, cy: e.cy - R * 0.62, r: ra, relleno: 0xe5e9ff },
            { t: 'circulo', cx: e.cx + 0.9, cy: e.cy - R * 0.62 - 0.5, r: ra * 0.8, relleno: 0x0b1020 },
          ]
      const horas: Forma[] = [0, 6, 12, 18].map(hh => {
        const a = punto(e, ang(hh * 60), R - 3.2)
        return { t: 'circulo', cx: a.x, cy: a.y, r: 0.6, relleno: 0xcbd5e1 }
      })
      return {
        ...lienzoAnalogico(chico),
        formas: [
          { t: 'circulo', cx: e.cx, cy: e.cy, r: R - 1.3, relleno: dia ? 0x0f2740 : 0x0b1020 },
          { t: 'arco', cx: e.cx, cy: e.cy, r: R - 1, desde: 0, hasta: 360, color: NAVY, grosor: 2 },
          { t: 'arco', cx: e.cx, cy: e.cy, r: R - 1, desde: ang(c.amanecer), hasta: ang(c.atardecer), color: AMBAR, grosor: 2 },
          ...horas,
          // Una vuelta al día: el sol (o la luna) marca la hora
          {
            t: 'grupo',
            anim: { tipo: 'girar', cx: e.cx, cy: e.cy, periodo: 86_400, fase: f.dia, desde: 180 },
            hijos: [{ t: 'linea', x1: e.cx, y1: e.cy, x2: e.cx, y2: e.cy - R * 0.5, color: dia ? 0xffd75f : 0xc7d2fe, grosor: 1 }, ...astro],
          },
          manecilla(e, R * 0.8, 0, 0.6, 0x93c5fd, 3600, f.min),
          // Un satélite orbita una vez por minuto
          {
            t: 'grupo',
            anim: { tipo: 'girar', cx: e.cx, cy: e.cy, periodo: 60, fase: f.seg },
            hijos: [{ t: 'circulo', cx: e.cx, cy: e.cy - (R - 1), r: 0.7, relleno: 0xffffff }],
          },
          { t: 'circulo', cx: e.cx, cy: e.cy, r: 0.9, relleno: 0xe2e8f0 },
        ],
      }
    },
  },
  digital: {
    nombre: 'Luz del día',
    dibujar: (c, chico) => {
      const dia = esDia(c)
      const estilo: Estilo = { color: dia ? 0xffc857 : 0x8fb3ff, segundos: dia ? 0xff8c42 : 0xd7d7ff, barra: false }
      const L = chico ? LIENZO.digitalChico : LIENZO.digital
      const formas = sieteSegmentos(c, estilo, 1, 1, chico)
      if (!chico) {
        // Barra de 24 h: la franja ámbar es el día y la marca blanca es ahora
        const x0 = 1
        const largo = 34
        const pos = (min: number) => x0 + (min / 1440) * largo
        const y = 15
        formas.push({ t: 'rect', x: x0, y, w: largo, h: 1, color: NAVY })
        formas.push({ t: 'rect', x: pos(c.amanecer), y, w: pos(c.atardecer) - pos(c.amanecer), h: 1, color: AMBAR })
        formas.push({
          t: 'rect',
          x: Math.floor(pos(c.h * 60 + c.m)),
          y: y - 1,
          w: 1,
          h: 3,
          color: 0xffffff,
          anim: { tipo: 'parpadeo', periodo: 2, fase: ((c.s % 2) + c.ms / 1000) / 2, encendido: 0.75 },
        })
      }
      return { ...L, nitido: true, formas }
    },
  },
}

const neon: Tema = {
  id: 'neon',
  nombre: 'Neón',
  analogico: {
    nombre: 'Anillos',
    dibujar: (c, chico) => {
      const e = chico ? CHICA : GRANDE
      const R = e.r
      const f = fases(c)
      const g = chico ? 1.6 : 2.2
      const anillo = (r: number, color: number, pista: number, periodo: number, fase: number): Forma[] => [
        { t: 'arco', cx: e.cx, cy: e.cy, r, desde: 0, hasta: 360, color: pista, grosor: g },
        { t: 'arco', cx: e.cx, cy: e.cy, r, desde: 0, hasta: 360, color, grosor: g, anim: { tipo: 'crecer', periodo, fase } },
      ]
      return {
        ...lienzoAnalogico(chico),
        formas: [
          ...anillo(R - 1.2, 0xff2bd6, 0x3b0a33, 43_200, f.hora),
          ...anillo(R - 1.2 - g - 1, 0x00e5ff, 0x063a42, 3600, f.min),
          ...anillo(R - 1.2 - 2 * (g + 1), 0xf9f871, 0x34340e, 60, f.seg),
          { t: 'circulo', cx: e.cx, cy: e.cy, r: 1.3, relleno: 0xff2bd6, anim: { tipo: 'parpadeo', periodo: 1, fase: f.medio, encendido: 0.5 } },
        ],
      }
    },
  },
  digital: { nombre: 'Neón', dibujar: digitalSimple({ color: 0xff4fd8, segundos: 0x00e5ff, brillo: 0x4a0a40, pista: 0x063a42 }) },
}

const binario: Tema = {
  id: 'binario',
  nombre: 'Binario',
  analogico: {
    nombre: '60 luces',
    dibujar: (c, chico) => {
      const e = chico ? CHICA : GRANDE
      const R = e.r
      const segundo = c.s + c.ms / 1000
      // Cada luz se enciende en su segundo y se apaga al cerrar el minuto
      const luces: Forma[] = []
      for (let i = 0; i < 60; i++) {
        const p = punto(e, i * 6, R - 1)
        const r = i % 5 === 0 ? 0.75 : 0.45
        luces.push({ t: 'circulo', cx: p.x, cy: p.y, r, relleno: 0x1f2937 })
        luces.push({
          t: 'circulo',
          cx: p.x,
          cy: p.y,
          r,
          relleno: i % 5 === 0 ? 0x6ee7b7 : 0x34d399,
          anim: { tipo: 'parpadeo', periodo: 60, fase: ((((segundo - i) / 60) % 1) + 1) % 1, encendido: (60 - i) / 60 },
        })
      }
      return {
        ...lienzoAnalogico(chico),
        formas: [
          ...luces,
          ...marcas(e, R - 4, 0.5, 0x374151),
          ...tresManecillas(e, c, { hora: 0xe5e7eb, minuto: 0x9ca3af }, { h: 0.42, m: 0.66, s: 0.7 }),
          { t: 'circulo', cx: e.cx, cy: e.cy, r: 1, relleno: 0x34d399 },
        ],
      }
    },
  },
  digital: {
    nombre: 'BCD',
    dibujar: (c, chico) => {
      const L = chico ? LIENZO.digitalChico : LIENZO.digital
      const lado = chico ? 1 : 3
      const paso = lado + 1
      const grupo = chico ? 1 : 2
      const ancho = 6 * paso - 1 + 2 * grupo
      const x0 = Math.floor((L.ancho - ancho) / 2)
      const y0 = chico ? 0 : 1
      const formas: Forma[] = []
      const encendido = 0x34d399
      const apagado = 0x1f2937
      type Columna = { bits: number; valor: number; ciclo?: { periodo: number; fase: number; de: (k: number) => number; pasos: number } }
      // Columnas: decenas y unidades de horas, minutos y segundos; bit 3 arriba
      const columnas: Columna[] = [
        { bits: 2, valor: Math.floor(c.h / 10) },
        { bits: 4, valor: c.h % 10 },
        { bits: 3, valor: Math.floor(c.m / 10) },
        { bits: 4, valor: c.m % 10 },
        { bits: 3, valor: 0, ciclo: { periodo: 60, fase: (c.s + c.ms / 1000) / 60, de: k => Math.floor(k / 10), pasos: 60 } },
        { bits: 4, valor: 0, ciclo: { periodo: 10, fase: ((c.s % 10) + c.ms / 1000) / 10, de: k => k, pasos: 10 } },
      ]
      columnas.forEach((col, i) => {
        const x = x0 + i * paso + Math.floor(i / 2) * grupo
        for (let b = 0; b < col.bits; b++) {
          const y = y0 + (3 - b) * paso
          formas.push({ t: 'rect', x, y, w: lado, h: lado, color: apagado })
          const ciclo = col.ciclo
          if (ciclo) {
            const valores = Array.from({ length: ciclo.pasos }, (_, k) => ((ciclo.de(k) >> b) & 1 ? 1 : 0))
            formas.push({ t: 'rect', x, y, w: lado, h: lado, color: encendido, anim: { tipo: 'secuencia', periodo: ciclo.periodo, fase: ciclo.fase, valores } })
          } else if ((col.valor >> b) & 1) {
            formas.push({ t: 'rect', x, y, w: lado, h: lado, color: encendido })
          }
        }
      })
      return { ...L, nitido: true, formas }
    },
  },
}

// «Dos ciudades»: dos esferas chicas, cada una de día o de noche según su propia hora
const DIA_NOCHE = {
  diaAnalogico: { esfera: 0xf8fafc, borde: 0x94a3b8, manecillas: 0x111827, segundo: 0xea580c },
  nocheAnalogico: { esfera: 0x0f172a, borde: 0x475569, manecillas: 0xe2e8f0, segundo: 0x818cf8 },
  diaDigital: { color: 0xffd75f, segundos: 0xff8700 },
  nocheDigital: { color: 0x87afff, segundos: 0xd7d7ff },
}
const deDia = (c: Contexto): boolean => c.h >= 7 && c.h < 20

const dosCiudades: Tema = {
  id: 'dos',
  nombre: 'Dos ciudades',
  analogico: {
    nombre: 'Aquí y otra ciudad',
    dibujar: (c, chico = true) => {
      const e = chico ? CHICA : GRANDE
      const k = deDia(c) ? DIA_NOCHE.diaAnalogico : DIA_NOCHE.nocheAnalogico
      return {
        ...lienzoAnalogico(chico),
        formas: [
          { t: 'circulo', cx: e.cx, cy: e.cy, r: e.r - 0.5, relleno: k.esfera, borde: k.borde, grosor: 1 },
          ...marcas(e, e.r - 2.2, 0.4, k.borde, { radio: 0.7, color: k.manecillas }),
          ...tresManecillas(e, c, { hora: k.manecillas, minuto: k.manecillas, segundo: k.segundo, cola: 1.5 }),
          { t: 'circulo', cx: e.cx, cy: e.cy, r: 0.8, relleno: k.segundo },
        ],
      }
    },
  },
  digital: {
    nombre: 'Aquí y otra ciudad',
    dibujar: (c, chico = true) => digitalSimple(deDia(c) ? DIA_NOCHE.diaDigital : DIA_NOCHE.nocheDigital)(c, chico),
  },
}

export const TEMAS: Tema[] = [fosforo, despertador, evolucion, hielo, solLuna, neon, binario, dosCiudades]
export const DOS_CIUDADES = 'dos'

// Nombres de temas y carátulas en inglés (los de arriba quedan en español)
const NOMBRES_EN: Record<string, string> = {
  'Fósforo': 'Phosphor',
  Radar: 'Radar',
  'LCD fósforo': 'Phosphor LCD',
  Despertador: 'Alarm clock',
  Campanas: 'Bells',
  'LED rojo': 'Red LED',
  'Centro Evolución': 'Centro Evolución',
  'Oro y violeta': 'Gold and violet',
  'Dorado CE': 'CE gold',
  Hielo: 'Ice',
  Minimal: 'Minimal',
  'Trazo fino': 'Thin line',
  'Sol y luna': 'Sun and moon',
  '24 horas': '24 hours',
  'Luz del día': 'Daylight',
  'Neón': 'Neon',
  Anillos: 'Rings',
  Binario: 'Binary',
  '60 luces': '60 lights',
  BCD: 'BCD',
  'Dos ciudades': 'Two cities',
  'Aquí y otra ciudad': 'Here and another city',
}
export const nombreEn = (nombre: string): string => tr(nombre, NOMBRES_EN[nombre] ?? nombre)
