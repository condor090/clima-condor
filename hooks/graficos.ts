// Gráficos chicos del panel: la curva de la marea y el radar de ciclones
import type { Ciclon, Marea } from '../types'
import { mezclar } from './escena'
import { alturaEn, distanciaKm, estadoMarea, rumboGrados } from './marea'
import { nivel } from './huracanes'
import type { Nivel } from './huracanes'
import type { Dibujo, Forma } from './vector'

// --- Marea: un altímetro de avión; la aguja marca la altura del mar y se mueve al ritmo real de la marea

export const ALTIMETRO = { ancho: 24, alto: 24 }

export function dibujoMarea(m: Marea, ahora: number): Dibujo {
  const cx = 11.5
  const cy = 12
  const e = estadoMarea(m, ahora)
  const lo = Math.floor(Math.min(...m.alturas) * 10) / 10
  const hi = Math.ceil(Math.max(...m.alturas) * 10) / 10
  // La escala barre 270°: el mínimo abajo a la izquierda y el máximo abajo a la derecha
  const ang = (h: number) => -135 + Math.max(0, Math.min(1, (h - lo) / Math.max(0.1, hi - lo))) * 270
  const en = (a: number, r: number) => ({ x: cx + Math.sin((a * Math.PI) / 180) * r, y: cy - Math.cos((a * Math.PI) / 180) * r })
  const a = ang(e.altura)
  const formas: Forma[] = [
    { t: 'circulo', cx, cy, r: 11.2, relleno: 0x0b1220, borde: 0x475569, grosor: 1 },
    { t: 'circulo', cx, cy, r: 10.1, borde: 0x1e293b, grosor: 0.4 },
    { t: 'arco', cx, cy, r: 8.5, desde: -135, hasta: 135, color: 0x17324f, grosor: 1.6 },
    { t: 'arco', cx, cy, r: 8.5, desde: -135, hasta: a, color: e.subiendo ? 0x38bdf8 : 0x0ea5e9, grosor: 1.6 },
  ]
  // Marcas cada 27°; las de los extremos y el centro, más largas
  for (let k = 0; k <= 10; k++) {
    const t = -135 + k * 27
    const mayor = k === 0 || k === 5 || k === 10
    const p1 = en(t, 10)
    const p2 = en(t, mayor ? 9 : 9.5)
    formas.push({ t: 'linea', x1: p1.x, y1: p1.y, x2: p2.x, y2: p2.y, color: mayor ? 0xcbd5e1 : 0x64748b, grosor: mayor ? 0.6 : 0.4 })
  }
  // Próxima pleamar (amarillo) y bajamar (violeta) sobre la escala
  for (const x of e.proximas) {
    const p = en(ang(x.altura), 10.6)
    formas.push({ t: 'circulo', cx: p.x, cy: p.y, r: 0.65, relleno: x.tipo === 'alta' ? 0xfde047 : 0xa78bfa })
  }
  // Ventanilla arriba con la altura, mínimo y máximo abajo (solo el escritorio dibuja texto)
  formas.push({ t: 'rect', x: cx - 3.7, y: 5, w: 7.4, h: 3.3, color: 0x020617 })
  formas.push({ t: 'texto', x: cx, y: 6.7, texto: `${e.altura.toFixed(2)} m`, color: 0xe2e8f0, tam: 2 })
  formas.push({ t: 'texto', x: cx - 5.3, y: 20.3, texto: lo.toFixed(1), color: 0x94a3b8, tam: 1.7 })
  formas.push({ t: 'texto', x: cx + 5.3, y: 20.3, texto: hi.toFixed(1), color: 0x94a3b8, tam: 1.7 })
  // Flecha de tendencia que late, abajo al centro
  const yf = 18.8
  const d = e.subiendo ? -1 : 1
  formas.push({
    t: 'grupo',
    anim: { tipo: 'parpadeo', periodo: 1.6, fase: (ahora / 1600) % 1, encendido: 0.65 },
    hijos: [
      { t: 'linea', x1: cx - 1.4, y1: yf - d * 0.7, x2: cx, y2: yf + d * 0.7, color: e.subiendo ? 0x38bdf8 : 0xa78bfa, grosor: 0.6 },
      { t: 'linea', x1: cx, y1: yf + d * 0.7, x2: cx + 1.4, y2: yf - d * 0.7, color: e.subiendo ? 0x38bdf8 : 0xa78bfa, grosor: 0.6 },
    ],
  })
  // Aguja: arranca en la altura de ahora y gira a la velocidad real de la marea
  const cambio = alturaEn(m, ahora + 600_000) - e.altura // m por 10 min
  const gradosPorSeg = (cambio / 600) * (270 / Math.max(0.1, hi - lo))
  const periodo = Math.min(1e7, 360 / Math.max(1e-6, Math.abs(gradosPorSeg)))
  formas.push({
    t: 'grupo',
    anim: { tipo: 'girar', cx, cy, periodo, fase: 0, desde: a, inverso: gradosPorSeg < 0 },
    hijos: [
      { t: 'linea', x1: cx, y1: cy + 2, x2: cx, y2: cy - 9.6, color: 0xf8fafc, grosor: 0.7 },
      { t: 'circulo', cx, cy: cy + 2, r: 0.6, relleno: 0xf8fafc },
    ],
  })
  formas.push({ t: 'circulo', cx, cy, r: 1.2, relleno: 0xe2e8f0 })
  formas.push({ t: 'circulo', cx, cy, r: 0.5, relleno: 0x0b1220 })
  return { ...ALTIMETRO, formas }
}

