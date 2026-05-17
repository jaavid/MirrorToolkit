# Docker

- Docker daemon mirror is written only when `--apply` and running as root.
- Docker restart is **not** automatic; use `--restart-docker` to request restart.
- Host APT is never rewritten by `setup-mirrors.sh`.

## Build args example

```bash
source .env.mirrors
docker build \
  --build-arg PIP_INDEX_URL="$PIP_INDEX_URL" \
  --build-arg NPM_CONFIG_REGISTRY="$NPM_CONFIG_REGISTRY" \
  --build-arg MAVEN_MIRROR_URL="$MAVEN_MIRROR_URL" \
  --build-arg APT_UBUNTU_MIRROR="$APT_UBUNTU_MIRROR" \
  --build-arg APT_UBUNTU_SECURITY_MIRROR="$APT_UBUNTU_SECURITY_MIRROR" \
  --build-arg APT_DEBIAN_MIRROR="$APT_DEBIAN_MIRROR" \
  --build-arg APT_DEBIAN_SECURITY_MIRROR="$APT_DEBIAN_SECURITY_MIRROR" \
  -f examples/Dockerfile.python-node .
```

## Tool usage examples

- pip: `pip install -r requirements.txt` (with `PIP_INDEX_URL` exported)
- npm: `npm config set registry "$NPM_CONFIG_REGISTRY"`
- Maven: use optimizer snippet or active marker block for `/root/.m2/settings.xml`
