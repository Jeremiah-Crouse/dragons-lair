#!/bin/bash
# Start Crousia.com services inside proot
cd /root/crousia.com

# Kill any stale services
pkill -f "y-websocket" 2>/dev/null
pkill -f "serve.js" 2>/dev/null
sleep 1

# Start Yjs sync server on port 1234 in a tmux session
tmux new-session -d -s yjs "PORT=1234 node node_modules/y-websocket/bin/server.js"
sleep 2

# Start federated web server on port 5000 in a tmux session
tmux new-session -d -s serve "node serve.js"
