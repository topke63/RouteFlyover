@echo off
rem Route Flyover installer for Windows: double-click this file.
rem It runs install-windows.ps1 (next to this file, or downloaded from GitHub when it
rem isn't there) without changing your PowerShell execution policy.
rem Options are passed on, e.g.: install-windows.bat -InstallDir C:\RouteFlyover -NoLaunch
setlocal
set "SCRIPT=%~dp0install-windows.ps1"
if exist "%SCRIPT%" (
  powershell.exe -NoProfile -ExecutionPolicy Bypass -File "%SCRIPT%" %*
) else (
  powershell.exe -NoProfile -ExecutionPolicy Bypass -Command "irm https://raw.githubusercontent.com/topke63/RouteFlyover/main/install-windows.ps1 | iex"
)
echo.
pause
