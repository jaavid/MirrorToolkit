#!/usr/bin/env bash
set -Eeuo pipefail
jq -e '.' mirrors.json >/dev/null
jq -e 'to_entries | all(.value | type == "array") and all(.[]; (.value[]? | (.name? and .url? and .kind?)))' mirrors.json >/dev/null
