# Changelog

All notable changes to the WordCards web app.

## [0.4.0] - 2026-06-21
### Changed
- Layout editor fully decoupled: 6 independently-draggable modules (English,
  中文, 词性, eye, 音标, play) — POS and play are now separate from their groups.
- Navigation redesigned: transparent arrows on the screen edges + mouse/touch
  drag-to-swipe on the main screen; the bottom quick bar is removed.

### Fixed
- Auto-play no longer "flashes": removed the per-render entrance animation;
  card content swaps instantly with fixed module heights.

## [0.3.0] - 2026-06-21
### Added
- Full feature parity with the HighFreqWordCards Android app: draggable module
  layout editor, show/hide English/Chinese/phonetic/buttons/header, syllable mode,
  group navigation, dark mode (5 dark palettes + follow system), tabbed settings.
- Settings is now a large centered modal (two-column on wide screens).

### Changed
- Wordlist rule: remove only absolute (exact, case-sensitive) duplicates →
  17,640 words (restored case variants like Polish/polish, sauté, etc.).
- Eye (show/hide Chinese) button restyled to a clean solid icon button.

### Fixed
- No more vertical "shake" when navigating / auto-playing: module heights are
  fixed and the entrance animation is opacity-only.
- Path-unsafe audio filenames (e.g. `and/or`) sanitized to match the pipeline.

## [0.2.0]
### Added
- Custom word-pack upload (CSV/JSON), pack selector, settings drawer.
- Security hardening: textContent rendering (XSS), quoted-CSV parsing, quota/fetch guards.

## [0.1.0]
- Initial MVP: COCA 17k cards, US/UK audio, speed/repeat/auto-advance, palettes.
