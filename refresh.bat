@echo off
rem Refresh the bharatiq warehouse, then rebuild the site data.
rem Set PY to choose an interpreter; otherwise the per-user Python 3.11 install is used if present.
if not defined PY if exist "%LOCALAPPDATA%\Programs\Python\Python311\python.exe" set "PY=%LOCALAPPDATA%\Programs\Python\Python311\python.exe"
if not defined PY set "PY=python"
"%PY%" -m bharatiq refresh
"%PY%" "%~dp0build\build.py"
