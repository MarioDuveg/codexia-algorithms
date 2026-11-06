@echo off
setlocal
cd /d "%~dp0"
where node >nul 2>nul
if errorlevel 1 (
  echo Necesitas instalar Node.js 18 o superior antes de iniciar ALGORITMOS.
  echo https://nodejs.org/
  pause
  exit /b 1
)
echo Iniciando ALGORITMOS / PSO...
node app.js
pause
