#!/usr/bin/env bash
set -Eeuo pipefail
jq -e '.version == 2 and (.mirrors | type == "object")' mirrors.json >/dev/null
jq -e '.mirrors | to_entries | all(.[]; (.value | type == "array"))' mirrors.json >/dev/null
jq -e '.mirrors | to_entries | all(.[]; all(.value[]?; (.name? and .url? and .kind?)))' mirrors.json >/dev/null
jq -e '(.results | type == "array") and (.mirrors | type == "object")' docs-site/src/sample-report.json >/dev/null
