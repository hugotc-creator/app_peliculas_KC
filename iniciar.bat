@echo off
REM Arranque con doble clic (Windows): crea el entorno la primera vez, instala dependencias y abre la app.
cd /d "%~dp0"

where python >nul 2>nul || (
  echo Falta Python. Instalalo desde https://www.python.org/downloads/ marcando "Add python.exe to PATH".
  pause & exit /b 1
)

if not exist ".venv\Scripts\python.exe" (
  echo Creando entorno virtual e instalando dependencias...
  python -m venv .venv || (pause & exit /b 1)
  ".venv\Scripts\python.exe" -m pip install -q -r requirements.txt || (pause & exit /b 1)
)

if not exist ".env" (
  copy .env.example .env >nul
  echo Se ha creado el archivo .env. Abrelo y escribe tu API key de OMDb en OMDB_API_KEY=
  echo (gratis en https://www.omdbapi.com/apikey.aspx). Sin ella funcionan el catalogo y los detalles guardados,
  echo pero no la busqueda en OMDb. Pulsa una tecla para continuar.
  pause
)

start "" http://localhost:8000
".venv\Scripts\python.exe" -m uvicorn app.main:app --port 8000
pause
