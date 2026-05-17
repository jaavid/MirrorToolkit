#!/usr/bin/env bash
set -Eeuo pipefail
./setup-mirrors.sh --config mirrors.json --output /tmp/.env.mirrors --report /tmp/mirror-report.json --timeout 3 --no-apply
[[ -f /tmp/.env.mirrors ]]
[[ -f /tmp/mirror-report.json ]]
jq . /tmp/mirror-report.json >/dev/null
./scripts/optimize-dockerfile.sh tests/fixtures/Dockerfile.python /tmp/py.out
./scripts/optimize-dockerfile.sh /tmp/py.out /tmp/py.out2
from_line=$(grep -n '^FROM ' /tmp/py.out | head -n1 | cut -d: -f1)
env_line=$(grep -n '^ENV ' /tmp/py.out | head -n1 | cut -d: -f1)
[[ "$from_line" -lt "$env_line" ]]
[[ "$(grep -c '^ARG PIP_INDEX_URL' /tmp/py.out2)" -eq "1" ]]
[[ "$(grep -c '^ENV PIP_INDEX_URL=\${PIP_INDEX_URL}' /tmp/py.out2)" -eq "1" ]]
./scripts/optimize-dockerfile.sh tests/fixtures/Dockerfile.node /tmp/node.out
! grep -q 'mirror-toolkit apt rewrite block' /tmp/node.out
./scripts/optimize-dockerfile.sh tests/fixtures/Dockerfile.apt-marker /tmp/apt.out
grep -q 'mirror-toolkit apt rewrite block' /tmp/apt.out
./scripts/optimize-dockerfile.sh tests/fixtures/Dockerfile.java /tmp/java.out
grep -q 'mirror-toolkit maven active block' /tmp/java.out
