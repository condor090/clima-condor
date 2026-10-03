// Escena animada del cielo: pixel-art con medio bloque (▀), dos píxeles por celda
// El cielo sigue la hora real (amanecer, día, atardecer, noche), el clima real, la luna y el paisaje de la ciudad
import { luna, sol } from './astro'
import type { Horizontal } from './astro'
import { fase } from './luna'

export const DEFECTO = 0x01000000
const MEDIO_BLOQUE = 0x2580
const MEDIO_BLOQUE_ABAJO = 0x2584

export type Lienzo = { ancho: number; alto: number; px: Uint32Array }

export type Paisaje = 'desierto' | 'andes' | 'colinas'

export type DatosEscena = {
  codigo: number
  lat: number
  lon: number
  minutos: number // minutos locales del día, 0–1439
  amanecer: number // minutos locales
  atardecer: number
  cuadro: number
  ms?: number // instante real (para la fase de la luna)
}

// --- Colores

const r = (c: number): number => (c >> 16) & 0xff
const g = (c: number): number => (c >> 8) & 0xff
const b = (c: number): number => c & 0xff

export function mezclar(a: number, c: number, t: number): number {
  const k = Math.max(0, Math.min(1, t))
  const m = (x: number, y: number) => Math.round(x + (y - x) * k)
  return (m(r(a), r(c)) << 16) | (m(g(a), g(c)) << 8) | m(b(a), b(c))
}

// --- Base64 de los triples [glifo, frente, fondo]

const ABC = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/'

export function base64(bytes: Uint8Array): string {
  let s = ''
  let i = 0
  for (; i + 2 < bytes.length; i += 3) {
    const n = ((bytes[i] ?? 0) << 16) | ((bytes[i + 1] ?? 0) << 8) | (bytes[i + 2] ?? 0)
    s += ABC[(n >> 18) & 63]! + ABC[(n >> 12) & 63]! + ABC[(n >> 6) & 63]! + ABC[n & 63]!
  }
  const resto = bytes.length - i
  if (resto === 1) {
    const n = (bytes[i] ?? 0) << 16
    s += ABC[(n >> 18) & 63]! + ABC[(n >> 12) & 63]! + '=='
  } else if (resto === 2) {
    const n = ((bytes[i] ?? 0) << 16) | ((bytes[i + 1] ?? 0) << 8)
    s += ABC[(n >> 18) & 63]! + ABC[(n >> 12) & 63]! + ABC[(n >> 6) & 63]! + '='
  }
  return s
}

export function celdas(triples: Uint32Array): string {
  // Little-endian, como pide el Raster
  const bytes = new Uint8Array(triples.length * 4)
  triples.forEach((v, i) => {
    bytes[i * 4] = v & 0xff
    bytes[i * 4 + 1] = (v >>> 8) & 0xff
    bytes[i * 4 + 2] = (v >>> 16) & 0xff
    bytes[i * 4 + 3] = (v >>> 24) & 0xff
  })
  return base64(bytes)
}

// Inverso de celdas(): de base64 a los tripletes [glifo, frente, fondo]
function tripletes(s: string): Uint32Array {
  const limpio = s.replace(/=+$/, '')
  const bytes = new Uint8Array(Math.floor((limpio.length * 3) / 4))
  let j = 0
  for (let i = 0; i < limpio.length; i += 4) {
    const n =
      (ABC.indexOf(limpio[i] ?? 'A') << 18) |
      (ABC.indexOf(limpio[i + 1] ?? 'A') << 12) |
      ((ABC.indexOf(limpio[i + 2] ?? 'A') & 63) << 6) |
      (ABC.indexOf(limpio[i + 3] ?? 'A') & 63)
    if (j < bytes.length) bytes[j++] = (n >> 16) & 0xff
    if (j < bytes.length) bytes[j++] = (n >> 8) & 0xff
    if (j < bytes.length) bytes[j++] = n & 0xff
  }
  const t = new Uint32Array(Math.floor(bytes.length / 4))
  for (let i = 0; i < t.length; i++) {
    t[i] = ((bytes[i * 4] ?? 0) | ((bytes[i * 4 + 1] ?? 0) << 8) | ((bytes[i * 4 + 2] ?? 0) << 16) | ((bytes[i * 4 + 3] ?? 0) << 24)) >>> 0
  }
  return t
}

// Los marcos del escritorio pintan blanco detrás de un SVG transparente si su esquema de color
// no coincide con el de la app: el SVG declara que acepta claro y oscuro
export const ESQUEMA_ATRIBUTO = ' style="color-scheme:light dark"'
export const ESQUEMA_ESTILO = '<style>:root{color-scheme:light dark}body{margin:0;overflow:hidden}</style>'

const css = (c: number): string => `#${(c & 0xffffff).toString(16).padStart(6, '0')}`

// Las mismas celdas del Raster como SVG, para el escritorio (que no tiene Raster):
// cada celda son dos píxeles cuadrados; los tramos del mismo color se unen en un rect
export function svgDe(cells: string, columnas: number, filas: number, lado = 4): string {
  const t = tripletes(cells)
  const px = new Uint32Array(columnas * filas * 2).fill(DEFECTO)
  for (let f = 0; f < filas; f++) {
    for (let c = 0; c < columnas; c++) {
      const i = (f * columnas + c) * 3
      const glifo = t[i] ?? 0x20
      const frente = t[i + 1] ?? DEFECTO
      const fondo = t[i + 2] ?? DEFECTO
      const [arriba, abajo] =
        glifo === MEDIO_BLOQUE ? [frente, fondo] : glifo === MEDIO_BLOQUE_ABAJO ? [fondo, frente] : [fondo, fondo]
      px[2 * f * columnas + c] = arriba
      px[(2 * f + 1) * columnas + c] = abajo
    }
  }
  let rects = ''
  for (let y = 0; y < filas * 2; y++) {
    let x = 0
    while (x < columnas) {
      const color = px[y * columnas + x] ?? DEFECTO
      let fin = x + 1
      while (fin < columnas && px[y * columnas + fin] === color) fin++
      if (color !== DEFECTO) rects += `<rect x="${x * lado}" y="${y * lado}" width="${(fin - x) * lado}" height="${lado}" fill="${css(color)}"/>`
      x = fin
    }
  }
  const w = columnas * lado
  const h = filas * 2 * lado
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${w} ${h}" width="${w}" height="${h}" shape-rendering="crispEdges">${rects}</svg>`
}

