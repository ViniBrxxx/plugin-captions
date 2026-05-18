@echo off
chcp 65001 >nul
set "SCRIPT_DIR=%~dp0"
set "SCRIPT_DIR=%SCRIPT_DIR:~0,-1%"
set "PS_INSTALL=%SCRIPT_DIR%\installer\instalar_windows.ps1"

if not exist "%PS_INSTALL%" (
    echo.
    echo ============================================
    echo   ERRO: extraia todo o ZIP antes de instalar.
    echo   Arquivo instalar_windows.ps1 nao encontrado.
    echo ============================================
    echo.
    pause
    exit /b 1
)

echo.
echo ============================================
echo   Vini Captions - Instalador Windows
echo ============================================
echo.

powershell -NoProfile -ExecutionPolicy Bypass -File "%PS_INSTALL%"

if %errorlevel% neq 0 (
    echo.
    echo ============================================
    echo   ERRO na instalacao. Verifique as mensagens.
    echo ============================================
    echo.
)

pause
