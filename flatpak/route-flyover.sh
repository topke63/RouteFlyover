#!/bin/sh
# Starts the Route Flyover server inside the Flatpak sandbox and opens it in the host browser.
PORT=4173
URL="http://localhost:$PORT"

# Already running (another launch of the app)? Just open the browser.
if (exec 3<>/dev/tcp/127.0.0.1/$PORT) 2>/dev/null; then
    xdg-open "$URL"
    exit 0
fi 2>/dev/null

cd /app/share/route-flyover || exit 1
node node_modules/vite/bin/vite.js preview --configLoader native --host 127.0.0.1 --port "$PORT" --strictPort &
server=$!
trap 'kill "$server" 2>/dev/null' INT TERM

# Wait for the server (up to ~15 s), then open the browser.
for _ in $(seq 1 60); do
    (exec 3<>/dev/tcp/127.0.0.1/$PORT) 2>/dev/null && break
    sleep 0.25
done
xdg-open "$URL"

echo "Route Flyover is running at $URL"
echo "Stop it with: flatpak kill io.github.topke63.RouteFlyover"
wait "$server"
