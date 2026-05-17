#!/usr/bin/env bash
set -Eeuo pipefail

DEFAULT_CONFIG="mirrors.json"
DEFAULT_OUTPUT=".env.mirrors"
DEFAULT_REPORT="mirror-report.json"
DEFAULT_TIMEOUT=6

CONFIG="${DEFAULT_CONFIG}"
OUTPUT="${DEFAULT_OUTPUT}"
REPORT="${DEFAULT_REPORT}"
TIMEOUT="${DEFAULT_TIMEOUT}"
APPLY="false"

usage() {
  cat <<'USAGE'
Mirror Toolkit - select reachable mirrors and generate env + report

Usage:
  ./setup-mirrors.sh [mirrors.json]
  ./setup-mirrors.sh [options]

Options:
  --config <file>     Path to mirror config JSON (default: mirrors.json)
  --output <file>     Output env file (default: .env.mirrors)
  --report <file>     Output report JSON (default: mirror-report.json)
  --timeout <sec>     Per-mirror timeout seconds (default: 6)
  --apply             Apply user-level configs (pip/npm/maven); root-only docker daemon config
  --no-apply          Do not apply any local/host config changes
  -h, --help          Show this help

Notes:
  * Backward compatible: ./setup-mirrors.sh mirrors.json
  * Host APT sources are never rewritten by this script.
USAGE
}

require_cmd() { command -v "$1" >/dev/null 2>&1 || { echo "Missing required command: $1" >&2; exit 1; }; }
json_escape() { printf '%s' "$1" | sed 's/\\/\\\\/g; s/"/\\"/g'; }

probe_url() {
  local url="$1" timeout="$2"
  local curl_out http latency curl_rc tcp_status tcp_host tcp_port
  tcp_status="fail"
  http="0"
  latency="0"
  curl_rc=1

  curl_out="$(curl -L -I -sS -o /dev/null -w '%{http_code} %{time_total}' --max-time "$timeout" "$url" 2>/dev/null || true)"
  if [[ -n "$curl_out" ]]; then
    http="${curl_out%% *}"
    latency="${curl_out##* }"
    [[ "$http" =~ ^[0-9]+$ ]] || http="0"
    [[ "$latency" =~ ^[0-9]+(\.[0-9]+)?$ ]] || latency="0"
    if [[ "$http" -ge 200 && "$http" -lt 500 ]]; then
      curl_rc=0
    fi
  fi

  local parsed
  parsed="$(echo "$url" | sed -E 's#^[a-zA-Z]+://([^/:]+)(:([0-9]+))?.*#\1 \3#')"
  tcp_host="${parsed%% *}"
  tcp_port="${parsed##* }"
  [[ -z "$tcp_port" ]] && tcp_port=443
  if timeout "$timeout" bash -c "</dev/tcp/${tcp_host}/${tcp_port}" >/dev/null 2>&1; then
    tcp_status="ok"
  fi

  local error=""
  if [[ "$curl_rc" -ne 0 ]]; then
    error="unreachable or non-acceptable http status"
  fi

  printf '%s|%s|%s|%s|%s\n' "$http" "$latency" "$tcp_status" "$url" "$error"
}

select_for_category() {
  local category="$1" timeout="$2" json="$3"
  local items
  items="$(jq -c --arg c "$category" '.[$c][]? // empty' <<<"$json")"

  local selected="" selected_name="" selected_security=""
  local probes="[]"

  while IFS= read -r item; do
    [[ -z "$item" ]] && continue
    local name url kind security
    name="$(jq -r '.name // empty' <<<"$item")"
    url="$(jq -r '.url // empty' <<<"$item")"
    kind="$(jq -r '.kind // empty' <<<"$item")"
    security="$(jq -r '.security_url // empty' <<<"$item")"

    if [[ -z "$name" || -z "$url" || -z "$kind" ]]; then
      probes="$(jq -c --arg n "$name" --arg u "$url" --arg k "$kind" '. + [{name:$n,url:$u,kind:$k,checked_url:$u,tcp_status:"fail",http_status:0,latency:0,error:"missing required fields: name/url/kind"}]' <<<"$probes")"
      continue
    fi

    IFS='|' read -r http latency tcp checked error < <(probe_url "$url" "$timeout")
    probes="$(jq -c --arg n "$name" --arg u "$url" --arg k "$kind" --arg c "$checked" --arg t "$tcp" --arg e "$error" --argjson h "$http" --argjson l "$latency" '. + [{name:$n,url:$u,kind:$k,checked_url:$c,tcp_status:$t,http_status:$h,latency:$l,error:$e}]' <<<"$probes")"

    if [[ -z "$selected" && "$error" == "" && "$tcp" == "ok" ]]; then
      selected="$url"
      selected_name="$name"
      selected_security="$security"
    fi
  done <<<"$items"

  jq -n --arg category "$category" --arg selected "$selected" --arg selected_name "$selected_name" --arg selected_security "$selected_security" --argjson probes "$probes" '{category:$category,selected_url:$selected,selected_name:$selected_name,selected_security_url:$selected_security,probes:$probes}'
}