// --- Radar de ciclones: tú al centro, anillos cada tercio de la escala, trayectoria pronosticada

const COLOR: Record<Nivel, number> = { alerta: 0xf87171, vigilancia: 0xfb923c, atento: 0xfde047, lejos: 0x94a3b8 }
export const RADAR = { ancho: 31, alto: 32 }

const RAD = Math.PI / 180

// Escala en km: el ciclón más cercano cabe con holgura (de 1.500 a 3.000 km)
export function escalaRadar(cs: Ciclon[]): number {
  const k = cs[0]?.km ?? 1500
  return Math.min(3000, Math.max(1500, Math.ceil((k * 1.15) / 500) * 500))
}

function espiral(cx: number, cy: number, r: number, color: number, sur: boolean): Forma {
  // Los huracanes giran contra el reloj en el norte y a favor en el sur
  return {
    t: 'grupo',
    anim: { tipo: 'girar', cx, cy, periodo: 2.5, fase: 0, inverso: !sur },
    hijos: [
      { t: 'arco', cx, cy, r, desde: 20, hasta: 140, color, grosor: 0.9 },
      { t: 'arco', cx, cy, r, desde: 200, hasta: 320, color, grosor: 0.9 },
      { t: 'circulo', cx, cy, r: r * 0.45, relleno: color },
    ],
  }
}

export function dibujoRadar(cs: Ciclon[], lugar: { lat: number; lon: number }, ahora: number): Dibujo {
  const cx = 15.5
  const cy = 15.5
  const R = 14.5
  const esc = escalaRadar(cs)
  const pos = (km: number, rumbo: number) => {
    const d = Math.min(R, (km / esc) * R)
    return { x: cx + Math.sin(rumbo * RAD) * d, y: cy - Math.cos(rumbo * RAD) * d }
  }
  const formas: Forma[] = [
    { t: 'circulo', cx, cy, r: R, relleno: 0x07131f, borde: 0x1e3a5f, grosor: 0.8 },
    { t: 'circulo', cx, cy, r: (R * 2) / 3, borde: 0x15304d, grosor: 0.5 },
    { t: 'circulo', cx, cy, r: R / 3, borde: 0x15304d, grosor: 0.5 },
    { t: 'linea', x1: cx, y1: cy - R + 0.5, x2: cx, y2: cy + R - 0.5, color: 0x15304d, grosor: 0.4 },
    { t: 'linea', x1: cx - R + 0.5, y1: cy, x2: cx + R - 0.5, y2: cy, color: 0x15304d, grosor: 0.4 },
    // Barrido del radar
    {
      t: 'grupo',
      anim: { tipo: 'girar', cx, cy, periodo: 4, fase: (ahora / 4000) % 1 },
      hijos: [
        { t: 'arco', cx, cy, r: R / 2, desde: -30, hasta: 0, color: 0x0b2a3f, grosor: R },
        { t: 'linea', x1: cx, y1: cy, x2: cx, y2: cy - R + 0.5, color: 0x38bdf8, grosor: 0.5 },
      ],
    },
    { t: 'texto', x: cx, y: 2.6, texto: 'N', color: 0x64748b, tam: 2.6 },
  ]
  const sur = lugar.lat < 0
  // Solo los que caben en la escala; los lejanos quedan en la lista de texto
  for (const c of cs.filter(x => x.km <= esc).reverse()) {
    const color = COLOR[nivel(c)]
    const ruta = [{ km: c.km, rumbo: c.rumbo }, ...c.pronostico.filter(p => p.ms > ahora).map(p => puntoRelativo(lugar, p))]
    for (let i = 0; i + 1 < ruta.length; i++) {
      const a = pos(ruta[i]!.km, ruta[i]!.rumbo)
      const b = pos(ruta[i + 1]!.km, ruta[i + 1]!.rumbo)
      formas.push({ t: 'linea', x1: a.x, y1: a.y, x2: b.x, y2: b.y, color: mezclar(color, 0x07131f, 0.45), grosor: 0.5 })
      formas.push({ t: 'circulo', cx: b.x, cy: b.y, r: 0.5, relleno: mezclar(color, 0x07131f, 0.3) })
    }
    const p = pos(c.km, c.rumbo)
    formas.push(espiral(p.x, p.y, 1.8, color, sur))
  }
  // Tú, al centro
  formas.push({ t: 'circulo', cx, cy, r: 2.2, borde: 0x7dd3fc, grosor: 0.4, anim: { tipo: 'parpadeo', periodo: 1.6, fase: (ahora / 1600) % 1, encendido: 0.5 } })
  formas.push({ t: 'circulo', cx, cy, r: 1, relleno: 0x7dd3fc })
  return { ...RADAR, formas }
}

const puntoRelativo = (lugar: { lat: number; lon: number }, p: { lat: number; lon: number }) => ({ km: distanciaKm(lugar, p), rumbo: rumboGrados(lugar, p) })

// Ícono de huracán que gira, para el encabezado en el escritorio
export function dibujoEspiral(sur: boolean, color = 0xfb923c): Dibujo {
  return { ancho: 8, alto: 8, formas: [espiral(4, 4, 2.8, color, sur)] }
}
