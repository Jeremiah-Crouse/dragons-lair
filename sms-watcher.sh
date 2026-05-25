#!/data/data/com.termux/files/usr/bin/bash
# Minimal SMS watcher for Da She
# Polls the summon endpoint and sends SMS when summoned

ENDPOINT="https://shadow.cristio.ru/api/summon"
PHONE="$1"
[ -z "$PHONE" ] && PHONE="+19362300683"
POLL_SEC=10
LAST_FILE="/data/data/com.termux/files/home/.da-she-last.json"

log() { echo "$(date) $*" >> /data/data/com.termux/files/home/da-she.log; }
notify() { termux-sms-send -n "$PHONE" "$1" && log "SMS sent"; }

log "Da She minimal watcher started (phone: $PHONE)"
while true; do
  RESP=$(curl -s --max-time 5 "$ENDPOINT" 2>/dev/null)
  STATUS=$(echo "$RESP" | grep -o '"status":"[^"]*"' | cut -d'"' -f4)
  if [ "$STATUS" = "summoned" ]; then
    NOTIFIED=$(cat "$LAST_FILE" 2>/dev/null || echo "{}")
    if ! echo "$NOTIFIED" | grep -q "$(echo $RESP | md5sum | cut -d' ' -f1)"; then
      notify "Da She has been summoned."
      echo "$RESP" > "$LAST_FILE"
    fi
  fi
  sleep "$POLL_SEC"
done