write_env() {
  local out="$1" selections="$2"
  cat > "$out" <<EOF_ENV
DOCKER_REGISTRY_MIRROR=$(jq -r '.docker.selected_url' <<<"$selections")
DOCKER_REGISTRY_MIRROR_NAME=$(jq -r '.docker.selected_name' <<<"$selections")
PIP_INDEX_URL=$(jq -r '.python.selected_url' <<<"$selections")
PIP_INDEX_URL_NAME=$(jq -r '.python.selected_name' <<<"$selections")
PIP_EXTRA_INDEX_URL=
NPM_CONFIG_REGISTRY=$(jq -r '.node.selected_url' <<<"$selections")
NPM_CONFIG_REGISTRY_NAME=$(jq -r '.node.selected_name' <<<"$selections")
YARN_NPM_REGISTRY_SERVER=$(jq -r '.node.selected_url' <<<"$selections")
PNPM_REGISTRY=$(jq -r '.node.selected_url' <<<"$selections")
MAVEN_MIRROR_URL=$(jq -r '.java.selected_url' <<<"$selections")
MAVEN_MIRROR_URL_NAME=$(jq -r '.java.selected_name' <<<"$selections")
MAVEN_OPTS_MIRROR_URL=$(jq -r '.java.selected_url' <<<"$selections")
APT_UBUNTU_MIRROR=$(jq -r '.ubuntu.selected_url' <<<"$selections")
APT_UBUNTU_MIRROR_NAME=$(jq -r '.ubuntu.selected_name' <<<"$selections")
APT_UBUNTU_SECURITY_MIRROR=$(jq -r '.ubuntu.selected_security_url' <<<"$selections")
APT_DEBIAN_MIRROR=$(jq -r '.debian.selected_url' <<<"$selections")
APT_DEBIAN_MIRROR_NAME=$(jq -r '.debian.selected_name' <<<"$selections")
APT_DEBIAN_SECURITY_MIRROR=$(jq -r '.debian.selected_security_url' <<<"$selections")
EOF_ENV
}

apply_configs() {
  local env_file="$1"
  # shellcheck disable=SC1090
  source "$env_file"
  mkdir -p "$HOME/.pip" "$HOME/.m2"
  {
    echo "[global]"
    echo "index-url = ${PIP_INDEX_URL}"
  } > "$HOME/.pip/pip.conf"

  if [[ -n "${NPM_CONFIG_REGISTRY:-}" ]]; then
    npm config set registry "$NPM_CONFIG_REGISTRY" >/dev/null 2>&1 || true
  fi

  if [[ -n "${MAVEN_MIRROR_URL:-}" ]]; then
    cat > "$HOME/.m2/settings.xml" <<EOF_MVN
<settings>
  <mirrors>
    <mirror>
      <id>mirror-toolkit-selected</id>
      <name>${MAVEN_MIRROR_URL_NAME:-mirror}</name>
      <url>${MAVEN_MIRROR_URL}</url>
      <mirrorOf>*</mirrorOf>
    </mirror>
  </mirrors>
</settings>
EOF_MVN
  fi

  if [[ "$(id -u)" -eq 0 && -n "${DOCKER_REGISTRY_MIRROR:-}" ]]; then
    mkdir -p /etc/docker
    cat > /etc/docker/daemon.json <<EOF_DOCKER
{
  "registry-mirrors": ["${DOCKER_REGISTRY_MIRROR}"]
}
EOF_DOCKER
  fi
}

main() {
  require_cmd jq
  require_cmd curl
  while [[ $# -gt 0 ]]; do
    case "$1" in
      --config) CONFIG="$2"; shift 2;;
      --output) OUTPUT="$2"; shift 2;;
      --report) REPORT="$2"; shift 2;;
      --timeout) TIMEOUT="$2"; shift 2;;
      --apply) APPLY="true"; shift;;
      --no-apply) APPLY="false"; shift;;
      -h|--help) usage; exit 0;;
      --*) echo "Unknown option: $1" >&2; usage; exit 1;;
      *) CONFIG="$1"; shift;;
    esac
  done

  [[ -f "$CONFIG" ]] || { echo "Config file not found: $CONFIG" >&2; exit 1; }
  local json
  json="$(jq -c '.' "$CONFIG")"
  local categories
  categories="$(jq -r 'keys[]' <<<"$json")"

  local selected='{}' all_probes='{}'
  for category in docker python node java ubuntu debian; do
    local result
    result="$(select_for_category "$category" "$TIMEOUT" "$json")"
    selected="$(jq -c --arg c "$category" --arg u "$(jq -r '.selected_url' <<<"$result")" --arg n "$(jq -r '.selected_name' <<<"$result")" --arg s "$(jq -r '.selected_security_url' <<<"$result")" '. + {($c):{selected_url:$u,selected_name:$n,selected_security_url:$s}}' <<<"$selected")"
    all_probes="$(jq -c --arg c "$category" --argjson p "$(jq '.probes' <<<"$result")" '. + {($c):$p}' <<<"$all_probes")"
  done

  local unknown
  unknown="$(jq -c '[keys[] | select(. != "docker" and . != "python" and . != "node" and . != "java" and . != "ubuntu" and . != "debian")]' <<<"$json")"

  write_env "$OUTPUT" "$selected"

  jq -n --argjson ts "$(date +%s)" --argjson timeout "$TIMEOUT" --argjson selected "$selected" --argjson probes "$all_probes" --argjson unknown "$unknown" '{generated_at_unix:$ts,timeout_seconds:$timeout,selected:$selected,probe_results:$probes,unknown_categories:$unknown}' > "$REPORT"

  if [[ "$APPLY" == "true" ]]; then
    apply_configs "$OUTPUT"
  fi

  echo "Generated: $OUTPUT"
  echo "Generated: $REPORT"
}

main "$@"
