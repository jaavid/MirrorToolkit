# UI/UX/DX Continuity Plan (Post-New Tasks)

## Current status snapshot
- Identity contract exists and is enforceable through `npm run check:ui-contract`.
- Web V1 validation checklist documents loading/error/empty states and browser-safe status labeling.
- GitHub CI already verifies static build constraints and blocks CDN regressions.

## Risk: “new tasks removed prior improvements”
Main risk is not missing features, but **regression drift**:
1. visual identity drift (RTL/lang/font/local assets)
2. build pipeline drift (different checks per CI platform)
3. developer workflow drift (new contributors skip web-specific checks)

## Plan for best UI/UX + DX

### 1) Protect UI identity as a hard gate
- Keep `docs/web-ui-identity-contract.md` as source of truth.
- Run `npm run check:ui-contract` in every CI system, not only GitHub.
- Require that any intentional identity change updates the contract + validator in same PR.

### 2) Unify CI behavior across platforms
- GitHub Actions (`.github/workflows/ci.yml`), Jenkins (`Jenkinsfile`) and GitLab (`.gitlab-ci.yml`) should run equivalent checks:
  - shell syntax + shellcheck
  - JSON/schema validation
  - smoke tests
  - docs-site build and no-CDN assertions

### 3) Optimize developer experience (DX)
- Keep one “golden local command sequence” in README.
- Ensure failures are actionable (clear command + expected artifact).
- Prefer deterministic outputs (`docs-site/dist`, `mirror-report.json`) so developers can debug quickly.

### 4) UX maturity priorities for next tasks
- Keep Persian-first RTL flow and technical LTR blocks.
- Improve step-state visibility (what is done / what’s next).
- Keep browser-limitation messaging explicit (`blocked-by-browser` vs `failed`).
- Preserve one-viewport critical journey: load config → benchmark → generate env → optimize Dockerfile.

## Definition of done for future changes
A task is “safe” only if all are true:
1. identity contract checks pass
2. web build checks pass in all CI providers
3. smoke + validation scripts pass
4. no CDN/font external dependency introduced
