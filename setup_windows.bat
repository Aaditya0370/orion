@echo off
setlocal
py -3 -m pip install -r requirements.txt
if errorlevel 1 (
  echo Dependency installation failed. Check that a supported Python is installed.
  pause
  exit /b 1
)
py -3 main.py
if errorlevel 1 pause
endlocal
