#!/usr/bin/env bash
set -Eeuo pipefail

[[ $# -eq 2 ]] || { echo "Usage: $0 input.Dockerfile output.Dockerfile" >&2; exit 1; }
in="$1"; out="$2"
[[ -f "$in" ]] || { echo "Input not found: $in" >&2; exit 1; }

tmp="$(mktemp)"
cp "$in" "$tmp"

if [[ -f .env.mirrors ]]; then
  set -a; source .env.mirrors; set +a
fi

insert_arg_if_missing() {
  local arg="$1"
  if ! rg -q "^ARG ${arg}(=|$)" "$tmp"; then
    awk -v line="ARG ${arg}" 'BEGIN{done=0} /^FROM / && done==0 {print line; done=1} {print} END{if(done==0) print line}' "$tmp" > "${tmp}.new" && mv "${tmp}.new" "$tmp"
  fi
}
for a in PIP_INDEX_URL NPM_CONFIG_REGISTRY MAVEN_MIRROR_URL APT_UBUNTU_MIRROR APT_UBUNTU_SECURITY_MIRROR APT_DEBIAN_MIRROR APT_DEBIAN_SECURITY_MIRROR; do insert_arg_if_missing "$a"; done

rg -qi 'python' "$tmp" && ! rg -q '^ENV PIP_INDEX_URL=' "$tmp" && awk 'BEGIN{d=0} /^ARG PIP_INDEX_URL/ && d==0 {print; print "ENV PIP_INDEX_URL=${PIP_INDEX_URL}"; d=1; next} {print}' "$tmp" > "${tmp}.new" && mv "${tmp}.new" "$tmp"
rg -qi 'node|npm|yarn|pnpm' "$tmp" && ! rg -q '^ENV NPM_CONFIG_REGISTRY=' "$tmp" && awk 'BEGIN{d=0} /^ARG NPM_CONFIG_REGISTRY/ && d==0 {print; print "ENV NPM_CONFIG_REGISTRY=${NPM_CONFIG_REGISTRY}"; d=1; next} {print}' "$tmp" > "${tmp}.new" && mv "${tmp}.new" "$tmp"

if rg -qi 'maven|gradle|openjdk|temurin' "$tmp" && ! rg -q 'mirror-toolkit: maven-mirror-snippet' "$tmp"; then
cat >> "$tmp" <<'EOF_MVN'

# mirror-toolkit: maven-mirror-snippet
# Optional Maven mirror snippet:
# RUN mkdir -p /root/.m2 && cat > /root/.m2/settings.xml <<'XML'
# <settings><mirrors><mirror><id>mirror</id><url>${MAVEN_MIRROR_URL}</url><mirrorOf>*</mirrorOf></mirror></mirrors></settings>
# XML
EOF_MVN
fi

if rg -q '# mirror-toolkit: enable-apt-rewrite' "$tmp" && ! rg -q 'mirror-toolkit apt rewrite block' "$tmp"; then
cat >> "$tmp" <<'EOF_APT'

# mirror-toolkit apt rewrite block
RUN set -eux; \
    if [ -f /etc/os-release ]; then . /etc/os-release; fi; \
    if [ -f /etc/apt/sources.list ]; then cp /etc/apt/sources.list /etc/apt/sources.list.bak; fi; \
    for f in /etc/apt/sources.list.d/debian.sources /etc/apt/sources.list.d/ubuntu.sources; do [ -f "$f" ] && cp "$f" "$f.bak" || true; done; \
    if [ "${ID:-}" = "debian" ] || [ "${ID_LIKE:-}" = "debian" ]; then \
      [ -n "${APT_DEBIAN_MIRROR:-}" ] && sed -i "s|http://deb.debian.org/debian|${APT_DEBIAN_MIRROR}|g; s|http://security.debian.org/debian-security|${APT_DEBIAN_SECURITY_MIRROR:-$APT_DEBIAN_MIRROR}|g" /etc/apt/sources.list /etc/apt/sources.list.d/*.sources 2>/dev/null || true; \
    else \
      [ -n "${APT_UBUNTU_MIRROR:-}" ] && sed -i "s|http://archive.ubuntu.com/ubuntu|${APT_UBUNTU_MIRROR}|g; s|http://security.ubuntu.com/ubuntu|${APT_UBUNTU_SECURITY_MIRROR:-$APT_UBUNTU_MIRROR}|g" /etc/apt/sources.list /etc/apt/sources.list.d/*.sources 2>/dev/null || true; \
    fi
EOF_APT
fi

cp "$tmp" "$out"
rm -f "$tmp"
echo "Optimized Dockerfile written to $out"
