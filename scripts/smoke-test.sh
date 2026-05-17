#!/usr/bin/env bash
set -Eeuo pipefail
./setup-mirrors.sh --config mirrors.json --output /tmp/.env.mirrors --report /tmp/mirror-report.json --timeout 3
[[ -f /tmp/.env.mirrors ]]
[[ -f /tmp/mirror-report.json ]]
jq . /tmp/mirror-report.json >/dev/null

./scripts/optimize-dockerfile.sh tests/fixtures/Dockerfile.python /tmp/py.out
./scripts/optimize-dockerfile.sh /tmp/py.out /tmp/py.out2
from_line=$(grep -n '^FROM ' /tmp/py.out | head -n1 | cut -d: -f1)
env_line=$(grep -n '^ENV ' /tmp/py.out | head -n1 | cut -d: -f1)
[[ "$from_line" -lt "$env_line" ]]
grep -Fq 'ENV PIP_INDEX_URL=${PIP_INDEX_URL}' /tmp/py.out
if grep -Fq 'ENV NPM_CONFIG_REGISTRY=${NPM_CONFIG_REGISTRY}' /tmp/py.out; then exit 1; fi
if grep -Fq 'mirror-toolkit: maven-mirror-snippet' /tmp/py.out; then exit 1; fi

./scripts/optimize-dockerfile.sh tests/fixtures/Dockerfile.node /tmp/node.out
./scripts/optimize-dockerfile.sh /tmp/node.out /tmp/node.out2
grep -Fq 'ENV NPM_CONFIG_REGISTRY=${NPM_CONFIG_REGISTRY}' /tmp/node.out
if grep -Fq 'ENV PIP_INDEX_URL=${PIP_INDEX_URL}' /tmp/node.out; then exit 1; fi
if grep -Fq 'mirror-toolkit: maven-mirror-snippet' /tmp/node.out; then exit 1; fi

./scripts/optimize-dockerfile.sh tests/fixtures/Dockerfile.java /tmp/java.out
grep -q 'mirror-toolkit: maven-mirror-snippet' /tmp/java.out
grep -q 'mirror-toolkit maven active block' /tmp/java.out

./scripts/optimize-dockerfile.sh tests/fixtures/Dockerfile.apt-marker /tmp/apt.out
grep -q 'mirror-toolkit apt rewrite block' /tmp/apt.out
if grep -Fq 'mirror-toolkit: maven-mirror-snippet' /tmp/apt.out; then exit 1; fi

for f in /tmp/py.out2 /tmp/node.out2 /tmp/java.out /tmp/apt.out; do
  ./scripts/optimize-dockerfile.sh "$f" "${f}.twice"
  [[ "$(grep -c '^ARG PIP_INDEX_URL' "${f}.twice")" -eq 1 ]]
  [[ "$(grep -c '^ARG NPM_CONFIG_REGISTRY' "${f}.twice")" -eq 1 ]]
  [[ "$(grep -Fc 'ENV PIP_INDEX_URL=${PIP_INDEX_URL}' "${f}.twice" || true)" -le 1 ]]
  [[ "$(grep -Fc 'ENV NPM_CONFIG_REGISTRY=${NPM_CONFIG_REGISTRY}' "${f}.twice" || true)" -le 1 ]]
  [[ "$(grep -c 'mirror-toolkit apt rewrite block' "${f}.twice" || true)" -le 1 ]]
  [[ "$(grep -c 'mirror-toolkit maven active block' "${f}.twice" || true)" -le 1 ]]
  [[ "$(grep -c 'mirror-toolkit: maven-mirror-snippet' "${f}.twice" || true)" -le 1 ]]
done
