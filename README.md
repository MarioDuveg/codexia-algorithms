# ALGORITMOS — 5 mini retos de Particle Swarm Optimization

Aplicación web para preparatoria, basada en la estructura visual y técnica de CODEXIA. Sus retos y su ranking funcionan de forma independiente del CTF, pero **comparte Supabase para publicar la nota del Taller 2**. Incluye selección de equipo 1–20, 5 retos secuenciales, temporizador de servidor, puntuación de 0 a 100, clasificación en vivo, panel docente y exportación CSV. Funciona con **Node.js 18+ y sin instalar paquetes externos**.

## Supabase: comparte la función del Taller 1, sin SQL adicional

Si **ya ejecutaste el SQL del Taller 1** que crea `public.scores` y la función `public.registrar_taller(p_equipo integer, p_taller integer, p_puntaje numeric)`, **NO ejecutes otro SQL**. Esta versión reutiliza exactamente esa función, indicando siempre `p_taller: 2`, para guardar en `scores.taller_2`. Si todavía no instalaste el SQL del Taller 1, instálalo primero en tu proyecto Supabase `codexia-scores`. La URL y la clave **publicable** del proyecto original adjunto ya están configuradas. Ver más detalles en «Supabase — ALGORITMOS es TALLER 2».

## Inicio

```bash
npm start
```

Abre `http://localhost:3011` en el equipo anfitrión o la dirección de red local que muestra la terminal en otros dispositivos. **No basta con abrir `index.html` directamente:** las soluciones, los intentos y el cronómetro los controla Node.js.

- Estudiantes: `/`.
- Ranking público: `/scores` o `/resultados`, también desde el botón de la portada.
- Panel docente: `/admin`. La contraseña temporal aparece en la terminal, o puede fijarse con `ADMIN_PASSWORD`.

```bash
ADMIN_PASSWORD='UnaClaveSegura' PORT=3011 npm start
```

## Reglas de competencia

- **5 retos × 20 puntos = 100 puntos máximo.**
- Cada reto admite **3 intentos**: correcto al 1.º → **20 puntos**, al 2.º → **15 puntos**, al 3.º → **10 puntos**. Tres respuestas incorrectas → **0 puntos** y se avanza al siguiente reto.
- Las pistas se pueden usar sin penalización adicional.
- **15 minutos** desde que el equipo inicia, medidos en el servidor, sin pausas. Cuando se acaba el tiempo, se bloquean las respuestas pendientes y se conservan los puntos logrados.
- Clasificación: **más puntos → menor tiempo transcurrido → menos intentos**. Si todo coincide, comparten puesto.
- Un equipo puede reintentarlo tras terminar o agotar el tiempo. El ranking conserva su mejor participación. Se permite competir desde varios navegadores con el mismo equipo, pero solo su mejor intento se muestra. **Mientras una partida siga en curso, su posición es provisional.**
- Los resultados se guardan de forma persistente en `data/equipos.json`. Para una competencia formal, mantén el equipo anfitrión encendido y haz copia del archivo; el almacenamiento debe ser persistente si usas hosting.

## Los mini retos

| # | Nombre | Concepto | Solución que verifica el servidor |
|---|---|---|---|
| 1 | Encuentra el tesoro | Función objetivo \(f(x)=(x-7)^2\) | `8` |
| 2 | La memoria de la partícula | Mejor personal `pBest` | `5` |
| 3 | El líder del enjambre | Mejor global `gBest` | `D` |
| 4 | Calcula el movimiento | Actualización simplificada de velocidad y posición | `10` |
| 5 | Detén el enjambre | Convergencia y criterio de parada | `5` |

**No compartas las soluciones anteriores con los alumnos antes de la actividad.** Las respuestas y su validación están en `app.js`; las páginas de reto solo muestran los datos necesarios.

## Panel docente