// Dos píxeles por celda: el de arriba es el frente de ▀, el de abajo el fondo
export function empaquetar(l: Lienzo): string {
  const filas = l.alto / 2
  const t = new Uint32Array(l.ancho * filas * 3)
  for (let f = 0; f < filas; f++) {
    for (let c = 0; c < l.ancho; c++) {
      const i = (f * l.ancho + c) * 3
      const arriba = l.px[2 * f * l.ancho + c] ?? 0
      const abajo = l.px[(2 * f + 1) * l.ancho + c] ?? 0
      // Píxeles transparentes: nunca usar el color de texto por defecto como frente
      if (arriba === DEFECTO && abajo === DEFECTO) {
        t[i] = 0x20
        t[i + 1] = DEFECTO
        t[i + 2] = DEFECTO
      } else if (arriba === abajo) {
        // Un solo color: espacio con fondo, así Terminal.app no deja franja entre filas
        t[i] = 0x20
        t[i + 1] = DEFECTO
        t[i + 2] = arriba
      } else if (arriba === DEFECTO) {
        t[i] = MEDIO_BLOQUE_ABAJO
        t[i + 1] = abajo
        t[i + 2] = DEFECTO
      } else {
        t[i] = MEDIO_BLOQUE
        t[i + 1] = arriba
        t[i + 2] = abajo
      }
    }
  }
  return celdas(t)
}

// --- Utilidades de dibujo

const azar = (n: number): number => {
  const x = Math.sin(n * 127.1 + 311.7) * 43758.5453
  return x - Math.floor(x)
}

function pintar(l: Lienzo, x: number, y: number, color: number): void {
  const xi = Math.round(x)
  const yi = Math.round(y)
  if (xi < 0 || yi < 0 || xi >= l.ancho || yi >= l.alto) return
  l.px[yi * l.ancho + xi] = color
}

function disco(l: Lienzo, cx: number, cy: number, radio: number, color: number): void {
  for (let y = Math.floor(cy - radio); y <= Math.ceil(cy + radio); y++) {
    for (let x = Math.floor(cx - radio); x <= Math.ceil(cx + radio); x++) {
      if ((x - cx) ** 2 + (y - cy) ** 2 <= radio * radio) pintar(l, x, y, color)
    }
  }
}

// --- Paisaje según la ciudad

export function paisajeDe(lat: number, lon: number): Paisaje {
  if (lat < -17 && lat > -45 && lon > -76 && lon < -64) return 'andes'
  if (lat > 22 && lat < 34 && lon > -118 && lon < -102) return 'desierto'
  return 'colinas'
}

// --- Luz del día

type Luz = { dia: number; crepusculo: number; amaneciendo: boolean; t: number; esDia: boolean }

export function luz(minutos: number, amanecer: number, atardecer: number): Luz {
  const esDia = minutos >= amanecer && minutos <= atardecer
  const t = esDia ? (minutos - amanecer) / Math.max(1, atardecer - amanecer) : 0
  const aAmanecer = Math.min(Math.abs(minutos - amanecer), 1440 - Math.abs(minutos - amanecer))
  const aAtardecer = Math.min(Math.abs(minutos - atardecer), 1440 - Math.abs(minutos - atardecer))
  const cerca = Math.min(aAmanecer, aAtardecer)
  return {
    dia: esDia ? Math.min(1, cerca / 70) : 0,
    crepusculo: Math.max(0, 1 - cerca / 50),
    amaneciendo: aAmanecer < aAtardecer,
    t,
    esDia,
  }
}

// Cuánto tapa el cielo según el código WMO
function nubosidad(codigo: number): { nubes: number; gris: number; lluvia: 'nada' | 'llovizna' | 'lluvia' | 'nieve'; tormenta: boolean } {
  if (codigo >= 95) return { nubes: 5, gris: 0.7, lluvia: 'lluvia', tormenta: true }
  if (codigo >= 71 && codigo <= 86 && ![80, 81, 82].includes(codigo)) return { nubes: 4, gris: 0.45, lluvia: 'nieve', tormenta: false }
  if (codigo >= 61) return { nubes: 5, gris: 0.6, lluvia: 'lluvia', tormenta: false }
  if (codigo >= 51) return { nubes: 4, gris: 0.5, lluvia: 'llovizna', tormenta: false }
  if (codigo >= 45) return { nubes: 3, gris: 0.55, lluvia: 'nada', tormenta: false }
  if (codigo === 3) return { nubes: 5, gris: 0.5, lluvia: 'nada', tormenta: false }
  if (codigo === 2) return { nubes: 3, gris: 0.15, lluvia: 'nada', tormenta: false }
  if (codigo === 1) return { nubes: 1, gris: 0, lluvia: 'nada', tormenta: false }
  return { nubes: 0, gris: 0, lluvia: 'nada', tormenta: false }
}

// --- Escena en capas: lo fijo (cielo, sol, luna, paisaje) y lo que se mueve (estrellas, nubes, lluvia, haces)
// El sol y la luna van en su posición real (altura y azimut): salen y se ponen detrás del paisaje
// La terminal compone las capas cuadro a cuadro; el escritorio las anima con SMIL dentro de un SVG

type Estrella = { x: number; y: number; base: number; color: number; i: number }
type Nube = { y: number; vel: number; x0: number; forma: Lienzo; ox: number; oy: number }
type Gota = { i: number; x0: number; y0: number }
type Precip = { tipo: 'nada' | 'llovizna' | 'lluvia' | 'nieve'; color: number; vy: number; gotas: Gota[] }

export type Capas = {
  ancho: number
  alto: number
  horizonte: number
  fondo: Lienzo
  // El mismo cielo sin sol ni luna: el escritorio los dibuja encima como vectores
  limpio: Lienzo
  astros: Astros
  estrellas: Estrella[]
  rayos: { x: number; y: number; color: number } | null
  // Haces de luz del amanecer o el atardecer, que respiran
  haces: Lienzo
  fuerzaHaces: number
  nubes: Nube[]
  vuelta: number
  precip: Precip
  tormenta: boolean
  rayo: Array<[number, number]>
  paisaje: Lienzo
  ventanas: Array<{ x: number; y: number }>
  // Para el texto del panel
  altSol: number
  altLuna: number
}

// Sol y luna en coordenadas de píxel (con decimales), para dibujarlos lisos
export type Astros = {
  sol: { x: number; y: number; r: number; achatado: number; color: number; nucleo: number; halo: number } | null
  luna: {
    x: number
    y: number
    r: number
    claro: number
    oscuro: number | null // la cara a oscuras solo se ve de noche
    sombra: number // cuánto se ve la cara a oscuras (se apaga al aclarar)
    angulo: number // hacia dónde mira la cara iluminada (radianes, en pantalla)
    cosE: number // coseno de la elongación: dónde cae el terminador
    brillo: number // resplandor alrededor (0–1)
  } | null
}

const FPS = 8
const CRATERES: Array<[number, number]> = [[-0.35, -0.25], [0.3, 0.3], [0.05, -0.55], [-0.15, 0.45]]
// Submuestras por lado para suavizar los bordes en la terminal
const SUB = 4
const limitar = (v: number, a = 0, b = 1): number => Math.max(a, Math.min(b, v))

