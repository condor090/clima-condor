// Posición real del Sol y la Luna en el cielo del lugar (efemérides de baja precisión, ~0,3°)
// Altura sobre el horizonte y azimut (0 = norte, 90 = este), salidas y puestas

const DIA = 86_400_000
const J2000 = Date.UTC(2000, 0, 1, 12, 0, 0)
const RAD = Math.PI / 180

const norm = (g: number): number => ((g % 360) + 360) % 360

type Ecuatorial = { ra: number; dec: number } // grados

function eclipticaAEcuatorial(lon: number, lat: number, d: number): Ecuatorial {
  const e = (23.439 - 0.0000004 * d) * RAD
  const l = lon * RAD
  const b = lat * RAD
  const ra = Math.atan2(Math.sin(l) * Math.cos(e) - Math.tan(b) * Math.sin(e), Math.cos(l))
  const dec = Math.asin(Math.sin(b) * Math.cos(e) + Math.cos(b) * Math.sin(e) * Math.sin(l))
  return { ra: norm(ra / RAD), dec: dec / RAD }
}

export function solEcuatorial(ms: number): Ecuatorial {
  const d = (ms - J2000) / DIA
  const g = 357.529 + 0.98560028 * d
  const q = 280.459 + 0.98564736 * d
  const lon = q + 1.915 * Math.sin(g * RAD) + 0.02 * Math.sin(2 * g * RAD)
  return eclipticaAEcuatorial(lon, 0, d)
}

export function lunaEcuatorial(ms: number): Ecuatorial {
  const d = (ms - J2000) / DIA
  const L = 218.316 + 13.176396 * d // longitud media
  const M = 134.963 + 13.064993 * d // anomalía media de la Luna
  const Ms = 357.529 + 0.98560028 * d // anomalía media del Sol
  const D = 297.85 + 12.190749 * d // elongación media
  const F = 93.272 + 13.22935 * d // argumento de latitud
  const lon =
    L +
    6.289 * Math.sin(M * RAD) +
    1.274 * Math.sin((2 * D - M) * RAD) +
    0.658 * Math.sin(2 * D * RAD) +
    0.214 * Math.sin(2 * M * RAD) -
    0.186 * Math.sin(Ms * RAD) -
    0.114 * Math.sin(2 * F * RAD)
  const lat = 5.128 * Math.sin(F * RAD) + 0.281 * Math.sin((M + F) * RAD) - 0.278 * Math.sin((F - M) * RAD)
  return eclipticaAEcuatorial(lon, lat, d)
}

export type Horizontal = { alt: number; az: number }

function aHorizontal(eq: Ecuatorial, ms: number, lat: number, lon: number): Horizontal {
  const d = (ms - J2000) / DIA
  const lst = norm(280.46061837 + 360.98564736629 * d + lon)
  const H = (lst - eq.ra) * RAD
  const phi = lat * RAD
  const dec = eq.dec * RAD
  const alt = Math.asin(Math.sin(phi) * Math.sin(dec) + Math.cos(phi) * Math.cos(dec) * Math.cos(H))
  const az = Math.atan2(-Math.sin(H), Math.tan(dec) * Math.cos(phi) - Math.sin(phi) * Math.cos(H))
  return { alt: alt / RAD, az: norm(az / RAD) }
}

export function sol(ms: number, lat: number, lon: number): Horizontal {
  return aHorizontal(solEcuatorial(ms), ms, lat, lon)
}

// La Luna está cerca: el paralaje la baja casi un grado cerca del horizonte
export function luna(ms: number, lat: number, lon: number): Horizontal {
  const h = aHorizontal(lunaEcuatorial(ms), ms, lat, lon)
  return { alt: h.alt - 0.95 * Math.cos(h.alt * RAD), az: h.az }
}

// Próximo cruce del horizonte desde `ms` (sube = salida, baja = puesta), buscando hasta 36 h
export function cruce(cuerpo: 'sol' | 'luna', ms: number, lat: number, lon: number, sube: boolean): number | null {
  const h0 = cuerpo === 'sol' ? -0.833 : 0.125
  const alt = (t: number) => (cuerpo === 'sol' ? sol(t, lat, lon) : luna(t, lat, lon)).alt - h0
  const paso = 10 * 60_000
  let a = ms
  let fa = alt(a)
  for (let i = 0; i < (36 * 60) / 10; i++) {
    const b = a + paso
    const fb = alt(b)
    if (sube ? fa < 0 && fb >= 0 : fa > 0 && fb <= 0) {
      let lo = a
      let hi = b
      for (let k = 0; k < 14; k++) {
        const mid = (lo + hi) / 2
        const fm = alt(mid)
        if (sube ? fm < 0 : fm > 0) lo = mid
        else hi = mid
      }
      return hi
    }
    a = b
    fa = fb
  }
  return null
}
