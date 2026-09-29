# Design system foundation

P1 starts with a restrained Account control-surface visual system.

## Semantic colors

Use CSS variables rather than page-specific color literals:

- `--background`
- `--surface`
- `--surface-hover`
- `--foreground`
- `--muted`
- `--border`
- `--primary`
- `--primary-foreground`
- `--accent-soft`
- `--warning-soft`
- `--warning-border`
- `--focus`

## Layout

- Main content maximum width: approximately 1000px.
- Desktop sidebar: 232px.
- Mobile: one compact 56px header row and a drawer.
- Minimum supported viewport width: 320px.
- Primary touch targets: approximately 44px.

## Principles

- No dashboard decoration for its own sake.
- No security score.
- No charts unless a later domain has a concrete user need.
- Status must never rely on color alone.
- Destructive controls must use explicit consequence copy.
- Account pages should prefer settings rows/cards over dense application dashboards.

This file will expand as P1 adds reusable fields, buttons, badges, notices, dialogs, skeletons and destructive-action primitives.
