// Dibujos vectoriales con animación: el escritorio los recibe como SVG con SMIL (se mueven solos,
// sin redibujar el panel) y la terminal como píxeles del instante actual (se re-blitean cada segundo)
import { DEFECTO, ESQUEMA_ATRIBUTO, ESQUEMA_ESTILO, empaquetar } from './escena'
import type { Lienzo } from './escena'

// fase: dónde va el ciclo ahora (0–1); así el SVG arranca sincronizado con la hora real
export type Anim =
  | { tipo: 'girar'; cx: number; cy: number; periodo: number; fase: number; pasos?: number; desde?: number; inverso?: boolean }
  | { tipo: 'parpadeo'; periodo: number; fase: number; encendido: number }
  | { tipo: 'secuencia'; periodo: number; fase: number; valores: number[] }
  | { tipo: 'crecer'; periodo: number; fase: number }

// Ángulos en grados: 0 arriba, en el sentido del reloj
export type Forma =
  | { t: 'circulo'; cx: number; cy: number; r: number; relleno?: number; borde?: number; grosor?: number; anim?: Anim }
  | { t: 'linea'; x1: number; y1: number; x2: number; y2: number; color: number; grosor: number; anim?: Anim }
  | { t: 'rect'; x: number; y: number; w: number; h: number; color: number; anim?: Anim }
  | { t: 'arco'; cx: number; cy: number; r: number; desde: number; hasta: number; color: number; grosor: number; anim?: Anim }
  | { t: 'texto'; x: number; y: number; texto: string; color: number; tam: number; anim?: Anim }
  | { t: 'grupo'; hijos: Forma[]; anim?: Anim }

export type Dibujo = { ancho: number; alto: number; formas: Forma[]; nitido?: boolean }

const css = (c: number): string => `#${(c & 0xffffff).toString(16).padStart(6, '0')}`
const n = (v: number): string => String(Math.round(v * 100) / 100)
const seg = (v: number): string => `${n(v)}s`

// --- SVG con SMIL

function smil(a: Anim, propiedad: { ancho?: number; largoArco?: number; circunferencia?: number }): string {
  const comun = `dur="${seg(a.periodo)}" begin="${seg(-a.fase * a.periodo)}" repeatCount="indefinite"`
  if (a.tipo === 'girar') {
    const d = a.desde ?? 0
    const c = `${n(a.cx)} ${n(a.cy)}`
    const vuelta = a.inverso ? -360 : 360
    if (a.pasos) {
      const valores = Array.from({ length: a.pasos }, (_, k) => `${n(d + (k * vuelta) / a.pasos!)} ${c}`).join(';')
      return `<animateTransform attributeName="transform" type="rotate" values="${valores}" calcMode="discrete" ${comun}/>`
    }
    return `<animateTransform attributeName="transform" type="rotate" from="${n(d)} ${c}" to="${n(d + vuelta)} ${c}" ${comun}/>`
  }
  if (a.tipo === 'parpadeo') {
    if (a.encendido >= 1) return ''
    return `<animate attributeName="opacity" values="1;0" keyTimes="0;${n(a.encendido)}" calcMode="discrete" ${comun}/>`
  }
  if (a.tipo === 'secuencia') {
    const k = a.valores.length
    const tiempos = a.valores.map((_, i) => n(i / k)).join(';')
    return `<animate attributeName="opacity" values="${a.valores.map(n).join(';')}" keyTimes="${tiempos}" calcMode="discrete" ${comun}/>`
  }
  // crecer: el ancho de un rect, o el trazo de un arco
  if (propiedad.ancho !== undefined) return `<animate attributeName="width" from="0" to="${n(propiedad.ancho)}" ${comun}/>`
  if (propiedad.largoArco !== undefined && propiedad.circunferencia !== undefined) {
    const c = n(propiedad.circunferencia)
    return `<animate attributeName="stroke-dasharray" from="0 ${c}" to="${n(propiedad.largoArco)} ${c}" ${comun}/>`
  }
  return ''
}

