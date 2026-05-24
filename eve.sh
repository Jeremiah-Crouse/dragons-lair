#!/bin/bash
cd /root/crousia.com
while true; do
    node eve.js
    status=$?
    [ $status -eq 42 ] || break
    echo "🔄 Eve restarting..."
done
