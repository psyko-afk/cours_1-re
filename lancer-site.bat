@echo off
title Serveur Local - Site Histoire-Geo
echo Démarrage du serveur Caddy...
cd /d "%~dp0"
start "" caddy_windows_amd64.exe run --config Caddyfile
timeout /t 1 /nobreak > nul
echo Ouverture du site dans le navigateur...
start http://localhost:8080
echo.
echo Le serveur tourne. Laissez cette fenetre ouverte pendant vos revisions.
echo Pour arreter le serveur, fermez simplement cette fenetre.
pause