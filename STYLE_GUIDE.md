# 小善学习站 — Design System / Style Guide

This is the canonical design system for **小善学习站 (Xiaoshan Study Station)**.
The source of truth for tokens is the main [`index.html`](./index.html); a reusable
stylesheet that encodes everything below lives at
[`shared/xiaoshan-theme.css`](./shared/xiaoshan-theme.css).

Goal: every page — including embedded/vendored apps — should look like one product.

---

## Design tokens

| Token | Value | Role |
|---|---|---|
| `--color-paper` | `#fcfaf4` | Page background (warm off-white) |
| `--color-surface` | `#ffffff` | Cards, modals, inputs |
| `--color-ink` | `#362c24` | Primary text |
| `--color-ink-soft` | `#71675d` | Secondary text, labels |
| `--color-ink-dim` | `#a09890` | Tertiary / placeholder text |
| `--color-accent` | `#359658` | Primary brand green |
| `--color-accent-strong` | `#007c3a` | Hover / active / emphasis |
| `--color-accent-soft` | `#dcf7e2` | Tinted hover backgrounds |
| `--color-line` | `#e5e1da` | Hairlines, soft borders |
| `--color-line-strong` | `#d2cdc5` | Input borders, separators |
| `--color-danger` | `#c0392b` | Destructive text/border |
| `--color-danger-soft` | `#fdecea` | Destructive hover background |
| `--color-overlay` | `rgba(54,44,36,0.38)` | Modal scrim |

### Radius

| Token | Value | Use |
|---|---|---|
| `--radius-sm` | `0.5rem` | Buttons, inputs |
| `--radius-md` | `0.875rem` | Dropdowns, small cards |
| `--radius-lg` | `1.25rem` | Modals, large cards |

### Motion

| Token | Value |
|---|---|
| `--duration-fast` | `0.14s` |
| `--duration-normal` | `0.22s` |
| `--ease-out` | `cubic-bezier(0.16, 1, 0.3, 1)` |

Transitions are short and eased. Animate `color`, `background`, `transform`,
and `opacity` — never layout properties.

### Typography

Font stack (single family for the whole site):

```css
-apple-system, BlinkMacSystemFont, "PingFang SC", "Microsoft YaHei",
"Noto Sans SC", "Segoe UI", system-ui, sans-serif;
```

Font scale:

| Level | Size | Weight | Notes |
|---|---|---|---|
| Hero / `h1` | `2.5–3.2rem` | 800 | letter-spacing `-0.5px` |
| Section / `h2` | `1.2rem` | 700 | modal titles |
| Subhead / `h3` | `1rem` | 600 | |
| Body | `0.9–1rem` | 400–500 | |
| Label | `0.82rem` | 500 | `--color-ink-soft` |
| Caption | `0.75–0.8rem` | 400 | `--color-ink-dim` |

---

## Components

### Buttons

| Variant | Class | Rules |
|---|---|---|
| Primary | `.xs-btn` | accent bg, white text, no border, `--radius-sm`; **hover** → `accent-strong`; **disabled** → `line-strong` bg + `ink-soft` text |
| Outline | `.xs-btn-outline` | transparent bg, `1.5px` accent border, accent text; **hover** → `accent-soft` bg; **disabled** → `line-strong` border + `ink-dim` text |
| Danger | `.xs-btn-danger` | transparent bg, `1.5px` danger border, danger text; **hover** → `danger-soft` bg |

### Inputs

`.xs-input` — white bg, `1.5px solid var(--color-line-strong)`, `--radius-sm`,
placeholder `--color-ink-dim`. **Focus** → `border-color: var(--color-accent)`
(no glow). Pair with `.xs-label` (`0.82rem`, weight 500, `ink-soft`).

### Card

`.xs-card` — `--color-surface` bg, `1px solid var(--color-line)` border,
`--radius-lg`, `--shadow-card`. Group related content; do not stack uniform
shadows everywhere.

### Segmented control

`.xs-segmented` — `paper` track with `--color-line` border and `--radius-md`;
inactive buttons are `ink-soft`, the selected button (`[aria-selected="true"]`
or `.active`) gets `surface` bg + `accent-strong` text + `--shadow-card`.

### Modals

Scrim uses `--color-overlay`; panel uses `--color-surface` + `--radius-lg` +
`--shadow-modal`. Title is `h2`/`--color-ink`; supporting copy is `ink-soft`.

### Links

Default `--color-accent-strong`; **hover** `--color-accent` + underline.

---

## How to apply when importing a new page

When you vendor or embed a new page/app and want it to match the site:

1. **Adopt the tokens.** Either `<link rel="stylesheet" href="shared/xiaoshan-theme.css">`
   (when paths allow) or copy the `:root { … }` token block from
   [`shared/xiaoshan-theme.css`](./shared/xiaoshan-theme.css) into the page's
   own `<style>`.
2. **Replace page chrome with tokens:**
   - body background → `var(--color-paper)`; remove any imported gradient/bg.
   - apply the font stack to the page root (`*` or `body`).
   - text colors → `ink` / `ink-soft` / `ink-dim`.
   - buttons → accent (primary) / outline / danger per the rules above;
     remove any foreign brand colors.
   - inputs → white bg, `1.5px line-strong` border, accent focus.
   - cards/modals → `surface` bg + appropriate radius; scrim `--color-overlay`.
3. **Keep functionality untouched.** Restyle CSS only — do not rename IDs,
   classes, or change JS that the page depends on.
4. **Decorative color (charts, wheels, badges):** stay in the brand family —
   greens, warm neutrals/taupes, and accent variants. Ensure enough contrast
   for legibility; avoid clashing bright/saturated hues.
5. **Verify** the page's background, buttons, text, inputs, and headings match
   the main site side by side before shipping.

> Worked example: `vendor/lottery/index.html` (转盘) was imported and restyled
> to these tokens while preserving 100% of its game logic — its wheel segment
> colors were retoned to a harmonious green/neutral palette.
