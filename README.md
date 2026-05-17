# mirror-toolkit

A production-ready CLI/toolkit for selecting reachable mirrors in unstable or restricted networks and generating deterministic environment/config outputs for Docker, Python/pip, Node/npm/pnpm/yarn, Java/Maven, Ubuntu APT, and Debian APT.

## Quick start
```bash
chmod +x setup-mirrors.sh
./setup-mirrors.sh --config mirrors.json --output .env.mirrors --report mirror-report.json --timeout 6
```

## Example generated `.env.mirrors`
See `examples/env.example`.

## Docker build usage
```bash
source .env.mirrors
docker build \
  --build-arg PIP_INDEX_URL="$PIP_INDEX_URL" \
  --build-arg NPM_CONFIG_REGISTRY="$NPM_CONFIG_REGISTRY" \
  --build-arg MAVEN_MIRROR_URL="$MAVEN_MIRROR_URL" \
  -f examples/Dockerfile.python-node .
```

## CI/CD usage
Use `.github/workflows/ci.yml` as a baseline for validation, smoke test, and generated-file checks.

## Safety warning
This project does **not** rewrite host APT sources. Prefer generated env/build args over destructive host configuration changes.

## GitHub Pages optimizer
The `docs-site/` app includes a browser-only Dockerfile optimizer where users upload a Dockerfile and download an optimized version.

## Dockerfile optimizer markers
- `# mirror-toolkit: enable-apt-rewrite`
- `# mirror-toolkit: enable-maven-mirror`

The optimizer is conservative by default. APT rewrite is opt-in and Maven active mirror config is opt-in. Host APT is never modified; rewrite applies only inside Docker image build stages.
