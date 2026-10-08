@echo off
chcp 65001 >nul
title Загрузка сайта "Малина" на GitHub
cd /d "%~dp0"

rem ---------- ищем git: в системе, затем внутри GitHub Desktop ----------
set "GIT="
where git >nul 2>nul
if not errorlevel 1 set "GIT=git"

if not defined GIT (
  for /d %%d in ("%LOCALAPPDATA%\GitHubDesktop\app-*") do (
    if exist "%%d\resources\app\git\cmd\git.exe" set "GIT=%%d\resources\app\git\cmd\git.exe"
  )
)
if not defined GIT if exist "%ProgramFiles%\Git\cmd\git.exe" set "GIT=%ProgramFiles%\Git\cmd\git.exe"

if not defined GIT (
  echo.
  echo   Git не найден.
  echo   Установите Git for Windows: https://git-scm.com/download/win
  echo   или GitHub Desktop:        https://desktop.github.com
  echo.
  pause
  exit /b 1
)

echo.
echo   ============================================================
echo     Загрузка сайта фотостудии "Малина" на GitHub
echo   ============================================================
echo.
echo   Сначала создайте ПУСТОЙ репозиторий: https://github.com/new
echo   ^(галочки "Add a README" и ".gitignore" ставить не нужно^)
echo.

set "REPO="
set /p REPO=Вставьте ссылку репозитория и нажмите Enter: 
if "%REPO%"=="" (
  echo Ссылка не указана — выходим.
  pause
  exit /b 1
)

for /f "delims=" %%i in ('"%GIT%" config --global user.name 2^>nul') do set "GITNAME=%%i"
if "%GITNAME%"=="" (
  set /p GITNAME=Ваше имя для коммитов: 
  "%GIT%" config --global user.name "%GITNAME%"
)
for /f "delims=" %%i in ('"%GIT%" config --global user.email 2^>nul') do set "GITMAIL=%%i"
if "%GITMAIL%"=="" (
  set /p GITMAIL=Ваш e-mail ^(тот же, что на GitHub^): 
  "%GIT%" config --global user.email "%GITMAIL%"
)

echo.
echo   Готовлю файлы...
if not exist .git "%GIT%" init --initial-branch=main >nul
"%GIT%" add -A
"%GIT%" commit -m "Фотостудия Малина: сайт, онлайн-бронирование, админ-панель" >nul 2>nul
"%GIT%" branch -M main
"%GIT%" remote remove origin >nul 2>nul
"%GIT%" remote add origin %REPO%

echo   Отправляю на GitHub ^(может открыться окно входа в аккаунт^)...
echo.
"%GIT%" push -u origin main

echo.
if errorlevel 1 (
  echo   Не получилось отправить. Частые причины:
  echo     - неверная ссылка на репозиторий;
  echo     - не выполнен вход в GitHub;
  echo     - репозиторий не пустой ^(создайте пустой^).
  echo.
  echo   Проще всего: откройте GitHub Desktop -^> File -^> Add local repository -^>
  echo   выберите папку сайта -^> Publish repository.
) else (
  echo   Готово! Код загружен на GitHub.
)
echo.
pause
