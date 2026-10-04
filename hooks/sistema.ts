// Rutas y Python del equipo, para leer los otros agentes en macOS, Linux y Windows
export type Sistema = { windows: boolean; home: string; appdata: string | null }

// En Windows la carpeta del mod empieza con la unidad: C:\…
export const esWindows = (root: string): boolean => /^[A-Za-z]:[\\/]/.test(root)

export const unir = (s: Sistema, ...partes: string[]): string => partes.join(s.windows ? '\\' : '/')

// En Windows `python` puede ser el acceso directo a la Microsoft Store: sale con error y se prueba el siguiente
export const pythons = (s: Sistema): string[][] => (s.windows ? [['py', '-3'], ['python'], ['python3']] : [['python3']])
