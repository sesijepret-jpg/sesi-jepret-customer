@echo off
cd /d "%~dp0"
python canon_bridge.py
if errorlevel 1 pause