En `/admin` puedes ver el ranking, puntos, retos completados, tiempos e intentos, exportar un CSV y reiniciar la competencia (requiere escribir `REINICIAR`). El reinicio elimina resultados locales de todos los equipos: realiza primero un respaldo si lo necesitas.

## Archivos

- `app.js`: rutas HTTP, retos, validación de respuestas, puntuación, ranking y persistencia.
- `public/index.html`, `public/styles.css`, `public/main.js`: interfaz de juego.
- `public/challenge.css`: gráficos de cada reto.
- `public/resultados.html`, `public/scores.js`: clasificación pública.
- `public/admin.html`, `public/admin.js`: panel docente.
- `GUIA_DOCENTE.md`: recomendaciones para la clase.
- `test/flujo.test.js`: pruebas automáticas integrales, ejecutables con `npm test`.

## Supabase — ALGORITMOS es TALLER 2

**Esta edición actualiza automáticamente `public.scores.taller_2` del mismo Supabase de CODEXIA**, según `equipo` (1–20). No toca `taller_1`, `taller_3`, `taller_4` ni `batalla_final`: `total` sigue calculándose automáticamente en la base de datos.

**Sin migración adicional:** la aplicación usa la función `public.registrar_taller(integer,integer,numeric)` que creó el **SQL del Taller 1**. Debe estar instalada en la misma base `codexia-scores`, con permiso de ejecución para `anon`. Si ya la ejecutaste correctamente, no hay nada más que instalar en el SQL Editor. No ejecutes `02_registrar_taller_2.sql` de versiones anteriores; esta versión no lo necesita.

Después ejecuta `npm start`. El servidor reutiliza la **URL y clave publicable** que venían en el proyecto CODEXIA entregado. En caso de que se cambie de proyecto o se roten las claves, puedes indicarlas desde variables de entorno:

```bash
SUPABASE_URL='https://TU-PROYECTO.supabase.co' \
SUPABASE_PUBLISHABLE_KEY='sb_publishable_TU_CLAVE_PUBLICA' npm start
```

**No uses claves privadas `service_role`, `sb_secret_*` ni credenciales administrativas.** La conexión se realiza desde Node.js, no desde el JavaScript del navegador. Se utiliza el endpoint REST `POST /rest/v1/rpc/registrar_taller` con `p_equipo`, `p_taller: 2` y `p_puntaje`. La función compartida realiza `UPSERT` con `GREATEST` atómico, de modo que conserva el mejor puntaje sin tocar otras columnas.

**Cuándo se publica:** al terminar cualquier mini reto, al finalizar los cinco retos o cuando se agotan los 15 minutos. Se conserva el **mejor puntaje 0–100 del equipo**, incluso si reintenta y obtiene una calificación menor. Si Supabase está momentáneamente inaccesible, el resultado queda guardado en `data/equipos.json`; el servidor reintenta cada 15 segundos y tras un reinicio. La interfaz indica si el envío está pendiente o confirmado. Para hacer pruebas **sin conectar a Supabase**, inicia con `SUPABASE_DISABLED=1 npm start` en Mac/Linux (en Windows CMD: `set SUPABASE_DISABLED=1` antes de `node app.js`).

**Importante:** reiniciar la competencia en `/admin` **solo borra los intentos locales**, no las notas ya publicadas en Supabase. La puntuación existente en `taller_2` nunca disminuye por envíos desde esta app. Para limpiar la columna en Supabase, es necesaria una acción administrativa expresa y distinta.

El ranking de esta aplicación se mantiene local en el mismo servidor Node.js. La tabla global `scores` de CODEXIA recibe `taller_2` para sumar con los demás talleres; sus páginas de resultados pueden leerlo como siempre.

**Seguridad:** la clave publicable no es una clave secreta. La función RPC y las políticas públicas del SQL del Taller 1 permiten registrar o modificar notas a cualquier cliente con la clave publicable: es apropiado para una dinámica supervisada, **no sustituye una autenticación de equipos ni es antifraude**. No utilices esta política para una evaluación no supervisada.