// Paleta del cielo según la altura del sol: [altura, cénit, horizonte]
const PALETA: Array<[number, number, number]> = [
  [-90, 0x03050f, 0x070b1e],
  [-18, 0x04071a, 0x0b1230],
  [-12, 0x080d2c, 0x18234f],
  [-8, 0x111848, 0x3a2f6e],
  [-5, 0x1c2262, 0x7a3f80],
  [-3, 0x272d76, 0xc8537c],
  [-1, 0x34408c, 0xf2705a],
  [1, 0x3f55a2, 0xff9a4a],
  [4, 0x4a70bf, 0xffc272],
  [8, 0x3f84d7, 0xffe2ac],
  [15, 0x2f7fd8, 0xbfe2ff],
  [40, 0x2471d2, 0xa9d8ff],
  [90, 0x1e69cc, 0x9fd0ff],
]

function paleta(h: number): [number, number] {
  for (let i = 0; i + 1 < PALETA.length; i++) {
    const [a, za, ha] = PALETA[i]!
    const [b, zb, hb] = PALETA[i + 1]!
    if (h <= b) {
      const t = limitar((h - a) / (b - a))
      return [mezclar(za, zb, t), mezclar(ha, hb, t)]
    }
  }
  const ult = PALETA[PALETA.length - 1]!
  return [ult[1], ult[2]]
}

// Fuerza del resplandor dorado: máxima con el sol en el horizonte, nula a −8° y a +9°
const crepusculo = (h: number): number => limitar(1 - Math.abs(h - 0.5) / 8.5)

// Mirando al ecuador: en el norte el este queda a la izquierda; en el sur, a la derecha
// Proyección de cúpula: lo que está alto se acerca al centro (sin saltos al pasar por el cénit)
function proyectar(p: Horizontal, sur: boolean, ancho: number, horizonte: number): { x: number; y: number } {
  const rel = ((sur ? p.az : p.az - 180) * Math.PI) / 180
  const H = horizonte - 2
  // Altura no lineal: cerca del horizonte cada grado se nota (las salidas se ven pasar)
  const k = 14
  const y = horizonte - (H * (1 - Math.exp(-p.alt / k))) / (1 - Math.exp(-80 / k))
  const coseno = Math.cos((Math.max(0, p.alt) * Math.PI) / 180)
  return { x: ancho / 2 + 14 * coseno * Math.sin(rel), y }
}

// Sin instante real (pruebas), la hora solar local del día de referencia
function instante(d: DatosEscena): number {
  return d.ms ?? Date.UTC(2026, 9, 2) + (d.minutos * 60 - d.lon * 240) * 1000
}

