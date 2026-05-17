# MirrorToolkit Web V1 Roadmap

## Product Focus

Web V1 must prioritize a practical browser-based workflow that gives users immediate, usable outcomes in the web UI:

1. load `mirrors.json` correctly
2. run a browser-safe mirror check
3. explain CORS limitations instead of treating them as hard failures
4. generate useful environment configuration snippets
5. accept a Dockerfile input and return a mirror-aware output
6. keep the current visual model but make the UI more mature and usable

This version is intentionally scoped for practical utility over completeness. The following items are explicitly postponed to Web V2: CLI parity, authoritative benchmarking, deep Dockerfile parsing, GitHub Pages latency charts, advanced analytics, advanced optimizer logic, and full design-system refactoring.

## Current Critical Problems

1. **Schema mismatch:**
   - The web app currently expects `data.ecosystems`.
   - The real `mirrors.json` uses `data.mirrors`.
   - Web V1 must normalize the input data before rendering or benchmarking.

2. **Browser benchmark limitations:**
   - Many registry and mirror URLs do not support browser CORS.
   - CORS-blocked requests must not be presented as mirror failures.
   - The UI must distinguish between:
     - `ok`
     - `slow`
     - `blocked-by-browser`
     - `failed`

3. **User flow problem:**
   - The UI must clearly tell the user what to do first.
   - The preferred flow is:
     - Load `mirrors.json`
     - Run quick browser check
     - Review fastest/usable mirrors
     - Paste Dockerfile
     - Generate optimized Dockerfile
     - Copy/download result

4. **Output usefulness:**
   - The app must generate practical snippets for Docker, npm, pip, and apt.
   - Dockerfile optimization should be basic but understandable.
   - The app should show what changed and why.

## Web V1 Priorities

### P0 - Must Fix

- [ ] Add a data normalization layer that supports the current `mirrors.json` schema.
- [ ] Keep backward compatibility with any existing ecosystems-style sample data if present.
- [ ] Fix loading and rendering states so the page never gets stuck on "Loading mirrors.json...".
- [ ] Add explicit error UI for missing, invalid, or incompatible `mirrors.json`.
- [ ] Fix GitHub Pages build/deploy issues if `package-lock.json` or validation paths are currently wrong.
- [ ] Add a browser-safe status model for mirror checks.
- [ ] Do not classify CORS-blocked URLs as failed mirrors.

### P1 - Practical Output

- [ ] Generate copyable env snippets for:
  - Docker registry mirrors
  - npm registry
  - pip index URL / extra index URL
  - apt mirror configuration
- [ ] Add Dockerfile input textarea.
- [ ] Generate a basic optimized Dockerfile output.
- [ ] Show a small change report:
  - detected base images
  - detected package managers
  - inserted mirror configuration
  - warnings
- [ ] Add copy and download buttons for generated output.

### P2 - UI Maturity Without Full Redesign

- [ ] Replace the current unclear landing state with a step-based workflow.
- [ ] Make the primary call to action obvious.
- [ ] Keep charts smaller and more functional.
- [ ] Add compact result cards.
- [ ] Add badges for status and confidence.
- [ ] Reduce noisy explanatory text.
- [ ] Make the UI usable in one viewport as much as possible.

### Deferred to Web V2

- CLI parity
- authoritative server-side benchmarking
- advanced multi-stage Dockerfile parser
- repository upload/edit flow
- GitHub Pages latency history charts
- advanced mirror scoring
- full design-system refactor
- backend API
- scheduled benchmark reports

## Implementation Notes

- Prefer a pure frontend implementation for Web V1.
- Avoid external CDN dependencies.
- Tailwind must be bundled locally if used.
- The project should work on GitHub Pages.
- Browser checks are approximate and must be labeled as such.
- The UI should recommend CLI/server-side checks for authoritative results, but Web V1 should still provide useful output.

## Acceptance Criteria

- Opening the GitHub Pages site loads `mirrors.json` successfully.
- The UI shows the number of loaded mirrors and ecosystems.
- No indefinite loading state remains.
- CORS-blocked mirrors are shown as `blocked-by-browser`, not failed.
- The user can copy env snippets for at least Docker, npm, pip, and apt.
- The user can paste a Dockerfile and receive an edited output.
- The edited Dockerfile can be copied and downloaded.
- The UI clearly shows the current step and next action.
- The site builds successfully without CDN-based Tailwind.
- Existing validation scripts pass or are corrected.

## Suggested Next Tasks

1. Fix `mirrors.json` normalization and loading state
2. Fix build/validation paths
3. Add browser-safe mirror status model
4. Add env snippet generator
5. Add Dockerfile input/output panel
6. Improve the web UI flow around those features
