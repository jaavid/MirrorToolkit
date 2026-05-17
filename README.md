# mirror-toolkit

A production-ready CLI/toolkit for selecting reachable mirrors in unstable or restricted networks and generating deterministic environment/config outputs for Docker, Python/pip, Node/npm/pnpm/yarn, Java/Maven, Ubuntu APT, and Debian APT.

## Quick start
```bash
chmod +x setup-mirrors.sh
./setup-mirrors.sh --config mirrors.json --output .env.mirrors --report mirror-report.json --timeout 6 --no-apply
```

## CLI help
```bash
./setup-mirrors.sh --help
```

## `--apply` behavior
- Docker: only when root; writes `/etc/docker/daemon.json`, preserves existing JSON keys, and backs up to `/etc/docker/daemon.json.bak.TIMESTAMP`.
- Docker restart is opt-in with `--restart-docker`.
- pip: writes `~/.pip/pip.conf` (backup if exists).
- npm: runs `npm config set registry ...` when npm exists; warns otherwise.
- Maven: writes `~/.m2/settings.xml` (backup if exists).
- Host APT is never rewritten.

## Generated env keys
- `DOCKER_REGISTRY_MIRROR`, `DOCKER_REGISTRY_MIRROR_NAME`
- `PIP_INDEX_URL`, `PIP_INDEX_URL_NAME`, `PIP_EXTRA_INDEX_URL`
- `NPM_CONFIG_REGISTRY`, `NPM_CONFIG_REGISTRY_NAME`, `YARN_NPM_REGISTRY_SERVER`, `PNPM_REGISTRY`
- `MAVEN_MIRROR_URL`, `MAVEN_MIRROR_URL_NAME`
- `APT_UBUNTU_MIRROR`, `APT_UBUNTU_MIRROR_NAME`, `APT_UBUNTU_SECURITY_MIRROR`
- `APT_DEBIAN_MIRROR`, `APT_DEBIAN_MIRROR_NAME`, `APT_DEBIAN_SECURITY_MIRROR`

## Dockerfile optimizer examples
- Python/Node Dockerfiles get only relevant env lines.
- Maven snippet appears only for Java-related Dockerfiles.
- Active Maven block requires marker: `# mirror-toolkit: enable-maven-mirror`.
- APT rewrite block requires marker: `# mirror-toolkit: enable-apt-rewrite`.

## Docker build usage
```bash
source .env.mirrors
docker build \
  --build-arg PIP_INDEX_URL="$PIP_INDEX_URL" \
  --build-arg NPM_CONFIG_REGISTRY="$NPM_CONFIG_REGISTRY" \
  --build-arg MAVEN_MIRROR_URL="$MAVEN_MIRROR_URL" \
  -f examples/Dockerfile.python-node .
```
