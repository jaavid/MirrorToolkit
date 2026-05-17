# MirrorToolkit

MirrorToolkit is a **small CLI + static helper page** for selecting working package mirrors and improving Docker builds in restricted networks. It is **not a platform**.

## CLI quick usage

```bash
chmod +x setup-mirrors.sh
./setup-mirrors.sh --config mirrors.json --output .env.mirrors --report mirror-report.json --timeout 6
# also supported:
./setup-mirrors.sh mirrors.json
```

Outputs:
- `.env.mirrors`
- `mirror-report.json`

## GitHub Pages usage

Build and publish from `docs-site/dist`, then open the published Pages site (or local `docs-site/dist/index.html`), then:
- Run benchmark
- Copy generated env
- Download mirror-report.json
- Upload/paste Dockerfile, optimize, download

> Browser benchmark is approximate because CORS may block direct registry checks. The CLI benchmark is authoritative.

## mirrors.json schema

```json
{
  "version": 2,
  "mirrors": {
    "docker": [], "pypi": [], "npm": [], "maven": [], "ubuntu": [],
    "debian": [], "alpine": [], "golang": [], "composer": [], "nuget": []
  }
}
```

Mirror item format:

```json
{
  "name": "...",
  "url": "...",
  "kind": "...",
  "security_url": "...",
  "region": "...",
  "priority": 100
}
```

Required fields: `name`, `url`, `kind`.


## Building GitHub Pages frontend

```bash
cd docs-site
npm install
npm run build
```

Notes:
- No CDN assets are used at runtime (no Tailwind CDN, no remote JS/CSS/fonts).
- Build output is deterministic static files in `docs-site/dist`.
- GitHub Pages workflow deploys `docs-site/dist` only.
- Frontend remains fully static and offline-friendly after first load.

## Dockerfile optimizer

- no `ENV` before `FROM`
- inject mirror `ARG`s after each `FROM`
- avoid duplicate lines
- apt rewrite only with marker `# mirror-toolkit: enable-apt-rewrite`
- maven active block only with marker `# mirror-toolkit: enable-maven-mirror`

Shell optimizer:

```bash
./scripts/optimize-dockerfile.sh input.Dockerfile output.Dockerfile
```

## GitHub Pages UI

- The docs site is a static Tailwind build in `docs-site/` with local compiled CSS (no CDN runtime dependencies).
- Browser benchmark results are approximate because CORS can affect reachability/latency checks.
- CLI benchmark output remains authoritative for automation and CI.
- No backend is used.


### Dockerfile optimizer profiles

```bash
./scripts/optimize-dockerfile.sh Dockerfile Dockerfile.optimized
./scripts/optimize-dockerfile.sh --profile production --report dockerfile-report.json Dockerfile Dockerfile.optimized
./scripts/optimize-dockerfile.sh --profile restricted-network --env-file .env.mirrors Dockerfile Dockerfile.optimized
```
