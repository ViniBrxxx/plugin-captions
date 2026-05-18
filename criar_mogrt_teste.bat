@echo off
chcp 65001 >nul
set "SCRIPT_DIR=%~dp0"
set "SCRIPT_DIR=%SCRIPT_DIR:~0,-1%"
set "AE2026=C:\Program Files\Adobe\Adobe After Effects 2026\Support Files\AfterFX.exe"
set "AE2025=C:\Program Files\Adobe\Adobe After Effects 2025\Support Files\AfterFX.exe"
set "GENERATOR=%SCRIPT_DIR%\ferramentas\criar_mogrt_teste.jsx"

if not exist "%GENERATOR%" (
  echo Script gerador nao encontrado:
  echo %GENERATOR%
  pause
  exit /b 1
)

if exist "%AE2026%" (
  set "AE_EXE=%AE2026%"
) else if exist "%AE2025%" (
  set "AE_EXE=%AE2025%"
) else (
  echo After Effects 2025/2026 nao encontrado.
  pause
  exit /b 1
)

echo Abrindo After Effects para gerar o MOGRT de teste...
echo Aguarde o alerta de conclusao dentro do After Effects.
start "" "%AE_EXE%" -r "%GENERATOR%"
pause
