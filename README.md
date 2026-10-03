# clima-condor

Un mod para [Claude Code](https://claude.com/claude-code) que abre un panel con el cielo de tu ciudad: clima real, sol y luna en su posición real, marea, huracanes y relojes. Funciona en la terminal y en la pestaña Code de la app de escritorio.

## Qué muestra

- **Cielo vivo**: amanecer, día, atardecer y noche según la hora real; nubes, lluvia, nieve y tormentas según el clima real.
- **Sol y luna reales**: salen y se ponen detrás del paisaje, y la luna muestra su fase del día.
- **Timelapse**: el amanecer, el atardecer o la salida de la luna en 40 segundos.
- **Marea** de la costa más cercana (curva de 24 horas).
- **Huracanes** activos del Centro Nacional de Huracanes (NHC), con radar, trayectoria y aviso si uno se acerca.
- **Relojes** analógicos o digitales con 8 temas, incluido uno de dos ciudades.
- **Combustible**: cuánto llevas usado de tus límites de Claude Code y, si los tienes instalados, de Codex, Grok Build y Antigravity.

## Instalar

```bash
claude plugin marketplace add condor090/clima-condor
claude plugin install clima-condor@condor
```

Abre una sesión nueva de Claude Code y escribe `/clima`.

## Usar

| Comando | Qué hace |
|---|---|
| `/clima` | Abre el panel con tu ubicación (se detecta por tu IP) |
| `/clima Madrid` | El clima de otra ciudad |
| `/clima auto` | Vuelve a tu ubicación |
| `/clima amanecer`, `/clima atardecer`, `/clima luna` | Timelapse de 40 segundos |
| `/clima cerrar` | Cierra el panel |

## Opciones

La segunda ciudad del reloj «Dos ciudades» se cambia en la configuración del plugin:

- `segunda_ciudad`: el nombre que se muestra (por defecto, Santiago)
- `segunda_zona`: su zona horaria IANA (por defecto, `America/Santiago`)

## Privacidad

El mod consulta servicios públicos sin clave: [ipwho.is](https://ipwho.is) para ubicarte por tu IP, [Open-Meteo](https://open-meteo.com) para el clima y la marea, y el [NHC](https://www.nhc.noaa.gov) para los huracanes. Para el panel de consumo lee archivos locales de Codex (`~/.codex`), Grok Build (`~/.grok`) y Antigravity, solo si existen en tu equipo. Nada sale de tu equipo salvo esas consultas.

## Licencia

MIT