function svgForma(f: Forma): string {
  const anim = f.anim
  const gira = anim?.tipo === 'girar'
  let cuerpo: string
  if (f.t === 'grupo') return `<g>${anim ? smil(anim, {}) : ''}${f.hijos.map(svgForma).join('')}</g>`
  const interior = anim && !gira ? smil(anim, f.t === 'rect' ? { ancho: f.w } : f.t === 'arco' ? arcoMedidas(f) : {}) : ''
  if (f.t === 'circulo') {
    const relleno = f.relleno !== undefined ? css(f.relleno) : 'none'
    const borde = f.borde !== undefined ? ` stroke="${css(f.borde)}" stroke-width="${n(f.grosor ?? 1)}"` : ''
    cuerpo = `<circle cx="${n(f.cx)}" cy="${n(f.cy)}" r="${n(f.r)}" fill="${relleno}"${borde}>${interior}</circle>`
  } else if (f.t === 'linea') {
    cuerpo = `<line x1="${n(f.x1)}" y1="${n(f.y1)}" x2="${n(f.x2)}" y2="${n(f.y2)}" stroke="${css(f.color)}" stroke-width="${n(f.grosor)}" stroke-linecap="round">${interior}</line>`
  } else if (f.t === 'rect') {
    cuerpo = `<rect x="${n(f.x)}" y="${n(f.y)}" width="${n(f.w)}" height="${n(f.h)}" fill="${css(f.color)}">${interior}</rect>`
  } else if (f.t === 'texto') {
    cuerpo = `<text x="${n(f.x)}" y="${n(f.y)}" font-size="${n(f.tam)}" fill="${css(f.color)}" text-anchor="middle" dominant-baseline="central" font-family="ui-rounded, -apple-system, Helvetica, sans-serif" font-weight="600">${f.texto}${interior}</text>`
  } else {
    // Arco como círculo con trazo discontinuo, girado para empezar en `desde`
    const m = arcoMedidas(f)
    const inicial = anim?.tipo === 'crecer' ? `0 ${n(m.circunferencia)}` : `${n(m.largoArco)} ${n(m.circunferencia)}`
    cuerpo = `<circle cx="${n(f.cx)}" cy="${n(f.cy)}" r="${n(f.r)}" fill="none" stroke="${css(f.color)}" stroke-width="${n(f.grosor)}" stroke-dasharray="${inicial}" transform="rotate(${n(f.desde - 90)} ${n(f.cx)} ${n(f.cy)})">${interior}</circle>`
  }
  return gira && anim ? `<g>${smil(anim, {})}${cuerpo}</g>` : cuerpo
}

function arcoMedidas(f: { r: number; desde: number; hasta: number }): { largoArco: number; circunferencia: number } {
  const circunferencia = 2 * Math.PI * f.r
  return { largoArco: (circunferencia * Math.max(0, Math.min(360, f.hasta - f.desde))) / 360, circunferencia }
}

export function svgVector(d: Dibujo, lado: number): string {
  const w = d.ancho * lado
  const h = d.alto * lado
  const forma = d.nitido ? ' shape-rendering="crispEdges"' : ''
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${d.ancho} ${d.alto}" width="${w}" height="${h}"${forma}${ESQUEMA_ATRIBUTO}>${ESQUEMA_ESTILO}${d.formas.map(svgForma).join('')}</svg>`
}

// --- Píxeles del instante actual

type Punto = [number, number]
type Inversa = (p: Punto) => Punto

const RAD = Math.PI / 180

function visible(a: Anim | undefined): boolean {
  if (!a) return true
  if (a.tipo === 'parpadeo') return ((a.fase % 1) + 1) % 1 < a.encendido
  if (a.tipo === 'secuencia') return (a.valores[Math.floor((((a.fase % 1) + 1) % 1) * a.valores.length)] ?? 1) >= 0.5
  return true
}

