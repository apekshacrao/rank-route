@echo off
setlocal

powershell -NoProfile -ExecutionPolicy Bypass -File "%~dp0run_lan_server.ps1"

endlocal