export function capas(d: DatosEscena, ancho = 40, alto = 20): Capas {
  const ms = instante(d)
  const horizonte = alto - 6
  const sur = d.lat < 0
  const nb = nubosidad(d.codigo)
  const S = sol(ms, d.lat, d.lon)
  const h = S.alt
  const ps = proyectar(S, sur, ancho, horizonte)
  const atardece = sol(ms + 600_000, d.lat, d.lon).alt < h
  const I = crepusculo(h) * (1 - nb.gris * 0.75)
  const dia = limitar((h + 2) / 12) // 0 de noche, 1 de día pleno

  // 1. Cielo: degradado vertical + resplandor alrededor del sol y una franja cálida en el horizonte
  let [zen, hor] = paleta(h)
  if (atardece && h > -7 && h < 6) hor = mezclar(hor, 0xff4d6d, 0.28 * crepusculo(h))
  const gris = dia > 0.5 ? 0x8d97a8 : mezclar(0x1c2030, 0x8d97a8, dia * 2)
  zen = mezclar(zen, gris, nb.gris)
  hor = mezclar(hor, gris, nb.gris)
  const dorado = mezclar(0xff5a1f, 0xffc96a, limitar((h + 3) / 10))
  const halo = h > 8 ? 0.35 * (1 - nb.gris) : 0
  const resplandor = (x: number, y: number): number => {
    const dx = x + 0.5 - ps.x
    const dy = y + 0.5 - ps.y
    const dist = Math.sqrt((dx / 2.3) ** 2 + dy ** 2)
    const franja = I * Math.exp(-Math.abs(dx) / 16) * Math.exp(-Math.max(0, horizonte - y) / 3.6) * 0.9
    return limitar(I * Math.exp(-dist / 8) * 1.05 + halo * Math.exp(-dist / 2.6) + franja)
  }
  const venus = limitar(1 - Math.abs(h + 2.5) / 4.5) * (1 - nb.gris)
  const fondo: Lienzo = { ancho, alto, px: new Uint32Array(ancho * alto) }
  const limpio: Lienzo = { ancho, alto, px: new Uint32Array(ancho * alto) }
  const nucleo = h > -3 ? 0.6 * (1 - nb.gris) : 0
  for (let y = 0; y < alto; y++) {
    const base = mezclar(zen, hor, Math.pow(limitar(y / horizonte), 1.35))
    for (let x = 0; x < ancho; x++) {
      const g = resplandor(x, y)
      let c = mezclar(base, dorado, g)
      // Del lado opuesto al sol: la sombra de la Tierra (azul) y encima el cinturón de Venus (rosa)
      if (venus > 0.02 && y < horizonte) {
        const lejos = limitar(Math.abs(x + 0.5 - ps.x) / ancho - 0.25) * 1.6
        const sobre = horizonte - y
        if (sobre <= 2) c = mezclar(c, 0x2b3466, 0.55 * venus * lejos)
        else if (sobre <= 5) c = mezclar(c, 0xe08aa6, 0.5 * venus * lejos * (1 - (sobre - 3) / 3))
      }
      limpio.px[y * ancho + x] = c
      // Núcleo blanco-dorado pegado al sol (en el escritorio va como degradado liso)
      const cerca = Math.hypot(x + 0.5 - ps.x, y + 0.5 - ps.y)
      if (cerca < 4 && nucleo > 0) c = mezclar(c, 0xfff1c9, limitar((4 - cerca) / 4) * nucleo)
      fondo.px[y * ancho + x] = c
    }
  }

  // 2. Haces de luz que salen del sol (abanico), solo en la hora dorada y sin cielo cubierto
  const haces: Lienzo = { ancho, alto, px: new Uint32Array(ancho * alto).fill(DEFECTO) }
  const fuerzaHaces = nb.gris < 0.55 ? I * 0.42 : 0
  if (fuerzaHaces > 0.03) {
    for (let y = 0; y < horizonte; y++) {
      for (let x = 0; x < ancho; x++) {
        const dx = x + 0.5 - ps.x
        const dy = y + 0.5 - ps.y
        if (Math.hypot(dx, dy) < 3) continue
        const ang = Math.atan2(dx, -dy)
        if (Math.sin(ang * 9 + 0.6) > 0.35) haces.px[y * ancho + x] = mezclar(dorado, 0xfff4d6, 0.3)
      }
    }
  }

  // 3. Sol: rojo y achatado al salir, dorado después, blanco a mediodía
  let rayos: Capas['rayos'] = null
  const astros: Astros = { sol: null, luna: null }
  if (h > -4) {
    const oculto = nb.gris >= 0.5
    const color = h < 1 ? 0xff4f1f : h < 6 ? mezclar(0xff4f1f, 0xffb02e, (h - 1) / 5) : mezclar(0xffb02e, 0xfff4c2, limitar((h - 6) / 25))
    const r = h < 5 ? 2.4 : 1.8
    const achatado = h < 3 ? 0.78 : 1
    const disco = oculto ? mezclar(color, gris, 0.6) : color
    // Borde suave: cada píxel toma el color del disco en la parte que cubre
    for (let y = Math.floor(ps.y - r - 1); y <= Math.ceil(ps.y + r + 1); y++) {
      for (let x = Math.floor(ps.x - r - 1); x <= Math.ceil(ps.x + r + 1); x++) {
        if (x < 0 || y < 0 || x >= ancho || y >= alto) continue
        let dentro = 0
        for (let sy = 0; sy < SUB; sy++) {
          for (let sx = 0; sx < SUB; sx++) {
            const u = (x + (sx + 0.5) / SUB - ps.x) / r
            const v = (y + (sy + 0.5) / SUB - ps.y) / (r * achatado)
            if (u * u + v * v <= 1) dentro++
          }
        }
        if (dentro > 0) fondo.px[y * ancho + x] = mezclar(fondo.px[y * ancho + x] ?? zen, disco, dentro / (SUB * SUB))
      }
    }
    astros.sol = { x: ps.x, y: ps.y, r, achatado, color: disco, nucleo, halo: oculto ? 0 : 1 }
    if (!oculto && h > 6) rayos = { x: ps.x - 0.5, y: ps.y - 0.5, color: mezclar(color, 0xffffff, 0.25) }
  }

  // 4. Luna en su lugar real, con la cara iluminada mirando al sol
  const L = luna(ms, d.lat, d.lon)
  const pl = proyectar(L, sur, ancho, horizonte)
  pl.y = Math.max(3.3, pl.y)
  const f = fase(ms, d.lat)
  let discoLuna: { x: number; y: number; r: number } | null = null
  if (L.alt > -5 && f.iluminada > 0.02) {
    const r = 3
    discoLuna = { x: pl.x, y: pl.y, r }
    const cieloLuna = fondo.px[limitar(Math.round(pl.y), 0, alto - 1) * ancho + limitar(Math.round(pl.x), 0, ancho - 1)] ?? zen
    // Naranja al salir, pálida de día, apagada con nubes
    let claro = mezclar(0xf4f1de, 0xffb070, 0.5 * limitar(1 - L.alt / 10))
    claro = mezclar(claro, cieloLuna, 0.55 * dia)
    claro = mezclar(claro, cieloLuna, nb.gris * 0.7)
    const oscuro = mezclar(cieloLuna, 0x2a3348, 0.5 * (1 - dia) * (1 - nb.gris))
    // Dirección hacia el sol en la pantalla (aunque esté bajo el horizonte)
    let sx = ps.x - pl.x
    let sy = ps.y - pl.y
    const n = Math.hypot(sx, sy) || 1
    sx /= n
    sy /= n
    const cosE = Math.cos((f.elongacion * Math.PI) / 180)
    const brillo = dia < 0.4 && f.iluminada > 0.3 ? 0.16 * f.iluminada * (1 - nb.gris) : 0
    const conOscuro = dia < 0.6
    // La cara a oscuras se ve de noche cerrada y se borra en el crepúsculo (sol entre −12° y −4°)
    const sombra = limitar((-4 - h) / 8)
    const crater = mezclar(claro, 0xb7b29c, 0.45)
    // Cada píxel promedia sus submuestras: borde y terminador suaves
    for (let y = Math.floor(pl.y - r - 2); y <= Math.ceil(pl.y + r + 2); y++) {
      for (let x = Math.floor(pl.x - r - 2); x <= Math.ceil(pl.x + r + 2); x++) {
        if (x < 0 || y < 0 || x >= ancho || y >= alto) continue
        const base = fondo.px[y * ancho + x] ?? zen
        let rr = 0
        let gg = 0
        let bb = 0
        let dentro = 0
        for (let sy2 = 0; sy2 < SUB; sy2++) {
          for (let sx2 = 0; sx2 < SUB; sx2++) {
            const u = (x + (sx2 + 0.5) / SUB - pl.x) / r
            const v = (y + (sy2 + 0.5) / SUB - pl.y) / r
            let c = base
            if (u * u + v * v <= 1) {
              dentro++
              const haciaSol = u * sx + v * sy
              const lado = -u * sy + v * sx
              if (haciaSol > cosE * Math.sqrt(Math.max(0, 1 - lado * lado))) {
                c = CRATERES.some(([a, b]) => (u - a) ** 2 + (v - b) ** 2 < 0.045) ? crater : claro
              } else if (conOscuro) {
                c = mezclar(base, oscuro, sombra)
              }
            }
            rr += (c >> 16) & 0xff
            gg += (c >> 8) & 0xff
            bb += c & 0xff
          }
        }
        const n2 = SUB * SUB
        if (dentro > 0) {
          fondo.px[y * ancho + x] = (Math.round(rr / n2) << 16) | (Math.round(gg / n2) << 8) | Math.round(bb / n2)
        } else if (brillo > 0) {
          const d2 = ((x + 0.5 - pl.x) / r) ** 2 + ((y + 0.5 - pl.y) / r) ** 2
          if (d2 <= 2) fondo.px[y * ancho + x] = mezclar(base, 0x9aa6c8, brillo)
        }
      }
    }
    astros.luna = { x: pl.x, y: pl.y, r, claro, oscuro: conOscuro ? oscuro : null, sombra, angulo: Math.atan2(sy, sx), cosE, brillo }
  }

  // 5. Estrellas: aparecen poco a poco al oscurecer, fuera del disco de la luna
  const estrellas: Estrella[] = []
  const oscuridad = limitar((-h - 5) / 9)
  if (oscuridad > 0.05 && nb.gris < 0.5) {
    for (let i = 0; i < 24; i++) {
      const x = Math.floor(azar(i) * ancho)
      const y = Math.floor(azar(i + 50) * (horizonte - 3))
      if (discoLuna && (x + 0.5 - discoLuna.x) ** 2 + (y + 0.5 - discoLuna.y) ** 2 <= (discoLuna.r + 1.5) ** 2) continue
      const base = fondo.px[y * ancho + x] ?? 0
      estrellas.push({ x, y, base, color: mezclar(base, 0xfff8e1, oscuridad * (1 - nb.gris)), i })
    }
  }

  // 6. Nubes: con el sol bajo el horizonte se encienden por debajo (panza dorada, lomo lavanda);
  // de día, blancas con sombra abajo
  const nubeNoche = mezclar(0x3b4258, 0x23283a, nb.gris)
  const nubeDia = mezclar(0xf8fafc, 0x7c8798, nb.gris)
  const desdeAbajo = h < 3 && I > 0.12
  const k = I * (1 - nb.gris * 0.5)
  const colorNube = desdeAbajo ? mezclar(mezclar(nubeNoche, nubeDia, dia), 0x9a6fb8, 0.75 * k) : mezclar(mezclar(nubeNoche, nubeDia, dia), 0xffb08a, 0.5 * k)
  const panza = desdeAbajo ? mezclar(0xff6f45, 0xffc27a, limitar((h + 6) / 9)) : mezclar(colorNube, 0x000000, 0.12)
  const sombra = desdeAbajo ? mezclar(colorNube, panza, 0.85 * k) : panza
  const borde = mezclar(colorNube, 0xffe6b0, desdeAbajo ? 0 : 0.55 * k)
  const vuelta = ancho + 16
  const nubes: Nube[] = []
  for (let i = 0; i < nb.nubes; i++) {
    const forma: Lienzo = { ancho: 12, alto: 9, px: new Uint32Array(12 * 9).fill(DEFECTO) }
    const ox = 3
    const oy = 4
    disco(forma, ox + 0.5, oy + 0.8, 2.1, sombra)
    disco(forma, ox + 3, oy + 0.4, 2.3, sombra)
    disco(forma, ox, oy, 2.1, colorNube)
    disco(forma, ox + 2.6, oy - 0.9, 2.6, colorNube)
    disco(forma, ox + 5.2, oy, 2, colorNube)
    // Filo iluminado: arriba de día, abajo en el crepúsculo
    if (k > 0.1) {
      for (let x = 0; x < 12; x++) {
        const ys = desdeAbajo ? [8, 7, 6, 5, 4, 3, 2, 1, 0] : [0, 1, 2, 3, 4, 5, 6, 7, 8]
        for (const y of ys) {
          if ((forma.px[y * 12 + x] ?? DEFECTO) !== DEFECTO) {
            forma.px[y * 12 + x] = desdeAbajo ? mezclar(panza, 0xfff0c0, 0.35) : borde
            break
          }
        }
      }
    }
    nubes.push({ y: 2 + ((i * 3) % Math.max(1, horizonte - 7)), vel: 0.05 + 0.03 * (i % 3), x0: azar(i + 7) * vuelta, forma, ox, oy })
  }

  // 7. Lluvia, llovizna o nieve
  const cuantas = nb.lluvia === 'nada' ? 0 : nb.lluvia === 'llovizna' ? 14 : 28
  const precip: Precip = {
    tipo: nb.lluvia,
    color: nb.lluvia === 'nieve' ? 0xf8fafc : dia > 0.5 ? 0x9fd4f5 : 0x5b7fa8,
    vy: nb.lluvia === 'nieve' ? 0.25 : 1.1,
    gotas: Array.from({ length: cuantas }, (_, i) => ({ i, x0: azar(i + 30) * ancho, y0: azar(i + 90) * horizonte })),
  }

  // 8. Rayo en zigzag para las tormentas
  const rayo: Array<[number, number]> = []
  if (nb.tormenta) {
    let x = 6 + Math.floor(azar(Math.floor(d.cuadro / 48)) * (ancho - 12))
    for (let y = 0; y < horizonte; y++) {
      rayo.push([x, y])
      if (y % 2 === 1) x += azar(y + d.cuadro) > 0.5 ? 1 : -1
    }
  }

  // 9. Paisaje a contraluz: más claro de día, tibio en la hora dorada, con el filo encendido hacia el sol
  const lunaLuz = L.alt > 0 ? 0.1 * f.iluminada * (1 - nb.gris) : 0
  const luzPaisaje = {
    claridad: limitar(0.1 + 0.9 * limitar((h + 6) / 16) + lunaLuz),
    tibio: 0.35 * I,
    dorado,
    resplandor,
    ventanas: h < -3,
  }
  const paisaje: Lienzo = { ancho, alto, px: new Uint32Array(ancho * alto).fill(DEFECTO) }
  const ventanas = dibujarPaisaje(paisaje, paisajeDe(d.lat, d.lon), luzPaisaje, horizonte)

  return { ancho, alto, horizonte, fondo, limpio, astros, estrellas, rayos, haces, fuerzaHaces, nubes, vuelta, precip, tormenta: nb.tormenta, rayo, paisaje, ventanas, altSol: h, altLuna: L.alt }
}

