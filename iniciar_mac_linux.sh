#!/usr/bin/env sh
cd "$(dirname "$0")" || exit 1
if ! command -v node >/dev/null 2>&1; then
  echo 'Necesitas Node.js 18 o superior: https://nodejs.org/'
  exit 1
fi
exec node app.js
