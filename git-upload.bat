@echo off
chcp 65001 >nul
title Загрузка сайта "Малина" на GitHub
cd /d "%~dp0"

where git >nul 2>nul
if errorlevel 1 (
  echo.
  echo   Git не установлен на этом компьютере.
  echo.
  echo   Установите один из вариантов ^(любой^):
  echo     1^) Git for Windows:  https://git-scm.com/download/win
  echo     2^) GitHub Desktop:   https://desktop.github.com
  echo.
  echo   После установки запустите этот файл снова.
  echo.
  pause
  exit /b 1
)

echo.
echo   ============================================================
echo     Загрузка сайта фотостудии "Малина" на GitHub
echo   ============================================================
echo.
echo   Сначала создайте пустой репозиторий на https://github.com/new
echo   ^(имя, например, malina-studio^). Галочки README и .gitignore
echo   ставить НЕ нужно.
echo.

set "REPO="
set /p REPO=Вставьте ссылку репозитория и нажмите Enter: 
if "%REPO%"=="" (
  echo Ссылка не указана — выходим.
  pause
  exit /b 1
)

rem --- имя и почта для коммитов ---
for /f "delims=" %%i in ('git config --global user.name 2^>nul') do set "GITNAME=%%i"
if "%GITNAME%"=="" (
  set /p GITNAME=Ваше имя для коммитов: 
  git config --global user.name "%GITNAME%"
)
for /f "delims=" %%i in ('git config --global user.email 2^>nul') do set "GITMAIL=%%i"
if "%GITMAIL%"=="" (
  set /p GITMAIL=Ваш e-mail (тот же, что на GitHub): 
  git config --global user.email "%GITMAIL%"
)

echo.
echo   Готовлю файлы...
if not exist .git git init >nul
git add .
git -c core.quotepath=false commit -m "Фотостудия Малина: сайт, онлайн-бронирование, админ-панель" >nul 2>nul
git branch -M main
git remote remove origin >nul 2>nul
git remote add origin %REPO%

echo   Отправляю на GitHub ^(может потребоваться вход в аккаунт^)...
echo.
git push -u origin main

echo.
if errorlevel 1 (
  echo   Не получилось отправить. Частые причины:
  echo     - неверная ссылка на репозиторий;
  echo     - не выполнен вход в GitHub ^(появится окно входа^);
  echo     - репозиторий уже содержит файлы ^(создайте пустой^).
) else (
  echo   Готово! Код загружен на GitHub.
)
echo.
pause
