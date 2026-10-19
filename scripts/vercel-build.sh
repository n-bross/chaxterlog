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
npx convex deploy --cmd 'npm run build' --cmd-url-env-var-name NEXT_PUBLIC_CONVEX_URL
# Auth-Origin der Preview-Datenbank auf die stabile Branch-URL setzen.
npx convex env set --preview-name "$VERCEL_GIT_COMMIT_REF" SITE_URL "https://$VERCEL_BRANCH_URL"