// Cada estrella titila a su ritmo, lento (12–25 s por ciclo) y suave
const ritmoEstrella = (i: number): number => 0.034 * (0.7 + 0.6 * azar(i + 200))
const brilloEstrella = (n: number, i: number): number => Math.max(0, Math.min(1, 0.6 + 0.4 * Math.sin(n * ritmoEstrella(i) + i * 1.7)))
const ventanaEncendida = (x: number, y: number, tramo: number): boolean => azar(x * 13 + y + tramo) > 0.55
const COLOR_VENTANA = 0xfcd34d
const DESTELLO = 0xe9ddff

function estampar(l: Lienzo, s: Lienzo, dx: number, dy: number): void {
  for (let y = 0; y < s.alto; y++) {
    for (let x = 0; x < s.ancho; x++) {
      const c = s.px[y * s.ancho + x] ?? DEFECTO
      if (c !== DEFECTO) pintar(l, x + dx, y + dy, c)
    }
  }
}

// Un cuadro de la escena (terminal: 8 por segundo)
export function componer(c: Capas, n: number): Lienzo {
  const l: Lienzo = { ancho: c.ancho, alto: c.alto, px: Uint32Array.from(c.fondo.px) }
  for (const e of c.estrellas) pintar(l, e.x, e.y, mezclar(e.base, e.color, brilloEstrella(n, e.i)))
  if (c.fuerzaHaces > 0.03) {
    const k = c.fuerzaHaces * (0.65 + 0.35 * Math.sin(n * 0.09))
    for (let i = 0; i < l.px.length; i++) {
      const hz = c.haces.px[i] ?? DEFECTO
      if (hz !== DEFECTO) l.px[i] = mezclar(l.px[i] ?? 0, hz, k)
    }
  }
  if (c.rayos) {
    for (let k = 0; k < 8; k++) {
      if ((k + Math.floor(n / 4)) % 2 !== 0) continue
      const ang = (k * Math.PI) / 4 + n * 0.04
      for (const rr of [2.8, 3.6]) pintar(l, c.rayos.x + Math.cos(ang) * rr, c.rayos.y + Math.sin(ang) * rr, c.rayos.color)
    }
  }
  for (const nube of c.nubes) {
    const x = ((nube.x0 + n * nube.vel) % c.vuelta) - 8
    estampar(l, nube.forma, Math.round(x) - nube.ox, nube.y - nube.oy)
  }
  const p = c.precip
  for (const g of p.gotas) {
    const y = (g.y0 + n * p.vy) % c.horizonte
    if (p.tipo === 'nieve') {
      pintar(l, (g.x0 + Math.sin(n * 0.1 + g.i) * 1.2 + c.ancho) % c.ancho, y, p.color)
    } else {
      const x = (g.x0 + n * 0.35) % c.ancho
      pintar(l, x, y, p.color)
      pintar(l, x - 0.35, y - 1, mezclar(p.color, l.px[Math.max(0, Math.round(y - 1)) * c.ancho + Math.round(x)] ?? p.color, 0.5))
    }
  }
  const fase = n % 48
  if (c.tormenta && (fase === 0 || fase === 2)) {
    for (let i = 0; i < l.px.length; i++) l.px[i] = mezclar(l.px[i] ?? 0, DESTELLO, 0.55)
    for (const [x, y] of c.rayo) pintar(l, x, y, 0xfffbe6)
  }
  estampar(l, c.paisaje, 0, 0)
  for (const v of c.ventanas) if (ventanaEncendida(v.x, v.y, Math.floor(n / 40))) pintar(l, v.x, v.y, COLOR_VENTANA)
  return l
}

