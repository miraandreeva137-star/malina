@echo off
chcp 65001 >nul
title Фотостудия "Малина" - сервер сайта
cd /d "%~dp0"

rem --- ищем Node.js: сначала в системе, потом встроенный ---
set "NODE="
where node >nul 2>nul
if not errorlevel 1 set "NODE=node"

if not defined NODE if exist "%LOCALAPPDATA%\Programs\DeepSeek Harness\resources\app.asar\dsh\node.exe" set "NODE=%LOCALAPPDATA%\Programs\DeepSeek Harness\resources\app.asar\dsh\node.exe"
if not defined NODE if exist "C:\Users\user\.dsh\dsh-runtimes\dsh-primary-runtime\dependencies\node\bin\node.exe" set "NODE=C:\Users\user\.dsh\dsh-runtimes\dsh-primary-runtime\dependencies\node\bin\node.exe"

if not defined NODE (
  echo.
  echo   Не найден Node.js.
  echo   Установите его с сайта https://nodejs.org и запустите этот файл снова.
  echo.
  pause
  exit /b 1
)

echo.
echo   Запускаю сайт фотостудии "Малина"...
echo   Адрес сайта:      http://localhost:4321/
echo   Панель админа:    http://localhost:4321/admin.html   (admin / malina2024)
echo.
echo   Это окно должно оставаться открытым, пока нужен сайт.
echo   Остановить сервер: Ctrl + C
echo.

start "" http://localhost:4321/

"%NODE%" server.js

echo.
echo   Сервер остановлен. Нажмите любую клавишу, чтобы закрыть окно.
pause >nul
