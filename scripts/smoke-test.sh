#!/usr/bin/env bash
set -Eeuo pipefail
./setup-mirrors.sh --config mirrors.json --output /tmp/.env.mirrors --report /tmp/mirror-report.json --timeout 3
jq . /tmp/mirror-report.json >/dev/null

cat > /tmp/devpulse.Dockerfile <<'DOCK'
FROM node:20
ENV NPM_CONFIG_REGISTRY=https://npm.devneeds.ir/
RUN npm config set registry https://npm.devneeds.ir/ --save
ENTRYPOINT ["node","index.js"]
DOCK
./scripts/optimize-dockerfile.sh --profile production --report /tmp/devpulse-report.json /tmp/devpulse.Dockerfile /tmp/devpulse.out
[[ "$(grep -c '^ENV NPM_CONFIG_REGISTRY=' /tmp/devpulse.out)" -eq 1 ]]
[[ "$(grep -c '^ARG NPM_CONFIG_REGISTRY=' /tmp/devpulse.out)" -eq 1 ]]
grep -q 'npm config set registry "${NPM_CONFIG_REGISTRY}"' /tmp/devpulse.out

./scripts/optimize-dockerfile.sh tests/fixtures/Dockerfile.node /tmp/node.out
! grep -q 'PIP_INDEX_URL' /tmp/node.out

./scripts/optimize-dockerfile.sh tests/fixtures/Dockerfile.python /tmp/py.out
grep -q 'ARG PIP_INDEX_URL' /tmp/py.out
! grep -q 'NPM_CONFIG_REGISTRY' /tmp/py.out

grep -q 'ENTRYPOINT \["node","index.js"\]' /tmp/devpulse.out
./scripts/optimize-dockerfile.sh --profile production /tmp/devpulse.out /tmp/devpulse.twice
cmp -s /tmp/devpulse.out /tmp/devpulse.twice
jq -e '.profile and .detected and .changes and .warnings and .skipped' /tmp/devpulse-report.json >/dev/null
