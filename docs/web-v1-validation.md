# Web V1 Validation (P0 Practical Path)

## Scope
This checklist validates only:
- mirrors.json loading
- schema normalization
- loading/error/empty states
- browser-safe mirror status model

## Manual steps
1. Build site assets:
   - `cd docs-site && npm install && npm run build`
2. Serve docs-site `dist/` and open in browser.
3. Verify default load with repository `mirrors.json`:
   - status message reports loaded mirror and ecosystem counts
   - summary cards show total mirrors and total ecosystems
4. Verify error state:
   - rename/remove `dist/mirrors.json` and refresh
   - page shows error panel with failed path, likely cause, suggested action
   - page does not stay on `Loading mirrors.json...`
5. Verify empty state:
   - upload a JSON file with schema wrapper but no valid `{ ecosystem, url }` entries
   - page shows empty-state message that schema loaded but no valid mirrors were found
6. Verify legacy schema compatibility:
   - upload JSON using `{ "ecosystems": { "docker": [ ... ] } }`
   - mirrors render and ecosystem filters populate
7. Verify status model labels in benchmark output:
   - before run: mirrors appear as `Untested`
   - successful faster checks: `OK`
   - slower successful checks: `Slow`
   - browser policy/CORS blocks: `Blocked by browser` (not `Failed`)
   - explicit HTTP error responses: `Failed`
