#!/usr/bin/env bash
# Publish the current build to GitHub Pages.
#
# Pages serves from a subdirectory (/corner-office/), which works because
# vite.config.ts sets base: './' -- absolute asset paths would 404 there,
# the same reason itch.io needs relative paths.
set -euo pipefail

cd "$(dirname "$0")/.."
REMOTE=$(git remote get-url origin)
STAGE=$(mktemp -d)

npm run build

cp -r dist/* "$STAGE/"
touch "$STAGE/.nojekyll"   # stop Pages running the output through Jekyll

cd "$STAGE"
git init -q
git checkout -q -b gh-pages
git add -A
git commit -q -m "Deploy $(date -u '+%Y-%m-%d %H:%M UTC')"
git remote add origin "$REMOTE"
git push -q -f origin gh-pages

rm -rf "$STAGE"
echo ""
echo "Deployed. Live in a minute or two at:"
echo "  https://krishp1011.github.io/corner-office/"
