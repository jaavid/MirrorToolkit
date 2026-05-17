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

Open `docs-site/index.html` (or published Pages site), then:
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
