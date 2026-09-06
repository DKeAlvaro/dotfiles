#!/usr/bin/env bash
# Daily Canvas session health check — logs only, never emails.
# If it goes DEAD, the agent will ask Álvaro to run `auth canvas` next session.
COOKIE_FILE=/root/.canvas/cookies.json
LOG=/root/.canvas/keepalive.log
STAMP=$(date -Iseconds)
[ -f "$COOKIE_FILE" ] || exit 0
COOKIE=$(python3 -c "import json; print('; '.join(f\"{c['name']}={c['value']}\" for c in json.load(open('$COOKIE_FILE'))))" 2>/dev/null) || exit 0
CODE=$(curl -s -o /dev/null -w "%{http_code}" -m 20 -b "$COOKIE" https://canvas.tue.nl/api/v1/users/self)
if [ "$CODE" = "200" ]; then
  echo "$STAMP session OK" >> "$LOG"
else
  echo "$STAMP session DEAD (http $CODE) — needs 'auth canvas'" >> "$LOG"
fi
