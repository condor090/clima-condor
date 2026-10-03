// Idioma del mod: español o inglés. Cada texto lleva su traducción al lado: tr('Despejado', 'Clear')
export type Idioma = 'es' | 'en'

export const IDIOMAS: Idioma[] = ['es', 'en']
export const NOMBRE_IDIOMA: Record<Idioma, string> = { es: 'Español', en: 'English' }

let actual: Idioma = 'es'

export const idioma = (): Idioma => actual
export const esIdioma = (v: unknown): v is Idioma => v === 'es' || v === 'en'

export function fijarIdioma(v: unknown): Idioma {
  if (esIdioma(v)) actual = v
  return actual
}

export const tr = (es: string, en: string): string => (actual === 'en' ? en : es)

// Para separar miles: 10.034 en español, 10,034 en inglés
export const miles = (n: number): string => n.toLocaleString(actual === 'en' ? 'en-US' : 'es-MX')

// Lo que alguien puede escribir en /clima idioma <…>
export function idiomaDe(texto: string): Idioma | null {
  const t = texto.trim().toLowerCase()
  if (['es', 'esp', 'español', 'espanol', 'spanish'].includes(t)) return 'es'
  if (['en', 'eng', 'english', 'inglés', 'ingles'].includes(t)) return 'en'
  return null
}
