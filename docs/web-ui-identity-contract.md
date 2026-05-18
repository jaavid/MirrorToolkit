# MirrorToolkit Web UI Identity Contract

## Purpose
This contract locks the visual and language identity of the MirrorToolkit docs-site and prevents accidental redesign drift.

## Language and bilingual strategy
- The UI is bilingual with **Persian as the primary explanatory language**.
- English remains in place for technical labels and ecosystem terms where it improves clarity.
- Short bilingual/English helper text is allowed for workflow guidance.

## Direction (RTL/LTR) rules
- Root document must stay:
  - `<html lang="fa" dir="rtl">`
- Persian narrative content is RTL.
- Technical values must remain LTR, including:
  - URLs
  - code snippets
  - Dockerfile input/output
  - env output
  - ecosystem names and low-level technical identifiers

## Typography
- Brand title uses **Handjet** from local assets.
- Body text uses local/system Persian-friendly sans-serif stack.
- Handjet is limited to brand/title styling and should not replace body text.

## Flags and assets
- Country flags must be rendered using local `flag-icons` assets bundled in the repository.
- CDN-hosted flags are not allowed.
- No external font/CDN/image dependency is allowed.

## Stability requirement
- Do not replace or substantially alter this visual identity unless this contract is intentionally updated first.
- Any change that removes RTL defaults, local flags, local font strategy, or Persian-first UI violates this contract.
