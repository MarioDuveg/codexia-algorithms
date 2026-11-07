# ALGORITMOS / TALLER 2 — Cambios de la versión 5

## Video de portada

- El marco del video de CODEXIA / Ciberseguridad fue adaptado a ALGORITMOS.
- Video seleccionado: https://youtu.be/M8N3masC6oo
- Insertado como iframe de YouTube (`youtube-nocookie.com`), con enlace externo de respaldo.
- Al iniciar la partida, el iframe pasa a `about:blank` y deja de reproducirse detrás de los retos.

## Marcador general de resultados

- `/resultados`: diseño copiado de la clasificación general de CODEXIA, con columnas POS., EQUIPO, TALLER 1, TALLER 2, TALLER 3, TALLER 4, BATALLA FINAL y TOTAL.
- Actualización cada 10 s mediante lectura del endpoint `/api/general-scores`, que consulta la tabla `public.scores` de Supabase. Es de **solo lectura**, sin modificar datos.
- Se resalta la columna TALLER 2, correspondiente a ALGORITMOS.
- `/ranking` y `/scores`: clasificación por puntaje total de PSO y por cada uno de sus cinco mini retos, conservada de la versión 4.
- En la pantalla final hay enlaces a ambas páginas.

## Sin cambios en la competencia

- Cinco laboratorios experimentales, 15 minutos, puntuación máxima de 100, bonificaciones por rapidez y penalización por intentos.
- Se envía el mejor puntaje de `taller_2` mediante el RPC **compartido** `registrar_taller(p_equipo, p_taller, p_puntaje)`.
- No requiere SQL adicional si ya instalaste el SQL del Taller 1.

## Actualizar en Render

Descomprime este ZIP, sustituye los archivos del repositorio GitHub actual y haz commit. Render desplegará los cambios si tienes activado Auto-Deploy. Conserva tus variables de entorno `ADMIN_PASSWORD`, `SUPABASE_URL` y `SUPABASE_PUBLISHABLE_KEY` si las configuraste. No copies claves privadas en el repositorio.

## Validación

- `npm test` pasó las 2 pruebas automatizadas del servidor y de sincronización simulada.
- Comprobación en navegador del diseño de la portada, tabla general, versión móvil y detención del iframe al iniciar.
- La conexión a tu base real no fue ejecutada desde el entorno de pruebas.