export function escena(d: DatosEscena, ancho = 40, alto = 20): Lienzo {
  return componer(capas(d, ancho, alto), d.cuadro)
}

// --- La misma escena como SVG animado para el escritorio

// Rects de un lienzo en unidades de píxel; los tramos del mismo color se unen
function rects(l: Lienzo): string {
  let s = ''
  for (let y = 0; y < l.alto; y++) {
    let x = 0
    while (x < l.ancho) {
      const color = l.px[y * l.ancho + x] ?? DEFECTO
      let fin = x + 1
      while (fin < l.ancho && l.px[y * l.ancho + fin] === color) fin++
      if (color !== DEFECTO) s += `<rect x="${x}" y="${y}" width="${fin - x}" height="1" fill="${css(color)}"/>`
      x = fin
    }
  }
  return s
}

const r2 = (v: number): string => String(Math.round(v * 1000) / 1000)
const ciclo = (dur: number, transcurrido: number): string => `dur="${r2(dur)}s" begin="${r2(-(((transcurrido % dur) + dur) % dur))}s" repeatCount="indefinite"`

// --- Sol y luna lisos para el escritorio (vectores encima del cielo de píxeles)

const LISO = 'shape-rendering="geometricPrecision"'

// Resplandores difusos: el núcleo dorado del sol y el halo de la luna, debajo de las estrellas
function resplandores(a: Astros): string {
  let s = ''
  if (a.sol && a.sol.nucleo > 0) {
    const { x, y, nucleo } = a.sol
    s += `<radialGradient id="ccNucleo"><stop offset="0" stop-color="#fff1c9" stop-opacity="${r2(nucleo)}"/><stop offset="1" stop-color="#fff1c9" stop-opacity="0"/></radialGradient>`
    s += `<circle cx="${r2(x)}" cy="${r2(y)}" r="4" fill="url(#ccNucleo)" ${LISO}/>`
  }
  if (a.luna && a.luna.brillo > 0) {
    const { x, y, r, brillo } = a.luna
    s += `<radialGradient id="ccHaloLuna"><stop offset="0.55" stop-color="#9aa6c8" stop-opacity="${r2(brillo * 1.6)}"/><stop offset="1" stop-color="#9aa6c8" stop-opacity="0"/></radialGradient>`
    s += `<circle cx="${r2(x)}" cy="${r2(y)}" r="${r2(r * 1.9)}" fill="url(#ccHaloLuna)" ${LISO}/>`
  }
  return s
}

// Los discos: sol con degradado (más claro hacia el centro) y luna con su fase real
function discos(a: Astros): string {
  let s = ''
  if (a.sol) {
    const { x, y, r, achatado, color, halo } = a.sol
    const centro = mezclar(color, 0xffffff, halo ? 0.55 : 0.2)
    s += `<radialGradient id="ccSol" cx="0.45" cy="0.42" r="0.6"><stop offset="0" stop-color="${css(centro)}"/><stop offset="0.7" stop-color="${css(color)}"/><stop offset="1" stop-color="${css(mezclar(color, 0xff3b1f, 0.25))}"/></radialGradient>`
    s += `<ellipse cx="${r2(x)}" cy="${r2(y)}" rx="${r2(r)}" ry="${r2(r * achatado)}" fill="url(#ccSol)" ${LISO}/>`
  }
  if (a.luna) {
    const { x, y, r, claro, oscuro, sombra, angulo, cosE } = a.luna
    // Cara iluminada: del limbo (semicírculo hacia el sol) al terminador (media elipse)
    const pts: string[] = []
    const N = 24
    for (let i = 0; i <= N; i++) {
      const t = -Math.PI / 2 + (Math.PI * i) / N
      pts.push(`${r2(r * Math.cos(t))},${r2(r * Math.sin(t))}`)
    }
    for (let i = N; i >= 0; i--) {
      const t = -Math.PI / 2 + (Math.PI * i) / N
      pts.push(`${r2(r * cosE * Math.cos(t))},${r2(r * Math.sin(t))}`)
    }
    const giro = `translate(${r2(x)} ${r2(y)}) rotate(${r2((angulo * 180) / Math.PI)})`
    const cara = `<polygon points="${pts.join(' ')}" transform="${giro}"/>`
    const limbo = mezclar(claro, 0x8a8778, 0.25)
    s += `<radialGradient id="ccLuna" cx="0.42" cy="0.4" r="0.65"><stop offset="0" stop-color="${css(mezclar(claro, 0xffffff, 0.25))}"/><stop offset="0.75" stop-color="${css(claro)}"/><stop offset="1" stop-color="${css(limbo)}"/></radialGradient>`
    s += `<clipPath id="ccFase">${cara}</clipPath>`
    s += `<g ${LISO}>`
    if (oscuro !== null) s += `<circle cx="${r2(x)}" cy="${r2(y)}" r="${r2(r)}" fill="${css(oscuro)}" opacity="${r2(sombra)}"/>`
    // El degradado va en un círculo entero recortado por la fase, así la luz no se corre con la forma
    s += `<g clip-path="url(#ccFase)"><circle cx="${r2(x)}" cy="${r2(y)}" r="${r2(r)}" fill="url(#ccLuna)"/>`
    const crater = css(mezclar(claro, 0xb7b29c, 0.45))
    for (const [u, v] of CRATERES) s += `<circle cx="${r2(x + u * r)}" cy="${r2(y + v * r)}" r="${r2(r * 0.19)}" fill="${crater}" opacity="0.8"/>`
    s += `</g></g>`
  }
  return s
}

