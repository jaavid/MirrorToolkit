#!/usr/bin/env bash
set -Eeuo pipefail
DEFAULT_CONFIG="mirrors.json"; DEFAULT_OUTPUT=".env.mirrors"; DEFAULT_REPORT="mirror-report.json"; DEFAULT_TIMEOUT=6
CONFIG="$DEFAULT_CONFIG"; OUTPUT="$DEFAULT_OUTPUT"; REPORT="$DEFAULT_REPORT"; TIMEOUT="$DEFAULT_TIMEOUT"; APPLY="false"
usage(){ :; }
require_cmd(){ command -v "$1" >/dev/null 2>&1 || { echo "Missing required command: $1" >&2; exit 1; }; }
probe_url(){
  local category="$1" kind="$2" url="$3" timeout="$4" checked_url
  checked_url="$url"
  [[ "$category" == "docker" || "$kind" == "registry" || "$kind" == "docker_registry" ]] && checked_url="${url%/}/v2/"
  local out http latency err ok=false
  out="$(curl -sS -o /dev/null -w '%{http_code} %{time_total}' --max-time "$timeout" "$checked_url" 2>/tmp/mt.err || true)"
  http="${out%% *}"; latency="${out##* }"; [[ "$http" =~ ^[0-9]+$ ]] || http=0; [[ "$latency" =~ ^[0-9.]+$ ]] || latency=0
  err=""
  if [[ "$category" == "docker" || "$kind" == "registry" || "$kind" == "docker_registry" ]]; then
    [[ "$http" == "200" || "$http" == "401" || "$http" == "403" ]] && ok=true
  else
    [[ "$http" -ge 200 && "$http" -lt 500 ]] && ok=true
  fi
  if ! $ok; then err="$(tr '\n' ' ' </tmp/mt.err | sed 's/"/\\"/g')"; [[ -z "$err" ]] && err="http status $http"; fi
  printf '%s|%s|%s|%s|%s\n' "$checked_url" "$http" "$latency" "$ok" "$err"
}
write_env(){
  local out="$1" sel="$2" py2="$3"
  {
    echo "DOCKER_REGISTRY_MIRROR=\"$(jq -r '.docker.selected_url' <<<"$sel")\""
    echo "PIP_INDEX_URL=\"$(jq -r '.python.selected_url' <<<"$sel")\""
    if [[ -n "$py2" ]]; then echo "PIP_EXTRA_INDEX_URL=\"$py2\""; else echo "# PIP_EXTRA_INDEX_URL=\"\""; fi
    echo "NPM_CONFIG_REGISTRY=\"$(jq -r '.node.selected_url' <<<"$sel")\""
    echo "YARN_NPM_REGISTRY_SERVER=\"$(jq -r '.node.selected_url' <<<"$sel")\""
    echo "PNPM_REGISTRY=\"$(jq -r '.node.selected_url' <<<"$sel")\""
    echo "MAVEN_MIRROR_URL=\"$(jq -r '.java.selected_url' <<<"$sel")\""
    echo "APT_UBUNTU_MIRROR=\"$(jq -r '.ubuntu.selected_url' <<<"$sel")\""
    echo "APT_UBUNTU_SECURITY_MIRROR=\"$(jq -r '.ubuntu.selected_security_url' <<<"$sel")\""
    echo "APT_DEBIAN_MIRROR=\"$(jq -r '.debian.selected_url' <<<"$sel")\""
    echo "APT_DEBIAN_SECURITY_MIRROR=\"$(jq -r '.debian.selected_security_url' <<<"$sel")\""
  } > "$out"
}
main(){
require_cmd jq; require_cmd curl
while [[ $# -gt 0 ]]; do case "$1" in --config) CONFIG="$2"; shift 2;; --output) OUTPUT="$2"; shift 2;; --report) REPORT="$2"; shift 2;; --timeout) TIMEOUT="$2"; shift 2;; --apply) APPLY=true; shift;; --no-apply) APPLY=false; shift;; *) CONFIG="$1"; shift;; esac; done
json="$(jq -c '.' "$CONFIG")"
selected='{}'; results='[]'; py_reach='[]'
for c in docker python node java ubuntu debian; do
 items="$(jq -c --arg c "$c" '.[$c][]? // empty' <<<"$json")"; best=""; best_lat=999999; best_name=""; best_sec=""
 while IFS= read -r it; do [[ -z "$it" ]] && continue
  n="$(jq -r '.name // ""' <<<"$it")"; u="$(jq -r '.url // ""' <<<"$it")"; k="$(jq -r '.kind // ""' <<<"$it")"; s="$(jq -r '.security_url // ""' <<<"$it")"
  IFS='|' read -r checked http lat ok err < <(probe_url "$c" "$k" "$u" "$TIMEOUT")
  tcp="fail"; [[ "$ok" == "true" ]] && tcp="ok"
  e=null; [[ -n "$err" ]] && e="\"$err\""
  results="$(jq -c --arg c "$c" --arg n "$n" --arg u "$u" --arg checked "$checked" --arg k "$k" --argjson h "$http" --argjson l "$lat" --argjson ok "$ok" --arg t "$tcp" --argjson e "$e" '. + [{category:$c,name:$n,url:$u,checked_url:$checked,kind:$k,ok:$ok,http_status:$h,latency_ms:$l,tcp_status:$t,error:$e}]' <<<"$results")"
  if [[ "$ok" == "true" ]]; then
    awk_cmp=$(awk -v a="$lat" -v b="$best_lat" 'BEGIN{if(a<b) print 1; else print 0}')
    if [[ -z "$best" || "$awk_cmp" == "1" ]]; then best="$u"; best_lat="$lat"; best_name="$n"; best_sec="$s"; fi
    [[ "$c" == "python" ]] && py_reach="$(jq -c --arg u "$u" '. + [$u]' <<<"$py_reach")"
  fi
 done <<<"$items"
 selected="$(jq -c --arg c "$c" --arg u "$best" --arg n "$best_name" --arg s "$best_sec" '. + {($c):{selected_url:$u,selected_name:$n,selected_security_url:$s}}' <<<"$selected")"
 done
unknown="$(jq -c '[keys[] | select(. != "docker" and . != "python" and . != "node" and . != "java" and . != "ubuntu" and . != "debian")]' <<<"$json")"
results="$(jq -c 'sort_by(.category, (.ok|not), .latency_ms)' <<<"$results")"
py2="$(jq -r 'if length>1 then .[1] else "" end' <<<"$py_reach")"
write_env "$OUTPUT" "$selected" "$py2"
jq -n --argjson ts "$(date +%s)" --argjson timeout "$TIMEOUT" --argjson selected "$selected" --argjson results "$results" --argjson unknown "$unknown" '{generated_at_unix:$ts,timeout_seconds:$timeout,selected:$selected,results:$results,unknown_categories:$unknown}' > "$REPORT"
echo "Generated: $OUTPUT"; echo "Generated: $REPORT"
}
main "$@"
