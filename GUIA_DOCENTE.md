# Guía docente — ALGORITMOS / PSO

**Nivel:** preparatoria. **Duración:** 15 minutos de competencia + 10 a 15 minutos de discusión. **Modalidad:** equipos 1–20, navegador web, sin calculadora avanzada.

## Antes de comenzar

1. Ejecuta `npm start` y muestra la URL de red local a los participantes.
2. Abre `/scores` en un proyector para mostrar la clasificación. Puede dejarse visible porque se actualiza cada 10 segundos.
3. Explica que PSO representa soluciones candidatas como partículas. Cada una recuerda su mejor solución (`pBest`) y puede aprender de la mejor del enjambre (`gBest`).
4. Anuncia las reglas: 100 puntos máximo; cada reto suma precisión (14/10/6 puntos según el intento) + rapidez (6 a 0 puntos según segundos transcurridos); tres errores significan 0 puntos; 15 minutos sin pausa. Primero cuentan los puntos, después el tiempo, después los intentos.

## Simulaciones que pueden observar los estudiantes

En cada reto aparece un laboratorio de partículas en movimiento, con controles **Pausar** y **Reiniciar**. Los retos 1 y 3 muestran partículas individuales intercambiando la mejor solución; el 2 ilustra cómo cambia la memoria pBest; el 4 anima un salto explicado por velocidad y atracciones; el 5 utiliza una simulación bidimensional con rastros y evolución del costo. Son demostraciones educativas, no atajos para responder (algunas usan datos distintos). El tiempo del reto sigue corriendo mientras observan la animación.

**Fórmula exacta del puntaje:** `puntos = (14, 10 o 6 por acierto según intento) + max(0, 6 − floor(segundos_del_reto/20))`. Si hay tres errores, puntaje cero. Se mide el tiempo de la **pregunta activa**, desde su primera apertura (no desde el inicio de la competencia), en el servidor; se conserva al recargar. Un acierto en el primer intento a los 48 segundos da `14 + 4 = 18` puntos. Cinco aciertos rápidos en primer intento pueden lograr 100 puntos.

## Objetivos de aprendizaje

- Reto 1: una **función objetivo** mide qué tan buena es una solución; aquí se **minimiza** costo.
- Reto 2: `pBest` conserva el mejor lugar que visitó una partícula, aunque se haya movido a otro lugar.
- Reto 3: `gBest` resume el mejor resultado conocido por el enjambre.
- Reto 4: la velocidad nueva combina inercia, atracción por `pBest` y atracción por `gBest`. Se usan coeficientes fijos como **simplificación didáctica**, no como modelo completo aleatorio.
- Reto 5: un criterio de parada observa iteraciones sin mejora; dos rondas consecutivas sin mejora pueden indicar estancamiento, aunque no garantizan óptimo global.

## Respuestas y justificación (solo docente)

1. **8**. `f(8) = (8−7)² = 1`, menor que `f(2)=25`, `f(5)=4` y `f(11)=16`.
2. **5**. Su costo 1 es menor que los otros valores del historial (16 y 9).
3. **D**. Su costo 1 es menor que A=36, B=4, C=16.
4. **10**. `v′=0.5×2 +(5−3)+(7−3)=1+2+4=7`, por lo que `x′=3+7=10`.
5. **5**. Mejora hasta la ronda 3; no mejora en rondas 4 y 5 (dos consecutivas).

## Reflexión posterior

Pregunta al grupo: ¿por qué una partícula necesita tanto memoria propia como información del resto? ¿Por qué detenerse sin cambios durante dos rondas NO demuestra haber encontrado el mínimo global? ¿Qué ocurriría si las partículas se movieran demasiado rápido y se saltaran buenas posiciones?

## Gestión

El panel `/admin` requiere la clave impresa al arrancar el servidor o la variable `ADMIN_PASSWORD`. Desde allí puedes exportar CSV y reiniciar. Los intentos se guardan en `data/equipos.json` y el **mejor puntaje por equipo se envía a `scores.taller_2` en Supabase**. La aplicación reutiliza la función `registrar_taller` del SQL del Taller 1; si ya la instalaste correctamente, no es necesario ejecutar más SQL. El botón REINICIAR solo borra los intentos locales, **no borra las notas ya publicadas en Supabase**.
