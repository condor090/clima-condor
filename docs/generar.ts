// Genera las imágenes del README con el mismo código que dibuja el panel
// Uso: npx tsx docs/generar.ts   (desde la carpeta clima-condor)
import { writeFileSync } from 'node:fs'
import { capas, paisajeDe, svgEscena } from '../hooks/escena'
import { luna, sol } from '../hooks/astro'
import { fase } from '../hooks/luna'
import { TEMAS } from '../hooks/reloj'
import { svgVector } from '../hooks/vector'

const DIR = new URL('.', import.meta.url).pathname
type Ciudad = { nombre: string; lat: number; lon: number }

// Busca, desde una fecha, el primer instante (cada 5 min) que cumple la condición
function buscar(c: Ciudad, desde: string, ok: (ms: number) => boolean): number {
  let ms = Date.parse(desde)
  for (let i = 0; i < 12 * 24 * 40; i++, ms += 300_000) if (ok(ms)) return ms
  throw new Error(`Sin instante para ${c.nombre}`)
}

function escena(archivo: string, c: Ciudad, codigo: number, ms: number): void {
  const svg = svgEscena(capas({ codigo, lat: c.lat, lon: c.lon, minutos: 0, amanecer: 0, atardecer: 0, cuadro: 0, ms }), 8, ms)
  writeFileSync(DIR + archivo, svg)
  console.log(archivo, c.nombre, paisajeDe(c.lat, c.lon), new Date(ms).toISOString(), `${Math.round(svg.length / 1024)} KB`)
}

const santiago: Ciudad = { nombre: 'Santiago', lat: -33.45, lon: -70.67 }
const phoenix: Ciudad = { nombre: 'Phoenix', lat: 33.45, lon: -112.07 }
const madrid: Ciudad = { nombre: 'Madrid', lat: 40.42, lon: -3.7 }

// 1. Amanecer en los Andes: el sol asoma detrás de la sierra
escena('amanecer.svg', santiago, 0, buscar(santiago, '2026-10-05T00:00:00Z', ms => {
  const a = sol(ms, santiago.lat, santiago.lon).alt
  return a > 0.3 && a < 1.5 && sol(ms + 600_000, santiago.lat, santiago.lon).alt > a
}))
// 2. Mañana despejada en el desierto, con rayos de sol
escena('dia.svg', phoenix, 0, buscar(phoenix, '2026-10-05T00:00:00Z', ms => {
  const a = sol(ms, phoenix.lat, phoenix.lon).alt
  return a > 25 && a < 30 && sol(ms + 600_000, phoenix.lat, phoenix.lon).alt > a
}))
// 3. Noche de luna gibosa en el desierto
escena('noche.svg', phoenix, 0, buscar(phoenix, '2026-10-22T00:00:00Z', ms => {
  const f = fase(ms, phoenix.lat)
  return sol(ms, phoenix.lat, phoenix.lon).alt < -18 && luna(ms, phoenix.lat, phoenix.lon).alt > 35 && f.iluminada > 0.6
}))
// 4. Tormenta de tarde en las colinas
// (+3 s: la imagen arranca entre dos destellos del rayo, que caen cada 6 s)
escena('tormenta.svg', madrid, 95, 3000 + buscar(madrid, '2026-10-05T00:00:00Z', ms => {
  const a = sol(ms, madrid.lat, madrid.lon).alt
  return a > 15 && a < 20 && sol(ms + 600_000, madrid.lat, madrid.lon).alt < a
}))

// Relojes: las 8 carátulas analógicas a las 10:09:36 (la hora de las fotos de relojes)
const ctx = { h: 10, m: 9, s: 36, ms: 0, amanecer: 7 * 60, atardecer: 19 * 60 }
TEMAS.forEach((t, i) => {
  const d = t.analogico.dibujar(ctx, false)
  writeFileSync(`${DIR}reloj-${i + 1}.svg`, svgVector(d, 5))
})
console.log('relojes', TEMAS.map(t => t.nombre).join(', '))
