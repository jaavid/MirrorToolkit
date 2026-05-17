#!/usr/bin/env bash
set -Eeuo pipefail
./setup-mirrors.sh --config mirrors.json --output /tmp/.env.mirrors --report /tmp/mirror-report.json --timeout 3 --no-apply
[[ -f /tmp/.env.mirrors ]]
[[ -f /tmp/mirror-report.json ]]