// Ocho rayos finos alrededor del sol; `par` elige los pares o los impares
function trazosRayos(rayos: NonNullable<Capas['rayos']>, par: number): string {
  const cx = rayos.x + 0.5
  const cy = rayos.y + 0.5
  return [0, 1, 2, 3, 4, 5, 6, 7]
    .filter(k => k % 2 === par)
    .map(k => {
      const ang = (k * Math.PI) / 4
      const [c, s] = [Math.cos(ang), Math.sin(ang)]
      return `<line x1="${r2(cx + c * 2.5)}" y1="${r2(cy + s * 2.5)}" x2="${r2(cx + c * 3.9)}" y2="${r2(cy + s * 3.9)}" stroke="${css(rayos.color)}" stroke-width="0.32" stroke-linecap="round"/>`
    })
    .join('')
}

// Un cuadro del timelapse en el escritorio: cielo de píxeles con sol y luna lisos
export function svgCuadro(c: Capas, n: number, lado: number): string {
  const l = componer({ ...c, fondo: c.limpio, rayos: null }, n)
  const rayos = c.rayos
  const astros = resplandores(c.astros) + discos(c.astros) + (rayos ? `<g ${LISO}>${trazosRayos(rayos, 0)}${trazosRayos(rayos, 1)}</g>` : '')
  // El paisaje va encima de nuevo para que el sol y la luna salgan detrás de la sierra
  const ventanas = c.ventanas.filter(v => ventanaEncendida(v.x, v.y, Math.floor(n / 40)))
  const encima = rects(c.paisaje) + ventanas.map(v => `<rect x="${v.x}" y="${v.y}" width="1" height="1" fill="${css(COLOR_VENTANA)}"/>`).join('')
  return svgLienzo(l, lado, astros + encima)
}

// `ms`: el instante real, para que el SVG arranque donde iba la animación
export function svgEscena(c: Capas, lado: number, ms: number): string {
  const n0 = ms / (1000 / FPS)
  const seg = ms / 1000
  let s = rects(c.limpio) + resplandores(c.astros)

  // Estrellas chicas (menos de medio píxel) que titilan despacio, cada una a su ritmo
  for (const e of c.estrellas) {
    const w = ritmoEstrella(e.i)
    const dur = (2 * Math.PI) / w / FPS
    const valores = Array.from({ length: 13 }, (_, j) => r2(brilloEstrella((j / 12) * ((2 * Math.PI) / w), e.i))).join(';')
    const lado = 0.34 + 0.22 * azar(e.i + 300)
    const o = (1 - lado) / 2
    s += `<rect x="${r2(e.x + o)}" y="${r2(e.y + o)}" width="${r2(lado)}" height="${r2(lado)}" fill="${css(e.color)}"><animate attributeName="opacity" values="${valores}" ${ciclo(dur, seg)}/></rect>`
  }

  // Haces de luz: respiran despacio
  if (c.fuerzaHaces > 0.03) {
    const k = c.fuerzaHaces
    s += `<g opacity="${r2(k * 0.65)}"><animate attributeName="opacity" values="${r2(k * 0.3)};${r2(k)};${r2(k * 0.3)}" ${ciclo((2 * Math.PI) / 0.09 / FPS, seg)}/>${rects(c.haces)}</g>`
  }

  s += discos(c.astros)

  // Rayos del sol: trazos finos que giran despacio; pares e impares se turnan con un fundido
  const rayos = c.rayos
  if (rayos) {
    const { x, y } = rayos
    const cx = x + 0.5
    const cy = y + 0.5
    const durGiro = (2 * Math.PI) / 0.04 / FPS
    const alterna = (par: number) =>
      `<g opacity="${par ? 0.3 : 1}"><animate attributeName="opacity" values="1;0.3;1" ${ciclo(2, seg + (par ? 1 : 0))}/>${trazosRayos(rayos, par)}</g>`
    s += `<g shape-rendering="geometricPrecision"><animateTransform attributeName="transform" type="rotate" from="0 ${r2(cx)} ${r2(cy)}" to="360 ${r2(cx)} ${r2(cy)}" ${ciclo(durGiro, seg)}/>${alterna(0)}${alterna(1)}</g>`
  }

  // Nubes que cruzan el cielo y vuelven a entrar
  for (const nube of c.nubes) {
    const dur = c.vuelta / (nube.vel * FPS)
    const ya = (nube.x0 + n0 * nube.vel) % c.vuelta
    s += `<g transform="translate(${-nube.ox} ${nube.y - nube.oy})"><g><animateTransform attributeName="transform" type="translate" from="-8 0" to="${c.vuelta - 8} 0" dur="${r2(dur)}s" begin="${r2(-ya / (nube.vel * FPS))}s" repeatCount="indefinite"/>${rects(nube.forma)}</g></g>`
  }

  // Lluvia en diagonal o nieve que se mece
  const p = c.precip
  for (const g of p.gotas) {
    const durY = c.horizonte / (p.vy * FPS)
    const yaY = (g.y0 + n0 * p.vy) % c.horizonte
    const caida = `<animateTransform attributeName="transform" type="translate" from="0 0" to="0 ${c.horizonte}" dur="${r2(durY)}s" begin="${r2(-yaY / (p.vy * FPS))}s" repeatCount="indefinite"/>`
    if (p.tipo === 'nieve') {
      const durX = (2 * Math.PI) / 0.1 / FPS
      const vaiven = Array.from({ length: 12 }, (_, j) => `${r2(Math.sin((j / 12) * 2 * Math.PI + g.i) * 1.2)} 0`).join(';')
      s += `<g><animateTransform attributeName="transform" type="translate" values="${vaiven};${r2(Math.sin(g.i) * 1.2)} 0" ${ciclo(durX, seg)}/><g>${caida}<rect x="${r2(g.x0)}" y="0" width="1" height="1" fill="${css(p.color)}"/></g></g>`
    } else {
      const durX = c.ancho / (0.35 * FPS)
      const yaX = (g.x0 + n0 * 0.35) % c.ancho
      s += `<g><animateTransform attributeName="transform" type="translate" from="0 0" to="${c.ancho} 0" dur="${r2(durX)}s" begin="${r2(-yaX / (0.35 * FPS))}s" repeatCount="indefinite"/><g>${caida}<rect x="0" y="0" width="1" height="1" fill="${css(p.color)}"/><rect x="-0.35" y="-1" width="1" height="1" fill="${css(p.color)}" opacity="0.5"/></g></g>`
    }
  }

  // Tormenta: destello doble y rayo cada 6 segundos
  if (c.tormenta) {
    const tiempos = 'keyTimes="0;0.0208;0.0417;0.0625" calcMode="discrete"'
    const fase = ciclo(6, seg)
    s += `<rect x="0" y="0" width="${c.ancho}" height="${c.alto}" fill="${css(DESTELLO)}" opacity="0"><animate attributeName="opacity" values="0.55;0;0.55;0" ${tiempos} ${fase}/></rect>`
    s += `<g opacity="0"><animate attributeName="opacity" values="1;0;1;0" ${tiempos} ${fase}/>${c.rayo.map(([x, y]) => `<rect x="${x}" y="${y}" width="1" height="1" fill="#fffbe6"/>`).join('')}</g>`
  }

  s += rects(c.paisaje)

  // Ventanas de la ciudad que se encienden y apagan cada 5 segundos
  if (c.ventanas.length > 0) {
    const tramo = n0 / 40
    const base = Math.floor(tramo) - (Math.floor(tramo) % 6)
    const tiempos = Array.from({ length: 6 }, (_, j) => r2(j / 6)).join(';')
    for (const v of c.ventanas) {
      const valores = Array.from({ length: 6 }, (_, j) => (ventanaEncendida(v.x, v.y, base + j) ? 1 : 0)).join(';')
      s += `<rect x="${v.x}" y="${v.y}" width="1" height="1" fill="${css(COLOR_VENTANA)}"><animate attributeName="opacity" values="${valores}" keyTimes="${tiempos}" calcMode="discrete" ${ciclo(30, seg - base * 5)}/></rect>`
    }
  }

  const w = c.ancho * lado
  const h = c.alto * lado
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${c.ancho} ${c.alto}" width="${w}" height="${h}" shape-rendering="crispEdges" overflow="hidden"${ESQUEMA_ATRIBUTO}>${ESQUEMA_ESTILO}${s}</svg>`
}

