#!/bin/sh
# Vercel build: production deploys the Convex functions with the website; previews get
# their own Convex preview deployment per branch. Each environment only accepts its own key type.
set -eu
case "${VERCEL_ENV:-}" in
  production) expected=prod ;;
  preview) expected=preview ;;
  *) exec npm run build ;;
esac
if [ -z "${CONVEX_DEPLOY_KEY:-}" ]; then
  echo "CONVEX_DEPLOY_KEY (Convex ${expected}-Deploy-Key) fehlt in den Vercel-Variablen für ${VERCEL_ENV}." >&2
  exit 1
fi
case "$CONVEX_DEPLOY_KEY" in
  "$expected":*) ;;
  *) echo "CONVEX_DEPLOY_KEY ist kein ${expected}-Deploy-Key; ${VERCEL_ENV} darf nicht in ein anderes Convex-Deployment deployen." >&2; exit 1 ;;
esac
# Preview: Auth-Origin kommt aus SITE_ALLOWED_HOSTS (Convex-Standardvariable für Previews).
# Produktion: SITE_URL ist im Convex-Produktionsdeployment gesetzt.
exec npx convex deploy --cmd 'npm run build' --cmd-url-env-var-name NEXT_PUBLIC_CONVEX_URL
