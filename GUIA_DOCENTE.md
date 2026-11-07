# Guía docente — ALGORITMOS / PSO (versión experimental)

**Nivel:** preparatoria. **Modalidad:** equipos 1–20. **Competencia:** máximo 15 minutos, cinco laboratorios obligatorios y máximo 100 puntos. **Discusión final:** 10–15 minutos.

## ¿Qué cambió en esta versión?

Cada reto sigue el ciclo **experimenta → observa el registro visual → razona → responde**. Los experimentos no son videos decorativos: un estudiante debe activar sensores, avanzar partículas, lanzar competidores, cambiar fuerzas o ejecutar iteraciones; cada acción se valida y guarda en el servidor. El formulario de respuesta permanece bloqueado hasta realizar las acciones mínimas. Si se recarga la página, reaparecen las mediciones realizadas y el tiempo continúa.

Las trayectorias y funciones son **escenarios didácticos deterministas**: presentan componentes reales de PSO sin pretender implementar un optimizador estocástico de propósito general. El objetivo es comprender minimización, memoria personal, cooperación, velocidad y convergencia.

## Los cinco experimentos y sus soluciones (NO mostrar las respuestas a los estudiantes)

| # | Experimento que hacen | Pregunta posterior | Solución razonada |
|---|---|---|---|
| 1. Radar del mínimo | Pulsan los cuatro sensores **x=3, 6, 9 y 12**. Se revelan costos para una función inicialmente desconocida. | ¿Cuál de los cuatro puntos tiene menor costo? | **9**. Los costos observados son 25, 4, 1 y 16; se minimiza el costo. |
| 2. El recuerdo que no se borra | Avanzan **cuatro visitas** de una misma partícula (x=2, 6, 10, 8) mientras la pantalla registra el pBest. | ¿Qué posición recuerda tras cuatro visitas? | **6**. Los costos son 25, 1, 9 y 1. En un empate se conserva el primer pBest. |
| 3. Carrera por el gBest | Lanzan **A, B, C y D**, observando su recorrido de dos posiciones y el costo del mejor resultado de cada una. | ¿Qué partícula encontró el mejor resultado global? | **D**. Con función (x−10)², sus posiciones 6→10 dan costo final 0; ninguna otra llega a 0. |
| 4. Laboratorio de fuerzas | Activan o desactivan **inercia, memoria y social**; simulan **tres combinaciones distintas**, incluyendo todas las fuerzas activas. | ¿Cuál es la velocidad v′ con las tres fuerzas? | **7**. Inercia 1 + memoria 2 + influencia social 4 = 7. Posición x′=10, pero la respuesta pide **velocidad**. |
| 5. Semáforo de convergencia | Ejecutan **cinco iteraciones** y observan las posiciones de cuatro partículas y la gráfica del costo global. | ¿En qué iteración se acumulan dos rondas seguidas sin mejora? | **5**. gBest: 16→9→1→1→1, por tanto no mejora en 4 y 5. |

En el cuarto reto se usa la versión controlada de la ecuación: `v′ = 0.5v + (pBest−x) + (gBest−x)`, con `x=3`, `v=2`, `pBest=5`, `gBest=7`. Los interruptores permiten anular términos para comparar efectos, no sustituyen una iteración estocástica de PSO.

## Cómo se califica

Cada reto vale **hasta 20 puntos**: si aciertan al primer intento ganan **14 puntos de precisión**; al segundo, **10**; al tercero, **6**. Se suma un bono de rapidez de **6 a 0 puntos**, disminuyendo un punto por cada 20 segundos desde la apertura del reto. El tiempo del experimento también cuenta. Después de tres errores, ese reto suma cero y se avanza.

- Cinco retos de máximo 20 = **100 puntos máximo**.
- La puntuación se compara primero; después **menor tiempo total** y finalmente **menos intentos**.
- El límite global es **15 minutos sin pausa**, controlados por el servidor.
- El estudiante no puede enviar la respuesta sin completar el laboratorio: ni ocultando el formulario ni llamando directamente a `/api/answer`.
- Si se recarga una página, el servidor recuerda el progreso de experimentación y el cronómetro no se reinicia.

## Preguntas para la discusión

1. ¿Por qué en el primer reto el mejor lugar no es necesariamente el número más grande?
2. ¿Qué diferencia hay entre la posición actual de una partícula y su pBest?
3. ¿Por qué el gBest necesita comparar resultados de varias partículas?
4. ¿Qué ocurre con el salto cuando apagamos la influencia del enjambre?
5. ¿Puede un enjambre dejar de mejorar aunque todavía no haya hallado el óptimo global?

## Operación técnica

`npm start` ejecuta la aplicación (Node.js 18+). URL de estudiantes `/`, ranking `/scores`, panel del docente `/admin`. Establece `ADMIN_PASSWORD` como variable de entorno en Render. La base local `data/equipos.json` guarda partidas, experimentos, intentos y cronómetros. **Render Free tiene sistema de archivos efímero**; un reinicio puede perder la partida en curso. Para una competencia formal utiliza almacenamiento persistente.

El servidor sigue enviando **exclusivamente `taller_2`** mediante la función RPC compartida `registrar_taller` del SQL del Taller 1. **No requiere nuevo SQL** si esa función ya está instalada. Cada publicación conserva el máximo resultado del equipo. El reinicio en `/admin` no borra los puntajes enviados a Supabase. Las pruebas incluyen una simulación de esa integración; no hacen escrituras sobre tu base real.

**Prevención de trampas:** mantén el repositorio privado si no quieres revelar las respuestas almacenadas en `app.js`. Como la RPC del Taller 1 usa permisos públicos para `anon`, la seguridad de esas calificaciones depende de la supervisión del evento, no de una autenticación individual de equipos.

## Proyección y resultados (versión 5)

En la portada aparece el video introductorio que el docente proporcionó: https://youtu.be/M8N3masC6oo. Puede reproducirse antes de iniciar la competencia; al seleccionar equipo y pulsar START, el iframe se detiene automáticamente.

Para proyectar el marcador **general** de los talleres, abre `/resultados`. Lee Supabase y muestra Equipo, Taller 1–4, Batalla Final y Total; sigue la misma distribución de Ciberseguridad. Para la clasificación de los 5 retos de PSO, usa `/ranking` o el botón RANKING del juego.
