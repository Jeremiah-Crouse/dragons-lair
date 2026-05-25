#!/data/data/com.termux/files/usr/bin/bash
# SMS watcher — runs in termux, not proot
# Monitors sms-trigger file from shadow server (proot) and sends SMS

TRIGGER="$HOME/sms-trigger"
LOCK="$HOME/sms-trigger.lock"

while true; do
  if [ -f "$TRIGGER" ] && [ ! -f "$LOCK" ]; then
    touch "$LOCK"
    CMD=$(cat "$TRIGGER")
    rm -f "$TRIGGER"
    eval "$CMD" 2>/dev/null
    rm -f "$LOCK"
  fi
  sleep 2
done
