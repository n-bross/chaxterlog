#!/bin/sh
# Vercel build: previews get their own Convex preview deployment per branch.
set -eu
if [ "${VERCEL_ENV:-}" != "preview" ]; then
  exec npm run build
fi
if [ -z "${CONVEX_DEPLOY_KEY:-}" ]; then
  echo "CONVEX_DEPLOY_KEY (Convex Preview Deploy Key) fehlt in den Vercel-Preview-Variablen." >&2
  exit 1
fi
case "$CONVEX_DEPLOY_KEY" in
  preview:*) ;;
  *) echo "CONVEX_DEPLOY_KEY ist kein Preview Deploy Key; Previews dürfen nicht in Dev oder Produktion deployen." >&2; exit 1 ;;
esac
# Auth-Origin kommt aus SITE_ALLOWED_HOSTS (Convex-Standardvariable für Previews).
exec npx convex deploy --cmd 'npm run build' --cmd-url-env-var-name NEXT_PUBLIC_CONVEX_URL