type LuzPaisaje = { claridad: number; tibio: number; dorado: number; resplandor: (x: number, y: number) => number; ventanas: boolean }

// Devuelve dónde van las ventanas encendibles (solo la ciudad de los Andes las tiene)
function dibujarPaisaje(l: Lienzo, p: Paisaje, lz: LuzPaisaje, horizonte: number): Array<{ x: number; y: number }> {
  const { ancho, alto } = l
  const noche = 0x0a0d1a
  const tono = (c: number) => mezclar(mezclar(noche, c, lz.claridad), 0xff8a5a, lz.tibio * 0.5)
  const ventanas: Array<{ x: number; y: number }> = []

  const columna = (x: number, desde: number, color: number) => {
    for (let y = Math.max(0, Math.round(desde)); y < alto; y++) pintar(l, x, y, color)
  }

  if (p === 'andes') {
    // Cordillera con nieve en las cumbres (rosada en la hora dorada)
    const nieve = mezclar(tono(0xf1f5f9), 0xff9ab8, lz.tibio)
    for (let x = 0; x < ancho; x++) {
      const pico = Math.abs(((x * 0.9 + 3) % 11) - 5.5) * 1.1 + Math.abs(((x * 0.55) % 17) - 8.5) * 0.5
      const cima = Math.max(3, horizonte - 9 + pico)
      columna(x, cima, tono(0x5f6f8f))
      for (let y = Math.round(cima); y < Math.round(cima) + 2 && cima < horizonte - 5; y++) pintar(l, x, y, nieve)
    }
    // Ciudad con ventanas encendidas de noche
    for (let x = 0; x < ancho; x++) {
      const edificio = 2 + Math.floor(azar(Math.floor(x / 3)) * 4)
      const techo = alto - edificio
      columna(x, techo, tono(0x334155))
      if (lz.ventanas && x % 3 !== 2) {
        for (let y = techo + 1; y < alto - 1; y += 2) ventanas.push({ x, y })
      }
    }
  } else if (p === 'desierto') {
    // Sierra lejana, suelo de arena y sahuaros
    for (let x = 0; x < ancho; x++) {
      const cerro = horizonte - 2.5 - 2.2 * Math.sin(x * 0.17 + 0.6) - 1.2 * Math.sin(x * 0.41)
      columna(x, cerro, tono(0xa98068))
    }
    for (let x = 0; x < ancho; x++) {
      const suelo = alto - 3 + Math.round(Math.sin(x * 0.3) * 0.6)
      columna(x, suelo, tono(0xd8b47a))
    }
    const verde = tono(0x2f6b3f)
    for (const [cx, h] of [[7, 6], [24, 8], [34, 5]] as const) {
      const base = alto - 3
      for (let y = base - h; y < alto; y++) pintar(l, cx, y, verde)
      // Brazos del sahuaro
      pintar(l, cx - 1, base - h + 3, verde)
      pintar(l, cx - 2, base - h + 3, verde)
      pintar(l, cx - 2, base - h + 2, verde)
      pintar(l, cx - 2, base - h + 1, verde)
      if (h > 5) {
        pintar(l, cx + 1, base - h + 4, verde)
        pintar(l, cx + 2, base - h + 4, verde)
        pintar(l, cx + 2, base - h + 3, verde)
      }
    }
  } else {
    // Colinas verdes
    for (let x = 0; x < ancho; x++) {
      columna(x, horizonte - 1.5 - 2 * Math.sin(x * 0.2 + 1), tono(0x4f8a5b))
      columna(x, alto - 3 - 1.2 * Math.sin(x * 0.33), tono(0x6aa84f))
    }
  }

  // Filo encendido: la cresta de cada columna toma la luz del sol que tiene detrás
  for (let x = 0; x < ancho; x++) {
    for (let y = 0; y < alto; y++) {
      const i = y * ancho + x
      const c = l.px[i] ?? DEFECTO
      if (c === DEFECTO) continue
      l.px[i] = mezclar(c, lz.dorado, Math.min(0.85, lz.resplandor(x, y) * 1.4))
      break
    }
  }
  return ventanas
}

// Un lienzo cualquiera como SVG (con animaciones extra opcionales encima)
export function svgLienzo(l: Lienzo, lado: number, extra = ''): string {
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${l.ancho} ${l.alto}" width="${l.ancho * lado}" height="${l.alto * lado}" shape-rendering="crispEdges"${ESQUEMA_ATRIBUTO}>${ESQUEMA_ESTILO}${rects(l)}${extra}</svg>`
}
