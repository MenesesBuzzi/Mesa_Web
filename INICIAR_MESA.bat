@echo off
cd /d "%~dp0"
echo Abrindo a mesa do Sussurros em http://localhost:8080 ...
start "" http://localhost:8080
where python >nul 2>nul && (python -m http.server 8080 & goto :eof)
where py >nul 2>nul && (py -m http.server 8080 & goto :eof)
where npx >nul 2>nul && (npx --yes http-server -p 8080 -c-1 & goto :eof)
echo Nao achei Python nem Node. Instale um deles ou use a extensao Live Server do VS Code.
pause
