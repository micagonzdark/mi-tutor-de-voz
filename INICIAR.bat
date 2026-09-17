@echo off
title Tutor de Ingles con IA
cd /d "%~dp0"

echo.
echo  ============================================
echo   Tutor de Ingles con IA - Iniciando...
echo  ============================================
echo.
echo  Abriendo el navegador en unos segundos...
echo  Para CERRAR el tutor, cierra esta ventana.
echo.

:: Abre el navegador antes de que levante el servidor
:: (el navegador espera si el servidor tarda un segundo)
start "" "http://localhost:3000"

:: Inicia el servidor (esta ventana muestra los errores si los hay)
node server.js

echo.
echo  El servidor se cerro. Podes cerrar esta ventana.
pause
