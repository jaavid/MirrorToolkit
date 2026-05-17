#!/usr/bin/env bash
set -Eeuo pipefail

CONFIG="mirrors.json"; OUTPUT=".env.mirrors"; REPORT="mirror-report.json"; TIMEOUT=6
usage(){ echo "Usage: ./setup-mirrors.sh [mirrors.json] | --config mirrors.json --output .env.mirrors --report mirror-report.json --timeout 6"; }

while [[ $# -gt 0 ]]; do
  case "$1" in
    --config) CONFIG="$2"; shift 2;;
    --output) OUTPUT="$2"; shift 2;;
    --report) REPORT="$2"; shift 2;;
    --timeout) TIMEOUT="$2"; shift 2;;
    -h|--help) usage; exit 0;;
    *) CONFIG="$1"; shift;;
  esac
done

command -v jq >/dev/null || { echo "jq is required" >&2; exit 1; }
command -v curl >/dev/null || { echo "curl is required" >&2; exit 1; }

json="$(jq -c '.' "$CONFIG")"
mirrors_json="$(jq -c '.mirrors' <<<"$json")"

results='[]'
selected='{}'

test_url(){
  local category="$1" url="$2" kind="$3" check_url="$url"
  if [[ "$category" == "docker" || "$kind" == "registry" || "$kind" == "docker_registry" ]]; then
    check_url="${url%/}/v2/"
  fi
  local raw status latency ok=false
  raw="$(curl -sS -o /dev/null -w '%{http_code} %{time_total}' --max-time "$TIMEOUT" "$check_url" 2>/dev/null || true)"
  status="${raw%% *}"; latency="${raw##* }"
  [[ "$status" =~ ^[0-9]+$ ]] || status=0
  [[ "$latency" =~ ^[0-9.]+$ ]] || latency=0
  if [[ "$category" == "docker" || "$kind" == "registry" || "$kind" == "docker_registry" ]]; then
    [[ "$status" == "200" || "$status" == "401" || "$status" == "403" ]] && ok=true
  else
    [[ "$status" -ge 200 && "$status" -lt 500 ]] && ok=true
  fi
  printf '%s|%s|%s|%s\n' "$check_url" "$status" "$latency" "$ok"
}

while IFS= read -r category; do
  best_url=""; best_name=""; best_sec=""; best_latency=999999
  while IFS= read -r item; do
    [[ -z "$item" ]] && continue
    name="$(jq -r '.name' <<<"$item")"
    url="$(jq -r '.url' <<<"$item")"
    kind="$(jq -r '.kind' <<<"$item")"
    sec="$(jq -r '.security_url // ""' <<<"$item")"
    IFS='|' read -r checked status latency ok < <(test_url "$category" "$url" "$kind")
    results="$(jq -c --arg c "$category" --arg n "$name" --arg u "$url" --arg cu "$checked" --arg k "$kind" --argjson s "$status" --argjson l "$latency" --argjson o "$ok" '. + [{category:$c,name:$n,url:$u,checked_url:$cu,kind:$k,http_status:$s,latency_ms:$l,reachable:$o}]' <<<"$results")"
    if [[ "$ok" == "true" ]]; then
      if awk -v a="$latency" -v b="$best_latency" 'BEGIN{exit !(a<b)}'; then
        best_url="$url"; best_name="$name"; best_sec="$sec"; best_latency="$latency"
      fi
    fi
  done < <(jq -c --arg c "$category" '.[$c][]?' <<<"$mirrors_json")
  selected="$(jq -c --arg c "$category" --arg u "$best_url" --arg n "$best_name" --arg s "$best_sec" '. + {($c): {selected_url:$u,selected_name:$n,selected_security_url:$s}}' <<<"$selected")"
done < <(jq -r 'keys[]' <<<"$mirrors_json")

write_line(){ local k="$1" v="$2"; echo "$k=\"$v\"" >> "$OUTPUT"; }
: > "$OUTPUT"
write_line DOCKER_REGISTRY_MIRROR "$(jq -r '.docker.selected_url // ""' <<<"$selected")"
write_line DOCKER_REGISTRY_MIRROR_NAME "$(jq -r '.docker.selected_name // ""' <<<"$selected")"
write_line PIP_INDEX_URL "$(jq -r '.pypi.selected_url // ""' <<<"$selected")"
write_line PIP_INDEX_URL_NAME "$(jq -r '.pypi.selected_name // ""' <<<"$selected")"
write_line PIP_EXTRA_INDEX_URL ""
write_line NPM_CONFIG_REGISTRY "$(jq -r '.npm.selected_url // ""' <<<"$selected")"
write_line NPM_CONFIG_REGISTRY_NAME "$(jq -r '.npm.selected_name // ""' <<<"$selected")"
write_line PNPM_REGISTRY "$(jq -r '.npm.selected_url // ""' <<<"$selected")"
write_line YARN_NPM_REGISTRY_SERVER "$(jq -r '.npm.selected_url // ""' <<<"$selected")"
write_line MAVEN_MIRROR_URL "$(jq -r '.maven.selected_url // ""' <<<"$selected")"
write_line MAVEN_MIRROR_URL_NAME "$(jq -r '.maven.selected_name // ""' <<<"$selected")"
write_line APT_UBUNTU_MIRROR "$(jq -r '.ubuntu.selected_url // ""' <<<"$selected")"
write_line APT_UBUNTU_MIRROR_NAME "$(jq -r '.ubuntu.selected_name // ""' <<<"$selected")"
write_line APT_UBUNTU_SECURITY_MIRROR "$(jq -r '.ubuntu.selected_security_url // ""' <<<"$selected")"
write_line APT_DEBIAN_MIRROR "$(jq -r '.debian.selected_url // ""' <<<"$selected")"
write_line APT_DEBIAN_MIRROR_NAME "$(jq -r '.debian.selected_name // ""' <<<"$selected")"
write_line APT_DEBIAN_SECURITY_MIRROR "$(jq -r '.debian.selected_security_url // ""' <<<"$selected")"
write_line ALPINE_MIRROR "$(jq -r '.alpine.selected_url // ""' <<<"$selected")"
write_line ALPINE_MIRROR_NAME "$(jq -r '.alpine.selected_name // ""' <<<"$selected")"
write_line GOPROXY "$(jq -r '.golang.selected_url // ""' <<<"$selected")"
write_line GOPROXY_NAME "$(jq -r '.golang.selected_name // ""' <<<"$selected")"
write_line COMPOSER_REPO_PACKAGIST "$(jq -r '.composer.selected_url // ""' <<<"$selected")"
write_line COMPOSER_REPO_PACKAGIST_NAME "$(jq -r '.composer.selected_name // ""' <<<"$selected")"
write_line NUGET_SOURCE "$(jq -r '.nuget.selected_url // ""' <<<"$selected")"
write_line NUGET_SOURCE_NAME "$(jq -r '.nuget.selected_name // ""' <<<"$selected")"

jq -n --argjson timeout "$TIMEOUT" --argjson selected "$selected" --argjson results "$results" --argjson mirrors "$mirrors_json" '{generated_at:(now|todate),timeout_seconds:$timeout,selected:$selected,categories:($mirrors|keys),results:$results}' > "$REPORT"

echo "Generated: $OUTPUT"
echo "Generated: $REPORT"
