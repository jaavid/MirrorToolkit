#!/usr/bin/env bash
set -Eeuo pipefail

[[ $# -eq 2 ]] || { echo "Usage: $0 input.Dockerfile output.Dockerfile" >&2; exit 1; }
in="$1"; out="$2"
[[ -f "$in" ]] || { echo "Input not found: $in" >&2; exit 1; }

if [[ -f .env.mirrors ]]; then
  set -a; source .env.mirrors; set +a
fi

is_python_related() {
  local f="$1"
  grep -Eqi '^[[:space:]]*FROM[[:space:]].*python' "$f" || grep -Eqi '(^|[[:space:]])pip([[:space:]]|$)|requirements\.txt|pyproject\.toml' "$f"
}

is_node_related() {
  local f="$1"
  grep -Eqi '^[[:space:]]*FROM[[:space:]].*node' "$f" || grep -Eqi '(^|[[:space:]])(npm|pnpm|yarn)([[:space:]]|$)|package\.json' "$f"
}

is_java_related() {
  local f="$1"
  grep -Eqi '^[[:space:]]*FROM[[:space:]].*(maven|gradle|openjdk|eclipse-temurin|amazoncorretto|zulu)' "$f" || grep -Eqi '(^|[[:space:]])(mvn|gradle)([[:space:]]|$)|pom\.xml|build\.gradle' "$f"
}

python_related=false
node_related=false
java_related=false
if is_python_related "$in"; then python_related=true; fi
if is_node_related "$in"; then node_related=true; fi
if is_java_related "$in"; then java_related=true; fi

awk -v py="$python_related" -v nd="$node_related" '
BEGIN {
  split("PIP_INDEX_URL NPM_CONFIG_REGISTRY MAVEN_MIRROR_URL APT_UBUNTU_MIRROR APT_UBUNTU_SECURITY_MIRROR APT_DEBIAN_MIRROR APT_DEBIAN_SECURITY_MIRROR", args, " ")
  in_stage=0
}
function trim(s){sub(/^[[:space:]]+/,"",s); sub(/[[:space:]]+$/, "", s); return s}
function stage_flush(    i) {
  if (!in_stage) return
  for (i=1;i<=7;i++) print "ARG " args[i]
  if (py=="true") print "ENV PIP_INDEX_URL=${PIP_INDEX_URL}"
  if (nd=="true") print "ENV NPM_CONFIG_REGISTRY=${NPM_CONFIG_REGISTRY}"
  for (i=1;i<=stage_count;i++) print stage[i]
  delete has_arg; delete stage
  stage_count=0
}
{
  line=$0
  if (line ~ /^[[:space:]]*FROM[[:space:]]/) {
    stage_flush()
    print line
    in_stage=1
    next
  }
  if (!in_stage) {
    print line
    next
  }

  t=trim(line)
  if (t ~ /^ARG[[:space:]]+/) {
    split(t, a, /[[:space:]=]+/)
    n=a[2]
    has_arg[n]=1
  }

  if (t ~ /^ARG[[:space:]]+PIP_INDEX_URL([[:space:]]*=.*)?$/) next
  if (t ~ /^ARG[[:space:]]+NPM_CONFIG_REGISTRY([[:space:]]*=.*)?$/) next
  if (t ~ /^ARG[[:space:]]+MAVEN_MIRROR_URL([[:space:]]*=.*)?$/) next
  if (t ~ /^ARG[[:space:]]+APT_UBUNTU_MIRROR([[:space:]]*=.*)?$/) next
  if (t ~ /^ARG[[:space:]]+APT_UBUNTU_SECURITY_MIRROR([[:space:]]*=.*)?$/) next
  if (t ~ /^ARG[[:space:]]+APT_DEBIAN_MIRROR([[:space:]]*=.*)?$/) next
  if (t ~ /^ARG[[:space:]]+APT_DEBIAN_SECURITY_MIRROR([[:space:]]*=.*)?$/) next
  if (t == "ENV PIP_INDEX_URL=${PIP_INDEX_URL}") next
  if (t == "ENV NPM_CONFIG_REGISTRY=${NPM_CONFIG_REGISTRY}") next

  stage[++stage_count]=line
}
END { stage_flush() }
' "$in" > "$out"

if [[ "$java_related" == "true" ]] && ! grep -q 'mirror-toolkit: maven-mirror-snippet' "$out"; then
cat >> "$out" <<'EOF_MVN'

# mirror-toolkit: maven-mirror-snippet
# Optional Maven mirror snippet:
# RUN mkdir -p /root/.m2 && cat > /root/.m2/settings.xml <<'XML'
# <settings><mirrors><mirror><id>mirror</id><url>${MAVEN_MIRROR_URL}</url><mirrorOf>*</mirrorOf></mirror></mirrors></settings>
# XML
EOF_MVN
fi

if [[ "$java_related" == "true" ]] && grep -q '# mirror-toolkit: enable-maven-mirror' "$out" && ! grep -q 'mirror-toolkit maven active block' "$out"; then
cat >> "$out" <<'EOF_MVNA'

# mirror-toolkit maven active block
RUN set -eu; \
    mkdir -p /root/.m2; \
    cat > /root/.m2/settings.xml <<'XML'
<settings><mirrors><mirror><id>mirror-toolkit</id><url>${MAVEN_MIRROR_URL}</url><mirrorOf>*</mirrorOf></mirror></mirrors></settings>
XML
EOF_MVNA
fi

if grep -q '# mirror-toolkit: enable-apt-rewrite' "$out" && ! grep -q 'mirror-toolkit apt rewrite block' "$out"; then
cat >> "$out" <<'EOF_APT'

# mirror-toolkit apt rewrite block
# This only changes apt sources inside the Docker image build; host APT is never modified.
RUN set -eu; \
    [ -f /etc/os-release ] && . /etc/os-release || true; \
    [ -f /etc/apt/sources.list ] && cp /etc/apt/sources.list /etc/apt/sources.list.bak || true; \
    [ -f /etc/apt/sources.list.d/debian.sources ] && cp /etc/apt/sources.list.d/debian.sources /etc/apt/sources.list.d/debian.sources.bak || true; \
    [ -f /etc/apt/sources.list.d/ubuntu.sources ] && cp /etc/apt/sources.list.d/ubuntu.sources /etc/apt/sources.list.d/ubuntu.sources.bak || true; \
    if [ "${ID:-}" = "debian" ] || [ "${ID_LIKE:-}" = "debian" ]; then \
      if [ -n "${APT_DEBIAN_MIRROR:-}" ]; then \
        [ -f /etc/apt/sources.list ] && sed -i "s|http://deb.debian.org/debian|${APT_DEBIAN_MIRROR}|g; s|http://security.debian.org/debian-security|${APT_DEBIAN_SECURITY_MIRROR:-$APT_DEBIAN_MIRROR}|g" /etc/apt/sources.list || true; \
        [ -f /etc/apt/sources.list.d/debian.sources ] && sed -i "s|http://deb.debian.org/debian|${APT_DEBIAN_MIRROR}|g; s|http://security.debian.org/debian-security|${APT_DEBIAN_SECURITY_MIRROR:-$APT_DEBIAN_MIRROR}|g" /etc/apt/sources.list.d/debian.sources || true; \
      fi; \
    elif [ "${ID:-}" = "ubuntu" ] || [ "${ID_LIKE:-}" = "ubuntu" ] || [ "${ID_LIKE:-}" = "debian ubuntu" ]; then \
      if [ -n "${APT_UBUNTU_MIRROR:-}" ]; then \
        [ -f /etc/apt/sources.list ] && sed -i "s|http://archive.ubuntu.com/ubuntu|${APT_UBUNTU_MIRROR}|g; s|http://security.ubuntu.com/ubuntu|${APT_UBUNTU_SECURITY_MIRROR:-$APT_UBUNTU_MIRROR}|g" /etc/apt/sources.list || true; \
        [ -f /etc/apt/sources.list.d/ubuntu.sources ] && sed -i "s|http://archive.ubuntu.com/ubuntu|${APT_UBUNTU_MIRROR}|g; s|http://security.ubuntu.com/ubuntu|${APT_UBUNTU_SECURITY_MIRROR:-$APT_UBUNTU_MIRROR}|g" /etc/apt/sources.list.d/ubuntu.sources || true; \
      fi; \
    fi
EOF_APT
fi

echo "Optimized Dockerfile written to $out"
