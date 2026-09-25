@echo off
rem Double-click before a TEST recording. Logs the mouse (never keys) to D:\Hinglish\mouselogs\
rem Close this window (or press Ctrl+C) after you stop recording.
if not exist "D:\Hinglish\mouselogs" mkdir "D:\Hinglish\mouselogs"
for /f %%i in ('powershell -NoProfile -Command "Get-Date -Format yyyyMMdd-HHmmss"') do set STAMP=%%i
powershell -NoProfile -ExecutionPolicy Bypass -File "%~dp0mouselog.ps1" -Out "D:\Hinglish\mouselogs\mouselog-%STAMP%.jsonl"
