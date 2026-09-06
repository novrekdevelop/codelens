@echo off
setlocal
cd /d "%~dp0"

rem ============================================================================
rem  CodeLens - one-click launcher (Windows)
rem
rem  Usage:
rem    start.cmd            run CodeLens in development mode
rem    start.cmd build      build the release installers
rem    start.cmd test       run the Rust tests, then exit
rem ============================================================================

echo.
echo  ==============================
echo   CodeLens launcher
echo  ==============================
echo.

where node >nul 2>nul
if errorlevel 1 goto missing-node

where cargo >nul 2>nul
if errorlevel 1 goto missing-cargo

if not exist "node_modules" (
    echo  First run: installing npm dependencies...
    call npm install --no-audit --no-fund
    if errorlevel 1 goto npm-failed
)

if /i "%~1"=="build" goto build
if /i "%~1"=="test" goto test
goto dev

:missing-node
echo  [ERROR] Node.js ^>= 18 is not installed.
echo          Download it from https://nodejs.org/ and run this file again.
exit /b 1

:missing-cargo
echo  [ERROR] Rust (cargo) is not installed.
echo          Install it from https://rustup.rs/ and run this file again.
exit /b 1

:npm-failed
echo  [ERROR] npm install failed.
exit /b 1

:build
echo  Building release installers...
call npm run tauri build
if errorlevel 1 exit /b 1
echo.
echo  Done. Installers are in src-tauri\target\release\bundle\.
exit /b 0

:test
echo  Running Rust tests...
call cargo test --manifest-path src-tauri\Cargo.toml
exit /b %errorlevel%

:dev
echo  Launching CodeLens in development mode...
echo  (Close the CodeLens window to stop the dev server.)
call npm run tauri dev
exit /b %errorlevel%