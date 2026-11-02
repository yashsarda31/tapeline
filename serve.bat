@echo off
rem Serve the site locally at http://127.0.0.1:8790
if not defined PY if exist "%LOCALAPPDATA%\Programs\Python\Python311\python.exe" set "PY=%LOCALAPPDATA%\Programs\Python\Python311\python.exe"
if not defined PY set "PY=python"
start "" http://127.0.0.1:8790
"%PY%" -m http.server 8790 --bind 127.0.0.1 --directory "%~dp0site"