const avance = (a: Anim | undefined): number => (a?.tipo === 'crecer' ? ((a.fase % 1) + 1) % 1 : 1)

function anguloGiro(a: Extract<Anim, { tipo: 'girar' }>): number {
  const f = ((a.fase % 1) + 1) % 1
  return (a.desde ?? 0) + (a.pasos ? Math.floor(f * a.pasos) / a.pasos : f) * (a.inverso ? -360 : 360)
}

function rotar(p: Punto, cx: number, cy: number, grados: number): Punto {
  const s = Math.sin(grados * RAD)
  const c = Math.cos(grados * RAD)
  const x = p[0] - cx
  const y = p[1] - cy
  return [cx + x * c - y * s, cy + x * s + y * c]
}

function distSegmento(p: Punto, x1: number, y1: number, x2: number, y2: number): number {
  const dx = x2 - x1
  const dy = y2 - y1
  const l2 = dx * dx + dy * dy
  const t = l2 === 0 ? 0 : Math.max(0, Math.min(1, ((p[0] - x1) * dx + (p[1] - y1) * dy) / l2))
  return Math.hypot(p[0] - (x1 + t * dx), p[1] - (y1 + t * dy))
}

// Color de la forma en el punto p (ya en coordenadas de la forma), o null
function colorEn(f: Exclude<Forma, { t: 'grupo' }>, p: Punto): number | null {
  if (f.t === 'circulo') {
    const d = Math.hypot(p[0] - f.cx, p[1] - f.cy)
    if (f.borde !== undefined && Math.abs(d - f.r) <= Math.max(0.5, (f.grosor ?? 1) / 2)) return f.borde
    if (f.relleno !== undefined && d <= f.r + 0.15) return f.relleno
    return null
  }
  if (f.t === 'linea') return distSegmento(p, f.x1, f.y1, f.x2, f.y2) <= Math.max(0.5, f.grosor / 2) ? f.color : null
  if (f.t === 'rect') {
    const w = f.w * avance(f.anim)
    return p[0] >= f.x && p[0] < f.x + w && p[1] >= f.y && p[1] < f.y + f.h ? f.color : null
  }
  if (f.t === 'arco') {
    const d = Math.hypot(p[0] - f.cx, p[1] - f.cy)
    if (Math.abs(d - f.r) > Math.max(0.5, f.grosor / 2)) return null
    const ang = ((Math.atan2(p[0] - f.cx, f.cy - p[1]) / RAD) % 360 + 360) % 360
    const barrido = (f.hasta - f.desde) * avance(f.anim)
    const rel = (((ang - f.desde) % 360) + 360) % 360
    return rel <= barrido ? f.color : null
  }
  return null // el texto solo existe en el escritorio
}

function pintarForma(l: Lienzo, f: Forma, inv: Inversa): void {
  if (!visible(f.anim)) return
  let propia = inv
  if (f.anim?.tipo === 'girar') {
    const a = f.anim
    const ang = anguloGiro(a)
    propia = p => rotar(inv(p), a.cx, a.cy, -ang)
  }
  if (f.t === 'grupo') {
    for (const h of f.hijos) pintarForma(l, h, propia)
    return
  }
  for (let y = 0; y < l.alto; y++) {
    for (let x = 0; x < l.ancho; x++) {
      const c = colorEn(f, propia([x + 0.5, y + 0.5]))
      if (c !== null) l.px[y * l.ancho + x] = c
    }
  }
}

export function rasterizar(d: Dibujo): Lienzo {
  const l: Lienzo = { ancho: d.ancho, alto: d.alto, px: new Uint32Array(d.ancho * d.alto).fill(DEFECTO) }
  for (const f of d.formas) pintarForma(l, f, p => p)
  return l
}

export const celdasVector = (d: Dibujo): string => empaquetar(rasterizar(d))
