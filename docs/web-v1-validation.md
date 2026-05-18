# Web V1 Validation (P0 Practical Path)

## Scope
This checklist validates only:
- mirrors.json loading
- schema normalization
- loading/error/empty states
- browser-safe mirror status model
- UI identity contract consistency

## Manual steps
1. Build site assets:
   - `cd docs-site && npm install && npm run build`
2. Enforce UI identity contract:
   - `cd docs-site && npm run check:ui-contract`
3. Serve docs-site `dist/` and open in browser.
4. Verify default load with repository `mirrors.json`:
   - status message reports loaded mirror and ecosystem counts
   - summary cards show total mirrors and total ecosystems
5. Verify error state:
   - rename/remove `dist/mirrors.json` and refresh
   - page shows error panel with failed path, likely cause, suggested action
   - page does not stay on `Loading mirrors.json...`
6. Verify empty state:
   - upload a JSON file with schema wrapper but no valid `{ ecosystem, url }` entries
   - page shows empty-state message that schema loaded but no valid mirrors were found
7. Verify legacy schema compatibility:
   - upload JSON using `{ "ecosystems": { "docker": [ ... ] } }`
   - mirrors render and ecosystem filters populate
8. Verify status model labels in benchmark output:
   - before run: mirrors appear as `بررسی‌نشده`
   - successful faster checks: `سالم`
   - slower successful checks: `کند`
   - browser policy/CORS blocks: `محدودیت مرورگر` (not `ناموفق`)
   - explicit HTTP error responses: `ناموفق`
9. Verify identity rules visually:
   - page root is Persian RTL (`lang="fa"`, `dir="rtl"`)
   - brand title uses Handjet style
   - technical blocks are LTR (env output, Dockerfile input/output, URLs)
   - region flags are loaded from local `assets/vendor/flag-icons`
   - no CDN dependencies exist in HTML

## Policy note
Visual identity must not be changed casually. Any intentional identity update must first revise `docs/web-ui-identity-contract.md`, then update tests/checks accordingly.
