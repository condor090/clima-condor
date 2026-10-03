export type Lugar = { nombre: string; lat: number; lon: number }

export type Actual = {
  temp: number
  sensacion: number
  humedad: number
  viento: number
  rafagas: number
  dirViento: number
  codigo: number
  esDia: boolean
  uv: number
}

export type Hora = { hora: string; temp: number; codigo: number; lluvia: number }

export type Dia = {
  fecha: string
  min: number
  max: number
  codigo: number
  lluvia: number
  amanecer: string
  atardecer: string
}

export type Clima = {
  lugar: Lugar
  actual: Actual
  horas: Hora[]
  dias: Dia[]
  actualizado: string
  offsetMin: number
}

// Tarjeta que este mod publica para la barra sobre el mensaje (barra-condor)
export type Tarjeta = { titulo: string; detalle: string; color: string }

// Un límite de uso de la cuenta, como lo da $.session.usage()
export type Limite = { kind: string; percentUsed: number; resetsAt?: string; etiqueta?: string; largoMs?: number }

// Límites de otro agente (Codex, Grok Build) leídos de sus archivos locales
export type Agente = { limites: Limite[]; plan: string | null; creditos: string | null; medido: string | null; nota: string | null }

// Marea de la costa más cercana: alturas horarias desde `inicio` (hora local de la costa)
export type Marea = { lat: number; lon: number; km: number; rumbo: number; inicio: string; offsetMin: number; alturas: number[] }

// Un punto de la trayectoria pronosticada de un ciclón
export type Punto = { ms: number; lat: number; lon: number; vientoKmh: number | null }

export type Ciclon = {
  id: string
  nombre: string
  clase: string
  vientoKmh: number
  categoria: number
  presion: number | null
  lat: number
  lon: number
  km: number
  rumbo: number // del lugar hacia el ciclón
  mueveHacia: number | null
  mueveKmh: number | null
  actualizado: string
  url: string
  pronostico: Punto[]
  radio34Km: number | null
  cercania: { km: number; ms: number } | null
}

// Lo que se sabe de los ciclones: null = aún no se consulta
export type Huracanes = { ciclones: Ciclon[]; consultado: number; error: string | null }

export type ModoReloj = 'analogico' | 'digital'

// Timelapse del cielo: desde `real` el reloj de la escena corre `vel` veces más rápido, de `desde` a `hasta`
export type Sim = { nombre: string; real: number; desde: number; hasta: number; vel: number }

declare module 'claude-code' {
  interface PluginState {
    'clima-condor': { clima: Clima | null; error: string | null; cargando: boolean; caratula: number; minuto: number; tarjeta: Tarjeta | null; limites: Limite[]; codex: Agente | null; grok: Agente | null; antigravity: Agente | null; modo: ModoReloj; marea: Marea | null; huracanes: Huracanes | null; sim: Sim | null; idioma: 'es' | 'en' }
  }
}
