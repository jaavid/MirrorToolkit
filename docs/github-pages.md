# GitHub Pages

Enable Pages from GitHub Actions in repository settings.

The browser optimizer in `docs-site/app.js` applies the same simple ARG/ENV/marker rules client-side and downloads the optimized Dockerfile. No backend is used.

## UI identity contract (required)
- The docs-site UI identity is locked by `docs/web-ui-identity-contract.md`.
- Do not casually redesign typography, language hierarchy, or direction behavior.
- Persian RTL is the default page direction, while technical values (URLs/code/env/Dockerfile/ecosystem labels) stay LTR.
- Font, flag, and image assets must remain local-only; CDN usage is not allowed.

## CI and local checks
Before publishing Pages, run:
- `npm run build`
- `npm run check:ui-contract`

These checks guard against accidental removal of RTL, Persian labels, brand font hooks, local flag rendering, or introduction of CDN dependencies.
