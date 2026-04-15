#!/bin/bash
set -euo pipefail

WINDY_API_KEY="EvgBIKK4OTuAJlNLD2A0gvGi809hWkR2"

OWNER="BrodieJ"
SHA=$(git rev-parse --short HEAD)
REPOSITORY=""
DIR=dist

# Build first
echo "Building plugin..."
npm run build

cd ./$DIR

echo "Creating plugin archive..."
node -e "
const a = JSON.parse(require('fs').readFileSync('plugin.json','utf8'));
Object.assign(a, {repositoryName:'${REPOSITORY}',commitSha:'${SHA}',repositoryOwner:'${OWNER}'});
require('fs').writeFileSync('plugin.json', JSON.stringify(a));
"
tar cf ./plugin.tar --exclude='./plugin.tar' --exclude='*.map' --exclude='plugin.js' .

echo "Publishing plugin..."
curl -s --fail-with-body -XPOST 'https://node.windy.com/plugins/v1.0/upload' \
  -H "x-windy-api-key: ${WINDY_API_KEY}" \
  -F "plugin_archive=@./plugin.tar"

rm ./plugin.tar
echo ""
echo "Done!"
