# Web experience and copy audit

Reviewed September 20, 2026. Scope: this web checkout's public copy and source-level feature verification. The Android candidate contains the gameplay and interface implementation. The web candidate changes copy only and remains unpublished.

## Main finding

The page advertised an unavailable Pixel Art mode, 20 templates, and four difficulty tiers. `public/game.js` exposes only Classic and Daily Challenge. It uses a 9x9 board with complete row, column, and 3x3-box clears. Promising a missing mode creates an avoidable expectation failure before a player learns the real game.

## Changes in public/index.html

- Rewrote description, social metadata, structured data, and below-board copy around the implemented rules and two modes.
- Removed wood-style positioning, exclusivity assertions, brain-training and eye-strain claims, and exponential-scoring language.
- Matched visible FAQ answers to the FAQ JSON-LD. Explained local browser saves and the absence of Android progress sync.
- Simplified the keyword-heavy footer and removed unrelated password, JSON, and regex tool links.
- Kept the Android link generic. Native version3.8 source uses a 10x10 row/column game; its public Play listing advertises 8x8. Web copy must not imply shared board rules, mode counts, or synchronized progress.
- Removed an unsupported publication date and updated the publisher name to the public Play listing's Threethree Labs.
- Preserved all gameplay control IDs, mode selectors, scripts, and existing style classes. No CSS or game.js edits in this copy pass.

## Quality principles

- Describe what the player can do now in plain language.
- Explain the next move before marketing secondary features.
- Keep one benefit per feature card and make rules scannable.
- Show actual gameplay in download creatives; do not promise feature parity between web and Android.

## Verification and limits

- Final local Edge browser checks at 390x844 and 1440x900 found no horizontal overflow or page JavaScript errors. Three JSON-LD blocks parsed, the help dialog dismissed, and the first FAQ opened. Screenshots were inspected for readable tagline, cards, and rules. All gameplay control IDs and script sources remain intact.
- Gameplay smoothness, restore reliability, and first-clear success need real interaction checks; copy edits alone do not prove retention improvement.
- Current download and gameplay cohorts remain unknown. The local metrics cache ends March 25, 2026; obtain current measurement before claiming growth.

Source references: [public web game](https://blockdoku-web.vercel.app/), [Android listing](https://play.google.com/store/apps/details?id=com.dohrbusiness.blockpuzzle), [Google metadata guidance](https://support.google.com/googleplay/android-developer/answer/9898842?hl=en), and the larger growth review at `C:/Users/Peter/Documents/claude-agent/docs/reviews/blockdoku_growth_review_2026_09_20.md` (external to this repository).

Confidence: high for source/copy mismatch and changes; medium for retention prioritization. No uplift forecast.
